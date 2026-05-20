import { getServiceAdapter } from './index';
import type { ServiceProvider } from '../types';
import { AzureOpenAiAdapter } from './azure-openai';
import { GeminiAdapter } from './gemini';
import { OpenAiAdapter } from './openai';
import { OpenAiCompatibleAdapter } from './openai-compatible';

// Jest types for type checking
declare const jest: any;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;

// Define a mock implementation of Data for testing if needed
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

// Mock the global $option object
const mockOption = {
  apiUrl: 'https://api.openai.com',
  customSystemPrompt: '',
  customUserPrompt: '',
};

// Mock the global $http object
const mockHttpRequest = jest.fn();

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

describe('Adapter Service', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockHttpRequest.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getServiceAdapter', () => {
    it('should return AzureOpenAiAdapter for "azure-openai" service provider', () => {
      const adapter = getServiceAdapter('azure-openai');
      expect(adapter).toBeInstanceOf(AzureOpenAiAdapter);
    });

    it('should return GeminiAdapter for "gemini" service provider', () => {
      const adapter = getServiceAdapter('gemini');
      expect(adapter).toBeInstanceOf(GeminiAdapter);
    });

    it('should return OpenAiCompatibleAdapter for "openai-compatible" service provider', () => {
      const adapter = getServiceAdapter('openai-compatible');
      expect(adapter).toBeInstanceOf(OpenAiCompatibleAdapter);
    });

    it('should return OpenAiAdapter for unknown service provider (default case)', () => {
      // Using a type assertion here to test the default case since all valid providers are handled
      const adapter = getServiceAdapter('non-existent-provider' as ServiceProvider);
      expect(adapter).toBeInstanceOf(OpenAiAdapter);
    });

    it('should return OpenAiAdapter for "openai" service provider (default case)', () => {
      const adapter = getServiceAdapter('openai');
      expect(adapter).toBeInstanceOf(OpenAiAdapter);
    });
  });
});