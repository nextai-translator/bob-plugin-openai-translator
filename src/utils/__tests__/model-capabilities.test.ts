import { describe, expect, it } from 'bun:test';
import { MODEL_CATALOG, resolveModelControls } from '../model-capabilities';

describe('model catalog', () => {
  it('contains unique model ids', () => {
    const ids = MODEL_CATALOG.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
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

  it('maps GPT models to their lowest supported reasoning effort', () => {
    expect(resolveModelControls('openai', 'gpt-6-luna', 'disable')).toEqual({
      openAiReasoningEffort: 'none',
    });
    expect(resolveModelControls('openai', 'gpt-6.2-sol', 'disable')).toEqual({
      openAiReasoningEffort: 'low',
    });
  });

  it('does not infer controls from model name prefixes', () => {
    expect(resolveModelControls('openai', 'gpt-4o', 'disable')).toEqual({});
    expect(
      resolveModelControls('openai-compatible', 'custom-model', 'disable'),
    ).toEqual({});
    expect(
      resolveModelControls('openai', 'gpt-6-luna-snapshot', 'disable'),
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

  it('maps Gemini models to their lowest thinking level', () => {
    expect(
      resolveModelControls('gemini', 'gemini-3.5-flash-lite', 'disable'),
    ).toEqual({ geminiThinkingLevel: 'minimal' });
    expect(
      resolveModelControls('gemini', 'gemini-4-hydrogen', 'disable'),
    ).toEqual({ geminiThinkingLevel: 'low' });
  });

  it('recognizes a namespaced model ID on native-format gateways only', () => {
    expect(
      resolveModelControls('gemini', 'google/gemini-4-hydrogen', 'disable'),
    ).toEqual({ geminiThinkingLevel: 'low' });
    expect(
      resolveModelControls(
        'anthropic',
        'anthropic/claude-haiku-5-5',
        'disable',
      ),
    ).toEqual({ anthropicReasoning: { thinking: 'disabled' } });
    expect(
      resolveModelControls('openai-compatible', 'openai/gpt-6-luna', 'disable'),
    ).toEqual({});
  });

  it('maps MiniMax models to their lowest reasoning setting', () => {
    expect(resolveModelControls('minimax', 'MiniMax-M3', 'disable')).toEqual({
      miniMaxThinking: 'disabled',
    });
    expect(
      resolveModelControls('minimax', 'MiniMax-M3.1-Flash', 'disable'),
    ).toEqual({ openAiReasoningEffort: 'low' });
  });
});
