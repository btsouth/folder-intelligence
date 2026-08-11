import type { TFile, TFolder } from 'obsidian';

export type ProviderKind =
	'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'xai' | 'custom';
export type ApiProtocol = 'chat-completions' | 'responses';

export interface ProviderProfile {
	id: string;
	name: string;
	provider: ProviderKind;
	customProtocol: ApiProtocol;
	baseUrl: string;
	model: string;
	rememberApiKey: boolean;
	apiKey: string;
	inputPricePerMillion: number;
	outputPricePerMillion: number;
	dailyRequestLimit: number;
	monthlyBudgetUsd: number;
	maxOutputTokens: number;
	maxCharactersPerNote: number;
	maxCharactersPerFolder: number;
	customInstructions: string;
}

export interface FolderProfileRule {
	pattern: string;
	profileId: string;
}

export interface UsageRecord {
	timestamp: string;
	profileId: string;
	provider: ProviderKind;
	model: string;
	folderPath: string;
	inputCharacters: number;
	estimatedInputTokens: number;
	outputCharacters: number;
	estimatedOutputTokens: number;
	estimatedCostUsd?: number;
}

export interface FolderIntelligenceSettings {
	dashboardNameTemplate: string;
	autoCreateDashboardForNewFolders: boolean;
	autoRefreshIndex: boolean;
	autoSummarizeOnOpen: boolean;
	changeDebounceMs: number;
	ignoredFolderPatterns: string[];
	excludedAiPathPatterns: string[];
	sensitiveProperties: string[];
	provider: ProviderKind;
	customProtocol: ApiProtocol;
	baseUrl: string;
	model: string;
	rememberApiKey: boolean;
	apiKey: string;
	maxCharactersPerNote: number;
	maxCharactersPerFolder: number;
	customInstructions: string;
	profiles: ProviderProfile[];
	defaultProfileId: string;
	folderProfileRules: FolderProfileRule[];
	usageRecords: UsageRecord[];
}

export interface NoteSnapshot {
	file: TFile;
	path: string;
	name: string;
	modifiedAt: number;
	content: string;
	aiEligible: boolean;
	exclusionReason?: string;
}

export interface ChildFolderSnapshot {
	folder: TFolder;
	path: string;
	name: string;
	dashboardPath: string;
	dashboardExists: boolean;
	summary?: string;
}

export interface FolderSnapshot {
	folder: TFolder;
	path: string;
	name: string;
	dashboardPath: string;
	notes: NoteSnapshot[];
	childFolders: ChildFolderSnapshot[];
	fingerprint: string;
	indexedAt: string;
}

export interface SummaryProvenance {
	provider: ProviderKind;
	model: string;
	profileId?: string;
	profileName?: string;
	generatedAt: string;
	fingerprint: string;
	noteCount: number;
	excludedNoteCount: number;
}

export interface GeneratedSummary {
	markdown: string;
	provenance: SummaryProvenance;
}
