import type {
  HttpResponse,
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';

export interface OpenAiErrorResponse {
  error: OpenAiErrorDetail;
}

export interface OpenAiErrorDetail {
  param: string | null;
  message: string;
  code: string;
  type: string;
}

export interface OpenAiResponseMessage {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'output_text';
    text: string;
    annotations?: unknown[];
  }>;
}

export interface OpenAiResponse {
  id: string;
  object: 'response';
  created: number;
  model: string;
  output: OpenAiResponseMessage[];
  output_text?: string; // Helper field provided by SDK
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAiResponseStreamChunk {
  id: string;
  object: 'response.chunk';
  created: number;
  model: string;
  delta?: {
    output?: Array<{
      content?: Array<{
        type?: 'output_text';
        text?: string;
      }>;
    }>;
  };
}

export interface GeminiResponse {
  usageMetadata: {
    promptTokenCount: number;
    totalTokenCount: number;
    candidatesTokenCount: number;
  };
  modelVersion: string;
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
      role: string;
    };
    finishReason: string;
    avgLogprobs: number;
  }>;
}

export interface ServiceAdapter {
  buildHeaders: (apiKey: string) => Record<string, string>;
  buildRequestBody: (query: TextTranslateQuery) => Record<string, unknown>;
  parseResponse: (
    response: HttpResponse<GeminiResponse | OpenAiResponse>,
  ) => string;
  getTextGenerationUrl: () => string;
  testApiConnection: (
    apiKey: string,
    apiUrl: string,
    completion: ValidationCompletion,
  ) => Promise<void>;
  handleStream: (
    streamData: { text: string },
    query: TextTranslateQuery,
    targetText: string,
  ) => string;
  makeStreamRequest: (
    url: string,
    header: Record<string, string>,
    body: Record<string, unknown>,
    query: TextTranslateQuery,
  ) => Promise<void>;
  makeRequest: (
    url: string,
    header: Record<string, string>,
    body: Record<string, unknown>,
    query: TextTranslateQuery,
  ) => Promise<void>;
  translate: (
    query: TextTranslateQuery,
    apiKey: string,
    isStream: boolean,
  ) => Promise<void>;
}

export interface ServiceAdapterConfig {
  troubleshootingLink: string;
  baseUrl?: string;
}

export type ServiceProvider =
  | 'azure-openai'
  | 'gemini'
  | 'openai'
  | 'openai-compatible';

export interface TypeCheckConfig {
  [key: string]: {
    type: 'string' | 'object' | 'null';
    optional?: boolean;
    nullable?: boolean;
  };
}
