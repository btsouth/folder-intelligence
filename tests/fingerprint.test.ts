import { describe, expect, it } from 'vitest';
import { stableFingerprint } from '../src/fingerprint';

describe('stableFingerprint', () => {
	it('is stable and order-sensitive', () => {
		expect(stableFingerprint(['a', 'b'])).toBe(
			stableFingerprint(['a', 'b']),
		);
		expect(stableFingerprint(['a', 'b'])).not.toBe(
			stableFingerprint(['b', 'a']),
		);
	});

	it('changes when source content changes', () => {
		expect(stableFingerprint(['note', 'before'])).not.toBe(
			stableFingerprint(['note', 'after']),
		);
	});
});
