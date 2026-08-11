import {
	Menu,
	Modal,
	Notice,
	Plugin,
	Setting,
	TAbstractFile,
	TFile,
	TFolder,
} from 'obsidian';
import {
	DashboardEngine,
	type SubtreePreflight,
	type SubtreeProgress,
} from './dashboard-engine';
import { dashboardPath, parentPath, pathBasename } from './path-utils';
import { migrateProviderProfiles } from './profiles';
import { DEFAULT_SETTINGS, FolderIntelligenceSettingTab } from './settings';
import type { FolderIntelligenceSettings } from './types';
import { pruneUsageRecords } from './usage';

function formatCost(value: number | undefined): string {
	return value === undefined
		? 'unavailable until pricing is entered'
		: value < 0.01
			? `<$0.01`
			: `$${value.toFixed(2)}`;
}

class InitializeDashboardsModal extends Modal {
	constructor(
		plugin: FolderIntelligencePlugin,
		private readonly onConfirm: () => Promise<void>,
	) {
		super(plugin.app);
	}

	onOpen(): void {
		this.contentEl.createEl('h2', {
			text: 'Initialize folder dashboards?',
		});
		this.contentEl.createEl('p', {
			text: 'Folder intelligence will create a Markdown dashboard in every non-ignored folder. Existing notes are preserved and only marked managed sections are updated.',
		});
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText('Create dashboards')
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);
						await this.onConfirm();
						this.close();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class SummaryConfirmationModal extends Modal {
	constructor(
		plugin: FolderIntelligencePlugin,
		private readonly folder: TFolder,
		private readonly engine: DashboardEngine,
	) {
		super(plugin.app);
	}

	onOpen(): void {
		this.contentEl.createEl('h2', { text: 'Refresh AI folder brief?' });
		const details = this.contentEl.createEl('p', {
			text: 'Calculating the request…',
		});
		const actions = new Setting(this.contentEl);
		actions.addButton((button) =>
			button.setButtonText('Cancel').onClick(() => this.close()),
		);
		void this.engine
			.estimateSummary(this.folder)
			.then((estimate) => {
				details.setText(
					`${estimate.profile.name} · ${estimate.profile.provider} / ${estimate.profile.model} · about ${estimate.estimatedInputTokens.toLocaleString()} input tokens · maximum estimated cost ${formatCost(estimate.maxEstimatedCostUsd)}.`,
				);
				if (estimate.blockedReason) {
					this.contentEl.createEl('p', {
						text: estimate.blockedReason,
						cls: 'mod-warning',
					});
					return;
				}
				if (!estimate.configured) {
					this.contentEl.createEl('p', {
						text: `${estimate.profile.name} needs a model and API key in settings.`,
						cls: 'mod-warning',
					});
					return;
				}
				actions.addButton((button) =>
					button
						.setButtonText('Refresh brief')
						.setCta()
						.onClick(async () => {
							button.setDisabled(true);
							try {
								await this.engine.summarize(this.folder);
								this.close();
							} catch (error) {
								button.setDisabled(false);
								new Notice(
									`Folder Intelligence: ${error instanceof Error ? error.message : String(error)}`,
									8000,
								);
							}
						}),
				);
			})
			.catch((error) => {
				details.setText(
					`Could not estimate this request: ${error instanceof Error ? error.message : String(error)}`,
				);
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class SubtreeRefreshModal extends Modal {
	private createMissing = false;
	private preflight?: SubtreePreflight;
	private abortController?: AbortController;
	private running = false;

	constructor(
		plugin: FolderIntelligencePlugin,
		private readonly folder: TFolder,
		private readonly engine: DashboardEngine,
	) {
		super(plugin.app);
	}

	onOpen(): void {
		void this.render();
	}

	private async render(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.createEl('h2', {
			text: `Refresh ${this.folder.name} subtree`,
		});
		this.contentEl.createEl('p', {
			text: 'Child folders are summarized deepest-first so each parent receives the latest child briefs. Current dashboards are skipped.',
		});
		new Setting(this.contentEl)
			.setName('Create missing dashboards')
			.setDesc(
				'Off keeps this limited to folders where you already created a dashboard.',
			)
			.addToggle((toggle) =>
				toggle.setValue(this.createMissing).onChange((value) => {
					this.createMissing = value;
					void this.render();
				}),
			);
		const summary = this.contentEl.createEl('p', {
			text: 'Scanning folders and estimating requests…',
		});
		this.preflight = await this.engine.preflightSubtree(
			this.folder,
			this.createMissing,
		);
		if (!this.contentEl.isConnected) return;
		summary.setText(
			`${this.preflight.folderCount} dashboard(s): ${this.preflight.staleCount} stale, ${this.preflight.currentCount} current, ${this.preflight.missingDashboardCount} missing. Up to ${this.preflight.requestCount} provider request(s); maximum estimated cost ${formatCost(this.preflight.maxEstimatedCostUsd)}.`,
		);
		const blocked = this.preflight.estimates.filter(
			(estimate) =>
				estimate.stale &&
				(estimate.blockedReason || !estimate.configured),
		);
		if (blocked.length) {
			this.contentEl.createEl('p', {
				text: `${blocked.length} stale folder(s) are not currently runnable because a profile is unconfigured or over budget. They will be reported as failed without making a request.`,
				cls: 'mod-warning',
			});
		}
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText('Refresh subtree')
					.setCta()
					.setDisabled(this.preflight?.staleCount === 0)
					.onClick(() => void this.run()),
			);
	}

	private async run(): Promise<void> {
		this.running = true;
		this.contentEl.empty();
		this.contentEl.createEl('h2', { text: 'Refreshing subtree…' });
		const progress = this.contentEl.createEl('progress');
		progress.max = Math.max(1, this.preflight?.folderCount ?? 1);
		progress.value = 0;
		const status = this.contentEl.createEl('p', { text: 'Starting…' });
		this.abortController = new AbortController();
		new Setting(this.contentEl).addButton((button) =>
			button.setButtonText('Cancel after current folder').onClick(() => {
				button.setDisabled(true);
				this.abortController?.abort();
				status.setText('Cancelling after the current request…');
			}),
		);
		const onProgress = (update: SubtreeProgress): void => {
			progress.value = update.completed;
			status.setText(
				`${update.completed}/${update.total}: ${update.folderPath} — ${update.status}${update.message ? ` (${update.message})` : ''}`,
			);
		};
		const result = await this.engine.refreshSubtree(this.folder, {
			createMissingDashboards: this.createMissing,
			signal: this.abortController.signal,
			onProgress,
		});
		this.running = false;
		this.contentEl.empty();
		this.contentEl.createEl('h2', {
			text: result.cancelled
				? 'Subtree refresh cancelled'
				: 'Subtree refresh complete',
		});
		this.contentEl.createEl('p', {
			text: `${result.refreshed} refreshed, ${result.skipped} already current, ${result.failed} failed.`,
		});
		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText('Close')
				.setCta()
				.onClick(() => this.close()),
		);
	}

	onClose(): void {
		if (this.running) this.abortController?.abort();
		this.contentEl.empty();
	}
}

export default class FolderIntelligencePlugin extends Plugin {
	settings: FolderIntelligenceSettings = DEFAULT_SETTINGS;
	private sessionApiKeys = new Map<string, string>();
	private engine!: DashboardEngine;
	private pendingIndexRefreshes = new Map<string, number>();
	private knownFolderPaths = new Set<string>();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.engine = new DashboardEngine({
			app: this.app,
			getSettings: () => this.settings,
			getSessionApiKey: (profileId) =>
				this.sessionApiKeys.get(profileId) ?? '',
			recordUsage: async (record) => {
				this.settings.usageRecords = pruneUsageRecords([
					...this.settings.usageRecords,
					record,
				]);
				await this.saveSettings();
			},
		});
		for (const file of this.app.vault.getAllLoadedFiles()) {
			if (file instanceof TFolder) this.knownFolderPaths.add(file.path);
		}

		this.addRibbonIcon('layout-dashboard', 'Open folder dashboard', () => {
			void this.runSafely(() => this.openCurrentFolderDashboard());
		});
		this.addSettingTab(new FolderIntelligenceSettingTab(this.app, this));
		this.registerCommands();
		this.registerEvents();
	}

	onunload(): void {
		for (const timeout of this.pendingIndexRefreshes.values())
			window.clearTimeout(timeout);
		this.pendingIndexRefreshes.clear();
		this.knownFolderPaths.clear();
		this.sessionApiKeys.clear();
	}

	async loadSettings(): Promise<void> {
		const loaded =
			(await this.loadData()) as Partial<FolderIntelligenceSettings> | null;
		const merged: FolderIntelligenceSettings = {
			...DEFAULT_SETTINGS,
			...loaded,
			profiles: loaded?.profiles ?? [],
			folderProfileRules: loaded?.folderProfileRules ?? [],
			usageRecords: loaded?.usageRecords ?? [],
		};
		this.settings = migrateProviderProfiles(merged);
		this.settings.usageRecords = pruneUsageRecords(
			this.settings.usageRecords,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	setSessionApiKey(profileId: string, value: string): void {
		if (value) this.sessionApiKeys.set(profileId, value);
		else this.sessionApiKeys.delete(profileId);
	}

	currentApiKey(profileId = this.settings.defaultProfileId): string {
		const profile = this.settings.profiles.find(
			(item) => item.id === profileId,
		);
		return this.sessionApiKeys.get(profileId) || profile?.apiKey || '';
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'open-folder-dashboard',
			name: 'Open or create dashboard for current folder',
			callback: () =>
				void this.runSafely(() => this.openCurrentFolderDashboard()),
		});
		this.addCommand({
			id: 'refresh-folder-dashboard',
			name: 'Refresh local index for current folder',
			callback: () =>
				void this.runSafely(() => this.refreshCurrentFolder()),
		});
		this.addCommand({
			id: 'summarize-folder-dashboard',
			name: 'Refresh AI summary for current folder',
			callback: () =>
				void this.runSafely(() => this.summarizeCurrentFolder()),
		});
		this.addCommand({
			id: 'refresh-folder-dashboard-subtree',
			name: 'Refresh AI summaries for current folder subtree',
			callback: () => {
				const folder = this.currentFolder();
				if (!folder || !folder.path) {
					new Notice('Open a note inside a folder first.');
					return;
				}
				new SubtreeRefreshModal(this, folder, this.engine).open();
			},
		});
		this.addCommand({
			id: 'initialize-all-folder-dashboards',
			name: 'Initialize dashboards for all folders',
			callback: () => {
				new InitializeDashboardsModal(this, async () => {
					await this.runSafely(async () => {
						const count = await this.engine.initializeAllFolders();
						new Notice(
							`Folder Intelligence created or refreshed ${count} dashboard(s).`,
						);
					});
				}).open();
			},
		});
		this.addCommand({
			id: 'mark-note-sensitive',
			name: 'Toggle sensitive property on current note',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || this.engine.isDashboard(file)) return false;
				if (!checking)
					void this.runSafely(() => this.toggleSensitive(file));
				return true;
			},
		});
	}

