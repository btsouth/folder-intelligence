import { Notice, TFile, TFolder, type App } from 'obsidian';
import { stableFingerprint } from './fingerprint';
import {
	extractManagedBlock,
	isFolderIntelligenceDashboardContent,
	removeRedundantDashboardTitle,
	stripManagedBlocks,
	upsertManagedBlock,
} from './managed-blocks';
import {
	buildFolderPrompt,
	normalizeGeneratedMarkdown,
	SUMMARY_SYSTEM_PROMPT,
} from './prompt';
import { noteSourceContent } from './note-brief-format';
import { aiExclusionReason } from './privacy';
import { generateText, type ProviderConfiguration } from './providers';
import { resolveProfile } from './profiles';
import {
	dashboardPath,
	matchesAnyGlob,
	normalizePath,
	parentPath,
} from './path-utils';
import {
	parseSummaryProvenance,
	renderFreshStatus,
	renderIndex,
	renderStaleStatus,
	renderSummary,
	stripSummaryProvenance,
	upsertSummaryProvenance,
} from './render';
import type {
	FolderIntelligenceSettings,
	FolderSnapshot,
	GeneratedSummary,
	NoteSnapshot,
	ChildFolderSnapshot,
	ProviderProfile,
	UsageRecord,
} from './types';
import {
	actualEstimatedCost,
	budgetBlockReason,
	estimateRequest,
	estimateTokens,
	type RequestEstimate,
} from './usage';

export interface DashboardEngineOptions {
	app: App;
	getSettings: () => FolderIntelligenceSettings;
	getSessionApiKey: (profileId: string) => string;
	recordUsage: (record: UsageRecord) => Promise<void>;
	getFreshNoteBrief?: (file: TFile, content: string) => string | undefined;
}

export interface FolderSummaryEstimate extends RequestEstimate {
	folderPath: string;
	profile: ProviderProfile;
	noteCount: number;
	excludedNoteCount: number;
	hasDashboard: boolean;
	stale: boolean;
	configured: boolean;
	blockedReason?: string;
}

export interface SubtreePreflight {
	rootPath: string;
	folderCount: number;
	staleCount: number;
	currentCount: number;
	missingDashboardCount: number;
	requestCount: number;
	maxEstimatedCostUsd?: number;
	estimates: FolderSummaryEstimate[];
}

export interface SubtreeProgress {
	completed: number;
	total: number;
	folderPath: string;
	status: 'refreshed' | 'skipped' | 'failed';
	message?: string;
}

export interface SubtreeRefreshOptions {
	createMissingDashboards: boolean;
	signal?: AbortSignal;
	onProgress?: (progress: SubtreeProgress) => void;
}

export interface SubtreeRefreshResult {
	refreshed: number;
	skipped: number;
	failed: number;
	cancelled: boolean;
}

export class DashboardEngine {
	private readonly app: App;
	private readonly getSettings: () => FolderIntelligenceSettings;
	private readonly getSessionApiKey: (profileId: string) => string;
	private readonly recordUsage: (record: UsageRecord) => Promise<void>;
	private readonly getFreshNoteBrief?: (
		file: TFile,
		content: string,
	) => string | undefined;
	private readonly activeSummaries = new Map<string, Promise<void>>();
	private readonly activeDashboardEnsures = new Map<
		string,
		Promise<TFile | undefined>
	>();
	private readonly knownDashboardPaths = new Set<string>();

	constructor(options: DashboardEngineOptions) {
		this.app = options.app;
		this.getSettings = options.getSettings;
		this.getSessionApiKey = options.getSessionApiKey;
		this.recordUsage = options.recordUsage;
		this.getFreshNoteBrief = options.getFreshNoteBrief;
	}

	getDashboardPath(folder: TFolder): string {
		return dashboardPath(
			folder.path,
			this.getSettings().dashboardNameTemplate,
		);
	}

	isDashboard(file: TFile): boolean {
		if (
			file.path !==
			dashboardPath(
				file.parent?.path ?? '',
				this.getSettings().dashboardNameTemplate,
			)
		)
			return false;
		if (this.knownDashboardPaths.has(file.path)) return true;
		return (
			this.app.metadataCache.getFileCache(file)?.frontmatter?.[
				'folder-intelligence'
			] === 'dashboard'
		);
	}

