import { describe, expect, it } from 'bun:test';
import type { TextTranslateQuery } from '@bob-translate/types';
import { AnthropicAdapter } from '../anthropic';
import { AzureOpenAiAdapter } from '../azure-openai';
import { GeminiAdapter } from '../gemini';
import { getServiceAdapter } from '../index';
import { MiniMaxAdapter } from '../minimax';
import { OpenAiAdapter } from '../openai';
import { createTestConfig } from './fixtures';

const query = {
  text: 'Hello',
  detectFrom: 'en',
  detectTo: 'zh-Hans',
} as unknown as TextTranslateQuery;

describe('provider dispatch', () => {
  it('derives the adapter from the model and optional API URL', () => {
    expect(getServiceAdapter(createTestConfig())).toBeInstanceOf(OpenAiAdapter);
    expect(
      getServiceAdapter(
        createTestConfig({
          model: 'custom',
          customModel: 'local',
          apiUrl: 'http://localhost:11434/v1/chat/completions',
        }),
      ),
    ).toBeInstanceOf(OpenAiAdapter);
    expect(
      getServiceAdapter(
        createTestConfig({
          model: 'custom',
          customModel: 'deployment',
          apiUrl: 'https://resource.openai.azure.com/openai/v1/responses',
        }),
      ),
    ).toBeInstanceOf(AzureOpenAiAdapter);
    expect(
      getServiceAdapter(
        createTestConfig({
          model: 'gemini-4-hydrogen',
        }),
      ),
    ).toBeInstanceOf(GeminiAdapter);
    expect(
      getServiceAdapter(createTestConfig({ model: 'MiniMax-M3' })),
    ).toBeInstanceOf(MiniMaxAdapter);
  });
});

describe('OpenAI protocol codec', () => {
  it('builds a minimal Responses request and omits temperature', () => {
    const adapter = new OpenAiAdapter(createTestConfig());
    const body = adapter.buildRequestBody(query);
    expect(adapter.getTextGenerationUrl()).toBe(
      'https://api.openai.com/v1/responses',
    );
    expect(adapter.buildHeaders('key')).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer key',
    });
    expect(body.model).toBe('gpt-6-luna');
    expect(body.stream).toBe(true);
    expect(body.reasoning).toBeUndefined();
    expect(body.temperature).toBeUndefined();
    expect(body.instructions).toContain('<__source_text__> tags');
    expect(body.input).toBe('<__source_text__>Hello</__source_text__>');

    const disabled = new OpenAiAdapter(
      createTestConfig({ reasoningMode: 'disable' }),
    );
    expect(disabled.buildRequestBody(query).reasoning).toEqual({
      effort: 'none',
    });
  });

  it('uses Chat Completions shape for a compatible endpoint', () => {
    const adapter = new OpenAiAdapter(
      createTestConfig({
        model: 'custom',
        customModel: 'local-model',
        apiUrl: 'http://localhost:11434/v1/chat/completions',
      }),
    );
    const body = adapter.buildRequestBody(query);
    expect(body.messages).toMatchObject([
      {
        role: 'system',
        content: expect.stringContaining('<__source_text__> tags'),
      },
      { role: 'user', content: '<__source_text__>Hello</__source_text__>' },
    ]);
    expect(body.instructions).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it('parses Responses and Chat Completions response shapes', () => {
    const responses = new OpenAiAdapter(createTestConfig());
    expect(
      responses.parseResponse({
        data: {
          output: [
            {
              type: 'message',
              content: [
                { type: 'output_text', text: '你' },
                { type: 'output_text', text: '好' },
              ],
            },
          ],
        },
      } as never),
    ).toBe('你好');

    const chat = new OpenAiAdapter(
      createTestConfig({
        model: 'custom',
        customModel: 'local-model',
        apiUrl: 'http://localhost:11434/v1/chat/completions',
      }),
    );
    expect(
      chat.parseResponse({
        data: { choices: [{ message: { content: '    你好\n' } }] },
      } as never),
    ).toBe('    你好\n');
  });

  it('rejects a Chat Completions response cut off at the output limit', () => {
    const chat = new OpenAiAdapter(
      createTestConfig({
        apiUrl: 'https://gateway.example/v1/chat/completions',
      }),
    );
    expect(() =>
      chat.parseResponse({
        data: {
          choices: [{ finish_reason: 'length', message: { content: '你' } }],
        },
      } as never),
    ).toThrow(expect.objectContaining({ message: 'API 响应未完成：length' }));
  });

  it('rejects incomplete Responses output instead of returning partial text', () => {
    const adapter = new OpenAiAdapter(createTestConfig());
    let error: unknown;

    try {
      adapter.parseResponse({
        data: {
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output_text: 'partial',
        },
      } as never);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      type: 'api',
      message: 'API 响应未完成：max_output_tokens',
    });
  });
});

