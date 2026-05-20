import type {
  HttpResponse,
  ServiceError,
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';
import type { GeminiResponse, OpenAiResponse, ServiceAdapterConfig } from '../types';
import { BaseAdapter } from './base';

// Jest types for type checking
declare const jest: any;
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;

// Mock the global $option variable
const mockOption = {
  temperature: 0.2,
  stream: false, // boolean value instead of string
  model: 'default-model',
  customModel: 'custom-model',
};

// Mock $http
const mockHttpRequest = jest.fn();
const mockStreamRequest = jest.fn();

// Set up global mocks
Object.defineProperty(global, '$option', {
  value: mockOption,
  writable: true,
});

Object.defineProperty(global, '$http', {
  value: {
    request: mockHttpRequest,
    streamRequest: mockStreamRequest,
  },
  writable: true,
});

// Mock query object
const mockQuery: TextTranslateQuery = {
  detectFrom: 'en',
  detectTo: 'zh',
  text: 'hello world',
  cancelSignal: {},
  onCompletion: jest.fn(),
  onError: jest.fn(),
} as any;

// Create a concrete implementation of BaseAdapter for testing
class TestAdapter extends BaseAdapter {
  constructor(config: ServiceAdapterConfig) {
    super(config);
  }

  buildHeaders(apiKey: string) {
    return { Authorization: `Bearer ${apiKey}` };
  }

  buildRequestBody(query: TextTranslateQuery) {
    return { text: query.text };
  }

  getTextGenerationUrl(apiUrl: string) {
    return `${apiUrl}/translate`;
  }

  handleStream(streamData: { text: string }, _query: TextTranslateQuery, targetText: string) {
    return targetText + streamData.text;
  }

  parseResponse(_response: HttpResponse<GeminiResponse | OpenAiResponse>) {
    return 'translated text';
  }

  async testApiConnection(
    _apiKey: string,
    _apiUrl: string,
    completion: ValidationCompletion,
  ): Promise<void> {
    completion({ result: true });
  }

  protected extractErrorFromResponse(_response: HttpResponse<unknown>): ServiceError {
    return { type: 'secretKey', message: 'API Error', addition: '', troubleshootingLink: '' };
  }
}

describe('BaseAdapter', () => {
  let adapter: TestAdapter;
  const mockConfig: ServiceAdapterConfig = {
    troubleshootingLink: 'https://example.com/troubleshooting',
  };

  beforeEach(() => {
    adapter = new TestAdapter(mockConfig);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with the provided config', () => {
      expect(adapter).toBeDefined();
      expect((adapter as any).config).toEqual(mockConfig);
    });
  });

  describe('getTemperature', () => {
    it('should return the temperature from $option', () => {
      const originalTemp = (global as any).$option.temperature;
      (global as any).$option.temperature = 0.5;
      expect(adapter['getTemperature']()).toBe(0.5);
      (global as any).$option.temperature = originalTemp;
    });

    it('should return 0 if $option.temperature is null', () => {
      const originalTemp = (global as any).$option.temperature;
      (global as any).$option.temperature = null;
      expect(adapter['getTemperature']()).toBe(0);
      (global as any).$option.temperature = originalTemp;
    });
  });

  describe('isStreamEnabled', () => {
    it('should return true when stream is enable', () => {
      (global as any).$option.stream = 'enable';
      expect(adapter['isStreamEnabled']()).toBe(true);
    });

    it('should return false when stream is not enable', () => {
      (global as any).$option.stream = 'disable';
      expect(adapter['isStreamEnabled']()).toBe(false);
    });
  });

  describe('getModel', () => {
    it('should return custom model when model is custom', () => {
      (global as any).$option.model = 'custom';
      (global as any).$option.customModel = 'my-custom-model';
      expect(adapter['getModel']()).toBe('my-custom-model');
    });

    it('should return default model when model is not custom', () => {
      (global as any).$option.model = 'default-model';
      expect(adapter['getModel']()).toBe('default-model');
    });
  });

  describe('handleStreamCompletion', () => {
    it('should call query.onCompletion with the correct result', () => {
      const targetText = 'Hello translated text';
      adapter['handleStreamCompletion'](mockQuery, targetText);

      expect(mockQuery.onCompletion).toHaveBeenCalledWith({
        result: {
          from: mockQuery.detectFrom,
          to: mockQuery.detectTo,
          toParagraphs: [targetText],
        },
      });
    });
  });

  describe('handleGeneralCompletion', () => {
    it('should call query.onCompletion with the correct result, splitting text by newlines', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      adapter['handleGeneralCompletion'](mockQuery, text);

      expect(mockQuery.onCompletion).toHaveBeenCalledWith({
        result: {
          from: mockQuery.detectFrom,
          to: mockQuery.detectTo,
          toParagraphs: ['Line 1', 'Line 2', 'Line 3'],
        },
      });
    });

    it('should handle single line text correctly', () => {
      const text = 'Single line';
      adapter['handleGeneralCompletion'](mockQuery, text);

      expect(mockQuery.onCompletion).toHaveBeenCalledWith({
        result: {
          from: mockQuery.detectFrom,
          to: mockQuery.detectTo,
          toParagraphs: ['Single line'],
        },
      });
    });
  });

  describe('translate method', () => {
    it('should make a stream request when isStream is true', async () => {
      mockStreamRequest.mockImplementation(({ handler }: { handler: any }) => {
        // Simulate a successful stream response
        handler({ response: { statusCode: 200 }, error: null });
      });

      await adapter['translate'](mockQuery, 'api-key', 'http://api.example.com', true);

      expect(mockStreamRequest).toHaveBeenCalled();
    });
  });

  describe('makeRequest method', () => {
    it('should make a successful request and handle response', async () => {
      const mockResponse = {
        response: { statusCode: 200 },
        error: null,
      };
      mockHttpRequest.mockResolvedValue(mockResponse);

      await adapter['makeRequest'](
        'http://api.example.com',
        { Authorization: 'Bearer key' },
        { text: 'hello' },
        mockQuery
      );

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://api.example.com',
          header: { Authorization: 'Bearer key' },
          body: { text: 'hello' },
        })
      );
    });

    it('should handle error responses', async () => {
      const mockResponse = {
        response: { statusCode: 400 },
        error: null,
      };
      mockHttpRequest.mockResolvedValue(mockResponse);

      await adapter['makeRequest'](
        'http://api.example.com',
        { Authorization: 'Bearer key' },
        { text: 'hello' },
        mockQuery
      );

      expect(mockHttpRequest).toHaveBeenCalled();
    });
  });
});