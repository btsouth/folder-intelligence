import { describe, expect, it } from 'vitest';
import {
	extractManagedBlock,
	isFolderIntelligenceDashboardContent,
	MalformedManagedBlockError,
	removeRedundantDashboardTitle,
	stripManagedBlocks,
	upsertManagedBlock,
} from '../src/managed-blocks';

describe('managed blocks', () => {
	it('adds a block without changing existing user content', () => {
		const result = upsertManagedBlock(
			'# Projects\n\nMy permanent note.',
			'index',
			'## Folder contents\n- [[Plan]]',
		);
		expect(result).toContain('My permanent note.');
		expect(extractManagedBlock(result, 'index')).toBe(
			'## Folder contents\n- [[Plan]]',
		);
	});

	it('updates only the selected block', () => {
		let content = upsertManagedBlock(
			'# Work\n\nUser text',
			'summary',
			'Old summary',
		);
		content = upsertManagedBlock(content, 'index', 'Stable index');
		const result = upsertManagedBlock(content, 'summary', 'New summary');
		expect(result).toContain('User text');
		expect(extractManagedBlock(result, 'summary')).toBe(
			'## AI folder brief\n\nNew summary',
		);
		expect(extractManagedBlock(result, 'index')).toBe(
			'## Folder contents\n\nStable index',
		);
	});

	it('refuses to edit malformed markers', () => {
		expect(() =>
			upsertManagedBlock(
				'<!-- folder-intelligence:summary:start -->\nunfinished',
				'summary',
				'replacement',
			),
		).toThrow(MalformedManagedBlockError);
	});

	it('migrates legacy markers to clean heading-delimited sections', () => {
		const legacy = [
			'# Work',
			'',
			'<!-- folder-intelligence:summary:start -->',
			'Old summary',
			'<!-- folder-intelligence:summary:end -->',
		].join('\n');
		const result = upsertManagedBlock(legacy, 'summary', 'New summary');
		expect(result).toContain('## AI folder brief\n\nNew summary');
		expect(result).not.toContain(
			'<!-- folder-intelligence:summary:start -->',
		);
		expect(extractManagedBlock(result, 'summary')).toBe(
			'## AI folder brief\n\nNew summary',
		);
	});

	it('recognizes dashboard ownership only in YAML frontmatter', () => {
		expect(
			isFolderIntelligenceDashboardContent(
				'---\nfolder-intelligence: dashboard\n---\n# Work',
			),
		).toBe(true);
		expect(
			isFolderIntelligenceDashboardContent(
				'# User note\nfolder-intelligence: dashboard',
			),
		).toBe(false);
	});

	it('removes only a generated title that duplicates the folder name', () => {
		const dashboard =
			'---\nfolder-intelligence: dashboard\n---\n\n# Work\n\n## Dashboard status';
		expect(removeRedundantDashboardTitle(dashboard, 'Work')).toContain(
			'---\n\n## Dashboard status',
		);
		expect(removeRedundantDashboardTitle(dashboard, 'Personal')).toContain(
			'# Work',
		);
	});

	it('strips plugin output before a dashboard becomes AI context', () => {
		let content = '# Child dashboard\n\nUser context';
		content = upsertManagedBlock(content, 'summary', 'Generated content');
		expect(stripManagedBlocks(content)).toContain('User context');
		expect(stripManagedBlocks(content)).not.toContain('Generated content');
	});
});
