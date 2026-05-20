import type {
  HttpResponse,
  TextTranslateQuery,
  ValidationCompletion,
  Data,
} from '@bob-translate/types';
import type { GeminiResponse, OpenAiResponse } from '../types';
import { OpenAiAdapter } from './openai';

// Jest types for type checking
declare const jest: any;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;

// Define a mock implementation of Data for testing
const mockData: Data = {
  length: 0,
  toUTF8: () => undefined,
  toHex: () => '',
  toBase64: () => '',
  toByteArray: () => [],
  readUInt8: () => 0,
  writeUInt8: () => {},
  subData: () => mockData,
  appendData: () => {},
};

// Mock the global $option object 
const mockOption = {
  apiUrl: 'https://api.openai.com',
  customSystemPrompt: '',
  customUserPrompt: '',
};

// Mock the global $http object
const mockHttpRequest = jest.fn();

// Mock the global console for error logging
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

// Set up global mocks
Object.defineProperty(global, '$option', {
  value: mockOption,
  writable: true,
});

Object.defineProperty(global, '$http', {
  value: {
    request: mockHttpRequest,
  },
  writable: true,
});

describe('OpenAiAdapter', () => {
  let adapter: OpenAiAdapter;

  beforeEach(() => {
    adapter = new OpenAiAdapter();
    mockHttpRequest.mockReset();
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      expect(adapter).toBeDefined();
      // @ts-expect-error - accessing private property for testing
      expect(adapter.config.troubleshootingLink).toBe(
        'https://bobtranslate.com/service/translate/openai.html',
      );
      // @ts-expect-error - accessing private property for testing
      expect(adapter.config.baseUrl).toBe('https://api.openai.com');
    });

    it('should use custom config when provided', () => {
      const customConfig = {
        troubleshootingLink: 'https://custom-link.com',
        baseUrl: 'https://custom-api.com',
      };
      const customAdapter = new OpenAiAdapter(customConfig);
      // @ts-expect-error - accessing private property for testing
      expect(customAdapter.config.troubleshootingLink).toBe('https://custom-link.com');
      // @ts-expect-error - accessing private property for testing
      expect(customAdapter.config.baseUrl).toBe('https://custom-api.com');
    });
  });

  describe('extractErrorFromResponse', () => {
    it('should handle error as string', () => {
      const errorResponse: HttpResponse<unknown> = {
        data: { error: 'Invalid API key' },
        response: {
          statusCode: 401,
          expectedContentLength: 0,
          headers: {},
          MIMEType: '',
          suggestedFilename: '',
          textEncodingName: '',
          url: '',
        },
        rawData: mockData,
      };

      const error = adapter['extractErrorFromResponse'](errorResponse);
      expect(error).toEqual({
        type: 'secretKey',
        message: 'Invalid API key',
        addition: '{"error":"Invalid API key"}',
        troubleshootingLink: 'https://bobtranslate.com/service/translate/openai.html',
      });
    });

    it('should handle error as object with message', () => {
      const errorResponse: HttpResponse<unknown> = {
        data: { error: { message: 'Rate limit exceeded', param: 'requests' } },
        response: {
          statusCode: 429,
          expectedContentLength: 0,
          headers: {},
          MIMEType: '',
          suggestedFilename: '',
          textEncodingName: '',
          url: '',
        },
        rawData: mockData,
      };

      const error = adapter['extractErrorFromResponse'](errorResponse);
      expect(error).toEqual({
        type: 'api',
        message: 'Rate limit exceeded (parameter: requests)',
        addition: '{"error":{"message":"Rate limit exceeded","param":"requests"}}',
        troubleshootingLink: 'https://bobtranslate.com/service/translate/openai.html',
      });
    });

    it('should handle error as object with message but no param', () => {
      const errorResponse: HttpResponse<unknown> = {
        data: { error: { message: 'Invalid request' } },
        response: {
          statusCode: 400,
          expectedContentLength: 0,
          headers: {},
          MIMEType: '',
          suggestedFilename: '',
          textEncodingName: '',
          url: '',
        },
        rawData: mockData,
      };

      const error = adapter['extractErrorFromResponse'](errorResponse);
      expect(error).toEqual({
        type: 'api',
        message: 'Invalid request',
        addition: '{"error":{"message":"Invalid request"}}',
        troubleshootingLink: 'https://bobtranslate.com/service/translate/openai.html',
      });
    });

    it('should return base error for unknown error format', () => {
      const errorResponse: HttpResponse<unknown> = {
        data: { message: 'Unknown error' },
        response: {
          statusCode: 500,
          expectedContentLength: 0,
          headers: {},
          MIMEType: '',
          suggestedFilename: '',
          textEncodingName: '',
          url: '',
        },
        rawData: mockData,
      };

      const error = adapter['extractErrorFromResponse'](errorResponse);
      expect(error).toEqual({
        type: 'api',
        message: 'API request failed',
        addition: '{"message":"Unknown error"}',
        troubleshootingLink: 'https://bobtranslate.com/service/translate/openai.html',
      });
    });

    it('should return secretKey error type for 401 status code', () => {
      const errorResponse: HttpResponse<unknown> = {
        data: { error: { message: 'Unauthorized' } },
        response: {
          statusCode: 401,
          expectedContentLength: 0,
          headers: {},
          MIMEType: '',
          suggestedFilename: '',
          textEncodingName: '',
          url: '',
        },
        rawData: mockData,
      };

      const error = adapter['extractErrorFromResponse'](errorResponse);
      expect(error.type).toBe('secretKey');
    });
  });

  describe('buildHeaders', () => {
    it('should return proper headers with API key', () => {
      const headers = adapter.buildHeaders('test-api-key');
      expect(headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-key',
      });
    });
  });

  describe('parseResponse', () => {
    it('should parse Responses API format with output_text field', () => {
      const response: HttpResponse<OpenAiResponse> = {
        data: {
          id: "resp_123",
          object: "response",
          created: 1234567890,
          model: "model-123",
          output_text: 'Translated text',
          output: [],
        },
        response: {
          statusCode: 200 as unknown as 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511,
          expectedContentLength: 0,
          headers: {},
          MIMEType: '',
          suggestedFilename: '',
          textEncodingName: '',
          url: '',
        },
        rawData: mockData,
      };

      const result = adapter.parseResponse(response);
      expect(result).toBe('Translated text');
    });

    it('should parse Responses API format with output array', () => {
      const response: HttpResponse<OpenAiResponse> = {
        data: {
          id: "resp_123",
          object: "response",
          created: 1234567890,
          model: "model-123",
          output: [
            {
              id: "msg_123",
              role: "assistant",
              type: 'message',
              content: [
                { type: 'output_text', text: 'Part 1' },
                { type: 'output_text', text: 'Part 2' },
              ],
            },
          ],
        },
        response: {
          statusCode: 200 as unknown as 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511,
          expectedContentLength: 0,
          headers: {},
          MIMEType: '',
          suggestedFilename: '',
          textEncodingName: '',
          url: '',
        },
        rawData: mockData,
      };

      const result = adapter.parseResponse(response);
      expect(result).toBe('Part 1Part 2');
    });

    it('should throw error when no output is found in Responses API', () => {
      const response: HttpResponse<OpenAiResponse> = {
        data: {
          id: "resp_123",
          object: "response",
          created: 1234567890,
          model: "model-123",
          output: [],
        },
        response: {
          statusCode: 200 as unknown as 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511,
          expectedContentLength: 0,
          headers: {},
          MIMEType: '',
          suggestedFilename: '',
          textEncodingName: '',
          url: '',
        },
        rawData: mockData,
      };

      expect(() => adapter.parseResponse(response)).toThrow(
        'No output returned from Responses API',
      );
    });

    it('should throw error for unsupported response type', () => {
      const response: HttpResponse<GeminiResponse> = {
        data: {
          candidates: [],
          usageMetadata: {
            promptTokenCount: 0,
            candidatesTokenCount: 0,
            totalTokenCount: 0,
          },
          modelVersion: "gemini-1.0",
        },
        response: {
          statusCode: 200 as unknown as 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511,
          expectedContentLength: 0,
          headers: {},
          MIMEType: '',
          suggestedFilename: '',
          textEncodingName: '',
          url: '',
        },
        rawData: mockData,
      };

      expect(() => adapter.parseResponse(response)).toThrow(
        'Unsupported response type',
      );
    });
  });

  describe('getTextGenerationUrl', () => {
    it('should return the correct text generation URL', () => {
      const url = adapter.getTextGenerationUrl('https://api.openai.com');
      expect(url).toBe('https://api.openai.com/v1/responses');
    });
  });

  describe('getValidationUrl', () => {
    it('should return the correct validation URL', () => {
      const url = adapter['getValidationUrl']('https://api.openai.com');
      expect(url).toBe('https://api.openai.com/v1/models');
    });
  });

  describe('extractDeltaFromData', () => {
    it('should extract delta from new Responses API format', () => {
      const dataObj = {
        type: 'response.output_text.delta',
        delta: 'partial text',
      };

      const result = adapter['extractDeltaFromData'](dataObj);
      expect(result).toBe('partial text');
    });

    it('should return null for new Responses API format with non-string delta', () => {
      const dataObj = {
        type: 'response.output_text.delta',
        delta: 123,
      };

      const result = adapter['extractDeltaFromData'](dataObj);
      expect(result).toBeNull();
    });

    it('should extract delta from old Responses API stream format', () => {
      const dataObj = {
        object: 'response.chunk',
        delta: {
          output: [
            {
              content: [
                { type: 'output_text', text: 'partial text' },
                { type: 'other_type', text: 'ignored' },
              ],
            },
          ],
        },
      };

      const result = adapter['extractDeltaFromData'](dataObj);
      expect(result).toBe('partial text');
    });

    it('should return null when old format has no content', () => {
      const dataObj = {
        object: 'response.chunk',
        delta: {
          output: [
            {
              content: [],
            },
          ],
        },
      };

      const result = adapter['extractDeltaFromData'](dataObj);
      expect(result).toBeNull();
    });

    it('should return null for unknown format', () => {
      const dataObj = {
        type: 'unknown',
        delta: 'ignored',
      };

      const result = adapter['extractDeltaFromData'](dataObj);
      expect(result).toBeNull();
    });
  });

  describe('parseSseMessage', () => {
    it('should throw error when error is present in data', () => {
      const sse = {
        data: JSON.stringify({
          error: { type: 'invalid_api_key', message: 'API key invalid' },
        }),
      };

      expect(() => adapter['parseSseMessage'](sse as any)).toThrow();
    });
  });

  describe('handleStream', () => {
    it('should handle [DONE] message and not update target text', () => {
      const query: TextTranslateQuery = {
        text: 'Hello',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
        from: 'auto',
        to: 'zh-Hans',
        cancelSignal: {
          send: jest.fn(),
          subscribe: jest.fn(() => ({ dispose: jest.fn() })),
          removeAllSubscriber: jest.fn(),
        },
        onCompletion: jest.fn(),
        onStream: jest.fn(),
      };

      const streamData = {
        text: 'event: [DONE]\ndata: [DONE]\n\n',
      };

      const result = adapter.handleStream(streamData, query, 'existing');
      expect(result).toBe('existing');
      expect(query.onStream).not.toHaveBeenCalled();
    });
  });

  describe('testApiConnection', () => {
    it('should return validation success on valid response', async () => {
      const apiKey = 'test-api-key';
      const apiUrl = 'https://api.openai.com';
      const completion: ValidationCompletion = jest.fn();

      mockHttpRequest.mockResolvedValueOnce({
        data: { data: [{ id: 'model1' }] },
        rawData: mockData,
        response: {
          statusCode: 200 as unknown as 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511,
          expectedContentLength: 0,
          headers: {},
          MIMEType: '',
          suggestedFilename: '',
          textEncodingName: '',
          url: '',
        },
      });

      await adapter.testApiConnection(apiKey, apiUrl, completion);

      expect(completion).toHaveBeenCalledWith({ result: true });
    });

    it('should return validation success on list object response', async () => {
      const apiKey = 'test-api-key';
      const apiUrl = 'https://api.openai.com';
      const completion: ValidationCompletion = jest.fn();

      mockHttpRequest.mockResolvedValueOnce({
        data: { object: 'list', data: [] },
        rawData: mockData,
        response: {
          statusCode: 200 as unknown as 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511,
          expectedContentLength: 0,
          headers: {},
          MIMEType: '',
          suggestedFilename: '',
          textEncodingName: '',
          url: '',
        },
      });

      await adapter.testApiConnection(apiKey, apiUrl, completion);

      expect(completion).toHaveBeenCalledWith({ result: true });
    });

    it('should return validation error on error response', async () => {
      const apiKey = 'test-api-key';
      const apiUrl = 'https://api.openai.com';
      const completion: ValidationCompletion = jest.fn();

      mockHttpRequest.mockResolvedValueOnce({
        data: { error: { message: 'Invalid API key' } },
        rawData: mockData,
        response: {
          statusCode: 401,
          expectedContentLength: 0,
          headers: {},
          MIMEType: '',
          suggestedFilename: '',
          textEncodingName: '',
          url: '',
        },
      });

      await adapter.testApiConnection(apiKey, apiUrl, completion);

      expect(completion).toHaveBeenCalledWith({
        result: false,
        error: {
          type: 'secretKey',
          message: 'Invalid API key',
          addition: '{"error":{"message":"Invalid API key"}}',
          troubleshootingLink: 'https://bobtranslate.com/service/translate/openai.html',
        },
      });
    });

    it('should handle request errors', async () => {
      const apiKey = 'test-api-key';
      const apiUrl = 'https://api.openai.com';
      const completion: ValidationCompletion = jest.fn();

      const error = new Error('Network error');
      mockHttpRequest.mockRejectedValueOnce(error);

      await adapter.testApiConnection(apiKey, apiUrl, completion);

      // Check that completion was called with result false
      expect(completion).toHaveBeenCalledWith({
        result: false,
        error: expect.objectContaining({
          type: 'api',
          message: 'Network error',
        }),
      });
    });
  });
});
