import { describe, expect, it } from 'vitest';
import {
	extractNoteBrief,
	hasNoteBrief,
	noteSourceContent,
	removeNoteBrief,
	renderNoteBrief,
	upsertNoteBrief,
} from '../src/note-brief-format';

const metadata = {
	generatedAt: '2026-08-11T04:00:00.000Z',
	profileName: 'Work',
	provider: 'openai',
	model: 'gpt-5.6-luna',
};

describe('AI note brief formatting', () => {
	it('inserts a native callout immediately after frontmatter', () => {
		const note =
			'---\ntags: [work]\n---\n\n# Project\n\nOriginal content.\n';
		const callout = renderNoteBrief('A concise summary.', metadata);
		const result = upsertNoteBrief(note, callout);
		expect(result).toMatch(
			/^---\ntags: \[work\]\n---\n\n> \[!abstract\] AI note brief/,
		);
		expect(result).toContain('\n\n# Project\n\nOriginal content.');
		expect(extractNoteBrief(result)).toBe('A concise summary.');
	});

	it('replaces only the plugin callout and preserves note content', () => {
		const original = upsertNoteBrief(
			'# Project\n\nUser content.\n\n> A normal quote.\n',
			renderNoteBrief('Old summary.', metadata),
		);
		const updated = upsertNoteBrief(
			original,
			renderNoteBrief('New summary.', metadata),
		);
		expect(updated).not.toContain('Old summary.');
		expect(updated).toContain('New summary.');
		expect(updated).toContain('User content.');
		expect(updated).toContain('> A normal quote.');
	});

	it('removes the generated callout from AI source and on explicit removal', () => {
		const result = upsertNoteBrief(
			'# Project\n\nSource text.',
			renderNoteBrief('- First\n- Second', metadata),
		);
		expect(hasNoteBrief(result)).toBe(true);
		expect(noteSourceContent(result)).toBe('# Project\n\nSource text.');
		expect(removeNoteBrief(result)).toBe('# Project\n\nSource text.\n');
	});

	it('refuses ambiguous duplicate plugin callouts', () => {
		const callout = renderNoteBrief('Summary.', metadata);
		expect(() => hasNoteBrief(`${callout}\n\n${callout}`)).toThrow(
			'more than one AI note brief',
		);
	});

	it('refuses to overwrite a user-authored callout with the same title', () => {
		const userCallout =
			'> [!abstract] AI note brief\n> This belongs to the user.\n\nOriginal note.';
		expect(() =>
			upsertNoteBrief(
				userCallout,
				renderNoteBrief('Generated summary.', metadata),
			),
		).toThrow('user-authored callout');
	});
});
