import { describe, expect, it } from 'bun:test';
import type { TextTranslateQuery } from '@bob-translate/types';
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
          model: 'gemini-3.6-flash',
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
    expect(body.model).toBe('gpt-5.6-luna');
    expect(body.stream).toBe(true);
    expect(body.reasoning).toBeUndefined();
    expect(body.temperature).toBeUndefined();
    expect(body.instructions).toBeString();
    expect(body.input).toBeString();

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
    expect(body.messages).toBeArray();
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
        data: { choices: [{ message: { content: '  你好  ' } }] },
      } as never),
    ).toBe('你好');
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

describe('Gemini codec', () => {
  it('uses native GenerateContent and model defaults without temperature', () => {
    const adapter = new GeminiAdapter(
      createTestConfig({
        model: 'gemini-3.6-flash',
      }),
    );
    const body = adapter.buildRequestBody(query);
    expect(adapter.getTextGenerationUrl()).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse',
    );
    expect(adapter.buildHeaders('key')['x-goog-api-key']).toBe('key');
    expect(body.generationConfig).toBeUndefined();

    const disabled = new GeminiAdapter(
      createTestConfig({
        model: 'gemini-3.6-flash',
        reasoningMode: 'disable',
      }),
    );
    expect(disabled.buildRequestBody(query).generationConfig).toEqual({
      thinkingConfig: { thinkingLevel: 'minimal' },
    });
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
