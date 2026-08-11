import { matchesAnyGlob } from './path-utils';
import { PROVIDER_DEFAULTS } from './provider-defaults';
import type {
	FolderIntelligenceSettings,
	FolderProfileRule,
	ProviderKind,
	ProviderProfile,
} from './types';

const DEFAULT_PROFILE_ID = 'default';

function isProviderKind(value: unknown): value is ProviderKind {
	return [
		'openai',
		'anthropic',
		'gemini',
		'deepseek',
		'xai',
		'custom',
	].includes(String(value));
}

export function createProviderProfile(
	provider: ProviderKind = 'openai',
	overrides: Partial<ProviderProfile> = {},
): ProviderProfile {
	const defaults = PROVIDER_DEFAULTS[provider];
	return {
		id: DEFAULT_PROFILE_ID,
		name: 'Default',
		provider,
		customProtocol:
			provider === 'openai' ? 'responses' : 'chat-completions',
		baseUrl: defaults.baseUrl,
		model: defaults.model,
		rememberApiKey: false,
		apiKey: '',
		inputPricePerMillion: provider === 'openai' ? 1 : 0,
		outputPricePerMillion: provider === 'openai' ? 6 : 0,
		dailyRequestLimit: 50,
		monthlyBudgetUsd: 10,
		maxOutputTokens: 1800,
		maxCharactersPerNote: 12_000,
		maxCharactersPerFolder: 100_000,
		customInstructions: '',
		...overrides,
	};
}

export function newProfileId(existingIds: Iterable<string>): string {
	const existing = new Set(existingIds);
	let index = existing.size + 1;
	let candidate = `profile-${index}`;
	while (existing.has(candidate)) {
		index += 1;
		candidate = `profile-${index}`;
	}
	return candidate;
}

export function migrateProviderProfiles(
	settings: FolderIntelligenceSettings,
): FolderIntelligenceSettings {
	const profiles = Array.isArray(settings.profiles)
		? settings.profiles.filter((profile): profile is ProviderProfile =>
				Boolean(profile && typeof profile.id === 'string'),
			)
		: [];
	if (!profiles.length) {
		profiles.push(
			createProviderProfile(settings.provider, {
				id: DEFAULT_PROFILE_ID,
				name: 'Default',
				customProtocol: settings.customProtocol,
				baseUrl: settings.baseUrl,
				model: settings.model,
				rememberApiKey: settings.rememberApiKey,
				apiKey: settings.apiKey,
				maxCharactersPerNote: settings.maxCharactersPerNote,
				maxCharactersPerFolder: settings.maxCharactersPerFolder,
				customInstructions: settings.customInstructions,
			}),
		);
	}

	const normalizedProfiles = profiles.map((profile, index) => {
		const provider = isProviderKind(profile.provider)
			? profile.provider
			: 'openai';
		const defaults = PROVIDER_DEFAULTS[provider];
		return createProviderProfile(provider, {
			...profile,
			id: profile.id.trim() || `profile-${index + 1}`,
			name: profile.name?.trim() || `Profile ${index + 1}`,
			provider,
			customProtocol:
				profile.customProtocol === 'responses'
					? 'responses'
					: 'chat-completions',
			baseUrl: profile.baseUrl?.trim() || defaults.baseUrl,
			model: profile.model?.trim() || defaults.model,
			rememberApiKey: Boolean(profile.rememberApiKey),
			apiKey: typeof profile.apiKey === 'string' ? profile.apiKey : '',
			customInstructions:
				typeof profile.customInstructions === 'string'
					? profile.customInstructions
					: '',
			inputPricePerMillion: Math.max(
				0,
				Number(profile.inputPricePerMillion) || 0,
			),
			outputPricePerMillion: Math.max(
				0,
				Number(profile.outputPricePerMillion) || 0,
			),
			dailyRequestLimit: Math.max(
				0,
				Math.floor(Number(profile.dailyRequestLimit) || 0),
			),
			monthlyBudgetUsd: Math.max(
				0,
				Number(profile.monthlyBudgetUsd) || 0,
			),
			maxOutputTokens: Math.max(
				128,
				Math.floor(Number(profile.maxOutputTokens) || 1800),
			),
			maxCharactersPerNote: Math.max(
				1000,
				Math.floor(Number(profile.maxCharactersPerNote) || 12_000),
			),
			maxCharactersPerFolder: Math.max(
				5000,
				Math.floor(Number(profile.maxCharactersPerFolder) || 100_000),
			),
		});
	});
	const ids = new Set(normalizedProfiles.map((profile) => profile.id));
	const defaultProfileId = ids.has(settings.defaultProfileId)
		? settings.defaultProfileId
		: normalizedProfiles[0]!.id;
	const folderProfileRules = Array.isArray(settings.folderProfileRules)
		? settings.folderProfileRules.filter(
				(rule) =>
					Boolean(rule?.pattern?.trim()) && ids.has(rule.profileId),
			)
		: [];

	return {
		...settings,
		// The legacy key is copied into the first profile above, then cleared so
		// disabling "Remember API key" cannot leave a hidden duplicate behind.
		apiKey: '',
		rememberApiKey: false,
		profiles: normalizedProfiles,
		defaultProfileId,
		folderProfileRules,
		usageRecords: Array.isArray(settings.usageRecords)
			? settings.usageRecords
			: [],
	};
}

export function profileById(
	settings: FolderIntelligenceSettings,
	profileId: string | undefined,
): ProviderProfile | undefined {
	return settings.profiles.find((profile) => profile.id === profileId);
}

export function resolveProfile(
	settings: FolderIntelligenceSettings,
	folderPath: string,
	dashboardProfileId?: string,
): ProviderProfile {
	const dashboardProfile =
		profileById(settings, dashboardProfileId) ??
		settings.profiles.find(
			(profile) =>
				profile.name.toLowerCase() ===
				dashboardProfileId?.toLowerCase(),
		);
	if (dashboardProfile) return dashboardProfile;
	const matchingRule = settings.folderProfileRules.find((rule) =>
		matchesAnyGlob(folderPath, [rule.pattern]),
	);
	const routedProfile = profileById(settings, matchingRule?.profileId);
	return (
		routedProfile ??
		profileById(settings, settings.defaultProfileId) ??
		settings.profiles[0] ??
		createProviderProfile()
	);
}

export function serializeProfileRules(
	rules: FolderProfileRule[],
	settings: FolderIntelligenceSettings,
): string {
	return rules
		.map((rule) => {
			const profile = profileById(settings, rule.profileId);
			return `${rule.pattern} => ${profile?.name ?? rule.profileId}`;
		})
		.join('\n');
}

export function parseProfileRules(
	value: string,
	settings: FolderIntelligenceSettings,
): FolderProfileRule[] {
	const profilesByName = new Map(
		settings.profiles.map((profile) => [
			profile.name.toLowerCase(),
			profile,
		]),
	);
	return value
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [patternPart, profilePart] = line.split(/\s*=>\s*/, 2);
			const pattern = patternPart?.trim() ?? '';
			const profileReference = profilePart?.trim() ?? '';
			const profile =
				profileById(settings, profileReference) ??
				profilesByName.get(profileReference.toLowerCase());
			if (!pattern || !profile) {
				throw new Error(
					`Invalid profile route "${line}". Use Folder/** => Profile name.`,
				);
			}
			return { pattern, profileId: profile.id };
		});
}
