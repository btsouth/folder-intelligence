import type { App, TFile } from 'obsidian';
import { matchesAnyGlob } from './path-utils';
import type { FolderIntelligenceSettings } from './types';

export function aiExclusionReason(
	app: App,
	settings: FolderIntelligenceSettings,
	file: TFile,
): string | undefined {
	if (matchesAnyGlob(file.path, settings.excludedAiPathPatterns))
		return 'excluded path';
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	for (const property of settings.sensitiveProperties) {
		const value: unknown = frontmatter?.[property];
		if (
			value === true ||
			(typeof value === 'string' &&
				['true', 'yes', 'sensitive'].includes(value.toLowerCase()))
		)
			return `property ${property}`;
	}
	return undefined;
}
