import { describe, expect, it } from 'vitest';
import type { TFile, TFolder } from 'obsidian';
import { buildFolderPrompt, normalizeGeneratedMarkdown } from '../src/prompt';
import type { FolderSnapshot } from '../src/types';

function snapshot(): FolderSnapshot {
	return {
		folder: {} as TFolder,
		path: 'Work',
		name: 'Work',
		dashboardPath: 'Work/Work.md',
		fingerprint: 'abc',
		indexedAt: '2026-08-10T00:00:00.000Z',
		childFolders: [],
		notes: [
			{
				file: {} as TFile,
				path: 'Work/Plan.md',
				name: 'Plan',
				modifiedAt: 1,
				content: 'Ship the first release.',
				aiEligible: true,
			},
			{
				file: {} as TFile,
				path: 'Work/Private.md',
				name: 'Private',
				modifiedAt: 2,
				content: 'SECRET THAT MUST NOT LEAK',
				aiEligible: false,
				exclusionReason: 'sensitive',
			},
		],
	};
}

describe('folder prompt', () => {
	it('never includes excluded note content', () => {
		const prompt = buildFolderPrompt(snapshot(), {
			maxCharactersPerNote: 10_000,
			maxCharactersPerFolder: 50_000,
			customInstructions: '',
		});
		expect(prompt).toContain('Ship the first release.');
		expect(prompt).not.toContain('SECRET THAT MUST NOT LEAK');
		expect(prompt).toContain('1 note(s) were intentionally excluded');
	});

	it('removes wrapper fences and frontmatter from generated output', () => {
		expect(
			normalizeGeneratedMarkdown('```markdown\n## Overview\nUseful\n```'),
		).toBe('### Overview\nUseful');
		expect(
			normalizeGeneratedMarkdown(
				'---\ntitle: Nope\n---\n## Overview\nUseful',
			),
		).toBe('### Overview\nUseful');
	});

	it('bounds child summaries as part of the folder input budget', () => {
		const large = snapshot();
		large.notes = [];
		large.childFolders = Array.from({ length: 100 }, (_, index) => ({
			folder: {} as TFolder,
			path: `Work/Child ${index}`,
			name: `Child ${index}`,
			dashboardPath: `Work/Child ${index}/00 Summary.md`,
			dashboardExists: true,
			summary: 'x'.repeat(4000),
		}));
		const prompt = buildFolderPrompt(large, {
			maxCharactersPerNote: 10_000,
			maxCharactersPerFolder: 10_000,
			customInstructions: '',
		});
		expect(prompt.length).toBeLessThan(12_000);
		expect(prompt).not.toContain('Work/Child 99');
	});
});