describe('Azure OpenAI codec', () => {
  it('uses the configured full endpoint, Azure auth, and deployment model', () => {
    const adapter = new AzureOpenAiAdapter(
      createTestConfig({
        model: 'custom',
        customModel: 'translation-deployment',
        apiUrl: 'https://resource.openai.azure.com/openai/v1/responses',
      }),
    );
    const body = adapter.buildRequestBody(query);
    expect(adapter.getTextGenerationUrl()).toBe(
      'https://resource.openai.azure.com/openai/v1/responses',
    );
    expect(adapter.buildHeaders('key')['api-key']).toBe('key');
    expect(body.model).toBe('translation-deployment');
    expect(body.temperature).toBeUndefined();
  });
});

describe('Anthropic codec', () => {
  it('builds a Messages request with the required output cap', () => {
    const adapter = new AnthropicAdapter(
      createTestConfig({ model: 'claude-haiku-5-5' }),
    );
    const body = adapter.buildRequestBody(query);

    expect(
      getServiceAdapter(createTestConfig({ model: 'claude-haiku-5-5' })),
    ).toBeInstanceOf(AnthropicAdapter);
    expect(adapter.getTextGenerationUrl()).toBe(
      'https://api.anthropic.com/v1/messages',
    );
    expect(adapter.buildHeaders('key')).toMatchObject({
      'anthropic-version': '2026-10-21',
      'x-api-key': 'key',
    });
    expect(body).toMatchObject({
      max_tokens: 32000,
      messages: [
        { role: 'user', content: '<__source_text__>Hello</__source_text__>' },
      ],
      model: 'claude-haiku-5-5',
      stream: true,
    });
    expect(body.system).toContain('<__source_text__> tags');
    expect(body.thinking).toBeUndefined();
    expect(body.output_config).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it('maps reasoning off to the lowest setting each model accepts', () => {
    const bodyFor = (model: string) =>
      new AnthropicAdapter(
        createTestConfig({
          customModel: model,
          model: 'custom',
          reasoningMode: 'disable',
        }),
      ).buildRequestBody(query);

    expect(bodyFor('claude-haiku-5-5').thinking).toEqual({ type: 'disabled' });
    expect(bodyFor('claude-sonnet-5-5').thinking).toEqual({
      type: 'between_tools',
    });
    expect(bodyFor('claude-opus-5-5')).toMatchObject({
      output_config: { effort: 'low' },
    });
    expect(bodyFor('claude-opus-5-5').thinking).toBeUndefined();
    expect(bodyFor('claude-unknown').thinking).toBeUndefined();
    expect(bodyFor('claude-unknown').output_config).toBeUndefined();
  });

  it('joins text blocks, skips thinking, and rejects truncated output', () => {
    const adapter = new AnthropicAdapter(
      createTestConfig({ model: 'claude-haiku-5-5' }),
    );
    expect(
      adapter.parseResponse({
        data: {
          content: [
            { type: 'thinking', thinking: 'hmm' },
            { type: 'text', text: '你' },
            { type: 'text', text: '好' },
          ],
          stop_reason: 'end_turn',
        },
      } as never),
    ).toBe('你好');
    expect(() =>
      adapter.parseResponse({
        data: {
          content: [{ type: 'text', text: '你' }],
          stop_reason: 'max_tokens',
        },
      } as never),
    ).toThrow();
  });
});

describe('Gemini codec', () => {
  it('uses native GenerateContent and model defaults without temperature', () => {
    const adapter = new GeminiAdapter(
      createTestConfig({
        model: 'gemini-4-hydrogen',
      }),
    );
    const body = adapter.buildRequestBody(query);
    expect(adapter.getTextGenerationUrl()).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:streamGenerateContent?alt=sse',
    );
    expect(adapter.buildHeaders('key')['x-goog-api-key']).toBe('key');
    expect(body).toMatchObject({
      system_instruction: {
        parts: [{ text: expect.stringContaining('<__source_text__> tags') }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: '<__source_text__>Hello</__source_text__>' }],
        },
      ],
    });
    expect(body.generationConfig).toBeUndefined();

    const disabled = new GeminiAdapter(
      createTestConfig({
        model: 'gemini-4-hydrogen',
        reasoningMode: 'disable',
      }),
    );
    expect(disabled.buildRequestBody(query).generationConfig).toEqual({
      thinkingConfig: { thinkingLevel: 'low' },
    });
  });

  it('appends the model operation to a configured models URL', () => {
    const adapter = new GeminiAdapter(
      createTestConfig({
        apiUrl: 'https://relay.example/v1beta/models',
        model: 'gemini-4-hydrogen',
        stream: 'disable',
      }),
    );
    expect(adapter.getTextGenerationUrl()).toBe(
      'https://relay.example/v1beta/models/gemini-4-hydrogen:generateContent',
    );
  });

  it('concatenates all returned text parts', () => {
    const adapter = new GeminiAdapter(
      createTestConfig({
        model: 'gemini-3.5-flash-lite',
      }),
    );
    expect(
      adapter.parseResponse({
        data: {
          candidates: [
            { content: { parts: [{ text: '你' }, { text: '好' }] } },
          ],
        },
      } as never),
    ).toBe('你好');
  });
});