	private registerEvents(): void {
		this.registerEvent(
			this.app.workspace.on(
				'file-menu',
				(menu: Menu, file: TAbstractFile) => {
					if (
						!(file instanceof TFolder) ||
						this.engine.shouldIgnoreFolder(file)
					)
						return;
					menu.addSeparator();
					menu.addItem((item) =>
						item
							.setTitle('Open folder dashboard')
							.setIcon('layout-dashboard')
							.onClick(
								() =>
									void this.runSafely(() =>
										this.engine.ensureDashboard(file, true),
									),
							),
					);
					menu.addItem((item) =>
						item
							.setTitle('Refresh AI folder brief')
							.setIcon('sparkles')
							.onClick(() =>
								new SummaryConfirmationModal(
									this,
									file,
									this.engine,
								).open(),
							),
					);
					menu.addItem((item) =>
						item
							.setTitle('Refresh AI subtree…')
							.setIcon('git-fork')
							.onClick(() =>
								new SubtreeRefreshModal(
									this,
									file,
									this.engine,
								).open(),
							),
					);
				},
			),
		);

		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFolder) {
					const isNewFolder = !this.knownFolderPaths.has(file.path);
					this.knownFolderPaths.add(file.path);
					if (
						isNewFolder &&
						this.settings.autoCreateDashboardForNewFolders
					) {
						void this.runSafely(() =>
							this.engine.ensureDashboard(file),
						);
					}
				}
				this.queueAffectedIndex(file);
			}),
		);
		this.registerEvent(
			this.app.vault.on('modify', (file) =>
				this.queueAffectedIndex(file),
			),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFolder)
					this.knownFolderPaths.delete(file.path);
				this.queueAffectedIndex(file);
			}),
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFolder) {
					this.knownFolderPaths.delete(oldPath);
					this.knownFolderPaths.add(file.path);
					void this.runSafely(() =>
						this.handleFolderRename(file, oldPath),
					);
				}
				this.queueAffectedIndex(file);
			}),
		);
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (!file || !this.engine.isDashboard(file)) return;
				const folder = file.parent;
				if (!folder) return;
				void this.runSafely(async () => {
					await this.engine.refreshIndex(folder);
					if (
						this.settings.autoSummarizeOnOpen &&
						this.engine.canSummarize(folder) &&
						(await this.engine.isSummaryStale(folder))
					) {
						await this.engine.summarize(folder);
					}
				});
			}),
		);
	}

	private currentFolder(): TFolder | undefined {
		const file = this.app.workspace.getActiveFile();
		return file?.parent ?? undefined;
	}

	private async openCurrentFolderDashboard(): Promise<void> {
		const folder = this.currentFolder();
		if (!folder || !folder.path)
			throw new Error('Open a note inside a folder first.');
		await this.engine.ensureDashboard(folder, true);
	}

	private async refreshCurrentFolder(): Promise<void> {
		const folder = this.currentFolder();
		if (!folder || !folder.path)
			throw new Error('Open a note inside a folder first.');
		await this.engine.ensureDashboard(folder);
		await this.engine.refreshIndex(folder);
		new Notice(
			`Folder Intelligence refreshed the local index for ${folder.name}.`,
		);
	}

	private async summarizeCurrentFolder(): Promise<void> {
		const folder = this.currentFolder();
		if (!folder || !folder.path)
			throw new Error('Open a note inside a folder first.');
		new SummaryConfirmationModal(this, folder, this.engine).open();
	}

	private queueAffectedIndex(file: TAbstractFile): void {
		if (!this.settings.autoRefreshIndex) return;
		let affectedPath =
			file instanceof TFolder ? parentPath(file.path) : file.parent?.path;
		if (file instanceof TFile && this.engine.isDashboard(file))
			affectedPath = file.parent?.parent?.path;
		if (!affectedPath) return;
		const abstractFolder =
			this.app.vault.getAbstractFileByPath(affectedPath);
		if (
			!(abstractFolder instanceof TFolder) ||
			this.engine.shouldIgnoreFolder(abstractFolder)
		)
			return;

		const previous = this.pendingIndexRefreshes.get(affectedPath);
		if (previous !== undefined) window.clearTimeout(previous);
		const timeout = window.setTimeout(() => {
			this.pendingIndexRefreshes.delete(affectedPath);
			void this.runSafely(() => this.engine.refreshIndex(abstractFolder));
		}, this.settings.changeDebounceMs);
		this.pendingIndexRefreshes.set(affectedPath, timeout);
	}

	private async toggleSensitive(file: TFile): Promise<void> {
		const property = this.settings.sensitiveProperties[0] || 'sensitive';
		let enabled = false;
		await this.app.fileManager.processFrontMatter(
			file,
			(frontmatter: Record<string, unknown>) => {
				enabled = frontmatter[property] !== true;
				frontmatter[property] = enabled;
			},
		);
		new Notice(
			`${file.basename} is ${enabled ? 'excluded from' : 'eligible for'} AI context.`,
		);
	}

	private async handleFolderRename(
		folder: TFolder,
		oldPath: string,
	): Promise<void> {
		const oldName = pathBasename(oldPath);
		const movedDashboardPath = `${folder.path}/${oldName}.md`;
		const targetPath = dashboardPath(
			folder.path,
			this.settings.dashboardNameTemplate,
		);
		let dashboard =
			this.app.vault.getAbstractFileByPath(movedDashboardPath);

		if (movedDashboardPath !== targetPath && dashboard instanceof TFile) {
			const content = await this.app.vault.cachedRead(dashboard);
			if (/^folder-intelligence:\s*dashboard\s*$/m.test(content)) {
				if (this.app.vault.getAbstractFileByPath(targetPath)) {
					new Notice(
						`Folder Intelligence could not rename ${movedDashboardPath}; ${targetPath} already exists.`,
					);
				} else {
					await this.app.fileManager.renameFile(
						dashboard,
						targetPath,
					);
					dashboard =
						this.app.vault.getAbstractFileByPath(targetPath);
				}
			}
		}

		if (dashboard instanceof TFile) {
			await this.app.vault.process(dashboard, (content) =>
				content.replace(
					/^folder:\s*.*$/m,
					`folder: "${folder.path.replaceAll('"', '\\"')}"`,
				),
			);
		} else if (this.settings.autoCreateDashboardForNewFolders) {
			await this.engine.ensureDashboard(folder);
		}
	}

	private async runSafely(operation: () => Promise<unknown>): Promise<void> {
		try {
			await operation();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			console.error('Folder Intelligence:', error);
			new Notice(`Folder Intelligence: ${message}`, 8000);
		}
	}
}
