import { requestUrl, type RequestUrlParam } from 'obsidian';
import {
	parseAnthropicResponse,
	parseChatCompletion,
	parseGeminiResponse,
	parseOpenAIResponse,
	textFromUnknown,
	type JsonRecord,
} from './provider-parsers';
import type { ApiProtocol, ProviderKind } from './types';
export { PROVIDER_DEFAULTS } from './provider-defaults';

export interface ProviderConfiguration {
	provider: ProviderKind;
	customProtocol: ApiProtocol;
	baseUrl: string;
	model: string;
	apiKey: string;
}

export interface GenerationRequest {
	system: string;
	prompt: string;
	maxOutputTokens?: number;
}

function trimSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

async function send(parameters: RequestUrlParam): Promise<unknown> {
	const response = await requestUrl(parameters);
	if (response.status >= 400) {
		const json = response.json as unknown;
		let detail: string | undefined;
		if (json && typeof json === 'object') {
			const error = (json as JsonRecord).error;
			if (error && typeof error === 'object')
				detail = textFromUnknown((error as JsonRecord).message);
			else detail = textFromUnknown(error);
		}
		throw new Error(
			`Provider request failed (${response.status})${detail ? `: ${detail}` : '.'}`,
		);
	}
	return response.json;
}

async function generateOpenAI(
	configuration: ProviderConfiguration,
	request: GenerationRequest,
): Promise<string> {
	const json = await send({
		url: `${trimSlash(configuration.baseUrl)}/responses`,
		method: 'POST',
		contentType: 'application/json',
		headers: configuration.apiKey
			? { Authorization: `Bearer ${configuration.apiKey}` }
			: undefined,
		body: JSON.stringify({
			model: configuration.model,
			instructions: request.system,
			input: request.prompt,
			max_output_tokens: request.maxOutputTokens ?? 1800,
			...(configuration.provider === 'openai'
				? { reasoning: { effort: 'none' } }
				: {}),
		}),
		throw: false,
	});
	return parseOpenAIResponse(json);
}

async function generateChatCompletion(
	configuration: ProviderConfiguration,
	request: GenerationRequest,
): Promise<string> {
	const json = await send({
		url: `${trimSlash(configuration.baseUrl)}/chat/completions`,
		method: 'POST',
		contentType: 'application/json',
		headers: configuration.apiKey
			? { Authorization: `Bearer ${configuration.apiKey}` }
			: undefined,
		body: JSON.stringify({
			model: configuration.model,
			messages: [
				{ role: 'system', content: request.system },
				{ role: 'user', content: request.prompt },
			],
			max_tokens: request.maxOutputTokens ?? 1800,
			stream: false,
			...(configuration.provider === 'deepseek'
				? { thinking: { type: 'disabled' } }
				: {}),
			...(configuration.provider === 'xai'
				? { reasoning_effort: 'none' }
				: {}),
		}),
		throw: false,
	});
	return parseChatCompletion(json);
}

async function generateAnthropic(
	configuration: ProviderConfiguration,
	request: GenerationRequest,
): Promise<string> {
	const json = await send({
		url: `${trimSlash(configuration.baseUrl)}/v1/messages`,
		method: 'POST',
		contentType: 'application/json',
		headers: {
			'x-api-key': configuration.apiKey,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify({
			model: configuration.model,
			max_tokens: request.maxOutputTokens ?? 1800,
			system: request.system,
			messages: [{ role: 'user', content: request.prompt }],
		}),
		throw: false,
	});
	return parseAnthropicResponse(json);
}

async function generateGemini(
	configuration: ProviderConfiguration,
	request: GenerationRequest,
): Promise<string> {
	const model = encodeURIComponent(configuration.model);
	const json = await send({
		url: `${trimSlash(configuration.baseUrl)}/models/${model}:generateContent`,
		method: 'POST',
		contentType: 'application/json',
		headers: { 'x-goog-api-key': configuration.apiKey },
		body: JSON.stringify({
			systemInstruction: { parts: [{ text: request.system }] },
			contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
			generationConfig: {
				maxOutputTokens: request.maxOutputTokens ?? 1800,
			},
		}),
		throw: false,
	});
	return parseGeminiResponse(json);
}

export async function generateText(
	configuration: ProviderConfiguration,
	request: GenerationRequest,
): Promise<string> {
	if (!configuration.model.trim())
		throw new Error('Choose a model before generating a summary.');
	if (!configuration.apiKey.trim() && configuration.provider !== 'custom') {
		throw new Error(
			'Add an API key in Folder Intelligence settings first.',
		);
	}

	switch (configuration.provider) {
		case 'openai':
			return generateOpenAI(configuration, request);
		case 'anthropic':
			return generateAnthropic(configuration, request);
		case 'gemini':
			return generateGemini(configuration, request);
		case 'deepseek':
		case 'xai':
			return generateChatCompletion(configuration, request);
		case 'custom':
			return configuration.customProtocol === 'responses'
				? generateOpenAI(configuration, request)
				: generateChatCompletion(configuration, request);
	}
}
