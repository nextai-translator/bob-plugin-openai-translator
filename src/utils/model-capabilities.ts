import type { ReasoningMode, ServiceProvider } from '../types';

export const DEFAULT_MODEL = 'gpt-5.6-luna';

export const MODEL_CATALOG = Object.freeze([
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'gemini',
  },
  {
    id: 'gemini-3.6-flash',
    provider: 'gemini',
  },
  {
    id: 'gpt-5.4-mini',
    provider: 'openai',
  },
  {
    id: 'gpt-5.6-luna',
    provider: 'openai',
  },
  {
    id: 'MiniMax-M2.7-highspeed',
    provider: 'minimax',
  },
  {
    id: 'MiniMax-M3',
    provider: 'minimax',
  },
] as const);

export type OpenAiReasoningEffort = 'high' | 'low' | 'minimal' | 'none';

export type GeminiThinkingConfig =
  | { readonly thinkingBudget: number }
  | { readonly thinkingLevel: 'low' | 'minimal' };

export interface ModelControls {
  readonly geminiThinking?: GeminiThinkingConfig;
  readonly miniMaxThinking?: 'disabled';
  readonly openAiReasoningEffort?: OpenAiReasoningEffort;
}

export const getCatalogModelProvider = (
  model: string,
): ServiceProvider | undefined =>
  MODEL_CATALOG.find((entry) => entry.id === model)?.provider;

const OPENAI_REASONING_FLOORS = new Map<string, OpenAiReasoningEffort>([
  ['gpt-5', 'minimal'],
  ['gpt-5-pro', 'high'],
  ['gpt-5.3-codex', 'low'],
  ['gpt-5.4-mini', 'none'],
  ['gpt-5.6', 'none'],
  ['gpt-5.6-luna', 'none'],
  ['gpt-5.6-sol', 'none'],
  ['gpt-5.6-terra', 'none'],
]);

const GEMINI_THINKING_FLOORS = new Map<string, GeminiThinkingConfig>([
  ['gemini-2.5-flash', { thinkingBudget: 0 }],
  ['gemini-2.5-flash-lite', { thinkingBudget: 0 }],
  ['gemini-2.5-pro', { thinkingBudget: 128 }],
  ['gemini-3-flash-preview', { thinkingLevel: 'minimal' }],
  ['gemini-3-pro-preview', { thinkingLevel: 'low' }],
  ['gemini-3.1-pro-preview', { thinkingLevel: 'low' }],
  ['gemini-3.5-flash', { thinkingLevel: 'minimal' }],
  ['gemini-3.5-flash-lite', { thinkingLevel: 'minimal' }],
  ['gemini-3.6-flash', { thinkingLevel: 'minimal' }],
]);

export const resolveModelControls = (
  provider: ServiceProvider,
  model: string,
  mode: ReasoningMode,
): ModelControls => {
  if (
    provider === 'openai' ||
    provider === 'azure-openai' ||
    provider === 'openai-compatible'
  ) {
    const effort =
      mode === 'disable' ? OPENAI_REASONING_FLOORS.get(model) : undefined;
    return effort ? { openAiReasoningEffort: effort } : {};
  }
  if (provider === 'gemini') {
    const thinking =
      mode === 'disable' ? GEMINI_THINKING_FLOORS.get(model) : undefined;
    return thinking ? { geminiThinking: thinking } : {};
  }
  if (provider === 'minimax' && model === 'MiniMax-M3') {
    return mode === 'disable' ? { miniMaxThinking: 'disabled' } : {};
  }
  return {};
};
