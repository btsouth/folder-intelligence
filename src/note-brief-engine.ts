import { TFile, TFolder, type App } from 'obsidian';
import { stableFingerprint } from './fingerprint';
import {
	extractNoteBrief,
	hasNoteBrief,
	noteSourceContent,
	removeNoteBrief,
	renderNoteBrief,
	upsertNoteBrief,
} from './note-brief-format';
import {
	buildNoteBriefPrompt,
	NOTE_BRIEF_SYSTEM_PROMPT,
	normalizeNoteBriefMarkdown,
} from './note-brief-prompt';
import { aiExclusionReason } from './privacy';
import { generateText, type ProviderConfiguration } from './providers';
import type {
	FolderIntelligenceSettings,
	NoteSummaryRecord,
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

export interface NoteBriefEstimate extends RequestEstimate {
	path: string;
	profile: ProviderProfile;
	hasBrief: boolean;
	stale: boolean;
	configured: boolean;
	blockedReason?: string;
}

export interface NoteBriefEngineOptions {
	app: App;
	getSettings: () => FolderIntelligenceSettings;
	getSessionApiKey: (profileId: string) => string;
	resolveProfile: (folder: TFolder) => ProviderProfile;
	recordUsage: (record: UsageRecord) => Promise<void>;
	upsertRecord: (record: NoteSummaryRecord) => Promise<void>;
	removeRecord: (path: string) => Promise<void>;
}

export class NoteBriefEngine {
	private readonly app: App;
	private readonly getSettings: () => FolderIntelligenceSettings;
	private readonly getSessionApiKey: (profileId: string) => string;
	private readonly resolveProfile: (folder: TFolder) => ProviderProfile;
	private readonly recordUsage: (record: UsageRecord) => Promise<void>;
	private readonly upsertRecord: (record: NoteSummaryRecord) => Promise<void>;
	private readonly removeRecord: (path: string) => Promise<void>;
	private readonly activeSummaries = new Map<string, Promise<void>>();

	constructor(options: NoteBriefEngineOptions) {
		this.app = options.app;
		this.getSettings = options.getSettings;
		this.getSessionApiKey = options.getSessionApiKey;
		this.resolveProfile = options.resolveProfile;
		this.recordUsage = options.recordUsage;
		this.upsertRecord = options.upsertRecord;
		this.removeRecord = options.removeRecord;
	}

	hasRecordedBrief(file: TFile): boolean {
		return this.getSettings().noteSummaryRecords.some(
			(record) => record.path === file.path,
		);
	}

	async estimate(file: TFile): Promise<NoteBriefEstimate> {
		this.assertSummarizable(file);
		const settings = this.getSettings();
		const exclusionReason = aiExclusionReason(this.app, settings, file);
		if (exclusionReason)
			throw new Error(
				`This note is excluded from AI because of its ${exclusionReason}.`,
			);
		const folder = file.parent;
		if (!(folder instanceof TFolder))
			throw new Error('The note must be inside a vault folder.');
		const profile = this.resolveProfile(folder);
		const content = await this.app.vault.cachedRead(file);
		const source = noteSourceContent(content);
		if (!source.trim())
			throw new Error('This note has no content to summarize.');
		const prompt = buildNoteBriefPrompt(file.path, source, {
			maxCharacters: profile.maxCharactersPerNote,
			customInstructions: profile.customInstructions,
		});
		const maxOutputTokens = Math.min(
			profile.maxOutputTokens,
			settings.noteBriefMaxOutputTokens,
		);
		const estimate = estimateRequest(
			NOTE_BRIEF_SYSTEM_PROMPT.length + prompt.length,
			{ ...profile, maxOutputTokens },
		);
		const record = settings.noteSummaryRecords.find(
			(item) => item.path === file.path,
		);
		return {
			...estimate,
			path: file.path,
			profile,
			hasBrief: hasNoteBrief(content),
			stale: record?.fingerprint !== this.sourceFingerprint(source),
			configured:
				Boolean(profile.model.trim()) &&
				(profile.provider === 'custom' || this.hasApiKey(profile)),
			blockedReason: budgetBlockReason(
				profile,
				settings.usageRecords,
				estimate,
			),
		};
	}

	async summarize(file: TFile): Promise<void> {
		const active = this.activeSummaries.get(file.path);
		if (active) return active;
		const operation = this.performSummary(file).finally(() =>
			this.activeSummaries.delete(file.path),
		);
		this.activeSummaries.set(file.path, operation);
		return operation;
	}

	async remove(file: TFile): Promise<boolean> {
		this.assertSummarizable(file);
		let removed = false;
		await this.app.vault.process(file, (content) => {
			if (!hasNoteBrief(content)) return content;
			removed = true;
			return removeNoteBrief(content);
		});
		await this.removeRecord(file.path);
		return removed;
	}

	extractFreshBrief(file: TFile, content: string): string | undefined {
		if (!this.getSettings().preferFreshNoteBriefsInFolderSummaries)
			return undefined;
		const source = noteSourceContent(content);
		const record = this.getSettings().noteSummaryRecords.find(
			(item) => item.path === file.path,
		);
		if (record?.fingerprint !== this.sourceFingerprint(source))
			return undefined;
		return extractNoteBrief(content);
	}

	private async performSummary(file: TFile): Promise<void> {
		const estimate = await this.estimate(file);
		if (estimate.blockedReason) throw new Error(estimate.blockedReason);
		if (!estimate.configured)
			throw new Error(
				`${estimate.profile.name} needs a model and API key in settings.`,
			);
		const original = await this.app.vault.cachedRead(file);
		const source = noteSourceContent(original);
		const fingerprint = this.sourceFingerprint(source);
		const prompt = buildNoteBriefPrompt(file.path, source, {
			maxCharacters: estimate.profile.maxCharactersPerNote,
			customInstructions: estimate.profile.customInstructions,
		});
		const configuration: ProviderConfiguration = {
			provider: estimate.profile.provider,
			customProtocol: estimate.profile.customProtocol,
			baseUrl: estimate.profile.baseUrl,
			model: estimate.profile.model,
			apiKey:
				this.getSessionApiKey(estimate.profile.id) ||
				estimate.profile.apiKey,
		};
		const rawMarkdown = await generateText(configuration, {
			system: NOTE_BRIEF_SYSTEM_PROMPT,
			prompt,
			maxOutputTokens: estimate.maxOutputTokens,
		});
		const markdown = normalizeNoteBriefMarkdown(rawMarkdown);
		if (!markdown)
			throw new Error('The provider returned an empty note brief.');
		const generatedAt = new Date().toISOString();
		const estimatedOutputTokens = estimateTokens(rawMarkdown.length);
		await this.recordUsage({
			timestamp: generatedAt,
			profileId: estimate.profile.id,
			provider: estimate.profile.provider,
			model: estimate.profile.model,
			folderPath: file.path,
			inputCharacters: estimate.inputCharacters,
			estimatedInputTokens: estimate.estimatedInputTokens,
			outputCharacters: rawMarkdown.length,
			estimatedOutputTokens,
			estimatedCostUsd: actualEstimatedCost(
				estimate.profile,
				estimate.estimatedInputTokens,
				estimatedOutputTokens,
			),
		});
		const callout = renderNoteBrief(markdown, {
			generatedAt,
			profileName: estimate.profile.name,
			provider: estimate.profile.provider,
			model: estimate.profile.model,
		});
		await this.app.vault.process(file, (current) => {
			const latestSource = noteSourceContent(current);
			if (this.sourceFingerprint(latestSource) !== fingerprint)
				throw new Error(
					'The note changed while its brief was being generated. The result was not inserted.',
				);
			return upsertNoteBrief(current, callout);
		});
		await this.upsertRecord({
			path: file.path,
			fingerprint,
			provider: estimate.profile.provider,
			model: estimate.profile.model,
			profileId: estimate.profile.id,
			profileName: estimate.profile.name,
			generatedAt,
		});
	}

	private sourceFingerprint(source: string): string {
		return stableFingerprint([source]);
	}

	private hasApiKey(profile: ProviderProfile): boolean {
		return Boolean(this.getSessionApiKey(profile.id) || profile.apiKey);
	}

	private assertSummarizable(file: TFile): void {
		if (file.extension.toLowerCase() !== 'md')
			throw new Error('Only Markdown notes can have AI note briefs.');
		const frontmatter =
			this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (frontmatter?.['folder-intelligence'] === 'dashboard')
			throw new Error('Folder dashboards use AI folder briefs instead.');
	}
}
