import { describe, expect, it } from 'bun:test';
import {
  getCatalogModelProvider,
  MODEL_CATALOG,
  resolveModelControls,
} from '../model-capabilities';

describe('model catalog', () => {
  it('contains unique model ids', () => {
    const ids = MODEL_CATALOG.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('maps every curated model to its provider', () => {
    for (const model of MODEL_CATALOG) {
      expect(getCatalogModelProvider(model.id)).toBe(model.provider);
    }
    expect(getCatalogModelProvider('custom-model')).toBeUndefined();
  });
});

describe('resolveModelControls', () => {
  it('omits all reasoning controls in default mode', () => {
    for (const model of MODEL_CATALOG) {
      expect(resolveModelControls(model.provider, model.id, 'default')).toEqual(
        {},
      );
    }
  });

  it('maps current GPT models to supported reasoning efforts', () => {
    expect(resolveModelControls('openai', 'gpt-5.6-luna', 'disable')).toEqual({
      openAiReasoningEffort: 'none',
    });
    expect(resolveModelControls('openai', 'gpt-5.4-mini', 'disable')).toEqual({
      openAiReasoningEffort: 'none',
    });
  });

  it('keeps the original GPT-5 family within its supported floor', () => {
    expect(resolveModelControls('openai', 'gpt-5', 'disable')).toEqual({
      openAiReasoningEffort: 'minimal',
    });
    expect(resolveModelControls('openai', 'gpt-5-pro', 'disable')).toEqual({
      openAiReasoningEffort: 'high',
    });
    expect(resolveModelControls('openai', 'gpt-5.3-codex', 'disable')).toEqual({
      openAiReasoningEffort: 'low',
    });
  });

  it('does not infer controls from model name prefixes', () => {
    expect(resolveModelControls('openai', 'gpt-4o', 'disable')).toEqual({});
    expect(
      resolveModelControls('openai-compatible', 'custom-model', 'disable'),
    ).toEqual({});
    expect(
      resolveModelControls('openai', 'gpt-5.3-codex-snapshot', 'disable'),
    ).toEqual({});
    expect(
      resolveModelControls('gemini', 'gemini-3.2-experimental', 'disable'),
    ).toEqual({});
    expect(
      resolveModelControls('minimax', 'MiniMax-M3-preview', 'disable'),
    ).toEqual({});
    expect(
      resolveModelControls('openai-compatible', 'constructor', 'disable'),
    ).toEqual({});
  });

  it('maps Gemini thinking without adding sampling parameters', () => {
    expect(
      resolveModelControls('gemini', 'gemini-3.6-flash', 'disable'),
    ).toEqual({
      geminiThinking: { thinkingLevel: 'minimal' },
    });
    expect(resolveModelControls('gemini', 'gemini-2.5-pro', 'disable')).toEqual(
      {
        geminiThinking: { thinkingBudget: 128 },
      },
    );
    expect(
      resolveModelControls('gemini', 'gemini-2.5-flash', 'disable'),
    ).toEqual({
      geminiThinking: { thinkingBudget: 0 },
    });
    expect(
      resolveModelControls('gemini', 'gemini-3.1-pro-preview', 'disable'),
    ).toEqual({
      geminiThinking: { thinkingLevel: 'low' },
    });
  });

  it('maps MiniMax M3 thinking and omits unsupported M2 controls', () => {
    expect(resolveModelControls('minimax', 'MiniMax-M3', 'disable')).toEqual({
      miniMaxThinking: 'disabled',
    });
    expect(
      resolveModelControls('minimax', 'MiniMax-M2.7-highspeed', 'disable'),
    ).toEqual({});
  });
});
