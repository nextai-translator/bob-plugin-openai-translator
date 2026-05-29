import type {
  OpenAiErrorResponse,
  OpenAiErrorDetail,
  OpenAiResponseMessage,
  OpenAiResponse,
  OpenAiResponseStreamChunk,
  GeminiResponse,
  ServiceAdapter,
  ServiceAdapterConfig,
  ServiceProvider,
  TypeCheckConfig,
} from './types';

// Add Jest global types
declare global {
  const describe: any;
  const it: any;
  const expect: any;
}

// Test OpenAiErrorResponse type
describe('OpenAiErrorResponse', () => {
  it('should match the expected structure', () => {
    const errorDetail: OpenAiErrorDetail = {
      param: 'test_param',
      message: 'Test error message',
      code: 'test_code',
      type: 'test_type',
    };

    const errorResponse: OpenAiErrorResponse = {
      error: errorDetail,
    };

    expect(errorResponse).toHaveProperty('error');
    expect(errorResponse.error).toEqual(errorDetail);
  });
});

// Test OpenAiErrorDetail type
describe('OpenAiErrorDetail', () => {
  it('should have the correct properties', () => {
    const errorDetail: OpenAiErrorDetail = {
      param: 'test_param',
      message: 'Test error message',
      code: 'test_code',
      type: 'test_type',
    };

    expect(errorDetail.param).toBe('test_param');
    expect(errorDetail.message).toBe('Test error message');
    expect(errorDetail.code).toBe('test_code');
    expect(errorDetail.type).toBe('test_type');
  });

  it('should allow null param', () => {
    const errorDetail: OpenAiErrorDetail = {
      param: null,
      message: 'Test error message',
      code: 'test_code',
      type: 'test_type',
    };

    expect(errorDetail.param).toBeNull();
  });
});

// Test OpenAiResponseMessage type
describe('OpenAiResponseMessage', () => {
  it('should match the expected structure', () => {
    const responseMessage: OpenAiResponseMessage = {
      id: 'test-id',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: 'Test response text',
          annotations: [],
        },
      ],
    };

    expect(responseMessage.id).toBe('test-id');
    expect(responseMessage.type).toBe('message');
    expect(responseMessage.role).toBe('assistant');
    expect(responseMessage.content).toHaveLength(1);
    expect(responseMessage.content[0]).toHaveProperty('type', 'output_text');
    expect(responseMessage.content[0]).toHaveProperty('text', 'Test response text');
  });

  it('should handle optional annotations', () => {
    const responseMessage: OpenAiResponseMessage = {
      id: 'test-id',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: 'Test response text',
        },
      ],
    };

    expect(responseMessage.content[0]).toHaveProperty('type', 'output_text');
    expect(responseMessage.content[0]).toHaveProperty('text', 'Test response text');
    expect(responseMessage.content[0]).not.toHaveProperty('annotations');
  });
});

// Test OpenAiResponse type
describe('OpenAiResponse', () => {
  it('should match the expected structure', () => {
    const response: OpenAiResponse = {
      id: 'test-id',
      object: 'response',
      created: 1234567890,
      model: 'test-model',
      output: [],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    };

    expect(response.id).toBe('test-id');
    expect(response.object).toBe('response');
    expect(response.created).toBe(1234567890);
    expect(response.model).toBe('test-model');
    expect(response.output).toEqual([]);
    expect(response.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    });
  });

  it('should allow optional usage field', () => {
    const response: OpenAiResponse = {
      id: 'test-id',
      object: 'response',
      created: 1234567890,
      model: 'test-model',
      output: [],
    };

    expect(response).not.toHaveProperty('usage');
  });

  it('should allow optional output_text field', () => {
    const response: OpenAiResponse = {
      id: 'test-id',
      object: 'response',
      created: 1234567890,
      model: 'test-model',
      output: [],
      output_text: 'test output text',
    };

    expect(response.output_text).toBe('test output text');
  });
});

// Test OpenAiResponseStreamChunk type
describe('OpenAiResponseStreamChunk', () => {
  it('should match the expected structure', () => {
    const chunk: OpenAiResponseStreamChunk = {
      id: 'chunk-id',
      object: 'response.chunk',
      created: 1234567890,
      model: 'test-model',
      delta: {
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: 'Test chunk text',
              },
            ],
          },
        ],
      },
    };

    expect(chunk.id).toBe('chunk-id');
    expect(chunk.object).toBe('response.chunk');
    expect(chunk.created).toBe(1234567890);
    expect(chunk.model).toBe('test-model');
    expect(chunk.delta?.output?.[0]?.content?.[0]?.text).toBe('Test chunk text');
  });

  it('should handle optional delta field', () => {
    const chunk: OpenAiResponseStreamChunk = {
      id: 'chunk-id',
      object: 'response.chunk',
      created: 1234567890,
      model: 'test-model',
    };

    expect(chunk).not.toHaveProperty('delta');
  });
});

