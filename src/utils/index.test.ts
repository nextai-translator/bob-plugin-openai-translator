import type {
  HttpResponse,
  ServiceError,
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';
import {
  convertToServiceError,
  ensureHttpsAndNoTrailingSlash,
  generatePrompts,
  getApiKey,
  handleGeneralError,
  handleValidateError,
  isServiceError,
  replacePromptKeywords,
} from './index';

// Jest type declarations
declare const jest: any;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;

// Mock the langMap for testing
jest.mock('../lang', () => ({
  langMap: new Map([
    ['zh-Hans', '简体中文'],
    ['zh-Hant', '繁體中文'],
    ['en', 'English'],
    ['ja', '日本語'],
    ['wyw', '古文'],
    ['yue', '粤语'],
    ['ko', '한국어'],
    ['fr', 'français'],
    ['de', 'Deutsch'],
    ['es', 'español'],
  ]),
}));

// Helper to create a mock cancel signal
const createMockCancelSignal = () => ({
  send: jest.fn(),
  subscribe: jest.fn(() => ({ dispose: jest.fn() })),
  removeAllSubscriber: jest.fn(),
});

// Define a mock implementation of Data for testing
const mockData = {
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

describe('Utils', () => {
  describe('convertToServiceError', () => {
    it('should convert a string error to a ServiceError', () => {
      const error = 'Some error message';
      const result = convertToServiceError(error);

      expect(result).toEqual({
        type: 'unknown',
        message: '未知错误',
        addition: JSON.stringify('Some error message'),
      });
    });

    it('should convert an Error object to a ServiceError', () => {
      const error = new Error('Test error');
      const result = convertToServiceError(error);

      expect(result).toEqual({
        type: 'api',
        message: 'Test error',
        addition: JSON.stringify(error),
      });
    });

    it('should return the same ServiceError if input is already a ServiceError', () => {
      const serviceError: ServiceError = {
        type: 'network',
        message: 'Network error',
      };
      const result = convertToServiceError(serviceError);

      expect(result).toBe(serviceError);
    });

    it('should return an unknown error type for non-object values', () => {
      const result = convertToServiceError(null);

      expect(result).toEqual({
        type: 'unknown',
        message: '未知错误',
        addition: JSON.stringify(null),
      });
    });

    it('should use default message when provided', () => {
      const error = 123;
      const result = convertToServiceError(error, 'Custom default message');

      expect(result).toEqual({
        type: 'unknown',
        message: 'Custom default message',
        addition: JSON.stringify(123),
      });
    });
  });

  describe('ensureHttpsAndNoTrailingSlash', () => {
    it('should add https protocol if missing', () => {
      expect(ensureHttpsAndNoTrailingSlash('example.com')).toBe('https://example.com');
    });

    it('should preserve existing protocol', () => {
      expect(ensureHttpsAndNoTrailingSlash('http://example.com')).toBe('http://example.com');
    });

    it('should remove trailing slash', () => {
      expect(ensureHttpsAndNoTrailingSlash('https://example.com/')).toBe('https://example.com');
    });

    it('should add https and remove trailing slash for a url without protocol but with trailing slash', () => {
      expect(ensureHttpsAndNoTrailingSlash('example.com/')).toBe('https://example.com');
    });

    it('should handle urls that already have https and no trailing slash', () => {
      expect(ensureHttpsAndNoTrailingSlash('https://example.com')).toBe('https://example.com');
    });

    it('should handle urls with other protocols and trailing slash', () => {
      expect(ensureHttpsAndNoTrailingSlash('ftp://example.com/')).toBe('ftp://example.com');
    });
  });

  describe('generatePrompts', () => {
    it('should generate default prompts for regular language translation', () => {
      const query: TextTranslateQuery = {
        text: 'Hello',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
        from: 'en',
        to: 'zh-Hans',
        cancelSignal: createMockCancelSignal(),
        onCompletion: jest.fn(),
        onStream: jest.fn(),
      };

      const result = generatePrompts(query);

      expect(result.generatedSystemPrompt).toBe('You are a translation engine that can only translate text and cannot interpret it.');
      expect(result.generatedUserPrompt).toBe('translate from English to 简体中文:\n\nHello');
    });

    it('should handle special cases for wyw and yue target languages', () => {
      const query: TextTranslateQuery = {
        text: 'Hello',
        detectFrom: 'en',
        detectTo: 'yue',
        from: 'en',
        to: 'yue',
        cancelSignal: createMockCancelSignal(),
        onCompletion: jest.fn(),
        onStream: jest.fn(),
      };

      const result = generatePrompts(query);

      expect(result.generatedUserPrompt).toBe('翻译成粤语:\n\nHello');
    });

    it('should handle Chinese language variations', () => {
      const query: TextTranslateQuery = {
        text: 'Hello',
        detectFrom: 'zh-Hans',
        detectTo: 'zh-Hant',
        from: 'zh-Hans',
        to: 'zh-Hant',
        cancelSignal: createMockCancelSignal(),
        onCompletion: jest.fn(),
        onStream: jest.fn(),
      };

      const result = generatePrompts(query);

      expect(result.generatedUserPrompt).toBe('翻译成繁体白话文:\n\nHello');
    });

    it('should generate different prompts when source and target languages are the same', () => {
      const query: TextTranslateQuery = {
        text: 'Hello',
        detectFrom: 'en',
        detectTo: 'en',
        from: 'en',
        to: 'en',
        cancelSignal: createMockCancelSignal(),
        onCompletion: jest.fn(),
        onStream: jest.fn(),
      };

      const result = generatePrompts(query);

      expect(result.generatedSystemPrompt).toBe('You are a text embellisher, you can only embellish the text, don\'t interpret it.');
      expect(result.generatedUserPrompt).toBe('polish this sentence:\n\nHello');
    });

    it('should handle Chinese same-language translation', () => {
      const query: TextTranslateQuery = {
        text: 'Hello',
        detectFrom: 'zh-Hans',
        detectTo: 'zh-Hans',
        from: 'zh-Hans',
        to: 'zh-Hans',
        cancelSignal: createMockCancelSignal(),
        onCompletion: jest.fn(),
        onStream: jest.fn(),
      };

      const result = generatePrompts(query);

      expect(result.generatedUserPrompt).toBe('润色此句:\n\nHello');
    });
  });

  describe('getApiKey', () => {
    it('should return a random API key from a comma-separated list', () => {
      const apiKeys = 'key1,key2,key3';
      const result = getApiKey(apiKeys);
      
      expect(['key1', 'key2', 'key3']).toContain(result);
    });

    it('should trim whitespace around API keys', () => {
      const apiKeys = ' key1 , key2 , key3 ';
      const result = getApiKey(apiKeys);
      
      expect(['key1', 'key2', 'key3']).toContain(result);
    });

    it('should handle trailing comma', () => {
      const apiKeys = 'key1,key2,';
      const result = getApiKey(apiKeys);
      
      expect(['key1', 'key2']).toContain(result);
    });

    it('should return the same key if only one provided', () => {
      const apiKeys = 'onlyKey';
      const result = getApiKey(apiKeys);
      
      expect(result).toBe('onlyKey');
    });
  });

  describe('handleGeneralError', () => {
    it('should handle ServiceError input', () => {
      const query: TextTranslateQuery = {
        text: 'test',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
        from: 'en',
        to: 'zh-Hans',
        cancelSignal: createMockCancelSignal(),
        onCompletion: jest.fn(),
        onStream: jest.fn(),
      };
      const serviceError: ServiceError = {
        type: 'api',
        message: 'Test error',
      };

      handleGeneralError(query, serviceError);

      expect(query.onCompletion).toHaveBeenCalledWith({
        error: serviceError,
      });
    });

    it('should convert regular error to ServiceError', () => {
      const query: TextTranslateQuery = {
        text: 'test',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
        from: 'en',
        to: 'zh-Hans',
        cancelSignal: createMockCancelSignal(),
        onCompletion: jest.fn(),
        onStream: jest.fn(),
      };
      const error = new Error('Test error');

      handleGeneralError(query, error);

      expect(query.onCompletion).toHaveBeenCalledWith({
        error: expect.objectContaining({
          type: 'api',
          message: 'Test error',
        }),
      });
    });

    it('should handle HttpResponse input', () => {
      const query: TextTranslateQuery = {
        text: 'test',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
        from: 'en',
        to: 'zh-Hans',
        cancelSignal: createMockCancelSignal(),
        onCompletion: jest.fn(),
        onStream: jest.fn(),
      };
      const httpResponse: HttpResponse = {
        response: {
          statusCode: 400,
          headers: {},
          expectedContentLength: 0,
          MIMEType: 'application/json',
          suggestedFilename: '',
          textEncodingName: 'utf-8',
          url: 'https://test.example.com',
        },
        data: 'error data',
        rawData: mockData,
      };

      handleGeneralError(query, httpResponse);

      expect(query.onCompletion).toHaveBeenCalledWith({
        error: expect.objectContaining({
          type: 'api',
          message: 'API 返回了错误响应',
          addition: JSON.stringify({ status: 400, data: 'error data' }),
        }),
      });
    });
  });

  describe('handleValidateError', () => {
    it('should handle ServiceError input', () => {
      const completion: ValidationCompletion = jest.fn();
      const serviceError: ServiceError = {
        type: 'api',
        message: 'Validation error',
      };

      handleValidateError(completion, serviceError);

      expect(completion).toHaveBeenCalledWith({
        result: false,
        error: serviceError,
      });
    });

    it('should convert regular error to ServiceError', () => {
      const completion: ValidationCompletion = jest.fn();
      const error = new Error('Test error');

      handleValidateError(completion, error);

      expect(completion).toHaveBeenCalledWith({
        result: false,
        error: expect.objectContaining({
          type: 'api',
          message: 'Test error',
        }),
      });
    });
  });

  describe('isServiceError', () => {
    it('should return true for valid ServiceError', () => {
      const validServiceError = {
        type: 'api',
        message: 'Error message',
      };
      
      expect(isServiceError(validServiceError)).toBe(true);
    });

    it('should return false for object missing required properties', () => {
      const invalidObject = {
        type: 'api',
        // missing message property
      };
      
      expect(isServiceError(invalidObject)).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(isServiceError(null)).toBe(false);
      expect(isServiceError('not an object')).toBe(false);
      expect(isServiceError(123)).toBe(false);
    });

    it('should return false for objects with wrong property types', () => {
      const invalidServiceError = {
        type: 123, // should be string
        message: 'Error message',
      };
      
      expect(isServiceError(invalidServiceError)).toBe(false);
    });
  });

  describe('replacePromptKeywords', () => {
    it('should replace $text, $sourceLang, and $targetLang keywords', () => {
      const query: TextTranslateQuery = {
        text: 'Hello world',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
        from: 'en',
        to: 'zh-Hans',
        cancelSignal: createMockCancelSignal(),
        onCompletion: jest.fn(),
        onStream: jest.fn(),
      };
      const prompt = 'Translate $text from $sourceLang to $targetLang';
      const result = replacePromptKeywords(prompt, query);

      expect(result).toBe('Translate Hello world from en to zh-Hans');
    });

    it('should handle prompts with no keywords', () => {
      const query: TextTranslateQuery = {
        text: 'Hello',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
        from: 'en',
        to: 'zh-Hans',
        cancelSignal: createMockCancelSignal(),
        onCompletion: jest.fn(),
        onStream: jest.fn(),
      };
      const prompt = 'No keywords here';
      const result = replacePromptKeywords(prompt, query);

      expect(result).toBe('No keywords here');
    });

    it('should return the original prompt if it is empty', () => {
      const query: TextTranslateQuery = {
        text: 'Hello',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
        from: 'en',
        to: 'zh-Hans',
        cancelSignal: createMockCancelSignal(),
        onCompletion: jest.fn(),
        onStream: jest.fn(),
      };
      const prompt = '';
      const result = replacePromptKeywords(prompt, query);

      expect(result).toBe('');
    });

    it('should replace multiple instances of the same keyword', () => {
      const query: TextTranslateQuery = {
        text: 'Hello',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
        from: 'en',
        to: 'zh-Hans',
        cancelSignal: createMockCancelSignal(),
        onCompletion: jest.fn(),
        onStream: jest.fn(),
      };
      const prompt = '$text and $text again from $sourceLang to $targetLang';
      const result = replacePromptKeywords(prompt, query);

      expect(result).toBe('Hello and $text again from en to zh-Hans');
    });
  });
});