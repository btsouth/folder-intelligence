import type { ProviderKind } from './types';

export const PROVIDER_DEFAULTS: Record<
	ProviderKind,
	{ label: string; baseUrl: string; model: string }
> = {
	openai: {
		label: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1',
		model: 'gpt-5.6-luna',
	},
	anthropic: {
		label: 'Anthropic',
		baseUrl: 'https://api.anthropic.com',
		model: 'claude-haiku-4-5-20251001',
	},
	gemini: {
		label: 'Google Gemini',
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
		model: 'gemini-3.5-flash-lite',
	},
	deepseek: {
		label: 'DeepSeek',
		baseUrl: 'https://api.deepseek.com/v1',
		model: 'deepseek-v4-flash',
	},
	xai: {
		label: 'xAI',
		baseUrl: 'https://api.x.ai/v1',
		model: 'grok-4.5',
	},
	custom: {
		label: 'Custom OpenAI-compatible',
		baseUrl: 'http://localhost:11434/v1',
		model: '',
	},
};