	shouldIgnoreFolder(folder: TFolder): boolean {
		if (!folder.path) return true;
		return matchesAnyGlob(
			folder.path,
			this.getSettings().ignoredFolderPatterns,
		);
	}

	async snapshot(folder: TFolder): Promise<FolderSnapshot> {
		const targetDashboardPath = this.getDashboardPath(folder);
		const notes: NoteSnapshot[] = [];
		const childFolders: ChildFolderSnapshot[] = [];

		for (const child of folder.children) {
			if (
				child instanceof TFile &&
				child.extension.toLowerCase() === 'md'
			) {
				if (child.path === targetDashboardPath) continue;
				const content = await this.app.vault.cachedRead(child);
				if (isFolderIntelligenceDashboardContent(content)) continue;
				const exclusionReason = aiExclusionReason(
					this.app,
					this.getSettings(),
					child,
				);
				const freshBrief = exclusionReason
					? undefined
					: this.getFreshNoteBrief?.(child, content);
				notes.push({
					file: child,
					path: child.path,
					name: child.basename,
					modifiedAt: child.stat.mtime,
					content: exclusionReason
						? ''
						: (freshBrief ?? this.safeSourceContent(content)),
					contentKind: freshBrief ? 'ai-note-brief' : 'full-note',
					aiEligible: !exclusionReason,
					exclusionReason,
				});
			} else if (
				child instanceof TFolder &&
				!this.shouldIgnoreFolder(child)
			) {
				const childDashboardPath = this.getDashboardPath(child);
				const abstractDashboard =
					this.app.vault.getAbstractFileByPath(childDashboardPath);
				let summary: string | undefined;
				if (abstractDashboard instanceof TFile) {
					const dashboardContent =
						await this.app.vault.cachedRead(abstractDashboard);
					summary = extractManagedBlock(dashboardContent, 'summary');
				}
				childFolders.push({
					folder: child,
					path: child.path,
					name: child.name,
					dashboardPath: childDashboardPath,
					dashboardExists: abstractDashboard instanceof TFile,
					summary,
				});
			}
		}

		const fingerprintParts = notes
			.filter((note) => note.aiEligible)
			.flatMap((note) => [
				note.path,
				String(note.modifiedAt),
				note.content,
			]);
		for (const child of childFolders) {
			fingerprintParts.push(child.path, child.summary ?? '');
		}

		return {
			folder,
			path: normalizePath(folder.path),
			name: folder.name || 'Vault',
			dashboardPath: targetDashboardPath,
			notes,
			childFolders,
			fingerprint: stableFingerprint(fingerprintParts),
			indexedAt: new Date().toISOString(),
		};
	}

	async ensureDashboard(
		folder: TFolder,
		open = false,
	): Promise<TFile | undefined> {
		if (this.shouldIgnoreFolder(folder)) return undefined;
		const path = this.getDashboardPath(folder);
		let operation = this.activeDashboardEnsures.get(path);
		if (!operation) {
			operation = this.ensureDashboardFile(folder).finally(() =>
				this.activeDashboardEnsures.delete(path),
			);
			this.activeDashboardEnsures.set(path, operation);
		}
		const dashboard = await operation;
		if (open && dashboard)
			await this.app.workspace.getLeaf(false).openFile(dashboard);
		return dashboard;
	}

	private async ensureDashboardFile(
		folder: TFolder,
	): Promise<TFile | undefined> {
		const snapshot = await this.snapshot(folder);
		let dashboard = this.app.vault.getAbstractFileByPath(
			snapshot.dashboardPath,
		);
		if (!dashboard) {
			dashboard = await this.app.vault.create(
				snapshot.dashboardPath,
				this.newDashboardContent(snapshot),
			);
		} else if (!(dashboard instanceof TFile)) {
			throw new Error(
				`A folder already exists at ${snapshot.dashboardPath}.`,
			);
		} else if (
			!isFolderIntelligenceDashboardContent(
				await this.app.vault.cachedRead(dashboard),
			)
		) {
			throw new Error(
				`Folder Intelligence will not modify ${snapshot.dashboardPath} because it is not a plugin dashboard. Rename that note or change the dashboard filename template.`,
			);
		} else {
			await this.refreshIndex(folder);
		}
		if (dashboard instanceof TFile)
			this.knownDashboardPaths.add(dashboard.path);
		return dashboard instanceof TFile ? dashboard : undefined;
	}

