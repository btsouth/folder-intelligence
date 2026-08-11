import {
	App,
	PluginSettingTab,
	Setting,
	type SettingDefinitionItem,
} from 'obsidian';
import type FolderIntelligencePlugin from './main';
import {
	createProviderProfile,
	newProfileId,
	parseProfileRules,
	serializeProfileRules,
} from './profiles';
import { PROVIDER_DEFAULTS } from './provider-defaults';
import type {
	FolderIntelligenceSettings,
	ProviderKind,
	ProviderProfile,
} from './types';

export const DEFAULT_SETTINGS: FolderIntelligenceSettings = {
	dashboardNameTemplate: '{folder}.md',
	autoCreateDashboardForNewFolders: false,
	autoRefreshIndex: true,
	autoSummarizeOnOpen: true,
	changeDebounceMs: 1500,
	ignoredFolderPatterns: ['.trash/**', 'Templates/**', 'Attachments/**'],
	excludedAiPathPatterns: ['Private/**', 'Sensitive/**'],
	sensitiveProperties: ['sensitive', 'private', 'ai-exclude'],
	provider: 'openai',
	customProtocol: 'responses',
	baseUrl: PROVIDER_DEFAULTS.openai.baseUrl,
	model: PROVIDER_DEFAULTS.openai.model,
	rememberApiKey: false,
	apiKey: '',
	maxCharactersPerNote: 12_000,
	maxCharactersPerFolder: 100_000,
	customInstructions: '',
	profiles: [createProviderProfile()],
	defaultProfileId: 'default',
	folderProfileRules: [],
	usageRecords: [],
	noteSummaryRecords: [],
	noteBriefMaxOutputTokens: 700,
	preferFreshNoteBriefsInFolderSummaries: true,
};

function lines(value: string): string[] {
	return value
		.split('\n')
		.map((item) => item.trim())
		.filter(Boolean);
}

function providerOptions(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(PROVIDER_DEFAULTS).map(([value, provider]) => [
			value,
			provider.label,
		]),
	);
}

export class FolderIntelligenceSettingTab extends PluginSettingTab {
	plugin: FolderIntelligencePlugin;
	private editingProfileId: string;

	constructor(app: App, plugin: FolderIntelligencePlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.editingProfileId = plugin.settings.defaultProfileId;
	}

	private editingProfile(): ProviderProfile {
		return (
			this.plugin.settings.profiles.find(
				(profile) => profile.id === this.editingProfileId,
			) ?? this.plugin.settings.profiles[0]!
		);
	}

