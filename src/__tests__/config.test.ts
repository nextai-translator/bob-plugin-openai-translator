import { describe, expect, it } from 'bun:test';
import { parseOptions } from '../config';
import { MODEL_CATALOG } from '../utils/model-capabilities';

const options = (
  overrides: Partial<Record<string, string>> = {},
): Record<string, string> => ({
  apiKeys: 'key-one, key-two',
  apiUrl: '',
  customModel: '',
  customSystemPrompt: '',
  model: 'gpt-6-luna',
  reasoningMode: 'default',
  stream: 'enable',
  ...overrides,
});

describe('parseOptions', () => {
  it('needs only API keys for the default OpenAI configuration', () => {
    const config = parseOptions({ apiKeys: 'key-one, key-two' });
    expect(config.endpoint).toBe('https://api.openai.com/v1/responses');
    expect(config.provider).toBe('openai');
    expect(config.protocol).toBe('openai-responses');
    expect(config.apiKeys).toEqual(['key-one', 'key-two']);
    expect(config.reasoningMode).toBe('default');
    expect(config.stream).toBe(true);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.apiKeys)).toBe(true);
  });

  it('routes every menu model to its official provider', () => {
    for (const model of MODEL_CATALOG) {
      expect(parseOptions(options({ model: model.id })).provider).toBe(
        model.provider,
      );
    }
  });

  it('keeps Bearer authentication for a non-Azure /openai/v1 path', () => {
    expect(
      parseOptions(
        options({ apiUrl: 'https://api.groq.com/openai/v1/chat/completions' }),
      ).provider,
    ).toBe('openai-compatible');
  });

  it('infers official providers from the selected model', () => {
    const gemini = parseOptions(
      options({
        model: 'gemini-4-hydrogen',
      }),
    );
    expect(gemini).toMatchObject({
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      protocol: 'gemini-generate-content',
      provider: 'gemini',
    });

    const minimax = parseOptions(
      options({
        model: 'MiniMax-M3',
      }),
    );
    expect(minimax).toMatchObject({
      endpoint: 'https://api.minimax.io/v1/chat/completions',
      protocol: 'openai-chat-completions',
      provider: 'minimax',
    });

    const anthropic = parseOptions(options({ model: 'claude-sonnet-5-5' }));
    expect(anthropic).toMatchObject({
      endpoint: 'https://api.anthropic.com/v1/messages',
      protocol: 'anthropic-messages',
      provider: 'anthropic',
    });
  });

  it('selects the native codec from the API URL ending', () => {
    const anthropicRelay = parseOptions(
      options({
        apiUrl: 'https://relay.example/anthropic/v1/messages/',
        customModel: 'vendor/claude',
        model: 'custom',
      }),
    );
    expect(anthropicRelay).toMatchObject({
      endpoint: 'https://relay.example/anthropic/v1/messages',
      protocol: 'anthropic-messages',
      provider: 'anthropic',
    });

    const geminiRelay = parseOptions(
      options({
        apiUrl: 'https://relay.example/v1beta/models',
        model: 'gpt-6-luna',
      }),
    );
    expect(geminiRelay).toMatchObject({
      endpoint: 'https://relay.example/v1beta/models',
      protocol: 'gemini-generate-content',
      provider: 'gemini',
    });
  });

  it('routes a complete custom API URL without a provider setting', () => {
    const compatible = parseOptions(
      options({
        apiUrl: 'gateway.example/v1/chat/completions',
      }),
    );
    expect(compatible).toMatchObject({
      endpoint: 'https://gateway.example/v1/chat/completions',
      protocol: 'openai-chat-completions',
      provider: 'openai-compatible',
    });

    const azure = parseOptions(
      options({
        apiUrl:
          'https://resource.openai.azure.com/openai/v1/responses?api-version=preview',
        customModel: 'translation-deployment',
        model: 'custom',
      }),
    );
    expect(azure).toMatchObject({
      protocol: 'openai-responses',
      provider: 'azure-openai',
    });

    const proxiedAzure = parseOptions(
      options({
        apiUrl:
          'https://azure-gateway.example/openai/deployments/translation/responses?api-version=preview',
      }),
    );
    expect(proxiedAzure.provider).toBe('azure-openai');

    const miniMaxChina = parseOptions(
      options({
        apiUrl: 'https://api.minimaxi.com/v1/chat/completions',
        model: 'MiniMax-M3',
      }),
    );
    expect(miniMaxChina).toMatchObject({
      protocol: 'openai-chat-completions',
      provider: 'minimax',
    });
  });

  it('keeps MiniMax official hosts with explicit ports on the MiniMax codec', () => {
    for (const apiUrl of [
      'https://api.minimax.io:443/v1/chat/completions',
      'https://api.minimaxi.com:443/v1/chat/completions',
    ]) {
      expect(
        parseOptions(options({ apiUrl, model: 'MiniMax-M3' })),
      ).toMatchObject({
        protocol: 'openai-chat-completions',
        provider: 'minimax',
      });
    }
  });

  it('rejects partial URLs, invalid menus, and empty keys', () => {
    expect(() =>
      parseOptions(options({ apiUrl: 'https://example.com/v1' })),
    ).toThrow();
    expect(() => parseOptions(options({ reasoningMode: 'minimal' }))).toThrow();
    expect(() => parseOptions(options({ reasoningMode: 'auto' }))).toThrow();
    expect(() => parseOptions(options({ reasoningMode: 'enable' }))).toThrow();
    expect(() => parseOptions(options({ stream: 'sometimes' }))).toThrow();
    expect(() => parseOptions(options({ apiKeys: ' , ' }))).toThrow();
  });

  it('requires the custom model value and infers known prefixes', () => {
    expect(() =>
      parseOptions(
        options({
          model: 'custom',
        }),
      ),
    ).toThrow();

    const custom = parseOptions(
      options({
        model: 'custom',
        customModel: 'gemini-experimental',
      }),
    );
    expect(custom.model).toBe('gemini-experimental');
    expect(custom.provider).toBe('gemini');
  });
});