	async refreshIndex(folder: TFolder): Promise<void> {
		if (this.shouldIgnoreFolder(folder)) return;
		const snapshot = await this.snapshot(folder);
		const dashboard = this.app.vault.getAbstractFileByPath(
			snapshot.dashboardPath,
		);
		if (!(dashboard instanceof TFile)) return;
		if (
			!isFolderIntelligenceDashboardContent(
				await this.app.vault.cachedRead(dashboard),
			)
		)
			return;
		this.knownDashboardPaths.add(dashboard.path);
		const aiConfigured = this.canSummarize(folder);

		await this.app.vault.process(dashboard, (current) => {
			const currentSummary = extractManagedBlock(current, 'summary');
			const provenance = parseSummaryProvenance(current);
			const status =
				provenance?.fingerprint === snapshot.fingerprint
					? renderFreshStatus({
							markdown: '',
							provenance,
						})
					: renderStaleStatus(snapshot, aiConfigured);
			let updated = upsertManagedBlock(
				removeRedundantDashboardTitle(current, snapshot.name),
				'status',
				status,
			);
			if (currentSummary) {
				updated = upsertManagedBlock(
					updated,
					'summary',
					stripSummaryProvenance(currentSummary),
				);
			}
			updated = upsertManagedBlock(
				updated,
				'index',
				renderIndex(snapshot),
			);
			if (provenance)
				updated = upsertSummaryProvenance(updated, provenance);
			return updated;
		});
	}

	async summarize(folder: TFolder, silent = false): Promise<void> {
		const existing = this.activeSummaries.get(folder.path);
		if (existing) return existing;
		const operation = this.performSummary(folder, silent).finally(() =>
			this.activeSummaries.delete(folder.path),
		);
		this.activeSummaries.set(folder.path, operation);
		return operation;
	}

	async isSummaryStale(folder: TFolder): Promise<boolean> {
		const snapshot = await this.snapshot(folder);
		const dashboard = this.app.vault.getAbstractFileByPath(
			snapshot.dashboardPath,
		);
		if (!(dashboard instanceof TFile)) return true;
		const content = await this.app.vault.cachedRead(dashboard);
		const provenance = parseSummaryProvenance(content);
		return provenance?.fingerprint !== snapshot.fingerprint;
	}

	canSummarize(folder?: TFolder): boolean {
		const profile = folder
			? this.profileForFolder(folder)
			: resolveProfile(this.getSettings(), '');
		return this.hasApiKey(profile) && Boolean(profile.model.trim());
	}

	async estimateSummary(folder: TFolder): Promise<FolderSummaryEstimate> {
		const snapshot = await this.snapshot(folder);
		const profile = this.profileForFolder(folder);
		const prompt = buildFolderPrompt(snapshot, profile);
		const estimate = estimateRequest(
			SUMMARY_SYSTEM_PROMPT.length + prompt.length,
			profile,
		);
		const dashboard = this.app.vault.getAbstractFileByPath(
			snapshot.dashboardPath,
		);
		const hasDashboard = dashboard instanceof TFile;
		let stale = true;
		if (hasDashboard) {
			const provenance = parseSummaryProvenance(
				await this.app.vault.cachedRead(dashboard),
			);
			stale = provenance?.fingerprint !== snapshot.fingerprint;
		}
		const settings = this.getSettings();
		return {
			...estimate,
			folderPath: folder.path,
			profile,
			noteCount: snapshot.notes.filter((note) => note.aiEligible).length,
			excludedNoteCount: snapshot.notes.filter((note) => !note.aiEligible)
				.length,
			hasDashboard,
			stale,
			configured:
				this.hasApiKey(profile) && Boolean(profile.model.trim()),
			blockedReason: budgetBlockReason(
				profile,
				settings.usageRecords,
				estimate,
			),
		};
	}

