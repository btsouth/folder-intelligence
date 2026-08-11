import type { ProviderProfile, UsageRecord } from './types';

export interface RequestEstimate {
	inputCharacters: number;
	estimatedInputTokens: number;
	maxOutputTokens: number;
	maxEstimatedCostUsd?: number;
}

export interface UsageTotals {
	dailyRequests: number;
	monthlyEstimatedCostUsd: number;
}

export function estimateTokens(characters: number): number {
	return Math.max(0, Math.ceil(characters / 4));
}

export function estimateRequest(
	inputCharacters: number,
	profile: ProviderProfile,
): RequestEstimate {
	const estimatedInputTokens = estimateTokens(inputCharacters);
	const hasPricing =
		profile.inputPricePerMillion > 0 || profile.outputPricePerMillion > 0;
	return {
		inputCharacters,
		estimatedInputTokens,
		maxOutputTokens: profile.maxOutputTokens,
		maxEstimatedCostUsd: hasPricing
			? (estimatedInputTokens / 1_000_000) *
					profile.inputPricePerMillion +
				(profile.maxOutputTokens / 1_000_000) *
					profile.outputPricePerMillion
			: undefined,
	};
}

function localDay(timestamp: string): string {
	return new Date(timestamp).toLocaleDateString('en-CA');
}

function localMonth(timestamp: string): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function usageTotals(
	records: UsageRecord[],
	profileId: string,
	now = new Date(),
): UsageTotals {
	const nowIso = now.toISOString();
	const day = localDay(nowIso);
	const month = localMonth(nowIso);
	let dailyRequests = 0;
	let monthlyEstimatedCostUsd = 0;
	for (const record of records) {
		if (record.profileId !== profileId) continue;
		if (localDay(record.timestamp) === day) dailyRequests += 1;
		if (localMonth(record.timestamp) === month)
			monthlyEstimatedCostUsd += record.estimatedCostUsd ?? 0;
	}
	return { dailyRequests, monthlyEstimatedCostUsd };
}

export function budgetBlockReason(
	profile: ProviderProfile,
	records: UsageRecord[],
	estimate: RequestEstimate,
	now = new Date(),
): string | undefined {
	const totals = usageTotals(records, profile.id, now);
	if (
		profile.dailyRequestLimit > 0 &&
		totals.dailyRequests >= profile.dailyRequestLimit
	) {
		return `${profile.name} has reached its daily limit of ${profile.dailyRequestLimit} request(s).`;
	}
	if (
		profile.monthlyBudgetUsd > 0 &&
		estimate.maxEstimatedCostUsd !== undefined &&
		totals.monthlyEstimatedCostUsd + estimate.maxEstimatedCostUsd >
			profile.monthlyBudgetUsd
	) {
		return `${profile.name} would exceed its $${profile.monthlyBudgetUsd.toFixed(2)} monthly budget.`;
	}
	return undefined;
}

export function actualEstimatedCost(
	profile: ProviderProfile,
	inputTokens: number,
	outputTokens: number,
): number | undefined {
	if (profile.inputPricePerMillion <= 0 && profile.outputPricePerMillion <= 0)
		return undefined;
	return (
		(inputTokens / 1_000_000) * profile.inputPricePerMillion +
		(outputTokens / 1_000_000) * profile.outputPricePerMillion
	);
}

export function pruneUsageRecords(
	records: UsageRecord[],
	now = new Date(),
): UsageRecord[] {
	const cutoff = now.getTime() - 93 * 24 * 60 * 60 * 1000;
	return records
		.filter((record) => new Date(record.timestamp).getTime() >= cutoff)
		.slice(-5000);
}