	private profileOptions(): Record<string, string> {
		return Object.fromEntries(
			this.plugin.settings.profiles.map((profile) => [
				profile.id,
				profile.name,
			]),
		);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: 'group',
				heading: 'Dashboards',
				items: [
					{
						name: 'Dashboard note name',
						desc: 'Use {folder} for the folder name. The default works with Folder Notes.',
						control: {
							type: 'text',
							key: 'dashboardNameTemplate',
							placeholder: '{folder}.md',
							validate: (value) =>
								value.trim()
									? undefined
									: 'Enter a dashboard filename.',
						},
					},
					{
						name: 'Create dashboards for new folders',
						desc: 'Optional. Off by default so dashboards are created one folder at a time from the folder menu.',
						control: {
							type: 'toggle',
							key: 'autoCreateDashboardForNewFolders',
						},
					},
					{
						name: 'Keep indexes current',
						desc: 'Debounces file changes and updates local folder indexes without calling AI.',
						control: { type: 'toggle', key: 'autoRefreshIndex' },
					},
					{
						name: 'Refresh stale summary when opened',
						desc: 'Makes at most one provider request when a stale dashboard is opened. Disable for manual-only AI.',
						control: { type: 'toggle', key: 'autoSummarizeOnOpen' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Privacy and exclusions',
				items: [
					{
						name: 'Ignored folders',
						desc: 'One vault-relative glob per line. No dashboard is created or maintained for these folders.',
						control: {
							type: 'textarea',
							key: 'ignoredFolderPatternsText',
							rows: 4,
						},
					},
					{
						name: 'Never send these paths to AI',
						desc: 'Notes remain visible in the local index with a lock icon, but their contents never enter AI context.',
						control: {
							type: 'textarea',
							key: 'excludedAiPathPatternsText',
							rows: 4,
						},
					},
					{
						name: 'Sensitive properties',
						desc: 'Comma-separated boolean frontmatter properties that exclude a note from AI.',
						control: {
							type: 'text',
							key: 'sensitivePropertiesText',
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'AI note briefs',
				items: [
					{
						name: 'Use fresh note briefs in folder summaries',
						desc: 'When a note brief is current, folder AI uses that shorter brief instead of resending the full note. Sensitive-note rules still apply.',
						control: {
							type: 'toggle',
							key: 'preferFreshNoteBriefsInFolderSummaries',
						},
					},
					{
						name: 'Maximum note-brief output tokens',
						desc: 'Keeps individual note summaries compact. The selected profile’s lower output limit still wins.',
						control: {
							type: 'number',
							key: 'noteBriefMaxOutputTokens',
							min: 128,
							max: 4000,
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'AI profiles',
				items: [
					{
						name: 'Default profile',
						desc: 'Used unless a dashboard override or folder route selects another profile.',
						control: {
							type: 'dropdown',
							key: 'defaultProfileId',
							options: this.profileOptions(),
						},
					},
					{
						name: 'Profile to edit',
						desc: 'Profiles keep provider, model, key, limits, and pricing together.',
						render: (setting) => {
							setting.addDropdown((dropdown) => {
								for (const [id, name] of Object.entries(
									this.profileOptions(),
								))
									dropdown.addOption(id, name);
								dropdown
									.setValue(this.editingProfile().id)
									.onChange((id) => {
										this.editingProfileId = id;
										this.rerender();
									});
							});
							setting.addButton((button) =>
								button
									.setButtonText('Add')
									.onClick(async () => {
										const source = this.editingProfile();
										const id = newProfileId(
											this.plugin.settings.profiles.map(
												(profile) => profile.id,
											),
										);
										this.plugin.settings.profiles.push(
											createProviderProfile(
												source.provider,
												{
													...source,
													id,
													name: `Profile ${this.plugin.settings.profiles.length + 1}`,
													apiKey: '',
												},
											),
										);
										this.editingProfileId = id;
										await this.plugin.saveSettings();
										this.rerender();
									}),
							);
							if (this.plugin.settings.profiles.length > 1)
								setting.addButton((button) => {
									button.setButtonText('Delete');
									button.buttonEl.addClass('mod-warning');
									button.onClick(async () => {
										const removedId =
											this.editingProfile().id;
										this.plugin.settings.profiles =
											this.plugin.settings.profiles.filter(
												(profile) =>
													profile.id !== removedId,
											);
										const next =
											this.plugin.settings.profiles[0]!;
										this.plugin.settings.folderProfileRules =
											this.plugin.settings.folderProfileRules.filter(
												(rule) =>
													rule.profileId !==
													removedId,
											);
										if (
											this.plugin.settings
												.defaultProfileId === removedId
										)
											this.plugin.settings.defaultProfileId =
												next.id;
										this.editingProfileId = next.id;
										await this.plugin.saveSettings();
										this.rerender();
									});
								});
						},
					},
					{
						name: 'Profile name',
						desc: 'A human-readable name such as Work or Personal.',
						control: { type: 'text', key: 'profileName' },
					},
					{
						name: 'Folder routes',
						desc: 'One route per line, first match wins. Example: 03 Work/** => Work',
						control: {
							type: 'textarea',
							key: 'folderProfileRulesText',
							rows: 4,
						},
					},
					{
						name: 'Provider',
						desc: 'No provider is contacted until a summary is confirmed or auto-refresh runs.',
						control: {
							type: 'dropdown',
							key: 'provider',
							options: providerOptions(),
						},
					},
					{
						name: 'Model',
						desc: 'Use any model ID available to your provider account.',
						control: {
							type: 'text',
							key: 'model',
							validate: (value) =>
								value.trim() ? undefined : 'Enter a model ID.',
						},
					},
					{
						name: 'API style',
						desc: 'Choose the protocol exposed by the compatible server.',
						visible: () =>
							this.editingProfile().provider === 'custom',
						control: {
							type: 'dropdown',
							key: 'customProtocol',
							options: {
								'chat-completions': 'Chat completions',
								responses: 'Responses',
							},
						},
					},
					{
						name: 'Base URL',
						desc: 'Advanced: change this for compatible gateways or local servers.',
						control: {
							type: 'text',
							key: 'baseUrl',
							validate: (value) =>
								/^https?:\/\//i.test(value)
									? undefined
									: 'Enter an HTTP or HTTPS base URL.',
						},
					},
					{
						name: 'API key',
						desc: this.editingProfile().rememberApiKey
							? 'Saved in this plugin’s data.json. It may be copied by vault sync or backup tools.'
							: 'Kept in memory only and forgotten when Obsidian closes.',
						render: (setting) => {
							setting.addText((text) => {
								text.inputEl.type = 'password';
								text.setPlaceholder('Enter API key');
								text.setValue(
									this.plugin.currentApiKey(
										this.editingProfile().id,
									),
								);
								text.onChange((value) => {
									const profile = this.editingProfile();
									if (profile.rememberApiKey) {
										profile.apiKey = value.trim();
										void this.plugin.saveSettings();
									} else {
										this.plugin.setSessionApiKey(
											profile.id,
											value.trim(),
										);
									}
								});
							});
						},
					},
					{
						name: 'Remember API key',
						desc: 'Off is safest. Obsidian does not provide community plugins with portable secure credential storage.',
						control: { type: 'toggle', key: 'rememberApiKey' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Selected profile limits',
				items: [
					{
						name: 'Input price per million tokens',
						desc: 'Used only for local estimates. Set 0 if unknown.',
						control: {
							type: 'number',
							key: 'inputPricePerMillion',
							min: 0,
						},
					},
					{
						name: 'Output price per million tokens',
						desc: 'Used only for local estimates. Set 0 if unknown.',
						control: {
							type: 'number',
							key: 'outputPricePerMillion',
							min: 0,
						},
					},
					{
						name: 'Daily request limit',
						desc: 'Hard local safety limit for this profile. Set 0 for unlimited.',
						control: {
							type: 'number',
							key: 'dailyRequestLimit',
							min: 0,
						},
					},
					{
						name: 'Monthly budget (USD)',
						desc: 'Blocks requests whose estimated maximum would cross this local budget. Set 0 for unlimited.',
						control: {
							type: 'number',
							key: 'monthlyBudgetUsd',
							min: 0,
						},
					},
					{
						name: 'Maximum output tokens',
						desc: 'Maximum tokens requested for each folder brief.',
						control: {
							type: 'number',
							key: 'maxOutputTokens',
							min: 128,
							max: 32_000,
						},
					},
					{
						name: 'Characters per note',
						desc: 'Longer notes are truncated in AI context, never on disk.',
						control: {
							type: 'number',
							key: 'maxCharactersPerNote',
							min: 1000,
							max: 1_000_000,
						},
					},
					{
						name: 'Characters per folder',
						desc: 'Hard ceiling for the combined AI input assembled from a folder.',
						control: {
							type: 'number',
							key: 'maxCharactersPerFolder',
							min: 5000,
							max: 5_000_000,
						},
					},
					{
						name: 'Summary preferences',
						desc: 'Optional style or domain guidance. Note content can never override the plugin’s safety instructions.',
						control: {
							type: 'textarea',
							key: 'customInstructions',
							rows: 5,
						},
					},
				],
			},
		];
	}

	display(): void {
		this.renderLegacySettings();
	}

	private renderLegacySettings(): void {
		const { containerEl } = this;
		const profile = this.editingProfile();
		containerEl.empty();
		containerEl.createEl('p', {
			text: 'Dashboards and indexes stay local. Only an AI summary sends eligible note text to the provider selected below.',
			cls: 'folder-intelligence-settings-intro',
		});

		new Setting(containerEl).setName('Dashboards').setHeading();
		new Setting(containerEl)
			.setName('Dashboard note name')
			.setDesc(
				'Use {folder} for the folder name. The default works with Folder Notes.',
			)
			.addText((text) =>
				text
					.setPlaceholder('{folder}.md')
					.setValue(this.plugin.settings.dashboardNameTemplate)
					.onChange((value) =>
						this.setControlValue('dashboardNameTemplate', value),
					),
			);
		this.addLegacyToggle(
			containerEl,
			'Create dashboards for new folders',
			'Optional. Off by default so dashboards are created one folder at a time from the folder menu.',
			'autoCreateDashboardForNewFolders',
			this.plugin.settings.autoCreateDashboardForNewFolders,
		);
		this.addLegacyToggle(
			containerEl,
			'Keep indexes current',
			'Debounces file changes and updates local folder indexes without calling AI.',
			'autoRefreshIndex',
			this.plugin.settings.autoRefreshIndex,
		);
		this.addLegacyToggle(
			containerEl,
			'Refresh stale summary when opened',
			'Makes at most one provider request when a stale dashboard is opened.',
			'autoSummarizeOnOpen',
			this.plugin.settings.autoSummarizeOnOpen,
		);

		new Setting(containerEl).setName('Privacy and exclusions').setHeading();
		this.addLegacyTextArea(
			containerEl,
			'Ignored folders',
			'One vault-relative glob per line. No dashboard is created or maintained for these folders.',
			'ignoredFolderPatternsText',
			this.plugin.settings.ignoredFolderPatterns.join('\n'),
			4,
		);
		this.addLegacyTextArea(
			containerEl,
			'Never send these paths to AI',
			'Notes remain visible in the local index with a lock icon, but their contents never enter AI context.',
			'excludedAiPathPatternsText',
			this.plugin.settings.excludedAiPathPatterns.join('\n'),
			4,
		);
		new Setting(containerEl)
			.setName('Sensitive properties')
			.setDesc(
				'Comma-separated boolean frontmatter properties that exclude a note from AI.',
			)
			.addText((text) =>
				text
					.setValue(
						this.plugin.settings.sensitiveProperties.join(', '),
					)
					.onChange((value) =>
						this.setControlValue('sensitivePropertiesText', value),
					),
			);

		new Setting(containerEl).setName('AI note briefs').setHeading();
		this.addLegacyToggle(
			containerEl,
			'Use fresh note briefs in folder summaries',
			'When a note brief is current, folder AI uses it instead of resending the full note.',
			'preferFreshNoteBriefsInFolderSummaries',
			this.plugin.settings.preferFreshNoteBriefsInFolderSummaries,
		);
		this.addLegacyNumber(
			containerEl,
			'Maximum note-brief output tokens',
			'Keeps individual note summaries compact.',
			'noteBriefMaxOutputTokens',
			this.plugin.settings.noteBriefMaxOutputTokens,
		);

		new Setting(containerEl).setName('AI profiles').setHeading();
		new Setting(containerEl)
			.setName('Default profile')
			.setDesc('Used when no folder route or dashboard override matches.')
			.addDropdown((dropdown) => {
				for (const [id, name] of Object.entries(this.profileOptions()))
					dropdown.addOption(id, name);
				dropdown
					.setValue(this.plugin.settings.defaultProfileId)
					.onChange((id) =>
						this.setControlValue('defaultProfileId', id),
					);
			});
		new Setting(containerEl)
			.setName('Profile to edit')
			.setDesc('Select a named provider configuration.')
			.addDropdown((dropdown) => {
				for (const [id, name] of Object.entries(this.profileOptions()))
					dropdown.addOption(id, name);
				dropdown.setValue(profile.id).onChange((id) => {
					this.editingProfileId = id;
					this.rerender();
				});
			});
		new Setting(containerEl)
			.setName('Profile name')
			.setDesc('For example: Work, personal, local, or cheap.')
			.addText((text) =>
				text
					.setValue(profile.name)
					.onChange((value) =>
						this.setControlValue('profileName', value),
					),
			);
		this.addLegacyTextArea(
			containerEl,
			'Folder routes',
			'One per line, first match wins. Example: 03 Work/** => Work',
			'folderProfileRulesText',
			serializeProfileRules(
				this.plugin.settings.folderProfileRules,
				this.plugin.settings,
			),
			4,
		);
		new Setting(containerEl)
			.setName('Provider')
			.setDesc('No provider is contacted until a summary is generated.')
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(
					providerOptions(),
				)) {
					dropdown.addOption(value, label);
				}
				dropdown
					.setValue(profile.provider)
					.onChange((value) =>
						this.setControlValue('provider', value),
					);
			});
		new Setting(containerEl)
			.setName('Model')
			.setDesc('Use any model ID available to your provider account.')
			.addText((text) =>
				text
					.setValue(profile.model)
					.onChange((value) => this.setControlValue('model', value)),
			);
		if (profile.provider === 'custom') {
			new Setting(containerEl)
				.setName('API style')
				.setDesc(
					'Choose the protocol exposed by the compatible server.',
				)
				.addDropdown((dropdown) =>
					dropdown
						.addOption('chat-completions', 'Chat completions')
						.addOption('responses', 'Responses')
						.setValue(profile.customProtocol)
						.onChange((value) =>
							this.setControlValue('customProtocol', value),
						),
				);
		}
		new Setting(containerEl)
			.setName('Base URL')
			.setDesc(
				'Advanced: change this for compatible gateways or local servers.',
			)
			.addText((text) =>
				text
					.setValue(profile.baseUrl)
					.onChange((value) =>
						this.setControlValue('baseUrl', value),
					),
			);
		new Setting(containerEl)
			.setName('API key')
			.setDesc(
				profile.rememberApiKey
					? 'Saved in this plugin’s data.json. It may be copied by vault sync or backup tools.'
					: 'Kept in memory only and forgotten when Obsidian closes.',
			)
			.addText((text) => {
				text.inputEl.type = 'password';
				text.setPlaceholder('Enter API key');
				text.setValue(this.plugin.currentApiKey(profile.id)).onChange(
					(value) => {
						if (profile.rememberApiKey) {
							profile.apiKey = value.trim();
							void this.plugin.saveSettings();
						} else {
							this.plugin.setSessionApiKey(
								profile.id,
								value.trim(),
							);
						}
					},
				);
			});
		this.addLegacyToggle(
			containerEl,
			'Remember API key',
			'Off is safest. Saved keys may be included in vault sync and backups.',
			'rememberApiKey',
			profile.rememberApiKey,
		);

		new Setting(containerEl)
			.setName('Selected profile limits')
			.setHeading();
		this.addLegacyNumber(
			containerEl,
			'Input price per million tokens',
			'Used only for local estimates. Set 0 if unknown.',
			'inputPricePerMillion',
			profile.inputPricePerMillion,
		);
		this.addLegacyNumber(
			containerEl,
			'Output price per million tokens',
			'Used only for local estimates. Set 0 if unknown.',
			'outputPricePerMillion',
			profile.outputPricePerMillion,
		);
		this.addLegacyNumber(
			containerEl,
			'Daily request limit',
			'Hard local safety limit. Set 0 for unlimited.',
			'dailyRequestLimit',
			profile.dailyRequestLimit,
		);
		this.addLegacyNumber(
			containerEl,
			'Monthly budget (USD)',
			'Blocks a request that would cross this estimated budget. Set 0 for unlimited.',
			'monthlyBudgetUsd',
			profile.monthlyBudgetUsd,
		);
		this.addLegacyNumber(
			containerEl,
			'Maximum output tokens',
			'Maximum tokens requested for each folder brief.',
			'maxOutputTokens',
			profile.maxOutputTokens,
		);
		this.addLegacyNumber(
			containerEl,
			'Characters per note',
			'Longer notes are truncated in AI context, never on disk.',
			'maxCharactersPerNote',
			profile.maxCharactersPerNote,
		);
		this.addLegacyNumber(
			containerEl,
			'Characters per folder',
			'Hard ceiling for the combined AI input assembled from a folder.',
			'maxCharactersPerFolder',
			profile.maxCharactersPerFolder,
		);
		this.addLegacyTextArea(
			containerEl,
			'Summary preferences',
			'Optional style or domain guidance. Note content can never override the plugin’s safety instructions.',
			'customInstructions',
			profile.customInstructions,
			5,
		);
	}

	getControlValue(key: string): unknown {
		switch (key) {
			case 'ignoredFolderPatternsText':
				return this.plugin.settings.ignoredFolderPatterns.join('\n');
			case 'excludedAiPathPatternsText':
				return this.plugin.settings.excludedAiPathPatterns.join('\n');
			case 'sensitivePropertiesText':
				return this.plugin.settings.sensitiveProperties.join(', ');
			case 'folderProfileRulesText':
				return serializeProfileRules(
					this.plugin.settings.folderProfileRules,
					this.plugin.settings,
				);
			case 'profileName':
				return this.editingProfile().name;
			case 'provider':
			case 'customProtocol':
			case 'baseUrl':
			case 'model':
			case 'rememberApiKey':
			case 'maxCharactersPerNote':
			case 'maxCharactersPerFolder':
			case 'customInstructions':
			case 'inputPricePerMillion':
			case 'outputPricePerMillion':
			case 'dailyRequestLimit':
			case 'monthlyBudgetUsd':
			case 'maxOutputTokens':
				return this.editingProfile()[key as keyof ProviderProfile];
			default:
				return this.plugin.settings[
					key as keyof FolderIntelligenceSettings
				];
		}
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const profile = this.editingProfile();
		switch (key) {
			case 'ignoredFolderPatternsText':
				this.plugin.settings.ignoredFolderPatterns = lines(
					String(value),
				);
				break;
			case 'excludedAiPathPatternsText':
				this.plugin.settings.excludedAiPathPatterns = lines(
					String(value),
				);
				break;
			case 'sensitivePropertiesText':
				this.plugin.settings.sensitiveProperties = String(value)
					.split(',')
					.map((item) => item.trim())
					.filter(Boolean);
				break;
			case 'folderProfileRulesText':
				try {
					this.plugin.settings.folderProfileRules = parseProfileRules(
						String(value),
						this.plugin.settings,
					);
				} catch {
					return;
				}
				break;
			case 'profileName':
				profile.name = String(value).trim() || profile.name;
				break;
			case 'defaultProfileId':
				if (
					this.plugin.settings.profiles.some(
						(item) => item.id === String(value),
					)
				)
					this.plugin.settings.defaultProfileId = String(value);
				break;
			case 'provider': {
				const providerKind = String(value) as ProviderKind;
				if (!(providerKind in PROVIDER_DEFAULTS)) return;
				profile.provider = providerKind;
				profile.baseUrl = PROVIDER_DEFAULTS[providerKind].baseUrl;
				profile.model = PROVIDER_DEFAULTS[providerKind].model;
				profile.customProtocol =
					providerKind === 'openai'
						? 'responses'
						: 'chat-completions';
				if (providerKind === 'openai') {
					profile.inputPricePerMillion = 1;
					profile.outputPricePerMillion = 6;
				}
				await this.plugin.saveSettings();
				this.rerender();
				return;
			}
			case 'rememberApiKey': {
				const remember = Boolean(value);
				profile.rememberApiKey = remember;
				if (remember) {
					profile.apiKey = this.plugin.currentApiKey(profile.id);
				} else {
					this.plugin.setSessionApiKey(profile.id, profile.apiKey);
					profile.apiKey = '';
				}
				await this.plugin.saveSettings();
				this.rerender();
				return;
			}
			case 'dashboardNameTemplate':
				this.plugin.settings.dashboardNameTemplate =
					String(value).trim();
				break;
			case 'autoCreateDashboardForNewFolders':
				this.plugin.settings.autoCreateDashboardForNewFolders =
					Boolean(value);
				break;
			case 'autoRefreshIndex':
				this.plugin.settings.autoRefreshIndex = Boolean(value);
				break;
			case 'autoSummarizeOnOpen':
				this.plugin.settings.autoSummarizeOnOpen = Boolean(value);
				break;
			case 'preferFreshNoteBriefsInFolderSummaries':
				this.plugin.settings.preferFreshNoteBriefsInFolderSummaries =
					Boolean(value);
				break;
			case 'noteBriefMaxOutputTokens':
				this.plugin.settings.noteBriefMaxOutputTokens = Math.min(
					4000,
					Math.max(128, Math.floor(Number(value) || 700)),
				);
				break;
			case 'customProtocol':
				profile.customProtocol =
					value === 'responses' ? 'responses' : 'chat-completions';
				break;
			case 'baseUrl':
				profile.baseUrl = String(value).trim();
				break;
			case 'model':
				profile.model = String(value).trim();
				break;
			case 'maxCharactersPerNote':
				profile.maxCharactersPerNote = Math.max(
					1000,
					Number(value) || 12_000,
				);
				break;
			case 'maxCharactersPerFolder':
				profile.maxCharactersPerFolder = Math.max(
					5000,
					Number(value) || 100_000,
				);
				break;
			case 'customInstructions':
				profile.customInstructions = String(value);
				break;
			case 'inputPricePerMillion':
			case 'outputPricePerMillion':
			case 'monthlyBudgetUsd':
				profile[key] = Math.max(0, Number(value) || 0);
				break;
			case 'dailyRequestLimit':
				profile.dailyRequestLimit = Math.max(
					0,
					Math.floor(Number(value) || 0),
				);
				break;
			case 'maxOutputTokens':
				profile.maxOutputTokens = Math.max(
					128,
					Math.floor(Number(value) || 1800),
				);
				break;
			default:
				return;
		}
		await this.plugin.saveSettings();
	}

	private addLegacyToggle(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		key: string,
		value: boolean,
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle((toggle) =>
				toggle
					.setValue(value)
					.onChange((nextValue) =>
						this.setControlValue(key, nextValue),
					),
			);
	}

	private addLegacyTextArea(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		key: string,
		value: string,
		rows: number,
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addTextArea((area) => {
				area.inputEl.rows = rows;
				area.setValue(value).onChange((nextValue) =>
					this.setControlValue(key, nextValue),
				);
			});
	}

	private addLegacyNumber(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		key: string,
		value: number,
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) => {
				text.inputEl.type = 'number';
				text.setValue(String(value)).onChange((nextValue) =>
					this.setControlValue(key, Number(nextValue)),
				);
			});
	}

	private rerender(): void {
		const compatibleTab = this as unknown as { update?: () => void };
		if (typeof compatibleTab.update === 'function') compatibleTab.update();
		else this.renderLegacySettings();
	}
}
