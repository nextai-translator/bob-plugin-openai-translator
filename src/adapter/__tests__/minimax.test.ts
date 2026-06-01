import { beforeEach, describe, expect, it, mock } from 'bun:test';

// Mock Bob globals before importing adapter
const mockOption: Record<string, string> = {};
const mockHttpResponses: Array<{
  data?: unknown;
  error?: unknown;
  response?: { statusCode: number };
}> = [];

// @ts-expect-error - Mock Bob global
globalThis.$option = new Proxy(mockOption, {
  get: (_target, prop) => mockOption[prop as string],
});

// @ts-expect-error - Mock Bob global
globalThis.$http = {
  request: mock(async () => mockHttpResponses.shift()),
  streamRequest: mock(async () => {}),
};

import { getServiceAdapter } from '../index';
import { MiniMaxAdapter } from '../minimax';

describe('MiniMaxAdapter', () => {
  beforeEach(() => {
    // Reset options
    for (const key of Object.keys(mockOption)) {
      delete mockOption[key];
    }
    mockHttpResponses.length = 0;
  });

  describe('constructor', () => {
    it('should use default MiniMax base URL', () => {
      const adapter = new MiniMaxAdapter();
      const url = adapter.getTextGenerationUrl();
      expect(url).toBe('https://api.minimax.io/v1/chat/completions');
    });

    it('should use custom apiUrl if provided', () => {
      mockOption.apiUrl = 'https://api.minimaxi.com';
      const adapter = new MiniMaxAdapter();
      const url = adapter.getTextGenerationUrl();
      expect(url).toBe('https://api.minimaxi.com/v1/chat/completions');
    });

    it('should use custom apiPath if provided', () => {
      mockOption.apiPath = '/v1/responses';
      const adapter = new MiniMaxAdapter();
      const url = adapter.getTextGenerationUrl();
      expect(url).toBe('https://api.minimax.io/v1/responses');
    });
  });

  describe('getApiPath', () => {
    it('should default to /v1/chat/completions', () => {
      const adapter = new MiniMaxAdapter();
      const url = adapter.getTextGenerationUrl();
      expect(url).toContain('/v1/chat/completions');
    });
  });

  describe('temperature clamping', () => {
    it('should clamp temperature 0 to 0.01', () => {
      mockOption.temperature = '0';
      mockOption.model = 'MiniMax-M3';
      const adapter = new MiniMaxAdapter();
      const body = adapter.buildRequestBody({
        text: 'hello',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
      } as any);
      expect(body.temperature).toBe(0.01);
    });

    it('should clamp negative temperature to 0.01', () => {
      mockOption.temperature = '-0.5';
      mockOption.model = 'MiniMax-M3';
      const adapter = new MiniMaxAdapter();
      const body = adapter.buildRequestBody({
        text: 'hello',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
      } as any);
      expect(body.temperature).toBe(0.01);
    });

    it('should clamp temperature above 1 to 1.0', () => {
      mockOption.temperature = '1.5';
      mockOption.model = 'MiniMax-M3';
      const adapter = new MiniMaxAdapter();
      const body = adapter.buildRequestBody({
        text: 'hello',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
      } as any);
      expect(body.temperature).toBe(1.0);
    });

    it('should keep valid temperature unchanged', () => {
      mockOption.temperature = '0.5';
      mockOption.model = 'MiniMax-M3';
      const adapter = new MiniMaxAdapter();
      const body = adapter.buildRequestBody({
        text: 'hello',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
      } as any);
      expect(body.temperature).toBe(0.5);
    });
  });

  describe('buildHeaders', () => {
    it('should set Bearer authorization', () => {
      const adapter = new MiniMaxAdapter();
      const headers = adapter.buildHeaders('test-api-key');
      expect(headers.Authorization).toBe('Bearer test-api-key');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('buildRequestBody', () => {
    it('should build Chat Completions API request body', () => {
      mockOption.model = 'MiniMax-M3';
      mockOption.temperature = '0.2';
      mockOption.stream = 'enable';
      const adapter = new MiniMaxAdapter();
      const body = adapter.buildRequestBody({
        text: 'hello',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
      } as any);

      expect(body.model).toBe('MiniMax-M3');
      expect(body.stream).toBe(true);
      expect(body.messages).toBeDefined();
      expect(Array.isArray(body.messages)).toBe(true);
      const messages = body.messages as Array<{ role: string }>;
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    it('should use custom model name', () => {
      mockOption.model = 'custom';
      mockOption.customModel = 'MiniMax-M2.7-highspeed';
      mockOption.temperature = '0.5';
      const adapter = new MiniMaxAdapter();
      const body = adapter.buildRequestBody({
        text: 'hello',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
      } as any);
      expect(body.model).toBe('MiniMax-M2.7-highspeed');
    });
  });

  describe('parseResponse', () => {
    it('should parse Chat Completions response', () => {
      const adapter = new MiniMaxAdapter();
      const result = adapter.parseResponse({
        data: {
          choices: [
            {
              message: {
                content: '  你好  ',
              },
            },
          ],
        },
        rawData: '',
        response: { statusCode: 200, headers: {} },
      } as any);
      expect(result).toBe('你好');
    });

    it('should strip think tags from response', () => {
      const adapter = new MiniMaxAdapter();
      const result = adapter.parseResponse({
        data: {
          choices: [
            {
              message: {
                content:
                  '<think>\nLet me translate this.\n</think>\n\n你好，世界！',
              },
            },
          ],
        },
        rawData: '',
        response: { statusCode: 200, headers: {} },
      } as any);
      expect(result).toBe('你好，世界！');
    });

    it('should handle response without think tags', () => {
      const adapter = new MiniMaxAdapter();
      const result = adapter.parseResponse({
        data: {
          choices: [
            {
              message: {
                content: '你好，世界！',
              },
            },
          ],
        },
        rawData: '',
        response: { statusCode: 200, headers: {} },
      } as any);
      expect(result).toBe('你好，世界！');
    });
  });

  describe('getServiceAdapter dispatch', () => {
    it('should return MiniMaxAdapter for minimax provider', () => {
      const adapter = getServiceAdapter('minimax');
      expect(adapter).toBeInstanceOf(MiniMaxAdapter);
    });
  });

  describe('Chat Completions API format', () => {
    it('should always use Chat Completions API format by default', () => {
      mockOption.model = 'MiniMax-M3';
      mockOption.temperature = '0.5';
      const adapter = new MiniMaxAdapter();
      const body = adapter.buildRequestBody({
        text: 'hello',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
      } as any);
      // Chat Completions format uses messages array, not instructions/input
      expect(body.messages).toBeDefined();
      expect(body.instructions).toBeUndefined();
      expect(body.input).toBeUndefined();
    });
  });
});

describe('MiniMaxAdapter integration', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockOption)) {
      delete mockOption[key];
    }
    mockHttpResponses.length = 0;
  });

  it('should validate API connection successfully', async () => {
    mockHttpResponses.push({
      data: {
        choices: [{ message: { content: 'OK' } }],
      },
      response: { statusCode: 200 },
    });

    const adapter = new MiniMaxAdapter();
    const result = await new Promise<{ result: boolean }>((resolve) => {
      adapter.testApiConnection('test-key', '', (completion) => {
        resolve(completion as { result: boolean });
      });
    });

    expect(result.result).toBe(true);
  });

  it('should handle API connection error', async () => {
    mockHttpResponses.push({
      data: {
        error: {
          message: 'Invalid API key',
          type: 'invalid_request_error',
        },
      },
      response: { statusCode: 401 },
    });

    const adapter = new MiniMaxAdapter();
    const result = await new Promise<{ result: boolean }>((resolve) => {
      adapter.testApiConnection('bad-key', '', (completion) => {
        resolve(completion as { result: boolean });
      });
    });

    expect(result.result).toBe(false);
  });

  it('should build correct full request for translation', () => {
    mockOption.model = 'MiniMax-M3';
    mockOption.temperature = '0.2';
    mockOption.stream = 'disable';

    const adapter = new MiniMaxAdapter();
    const headers = adapter.buildHeaders('test-key');
    const body = adapter.buildRequestBody({
      text: 'Hello, world!',
      detectFrom: 'en',
      detectTo: 'zh-Hans',
    } as any);
    const url = adapter.getTextGenerationUrl();

    expect(url).toBe('https://api.minimax.io/v1/chat/completions');
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(body.model).toBe('MiniMax-M3');
    expect(body.stream).toBe(false);
    expect(body.temperature).toBe(0.2);
  });
});
