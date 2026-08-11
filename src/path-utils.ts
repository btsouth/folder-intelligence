export function normalizePath(path: string): string {
	return path
		.replaceAll('\\', '/')
		.replace(/^\/+|\/+$/g, '')
		.replace(/\/{2,}/g, '/');
}

export function pathBasename(path: string): string {
	const normalized = normalizePath(path);
	if (!normalized) return 'Vault';
	return normalized.split('/').at(-1) ?? 'Vault';
}

export function parentPath(path: string): string {
	const parts = normalizePath(path).split('/').filter(Boolean);
	parts.pop();
	return parts.join('/');
}

export function dashboardPath(folderPath: string, template: string): string {
	const normalizedFolder = normalizePath(folderPath);
	const folderName = pathBasename(normalizedFolder);
	const filename =
		template.replaceAll('{folder}', folderName).trim() ||
		`${folderName}.md`;
	const markdownFilename = filename.toLowerCase().endsWith('.md')
		? filename
		: `${filename}.md`;
	return normalizedFolder
		? `${normalizedFolder}/${markdownFilename}`
		: markdownFilename;
}

export function isDirectChild(filePath: string, folderPath: string): boolean {
	return parentPath(filePath) === normalizePath(folderPath);
}

export function globMatches(path: string, pattern: string): boolean {
	const normalizedPath = normalizePath(path).toLowerCase();
	const normalizedPattern = normalizePath(pattern).toLowerCase();
	if (!normalizedPattern) return false;
	if (
		normalizedPattern.endsWith('/**') &&
		normalizedPath === normalizedPattern.slice(0, -3)
	)
		return true;

	let expression = '^';
	for (let index = 0; index < normalizedPattern.length; index += 1) {
		const character = normalizedPattern[index];
		const nextCharacter = normalizedPattern[index + 1];
		if (character === '*' && nextCharacter === '*') {
			expression += '.*';
			index += 1;
		} else if (character === '*') {
			expression += '[^/]*';
		} else if (character === '?') {
			expression += '[^/]';
		} else {
			expression +=
				character?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') ?? '';
		}
	}
	expression += '$';
	return new RegExp(expression).test(normalizedPath);
}

export function matchesAnyGlob(path: string, patterns: string[]): boolean {
	return patterns.some((pattern) => globMatches(path, pattern));
}

export function escapeWikiAlias(value: string): string {
	return value.replaceAll('|', '\\|');
}
