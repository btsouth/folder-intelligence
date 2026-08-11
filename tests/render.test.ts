import { describe, expect, it } from 'vitest';
import {
	parseSummaryProvenance,
	renderIndex,
	stripSummaryProvenance,
	upsertSummaryProvenance,
} from '../src/render';
import type { SummaryProvenance } from '../src/types';
import type { TFile, TFolder } from 'obsidian';

const provenance: SummaryProvenance = {
	provider: 'openai',
	model: 'gpt-5.6-luna',
	generatedAt: '2026-08-10T22:00:00.000Z',
	fingerprint: 'abc123',
	noteCount: 2,
	excludedNoteCount: 1,
};

describe('summary provenance', () => {
	it('stores provenance as a YAML comment and reads it back', () => {
		const dashboard =
			'---\nfolder-intelligence: dashboard\nfolder: Work\n---\n\n# Work';
		const result = upsertSummaryProvenance(dashboard, provenance);
		expect(result).toContain('# folder-intelligence-provenance:');
		expect(parseSummaryProvenance(result)).toEqual(provenance);
	});

	it('removes legacy provenance markers from visible summary content', () => {
		const legacy =
			'%% folder-intelligence:provenance {"fingerprint":"abc"} %%\n## AI folder brief';
		expect(stripSummaryProvenance(legacy)).toBe('## AI folder brief');
	});

	it('collapses very large note indexes into an Obsidian callout', () => {
		const notes = Array.from({ length: 31 }, (_, index) => ({
			file: {} as TFile,
			path: `Work/Note ${index}.md`,
			name: `Note ${index}`,
			modifiedAt: 1,
			content: '',
			aiEligible: true,
		}));
		const result = renderIndex({
			folder: {} as TFolder,
			path: 'Work',
			name: 'Work',
			dashboardPath: 'Work/00 Summary.md',
			notes,
			childFolders: [],
			fingerprint: 'abc',
			indexedAt: '2026-08-10T00:00:00.000Z',
		});
		expect(result).toContain('> [!abstract]- Notes (31)');
		expect(result).toContain('> - [[Work/Note 0|Note 0]]');
	});
});
