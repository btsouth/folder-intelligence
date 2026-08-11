import { describe, expect, it } from 'vitest';
import {
	parseAnthropicResponse,
	parseChatCompletion,
	parseGeminiResponse,
	parseOpenAIResponse,
} from '../src/provider-parsers';

describe('provider response parsing', () => {
	it('parses OpenAI Responses output', () => {
		expect(
			parseOpenAIResponse({
				output: [
					{
						content: [
							{ type: 'output_text', text: 'OpenAI summary' },
						],
					},
				],
			}),
		).toBe('OpenAI summary');
	});

	it('parses OpenAI-compatible chat output', () => {
		expect(
			parseChatCompletion({
				choices: [{ message: { content: 'Compatible summary' } }],
			}),
		).toBe('Compatible summary');
	});

	it('parses Anthropic Messages output', () => {
		expect(
			parseAnthropicResponse({
				content: [{ type: 'text', text: 'Claude summary' }],
			}),
		).toBe('Claude summary');
	});

	it('parses Gemini output', () => {
		expect(
			parseGeminiResponse({
				candidates: [
					{ content: { parts: [{ text: 'Gemini summary' }] } },
				],
			}),
		).toBe('Gemini summary');
	});

	it('rejects empty provider responses', () => {
		expect(() => parseChatCompletion({ choices: [] })).toThrow(
			'no summary text',
		);
	});
});
