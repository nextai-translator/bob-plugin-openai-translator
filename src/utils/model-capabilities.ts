import type { ReasoningMode, ServiceProvider } from '../types';

export const DEFAULT_MODEL = 'gpt-6-luna';

export const MODEL_CATALOG = [
  {
    id: 'claude-haiku-5-5',
    provider: 'anthropic',
  },
  {
    id: 'claude-sonnet-5-5',
    provider: 'anthropic',
  },
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'gemini',
  },
  {
    id: 'gemini-4-hydrogen',
    provider: 'gemini',
  },
  {
    id: 'gpt-6-luna',
    provider: 'openai',
  },
  {
    id: 'gpt-6.1-terra',
    provider: 'openai',
  },
  {
    id: 'MiniMax-M3',
    provider: 'minimax',
  },
  {
    id: 'MiniMax-M3.1-Flash',
    provider: 'minimax',
  },
] as const;

export type OpenAiReasoningEffort = 'low' | 'minimal' | 'none';

export type GeminiThinkingLevel = 'low' | 'minimal';

export type AnthropicReasoningFloor =
  | { readonly effort: 'low' }
  | { readonly thinking: 'between_tools' | 'disabled' };

export interface ModelControls {
  readonly anthropicReasoning?: AnthropicReasoningFloor;
  readonly geminiThinkingLevel?: GeminiThinkingLevel;
  readonly miniMaxThinking?: 'disabled';
  readonly openAiReasoningEffort?: OpenAiReasoningEffort;
}

const ANTHROPIC_REASONING_FLOORS = new Map<string, AnthropicReasoningFloor>([
  ['claude-fable-5-2', { effort: 'low' }],
  ['claude-haiku-5-5', { thinking: 'disabled' }],
  ['claude-opus-5-5', { effort: 'low' }],
  ['claude-sonnet-5-5', { thinking: 'between_tools' }],
]);

const GEMINI_THINKING_FLOORS = new Map<string, GeminiThinkingLevel>([
  ['gemini-3-flash-preview', 'minimal'],
  ['gemini-3.1-flash-lite', 'minimal'],
  ['gemini-3.1-pro-preview', 'low'],
  ['gemini-3.5-flash-lite', 'minimal'],
  ['gemini-3.6-flash', 'minimal'],
  ['gemini-3.8-flash', 'low'],
  ['gemini-4-argon', 'low'],
  ['gemini-4-carbon', 'low'],
  ['gemini-4-hydrogen', 'low'],
  ['gemini-4-neon', 'low'],
]);

const OPENAI_REASONING_FLOORS = new Map<string, OpenAiReasoningEffort>([
  ['gpt-5', 'minimal'],
  ['gpt-5.3-codex', 'low'],
  ['gpt-5.4-mini', 'none'],
  ['gpt-5.6', 'none'],
  ['gpt-5.6-luna', 'none'],
  ['gpt-5.6-sol', 'none'],
  ['gpt-5.6-terra', 'none'],
  ['gpt-6-luna', 'none'],
  ['gpt-6.1-terra', 'none'],
  ['gpt-6.2-astra', 'low'],
  ['gpt-6.2-sol', 'low'],
]);

// A gateway that speaks a provider's native format may namespace the same model ID.
const withoutNamespace = (model: string): string =>
  model.slice(model.lastIndexOf('/') + 1);

export const resolveModelControls = (
  provider: ServiceProvider,
  model: string,
  mode: ReasoningMode,
): ModelControls => {
  if (mode !== 'disable') return {};

  switch (provider) {
    case 'anthropic': {
      const floor = ANTHROPIC_REASONING_FLOORS.get(withoutNamespace(model));
      return floor ? { anthropicReasoning: floor } : {};
    }
    case 'gemini': {
      const level = GEMINI_THINKING_FLOORS.get(withoutNamespace(model));
      return level ? { geminiThinkingLevel: level } : {};
    }
    case 'minimax':
      if (model === 'MiniMax-M3') return { miniMaxThinking: 'disabled' };
      return model === 'MiniMax-M3.1-Flash'
        ? { openAiReasoningEffort: 'low' }
        : {};
    case 'azure-openai':
    case 'openai':
    case 'openai-compatible': {
      const effort = OPENAI_REASONING_FLOORS.get(model);
      return effort ? { openAiReasoningEffort: effort } : {};
    }
  }
};
