import { translate, pluginValidate, pluginTimeoutInterval, supportLanguages } from './main';
import { getServiceAdapter } from './adapter';
import type { ServiceProvider } from './types';
import {
  getApiKey,
  handleGeneralError,
  handleValidateError,
} from './utils';

// Jest types for type checking
declare const jest: any;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
// Define Jest matchers
declare namespace jest {
  interface JestMatchers<R> {
    toBe(expected: any): R;
    toEqual(expected: any): R;
    toHaveBeenCalled(): R;
    toHaveBeenCalledWith(...args: any[]): R;
    toHaveProperty(key: string, value?: any): R;
    toBeDefined(): R;
    toBeUndefined(): R;
    toBeNull(): R;
    toBeTruthy(): R;
    toBeFalsy(): R;
    toContain(item: any): R;
    toHaveLength(length: number): R;
    toBeGreaterThan(number: number): R;
    toBeGreaterThanOrEqual(number: number): R;
    toBeLessThan(number: number): R;
    toBeLessThanOrEqual(number: number): R;
    toMatch(regexp: RegExp | string): R;
    toThrow(error?: string | Error | RegExp): R;
    toMatchObject(obj: any): R;
    resolves: any;
    rejects: any;
  }
}

declare const expect: {
  (value: any): jest.JestMatchers<void>;
  objectContaining(obj: any): any;
  stringContaining(str: string): any;
  stringMatching(regexp: RegExp | string): any;
  arrayContaining(arr: any[]): any;
} & ((value: any) => any);

// Mock all dependencies
jest.mock('./adapter', () => ({
  getServiceAdapter: jest.fn(),
}));

jest.mock('./lang', () => ({
  supportLanguageList: [
    ['en', 'English'],
    ['zh-Hans', 'Chinese Simplified'],
    ['ja', 'Japanese'],
    ['ko', 'Korean'],
  ],
}));

jest.mock('./utils', () => ({
  ensureHttpsAndNoTrailingSlash: jest.fn((url: string) => url),
  getApiKey: jest.fn(() => 'mock-api-key'),
  handleGeneralError: jest.fn(),
  handleValidateError: jest.fn(),
}));