	async preflightSubtree(
		root: TFolder,
		createMissingDashboards: boolean,
	): Promise<SubtreePreflight> {
		const estimates: FolderSummaryEstimate[] = [];
		for (const folder of this.subtreeFolders(root)) {
			const estimate = await this.estimateSummary(folder);
			if (estimate.hasDashboard || createMissingDashboards)
				estimates.push(estimate);
		}
		const includedPaths = new Set(
			estimates.map((estimate) => estimate.folderPath),
		);
		const willRefresh = new Set(
			estimates
				.filter((estimate) => estimate.stale)
				.map((estimate) => estimate.folderPath),
		);
		for (const stalePath of [...willRefresh]) {
			let ancestor = parentPath(stalePath);
			while (ancestor && ancestor.startsWith(root.path)) {
				if (includedPaths.has(ancestor)) willRefresh.add(ancestor);
				if (ancestor === root.path) break;
				ancestor = parentPath(ancestor);
			}
		}
		for (const estimate of estimates)
			estimate.stale = willRefresh.has(estimate.folderPath);
		const requests = estimates.filter((estimate) => estimate.stale);
		const costs = requests.map((estimate) => estimate.maxEstimatedCostUsd);
		return {
			rootPath: root.path,
			folderCount: estimates.length,
			staleCount: requests.length,
			currentCount: estimates.length - requests.length,
			missingDashboardCount: estimates.filter(
				(estimate) => !estimate.hasDashboard,
			).length,
			requestCount: requests.length,
			maxEstimatedCostUsd: costs.every(
				(cost): cost is number => cost !== undefined,
			)
				? costs.reduce((total, cost) => total + cost, 0)
				: undefined,
			estimates,
		};
	}

	async refreshSubtree(
		root: TFolder,
		options: SubtreeRefreshOptions,
	): Promise<SubtreeRefreshResult> {
		const preflight = await this.preflightSubtree(
			root,
			options.createMissingDashboards,
		);
		const result: SubtreeRefreshResult = {
			refreshed: 0,
			skipped: 0,
			failed: 0,
			cancelled: false,
		};
		let completed = 0;
		for (const plannedEstimate of preflight.estimates) {
			if (options.signal?.aborted) {
				result.cancelled = true;
				break;
			}
			const folder = this.app.vault.getAbstractFileByPath(
				plannedEstimate.folderPath,
			);
			if (!(folder instanceof TFolder)) continue;
			const estimate = await this.estimateSummary(folder);
			if (!plannedEstimate.stale && !estimate.stale) {
				result.skipped += 1;
				completed += 1;
				options.onProgress?.({
					completed,
					total: preflight.folderCount,
					folderPath: estimate.folderPath,
					status: 'skipped',
				});
				continue;
			}
			try {
				if (estimate.blockedReason)
					throw new Error(estimate.blockedReason);
				if (!estimate.configured)
					throw new Error(
						`${estimate.profile.name} needs a model and API key.`,
					);
				await this.summarize(folder, true);
				result.refreshed += 1;
				completed += 1;
				options.onProgress?.({
					completed,
					total: preflight.folderCount,
					folderPath: estimate.folderPath,
					status: 'refreshed',
				});
			} catch (error) {
				result.failed += 1;
				completed += 1;
				options.onProgress?.({
					completed,
					total: preflight.folderCount,
					folderPath: estimate.folderPath,
					status: 'failed',
					message:
						error instanceof Error ? error.message : String(error),
				});
			}
		}
		return result;
	}

