export const NOTE_BRIEF_CALLOUT = '> [!abstract] AI note brief';

export class AmbiguousNoteBriefError extends Error {
	constructor() {
		super(
			'Folder Intelligence found more than one AI note brief and left the note unchanged.',
		);
		this.name = 'AmbiguousNoteBriefError';
	}
}

export class ConflictingNoteBriefError extends Error {
	constructor() {
		super(
			'This note already has a user-authored callout named AI note brief. Rename that callout before adding a generated brief.',
		);
		this.name = 'ConflictingNoteBriefError';
	}
}

interface LocatedNoteBrief {
	startIndex: number;
	endIndex: number;
	markdown: string;
}

function locateNoteBrief(content: string): LocatedNoteBrief | undefined {
	const pattern = /^> \[!abstract\] AI note brief[ \t]*(?:\r?\n>[^\r\n]*)*/gm;
	const matches = [...content.matchAll(pattern)];
	if (matches.length > 1) throw new AmbiguousNoteBriefError();
	const match = matches[0];
	if (!match || match.index === undefined) return undefined;
	if (
		!/^> ?_Generated .+ AI-generated; verify against the note\._$/m.test(
			match[0],
		)
	)
		throw new ConflictingNoteBriefError();
	return {
		startIndex: match.index,
		endIndex: match.index + match[0].length,
		markdown: match[0],
	};
}

function normalizeSpacing(content: string): string {
	return `${content.trim()}\n`;
}

export function hasNoteBrief(content: string): boolean {
	return Boolean(locateNoteBrief(content));
}

export function extractNoteBrief(content: string): string | undefined {
	const located = locateNoteBrief(content);
	if (!located) return undefined;
	const lines = located.markdown.split(/\r?\n/).slice(1);
	while (lines.length && !lines.at(-1)?.replace(/^> ?/, '').trim())
		lines.pop();
	if (
		lines
			.at(-1)
			?.match(
				/^> ?_Generated .+ AI-generated; verify against the note\._$/,
			)
	)
		lines.pop();
	while (lines.length && !lines.at(-1)?.replace(/^> ?/, '').trim())
		lines.pop();
	return lines
		.map((line) => line.replace(/^> ?/, ''))
		.join('\n')
		.trim();
}

export function renderNoteBrief(
	markdown: string,
	metadata: {
		generatedAt: string;
		profileName: string;
		provider: string;
		model: string;
	},
): string {
	const generated = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(metadata.generatedAt));
	const body = markdown
		.trim()
		.split(/\r?\n/)
		.map((line) => (line ? `> ${line}` : '>'));
	return [
		NOTE_BRIEF_CALLOUT,
		...body,
		'>',
		`> _Generated ${generated} with ${metadata.profileName} (${metadata.provider} / ${metadata.model}). AI-generated; verify against the note._`,
	].join('\n');
}

export function upsertNoteBrief(content: string, callout: string): string {
	const located = locateNoteBrief(content);
	if (located) {
		return normalizeSpacing(
			`${content.slice(0, located.startIndex).trimEnd()}\n\n${callout.trim()}\n\n${content.slice(located.endIndex).trimStart()}`,
		);
	}

	const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(content);
	const insertionIndex = frontmatter?.[0].length ?? 0;
	const before = content.slice(0, insertionIndex).trimEnd();
	const after = content.slice(insertionIndex).trimStart();
	return normalizeSpacing(
		[before, callout.trim(), after].filter(Boolean).join('\n\n'),
	);
}

export function removeNoteBrief(content: string): string {
	const located = locateNoteBrief(content);
	if (!located) return content;
	return normalizeSpacing(
		`${content.slice(0, located.startIndex).trimEnd()}\n\n${content.slice(located.endIndex).trimStart()}`,
	);
}

export function noteSourceContent(content: string): string {
	return removeNoteBrief(content).trim();
}