describe('main.ts', () => {
  // Mock global $option object
  const originalOption = (global as any).$option;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Set up default global $option using Object.defineProperty to match project pattern
    Object.defineProperty(global, '$option', {
      value: {
        apiKeys: 'test-key',
        apiUrl: 'https://api.openai.com/v1',
        serviceProvider: 'openai' as ServiceProvider,
        stream: 'disable',
        model: 'gpt-3.5-turbo',
        customModel: '',
      },
      writable: true,
    });
  });

  afterEach(() => {
    // Restore original $option
    Object.defineProperty(global, '$option', {
      value: originalOption,
      writable: true,
    });
  });

  describe('translate function', () => {
    const mockQuery = {
      text: 'Hello, world!',
      from: 'en',
      to: 'zh-Hans',
      detectFrom: 'en',
      detectTo: 'zh-Hans',
    };

    it('should handle configuration errors and call handleGeneralError', () => {
      // Mock a configuration error
      Object.defineProperty(global, '$option', {
        value: {
          apiKeys: '',
          apiUrl: '',
          serviceProvider: 'openai' as ServiceProvider,
          stream: 'disable',
          model: 'gpt-3.5-turbo',
          customModel: '',
        },
        writable: true,
      });

      // @ts-ignore - Function signature might be different from type definition
      translate(mockQuery);

      expect(handleGeneralError).toHaveBeenCalledWith(mockQuery, expect.objectContaining({
        type: 'secretKey',
        message: expect.stringContaining('API Keys'),
      }));
    });

    it('should call serviceAdapter.translate when configuration is valid', async () => {
      const mockTranslate = jest.fn().mockResolvedValue(undefined);
      (getServiceAdapter as any).mockReturnValue({
        buildHeaders: jest.fn(),
        buildRequestBody: jest.fn(),
        parseResponse: jest.fn(),
        getTextGenerationUrl: jest.fn(),
        testApiConnection: jest.fn(),
        handleStream: jest.fn(),
        makeStreamRequest: jest.fn(),
        makeRequest: jest.fn(),
        translate: mockTranslate,
      } as any);

      // @ts-ignore - Function signature might be different from type definition
      translate(mockQuery);

      expect(getServiceAdapter).toHaveBeenCalledWith('openai');
      expect(getApiKey).toHaveBeenCalledWith('test-key');
      expect(mockTranslate).toHaveBeenCalledWith(
        mockQuery,
        'mock-api-key',
        'https://api.openai.com/v1',
        false
      );
    });

    it('should handle errors during translation', async () => {
      const mockTranslate = jest.fn().mockRejectedValue(new Error('Translation error'));
      (getServiceAdapter as any).mockReturnValue({
        buildHeaders: jest.fn(),
        buildRequestBody: jest.fn(),
        parseResponse: jest.fn(),
        getTextGenerationUrl: jest.fn(),
        testApiConnection: jest.fn(),
        handleStream: jest.fn(),
        makeStreamRequest: jest.fn(),
        makeRequest: jest.fn(),
        translate: mockTranslate,
      } as any);

      // @ts-ignore - Function signature might be different from type definition
      translate(mockQuery);

      // Wait for the promise to resolve
      await new Promise(process.nextTick);

      expect(handleGeneralError).toHaveBeenCalledWith(mockQuery, new Error('Translation error'));
    });

    it('should enable streaming when stream option is enabled', () => {
      Object.defineProperty(global, '$option', {
        value: {
          ...(global as any).$option,
          stream: 'enable',
        },
        writable: true,
      });

      const mockTranslate = jest.fn().mockResolvedValue(undefined);
      (getServiceAdapter as any).mockReturnValue({
        buildHeaders: jest.fn(),
        buildRequestBody: jest.fn(),
        parseResponse: jest.fn(),
        getTextGenerationUrl: jest.fn(),
        testApiConnection: jest.fn(),
        handleStream: jest.fn(),
        makeStreamRequest: jest.fn(),
        makeRequest: jest.fn(),
        translate: mockTranslate,
      } as any);

      // @ts-ignore - Function signature might be different from type definition
      translate(mockQuery);

      expect(mockTranslate).toHaveBeenCalledWith(
        mockQuery,
        'mock-api-key',
        'https://api.openai.com/v1',
        true
      );
    });
  });

  describe('pluginValidate function', () => {
    const mockCompletion = jest.fn();

    it('should handle configuration errors and call handleValidateError', () => {
      // Mock a configuration error
      Object.defineProperty(global, '$option', {
        value: {
          apiKeys: '',
          apiUrl: '',
          serviceProvider: 'openai' as ServiceProvider,
          stream: 'disable',
          model: 'gpt-3.5-turbo',
          customModel: '',
        },
        writable: true,
      });

      pluginValidate(mockCompletion);

      expect(handleValidateError).toHaveBeenCalledWith(mockCompletion, expect.objectContaining({
        type: 'secretKey',
        message: expect.stringContaining('API Keys'),
      }));
    });

    it('should call serviceAdapter.testApiConnection when configuration is valid', () => {
      const mockTestConnection = jest.fn().mockResolvedValue(undefined);
      (getServiceAdapter as any).mockReturnValue({
        buildHeaders: jest.fn(),
        buildRequestBody: jest.fn(),
        parseResponse: jest.fn(),
        getTextGenerationUrl: jest.fn(),
        testApiConnection: mockTestConnection,
        handleStream: jest.fn(),
        makeStreamRequest: jest.fn(),
        makeRequest: jest.fn(),
        translate: jest.fn(),
      } as any);

      pluginValidate(mockCompletion);

      expect(getServiceAdapter).toHaveBeenCalledWith('openai');
      expect(getApiKey).toHaveBeenCalledWith('test-key');
      expect(mockTestConnection).toHaveBeenCalledWith('mock-api-key', 'https://api.openai.com/v1', mockCompletion);
    });

    it('should handle errors during validation', async () => {
      const mockTestConnection = jest.fn().mockRejectedValue(new Error('Validation error'));
      (getServiceAdapter as any).mockReturnValue({
        buildHeaders: jest.fn(),
        buildRequestBody: jest.fn(),
        parseResponse: jest.fn(),
        getTextGenerationUrl: jest.fn(),
        testApiConnection: mockTestConnection,
        handleStream: jest.fn(),
        makeStreamRequest: jest.fn(),
        makeRequest: jest.fn(),
        translate: jest.fn(),
      } as any);

      pluginValidate(mockCompletion);

      // Wait for the promise to resolve
      await new Promise(process.nextTick);

      expect(handleValidateError).toHaveBeenCalledWith(mockCompletion, new Error('Validation error'));
    });
  });

  describe('pluginTimeoutInterval function', () => {
    it('should return 120', () => {
      expect(pluginTimeoutInterval()).toBe(120);
    });
  });

  describe('supportLanguages function', () => {
    it('should return an array of supported languages', () => {
      const languages = supportLanguages();
      
      expect(languages).toEqual(['en', 'zh-Hans', 'ja', 'ko']);
      expect(Array.isArray(languages)).toBe(true);
    });
  });
});