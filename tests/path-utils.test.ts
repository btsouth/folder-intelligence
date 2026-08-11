import { describe, expect, it } from 'vitest';
import {
	dashboardPath,
	globMatches,
	isDirectChild,
	normalizePath,
} from '../src/path-utils';

describe('path utilities', () => {
	it('creates folder-matching dashboard paths', () => {
		expect(dashboardPath('Work/Projects', '{folder}.md')).toBe(
			'Work/Projects/Projects.md',
		);
		expect(dashboardPath('Research', '_Dashboard')).toBe(
			'Research/_Dashboard.md',
		);
	});

	it('normalizes Windows separators', () => {
		expect(normalizePath('\\Work\\Projects\\')).toBe('Work/Projects');
	});

	it('matches ignored folder roots and descendants', () => {
		expect(globMatches('Templates', 'Templates/**')).toBe(true);
		expect(globMatches('Templates/Meeting', 'Templates/**')).toBe(true);
		expect(globMatches('Work/Templates', 'Templates/**')).toBe(false);
	});

	it('distinguishes direct children from descendants', () => {
		expect(isDirectChild('Work/Plan.md', 'Work')).toBe(true);
		expect(isDirectChild('Work/Archive/Plan.md', 'Work')).toBe(false);
	});
});
