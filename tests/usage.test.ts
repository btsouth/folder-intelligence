import { describe, expect, it } from 'vitest';
import { createProviderProfile } from '../src/profiles';
import {
	actualEstimatedCost,
	budgetBlockReason,
	estimateRequest,
	estimateTokens,
	pruneUsageRecords,
	usageTotals,
} from '../src/usage';
import type { UsageRecord } from '../src/types';

function record(
	timestamp: string,
	cost: number | undefined = 0.25,
): UsageRecord {
	return {
		timestamp,
		profileId: 'default',
		provider: 'openai',
		model: 'test',
		folderPath: 'Work',
		inputCharacters: 400,
		estimatedInputTokens: 100,
		outputCharacters: 100,
		estimatedOutputTokens: 25,
		estimatedCostUsd: cost,
	};
}

describe('usage controls', () => {
	it('estimates tokens and a worst-case request cost', () => {
		const profile = createProviderProfile('openai', {
			inputPricePerMillion: 2,
			outputPricePerMillion: 10,
			maxOutputTokens: 1000,
		});
		expect(estimateTokens(401)).toBe(101);
		expect(estimateRequest(4000, profile)).toEqual({
			inputCharacters: 4000,
			estimatedInputTokens: 1000,
			maxOutputTokens: 1000,
			maxEstimatedCostUsd: 0.012,
		});
	});

	it('enforces daily requests and monthly estimated budget', () => {
		const now = new Date('2026-08-10T15:00:00.000Z');
		const profile = createProviderProfile('openai', {
			dailyRequestLimit: 2,
			monthlyBudgetUsd: 1,
		});
		const records = [
			record('2026-08-10T12:00:00.000Z'),
			record('2026-08-10T13:00:00.000Z'),
		];
		expect(usageTotals(records, profile.id, now).dailyRequests).toBe(2);
		expect(
			budgetBlockReason(
				profile,
				records,
				estimateRequest(100, profile),
				now,
			),
		).toContain('daily limit');

		profile.dailyRequestLimit = 0;
		expect(
			budgetBlockReason(
				profile,
				records,
				{ ...estimateRequest(100, profile), maxEstimatedCostUsd: 0.6 },
				now,
			),
		).toContain('monthly budget');
	});

	it('records actual estimates and prunes old ledger entries', () => {
		const profile = createProviderProfile('openai', {
			inputPricePerMillion: 1,
			outputPricePerMillion: 2,
		});
		expect(actualEstimatedCost(profile, 1000, 500)).toBe(0.002);
		expect(
			pruneUsageRecords(
				[
					record('2026-01-01T00:00:00.000Z'),
					record('2026-08-10T00:00:00.000Z'),
				],
				new Date('2026-08-11T00:00:00.000Z'),
			),
		).toHaveLength(1);
	});
});