describe('MiniMax codec', () => {
  it('uses Chat Completions and separates reasoning by default', () => {
    const adapter = new MiniMaxAdapter(
      createTestConfig({ model: 'MiniMax-M3' }),
    );
    const body = adapter.buildRequestBody(query);
    expect(adapter.getTextGenerationUrl()).toBe(
      'https://api.minimax.io/v1/chat/completions',
    );
    expect(body.reasoning_split).toBe(true);
    expect(body.thinking).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it('disables reasoning for supported models', () => {
    const disabled = new MiniMaxAdapter(
      createTestConfig({
        model: 'MiniMax-M3',
        reasoningMode: 'disable',
      }),
    );
    expect(disabled.buildRequestBody(query).thinking).toEqual({
      type: 'disabled',
    });
  });
});

describe('unfinished native responses', () => {
  it('rejects a Claude response that stopped for any reason other than completion', () => {
    const adapter = new AnthropicAdapter(
      createTestConfig({ model: 'claude-haiku-5-5' }),
    );
    for (const stopReason of [
      'max_tokens',
      'model_context_window_exceeded',
      'refusal',
    ]) {
      expect(() =>
        adapter.parseResponse({
          data: {
            type: 'message',
            content: [{ type: 'text', text: 'partial' }],
            stop_reason: stopReason,
          },
        } as never),
      ).toThrow(
        expect.objectContaining({ message: `API 响应未完成：${stopReason}` }),
      );
    }
  });

  it('rejects a Gemini response that did not finish with STOP', () => {
    const adapter = new GeminiAdapter(
      createTestConfig({ model: 'gemini-4-hydrogen' }),
    );
    expect(() =>
      adapter.parseResponse({
        data: {
          candidates: [
            {
              content: { parts: [{ text: 'partial' }] },
              finishReason: 'MAX_TOKENS',
            },
          ],
        },
      } as never),
    ).toThrow(
      expect.objectContaining({ message: 'API 响应未完成：MAX_TOKENS' }),
    );
  });
});

describe('Gemini operation URL', () => {
  it('inserts the model operation before a configured query string', () => {
    const create = (stream: string) =>
      new GeminiAdapter(
        createTestConfig({
          apiUrl: 'https://gateway.example/v1beta/models/?tenant=a',
          model: 'gemini-4-hydrogen',
          stream,
        }),
      );
    expect(create('disable').getTextGenerationUrl()).toBe(
      'https://gateway.example/v1beta/models/gemini-4-hydrogen:generateContent?tenant=a',
    );
    expect(create('enable').getTextGenerationUrl()).toBe(
      'https://gateway.example/v1beta/models/gemini-4-hydrogen:streamGenerateContent?tenant=a&alt=sse',
    );
  });
});