// Test GeminiResponse type
describe('GeminiResponse', () => {
  it('should match the expected structure', () => {
    const geminiResponse: GeminiResponse = {
      usageMetadata: {
        promptTokenCount: 10,
        totalTokenCount: 30,
        candidatesTokenCount: 20,
      },
      modelVersion: 'gemini-pro',
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'Test response from Gemini',
              },
            ],
            role: 'model',
          },
          finishReason: 'STOP',
          avgLogprobs: -0.5,
        },
      ],
    };

    expect(geminiResponse.usageMetadata.promptTokenCount).toBe(10);
    expect(geminiResponse.modelVersion).toBe('gemini-pro');
    expect(geminiResponse.candidates).toHaveLength(1);
    expect(geminiResponse.candidates[0].content.parts[0].text).toBe('Test response from Gemini');
  });
});

// Test ServiceAdapter interface
describe('ServiceAdapter', () => {
  it('should have all required methods', () => {
    const mockAdapter: ServiceAdapter = {
      buildHeaders: (apiKey: string) => ({ 'Authorization': `Bearer ${apiKey}` }),
      buildRequestBody: (query) => ({ query }),
      parseResponse: (response) => {
        // Simplified implementation for testing
        if (typeof response.data === 'object' && response.data && 'output_text' in response.data) {
          return (response.data as any).output_text || 'default';
        }
        return 'default';
      },
      getTextGenerationUrl: (apiUrl: string) => `${apiUrl}/generate`,
      testApiConnection: async (_apiKey, _apiUrl, completion) => {
        // Mock completion callback - calling with no error
        completion(null as any);
      },
      handleStream: (streamData, _query, _targetText) => streamData.text,
      makeStreamRequest: async (_url, _header, _body, _query) => {},
      makeRequest: async (_url, _header, _body, _query) => {},
      translate: async (_query, _apiKey, _apiUrl, _isStream) => {},
    };

    expect(typeof mockAdapter.buildHeaders).toBe('function');
    expect(typeof mockAdapter.buildRequestBody).toBe('function');
    expect(typeof mockAdapter.parseResponse).toBe('function');
    expect(typeof mockAdapter.getTextGenerationUrl).toBe('function');
    expect(typeof mockAdapter.testApiConnection).toBe('function');
    expect(typeof mockAdapter.handleStream).toBe('function');
    expect(typeof mockAdapter.makeStreamRequest).toBe('function');
    expect(typeof mockAdapter.makeRequest).toBe('function');
    expect(typeof mockAdapter.translate).toBe('function');
  });
});

// Test ServiceAdapterConfig interface
describe('ServiceAdapterConfig', () => {
  it('should match the expected structure', () => {
    const config: ServiceAdapterConfig = {
      troubleshootingLink: 'https://example.com/troubleshooting',
      baseUrl: 'https://api.example.com',
    };

    expect(config.troubleshootingLink).toBe('https://example.com/troubleshooting');
    expect(config?.baseUrl).toBe('https://api.example.com');
  });

  it('should allow optional baseUrl', () => {
    const config: ServiceAdapterConfig = {
      troubleshootingLink: 'https://example.com/troubleshooting',
    };

    expect(config.troubleshootingLink).toBe('https://example.com/troubleshooting');
    expect(config).not.toHaveProperty('baseUrl');
  });
});

// Test ServiceProvider type
describe('ServiceProvider', () => {
  it('should include all valid service providers', () => {
    const providers: ServiceProvider[] = [
      'azure-openai',
      'gemini',
      'openai',
      'openai-compatible',
    ];

    expect(providers).toHaveLength(4);
    expect(providers).toContain('azure-openai');
    expect(providers).toContain('gemini');
    expect(providers).toContain('openai');
    expect(providers).toContain('openai-compatible');
  });
});

// Test TypeCheckConfig type
describe('TypeCheckConfig', () => {
  it('should match the expected structure', () => {
    const config: TypeCheckConfig = {
      apiKey: {
        type: 'string',
        optional: true,
      },
      settings: {
        type: 'object',
        nullable: true,
      },
      count: {
        type: 'string',
        optional: false,
        nullable: false,
      },
    };

    expect(config.apiKey.type).toBe('string');
    expect(config.apiKey.optional).toBe(true);
    expect(config.settings.type).toBe('object');
    expect(config.settings.nullable).toBe(true);
    expect(config.count.type).toBe('string');
    expect(config.count.optional).toBe(false);
    expect(config.count.nullable).toBe(false);
  });
});