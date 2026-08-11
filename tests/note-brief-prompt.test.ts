import { describe, expect, it } from 'vitest';
import {
	buildNoteBriefPrompt,
	normalizeNoteBriefMarkdown,
} from '../src/note-brief-prompt';

describe('AI note brief prompt', () => {
	it('serializes source as data and enforces the character cap', () => {
		const prompt = buildNoteBriefPrompt('Work/Plan.md', 'x'.repeat(3000), {
			maxCharacters: 1000,
			customInstructions: 'Focus on decisions.',
		});
		expect(prompt).toContain('Focus on decisions.');
		expect(prompt).toContain('truncated to 1,000 characters');
		expect(prompt.length).toBeLessThan(1800);
	});

	it('removes provider wrappers and a redundant title', () => {
		expect(
			normalizeNoteBriefMarkdown(
				'```markdown\n# AI Note Brief\n\nA useful summary.\n```',
			),
		).toBe('A useful summary.');
	});
});