	async initializeAllFolders(): Promise<number> {
		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder)
			.filter((folder) => !this.shouldIgnoreFolder(folder))
			.sort(
				(left, right) =>
					right.path.split('/').length - left.path.split('/').length,
			);
		for (const folder of folders) await this.ensureDashboard(folder);
		return folders.length;
	}

	private async performSummary(
		folder: TFolder,
		silent: boolean,
	): Promise<void> {
		const dashboard = await this.ensureDashboard(folder);
		if (!dashboard)
			throw new Error(
				'This folder is excluded from Folder Intelligence.',
			);
		const snapshot = await this.snapshot(folder);
		const settings = this.getSettings();
		const profile = this.profileForFolder(folder);
		const prompt = buildFolderPrompt(snapshot, profile);
		const estimate = estimateRequest(
			SUMMARY_SYSTEM_PROMPT.length + prompt.length,
			profile,
		);
		const blockedReason = budgetBlockReason(
			profile,
			settings.usageRecords,
			estimate,
		);
		if (blockedReason) throw new Error(blockedReason);
		const configuration: ProviderConfiguration = {
			provider: profile.provider,
			customProtocol: profile.customProtocol,
			baseUrl: profile.baseUrl,
			model: profile.model,
			apiKey: this.getSessionApiKey(profile.id) || profile.apiKey,
		};
		const rawMarkdown = await generateText(configuration, {
			system: SUMMARY_SYSTEM_PROMPT,
			prompt,
			maxOutputTokens: profile.maxOutputTokens,
		});
		const markdown = normalizeGeneratedMarkdown(rawMarkdown);
		if (!markdown)
			throw new Error('The provider returned an empty summary.');
		const estimatedInputTokens = estimate.estimatedInputTokens;
		const estimatedOutputTokens = estimateTokens(rawMarkdown.length);
		await this.recordUsage({
			timestamp: new Date().toISOString(),
			profileId: profile.id,
			provider: profile.provider,
			model: profile.model,
			folderPath: folder.path,
			inputCharacters: estimate.inputCharacters,
			estimatedInputTokens,
			outputCharacters: rawMarkdown.length,
			estimatedOutputTokens,
			estimatedCostUsd: actualEstimatedCost(
				profile,
				estimatedInputTokens,
				estimatedOutputTokens,
			),
		});

		const generated: GeneratedSummary = {
			markdown,
			provenance: {
				provider: profile.provider,
				model: profile.model,
				profileId: profile.id,
				profileName: profile.name,
				generatedAt: new Date().toISOString(),
				fingerprint: snapshot.fingerprint,
				noteCount: snapshot.notes.filter((note) => note.aiEligible)
					.length,
				excludedNoteCount: snapshot.notes.filter(
					(note) => !note.aiEligible,
				).length,
			},
		};

		const latestSnapshot = await this.snapshot(folder);
		await this.app.vault.process(dashboard, (current) => {
			let updated = upsertManagedBlock(
				current,
				'summary',
				renderSummary(generated),
			);
			updated = upsertManagedBlock(
				updated,
				'index',
				renderIndex(latestSnapshot),
			);
			updated = upsertManagedBlock(
				updated,
				'status',
				latestSnapshot.fingerprint === generated.provenance.fingerprint
					? renderFreshStatus(generated)
					: renderStaleStatus(latestSnapshot, true),
			);
			updated = upsertSummaryProvenance(updated, generated.provenance);
			return updated;
		});
		if (!silent)
			new Notice(`Folder Intelligence refreshed ${folder.name}.`);
	}

	private hasApiKey(profile: ProviderProfile): boolean {
		return Boolean(this.getSessionApiKey(profile.id) || profile.apiKey);
	}

	profileForFolder(folder: TFolder): ProviderProfile {
		const dashboard = this.app.vault.getAbstractFileByPath(
			this.getDashboardPath(folder),
		);
		const override =
			dashboard instanceof TFile
				? (this.app.metadataCache.getFileCache(dashboard)
						?.frontmatter?.['folder-intelligence-profile'] as
						string | undefined)
				: undefined;
		return resolveProfile(this.getSettings(), folder.path, override);
	}

	private subtreeFolders(root: TFolder): TFolder[] {
		return this.app.vault
			.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder)
			.filter(
				(folder) =>
					(folder.path === root.path ||
						folder.path.startsWith(`${root.path}/`)) &&
					!this.shouldIgnoreFolder(folder),
			)
			.sort(
				(left, right) =>
					right.path.split('/').length -
						left.path.split('/').length ||
					left.path.localeCompare(right.path),
			);
	}

	private safeSourceContent(content: string): string {
		try {
			return noteSourceContent(stripManagedBlocks(content));
		} catch {
			return content;
		}
	}

	private newDashboardContent(snapshot: FolderSnapshot): string {
		const frontmatter = [
			'---',
			'folder-intelligence: dashboard',
			`folder: "${snapshot.path.replaceAll('"', '\\"')}"`,
			'---',
		].join('\n');
		let content = `${frontmatter}\n`;
		content = upsertManagedBlock(
			content,
			'status',
			renderStaleStatus(snapshot, this.canSummarize(snapshot.folder)),
		);
		content = upsertManagedBlock(
			content,
			'summary',
			'## AI folder brief\n\n_No AI summary has been generated yet._',
		);
		content = upsertManagedBlock(content, 'index', renderIndex(snapshot));
		return `${content.trimEnd()}\n\n## Your notes\n\nWrite anything here. Folder Intelligence will preserve it.\n`;
	}
}
