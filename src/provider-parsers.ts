export interface JsonRecord {
	[key: string]: unknown;
}

export function textFromUnknown(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseOpenAIResponse(json: unknown): string {
	if (!json || typeof json !== 'object')
		throw new Error('OpenAI returned an invalid response.');
	const record = json as JsonRecord;
	const direct = textFromUnknown(record.output_text);
	if (direct) return direct;
	if (!Array.isArray(record.output))
		throw new Error('OpenAI returned no summary text.');

	const output: unknown[] = record.output;
	const contentItems: unknown[] = [];
	for (const item of output) {
		if (!item || typeof item !== 'object') continue;
		const content = (item as JsonRecord).content;
		if (Array.isArray(content))
			contentItems.push(...(content as unknown[]));
	}
	const text = contentItems
		.map((item) =>
			item && typeof item === 'object'
				? textFromUnknown((item as JsonRecord).text)
				: undefined,
		)
		.filter((item): item is string => Boolean(item))
		.join('\n')
		.trim();
	if (!text) throw new Error('OpenAI returned no summary text.');
	return text;
}

export function parseChatCompletion(json: unknown): string {
	if (!json || typeof json !== 'object')
		throw new Error('The provider returned an invalid response.');
	const rawChoices = (json as JsonRecord).choices;
	if (!Array.isArray(rawChoices))
		throw new Error('The provider returned no choices.');
	const choices: unknown[] = rawChoices;
	const first: unknown = choices[0];
	if (!first || typeof first !== 'object')
		throw new Error('The provider returned no summary text.');
	const message = (first as JsonRecord).message;
	if (!message || typeof message !== 'object')
		throw new Error('The provider returned no summary text.');
	const text = textFromUnknown((message as JsonRecord).content);
	if (!text) throw new Error('The provider returned no summary text.');
	return text;
}

export function parseAnthropicResponse(json: unknown): string {
	if (!json || typeof json !== 'object')
		throw new Error('Anthropic returned an invalid response.');
	const content = (json as JsonRecord).content;
	if (!Array.isArray(content))
		throw new Error('Anthropic returned no summary text.');
	const text = (content as unknown[])
		.map((item) =>
			item && typeof item === 'object'
				? textFromUnknown((item as JsonRecord).text)
				: undefined,
		)
		.filter((item): item is string => Boolean(item))
		.join('\n')
		.trim();
	if (!text) throw new Error('Anthropic returned no summary text.');
	return text;
}

export function parseGeminiResponse(json: unknown): string {
	if (!json || typeof json !== 'object')
		throw new Error('Gemini returned an invalid response.');
	const rawCandidates = (json as JsonRecord).candidates;
	if (!Array.isArray(rawCandidates))
		throw new Error('Gemini returned no candidates.');
	const candidates: unknown[] = rawCandidates;
	const first: unknown = candidates[0];
	if (!first || typeof first !== 'object')
		throw new Error('Gemini returned no summary text.');
	const content = (first as JsonRecord).content;
	if (!content || typeof content !== 'object')
		throw new Error('Gemini returned no summary text.');
	const parts = (content as JsonRecord).parts;
	if (!Array.isArray(parts))
		throw new Error('Gemini returned no summary text.');
	const text = (parts as unknown[])
		.map((item) =>
			item && typeof item === 'object'
				? textFromUnknown((item as JsonRecord).text)
				: undefined,
		)
		.filter((item): item is string => Boolean(item))
		.join('\n')
		.trim();
	if (!text) throw new Error('Gemini returned no summary text.');
	return text;
}
