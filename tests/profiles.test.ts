import { describe, expect, it } from 'vitest';
import {
	createProviderProfile,
	migrateProviderProfiles,
	parseProfileRules,
	resolveProfile,
} from '../src/profiles';
import type { FolderIntelligenceSettings } from '../src/types';

function settings(): FolderIntelligenceSettings {
	const personal = createProviderProfile('openai', {
		id: 'personal',
		name: 'Personal',
	});
	const work = createProviderProfile('anthropic', {
		id: 'work',
		name: 'Work',
	});
	return {
		dashboardNameTemplate: '00 Summary.md',
		autoCreateDashboardForNewFolders: false,
		autoRefreshIndex: true,
		autoSummarizeOnOpen: false,
		changeDebounceMs: 1500,
		ignoredFolderPatterns: [],
		excludedAiPathPatterns: [],
		sensitiveProperties: [],
		provider: 'openai',
		customProtocol: 'responses',
		baseUrl: '',
		model: '',
		rememberApiKey: false,
		apiKey: '',
		maxCharactersPerNote: 12_000,
		maxCharactersPerFolder: 100_000,
		customInstructions: '',
		profiles: [personal, work],
		defaultProfileId: 'personal',
		folderProfileRules: [{ pattern: '03 Work/**', profileId: 'work' }],
		usageRecords: [],
		noteSummaryRecords: [],
		noteBriefMaxOutputTokens: 700,
		preferFreshNoteBriefsInFolderSummaries: true,
	};
}

describe('provider profiles', () => {
	it('routes folders by first matching glob and supports dashboard overrides', () => {
		const configured = settings();
		expect(resolveProfile(configured, '03 Work/Client').id).toBe('work');
		expect(resolveProfile(configured, '04 Personal').id).toBe('personal');
		expect(
			resolveProfile(configured, '03 Work/Client', 'personal').id,
		).toBe('personal');
	});

	it('parses readable route rules by profile name', () => {
		const configured = settings();
		expect(
			parseProfileRules(
				'03 Work/** => Work\n04 Personal/** => personal',
				configured,
			),
		).toEqual([
			{ pattern: '03 Work/**', profileId: 'work' },
			{ pattern: '04 Personal/**', profileId: 'personal' },
		]);
	});

	it('migrates the legacy provider and key into a profile without retaining a duplicate key', () => {
		const legacy = settings();
		legacy.profiles = [];
		legacy.provider = 'deepseek';
		legacy.model = 'deepseek-test';
		legacy.apiKey = 'secret';
		legacy.rememberApiKey = true;
		const migrated = migrateProviderProfiles(legacy);
		expect(migrated.profiles[0]).toMatchObject({
			provider: 'deepseek',
			model: 'deepseek-test',
			apiKey: 'secret',
			rememberApiKey: true,
		});
		expect(migrated.apiKey).toBe('');
		expect(migrated.rememberApiKey).toBe(false);
	});
});
