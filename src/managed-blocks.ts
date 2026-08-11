export const MANAGED_BLOCK_NAMES = ['status', 'summary', 'index'] as const;
export type ManagedBlockName = (typeof MANAGED_BLOCK_NAMES)[number];

const SECTION_HEADINGS: Record<ManagedBlockName, string> = {
	status: '## Dashboard status',
	summary: '## AI folder brief',
	index: '## Folder contents',
};

const SECTION_ORDER: ManagedBlockName[] = ['status', 'summary', 'index'];

export class MalformedManagedBlockError extends Error {
	constructor(block: ManagedBlockName) {
		super(
			`Folder Intelligence found an incomplete legacy ${block} block and left the note unchanged.`,
		);
		this.name = 'MalformedManagedBlockError';
	}
}

export function isFolderIntelligenceDashboardContent(content: string): boolean {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
		content,
	)?.[1];
	return Boolean(
		frontmatter &&
		/^folder-intelligence:\s*["']?dashboard["']?\s*$/m.test(frontmatter),
	);
}

export function removeRedundantDashboardTitle(
	content: string,
	title: string,
): string {
	const frontmatter = /^---\r?\n[\s\S]*?\r?\n---/.exec(content);
	if (!frontmatter) return content;
	const remainder = content.slice(frontmatter[0].length);
	const heading = /^\s*# ([^\r\n]+)\r?\n/.exec(remainder);
	if (heading?.[1]?.trim() !== title.trim()) return content;
	return `${frontmatter[0]}\n\n${remainder.slice(heading[0].length).trimStart()}`;
}

interface LocatedBlock {
	startIndex: number;
	endIndex: number;
}

function legacyMarkerVariants(name: ManagedBlockName): Array<{
	start: string;
	end: string;
}> {
	return [
		{
			start: `%% folder-intelligence:${name}:start %%`,
			end: `%% folder-intelligence:${name}:end %%`,
		},
		{
			start: `<!-- folder-intelligence:${name}:start -->`,
			end: `<!-- folder-intelligence:${name}:end -->`,
		},
	];
}

function locateLegacyBlock(
	content: string,
	name: ManagedBlockName,
): LocatedBlock | undefined {
	const matches = legacyMarkerVariants(name)
		.map(({ start, end }) => ({
			start,
			end,
			startIndex: content.indexOf(start),
			endIndex: content.indexOf(end),
		}))
		.filter(({ startIndex, endIndex }) => startIndex >= 0 || endIndex >= 0);

	if (matches.length === 0) return undefined;
	if (matches.length > 1) throw new MalformedManagedBlockError(name);
	const [match] = matches;
	if (!match || match.startIndex < 0 || match.endIndex < match.startIndex)
		throw new MalformedManagedBlockError(name);
	return {
		startIndex: match.startIndex,
		endIndex: match.endIndex + match.end.length,
	};
}

function headingIndex(content: string, heading: string): number {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`^${escaped}\\s*$`, 'm').exec(content)?.index ?? -1;
}

function locateSectionBlock(
	content: string,
	name: ManagedBlockName,
): LocatedBlock | undefined {
	const startIndex = headingIndex(content, SECTION_HEADINGS[name]);
	if (startIndex < 0) return undefined;
	const candidates = [
		...SECTION_ORDER.map((section) => SECTION_HEADINGS[section]),
		'## Your notes',
	]
		.map((heading) => headingIndex(content, heading))
		.filter((index) => index > startIndex);
	return {
		startIndex,
		endIndex:
			candidates.length > 0 ? Math.min(...candidates) : content.length,
	};
}

function locateManagedBlock(
	content: string,
	name: ManagedBlockName,
): LocatedBlock | undefined {
	return (
		locateLegacyBlock(content, name) ?? locateSectionBlock(content, name)
	);
}

function normalizeBody(name: ManagedBlockName, body: string): string {
	const trimmed = body.trim();
	return trimmed.startsWith(SECTION_HEADINGS[name])
		? trimmed
		: `${SECTION_HEADINGS[name]}\n\n${trimmed}`;
}

function insertionIndex(content: string, name: ManagedBlockName): number {
	const order = SECTION_ORDER.indexOf(name);
	const laterHeadings = SECTION_ORDER.slice(order + 1)
		.map((section) => headingIndex(content, SECTION_HEADINGS[section]))
		.filter((index) => index >= 0);
	const userNotes = headingIndex(content, '## Your notes');
	if (userNotes >= 0) laterHeadings.push(userNotes);
	return laterHeadings.length > 0
		? Math.min(...laterHeadings)
		: content.length;
}

export function extractManagedBlock(
	content: string,
	name: ManagedBlockName,
): string | undefined {
	const located = locateManagedBlock(content, name);
	if (!located) return undefined;
	let extracted = content.slice(located.startIndex, located.endIndex).trim();
	for (const { start, end } of legacyMarkerVariants(name)) {
		if (extracted.startsWith(start) && extracted.endsWith(end)) {
			extracted = extracted.slice(start.length, -end.length).trim();
			break;
		}
	}
	return extracted;
}

export function upsertManagedBlock(
	content: string,
	name: ManagedBlockName,
	body: string,
): string {
	const replacement = normalizeBody(name, body);
	const located = locateManagedBlock(content, name);
	if (located) {
		return `${content.slice(0, located.startIndex).trimEnd()}\n\n${replacement}\n\n${content.slice(located.endIndex).trimStart()}`.trimEnd();
	}

	const index = insertionIndex(content, name);
	return `${content.slice(0, index).trimEnd()}\n\n${replacement}\n\n${content.slice(index).trimStart()}`.trimEnd();
}

export function stripManagedBlocks(content: string): string {
	let result = content;
	for (const name of MANAGED_BLOCK_NAMES) {
		const located = locateManagedBlock(result, name);
		if (!located) continue;
		result = `${result.slice(0, located.startIndex)}${result.slice(located.endIndex)}`;
	}
	return result.trim();
}
