import { escapeWikiAlias } from './path-utils';
import type { FolderSnapshot, GeneratedSummary } from './types';

function displayDate(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	}).format(new Date(timestamp));
}

function wikiLink(path: string, label: string): string {
	const withoutExtension = path.toLowerCase().endsWith('.md')
		? path.slice(0, -3)
		: path;
	return `[[${withoutExtension}|${escapeWikiAlias(label)}]]`;
}

export function renderIndex(snapshot: FolderSnapshot): string {
	const lines = ['## Folder contents'];

	if (snapshot.childFolders.length > 0) {
		const collapseFolders = snapshot.childFolders.length > 20;
		lines.push(
			'',
			collapseFolders
				? `> [!abstract]- Folders (${snapshot.childFolders.length})`
				: '### Folders',
		);
		for (const child of [...snapshot.childFolders].sort((a, b) =>
			a.name.localeCompare(b.name),
		)) {
			const label = `📁 ${child.name}`;
			const item = child.dashboardExists
				? `- ${wikiLink(child.dashboardPath, label)}`
				: `- ${label}`;
			lines.push(collapseFolders ? `> ${item}` : item);
		}
	}

	if (snapshot.notes.length > 0) {
		const collapseNotes = snapshot.notes.length > 30;
		lines.push(
			'',
			collapseNotes
				? `> [!abstract]- Notes (${snapshot.notes.length})`
				: '### Notes',
		);
		for (const note of [...snapshot.notes].sort(
			(a, b) => b.modifiedAt - a.modifiedAt,
		)) {
			const privacy = note.aiEligible ? '' : ' 🔒';
			const item = `- ${wikiLink(note.path, note.name)}${privacy} — ${displayDate(note.modifiedAt)}`;
			lines.push(collapseNotes ? `> ${item}` : item);
		}
	}

	if (snapshot.childFolders.length === 0 && snapshot.notes.length === 0) {
		lines.push('', '_This folder has no notes yet._');
	}

	return lines.join('\n');
}

export function renderStaleStatus(
	snapshot: FolderSnapshot,
	aiConfigured: boolean,
): string {
	const excluded = snapshot.notes.filter((note) => !note.aiEligible).length;
	const detail = aiConfigured
		? 'The folder changed since its last AI summary. Open this dashboard or run **Refresh AI summary**.'
		: 'The local index is current. Add an AI provider in settings to generate a narrative summary.';
	return [
		'> [!info] Dashboard status',
		`> ${detail}`,
		`> Indexed ${snapshot.notes.length} note(s); ${excluded} excluded from AI.`,
	].join('\n');
}

export function renderFreshStatus(summary: GeneratedSummary): string {
	const generated = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(summary.provenance.generatedAt));
	return [
		'> [!success] Dashboard is current',
		`> Generated ${generated} with ${summary.provenance.provider} / ${summary.provenance.model}.`,
		`> ${summary.provenance.noteCount} note(s) considered; ${summary.provenance.excludedNoteCount} excluded from AI.`,
	].join('\n');
}

export function renderSummary(summary: GeneratedSummary): string {
	return [
		'## AI folder brief',
		'',
		summary.markdown,
		'',
		'> [!warning] AI-generated',
		'> Verify important details against the linked source notes.',
	].join('\n');
}

export function stripSummaryProvenance(markdown: string): string {
	return markdown
		.replace(/^# folder-intelligence-provenance: \{[^\n]+\}\r?\n?/m, '')
		.replace(
			/^(?:%%|<!--) folder-intelligence:provenance \{[^\n]+\} (?:%%|-->)\r?\n?/m,
			'',
		)
		.trim();
}

export function upsertSummaryProvenance(
	markdown: string,
	provenance: GeneratedSummary['provenance'],
): string {
	const cleaned = stripSummaryProvenance(markdown);
	const frontmatter = /^---\r?\n[\s\S]*?\r?\n---/.exec(cleaned);
	if (!frontmatter)
		throw new Error('The dashboard is missing YAML frontmatter.');
	const insertionIndex = frontmatter[0].lastIndexOf('\n---') + 1;
	const line = `# folder-intelligence-provenance: ${JSON.stringify(provenance)}\n`;
	return `${cleaned.slice(0, insertionIndex)}${line}${cleaned.slice(insertionIndex)}`;
}

export function parseSummaryProvenance(
	markdown: string,
): GeneratedSummary['provenance'] | undefined {
	const match = markdown.match(
		/(?:^# folder-intelligence-provenance: |(?:%%|<!--) folder-intelligence:provenance )(\{[^\n]+\})(?: (?:%%|-->))?/m,
	);
	if (!match?.[1]) return undefined;
	try {
		const parsed = JSON.parse(match[1]) as GeneratedSummary['provenance'];
		return typeof parsed.fingerprint === 'string' ? parsed : undefined;
	} catch {
		return undefined;
	}
}
