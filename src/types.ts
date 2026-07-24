import type {
  HttpResponse,
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';

export type ServiceProvider =
  | 'azure-openai'
  | 'gemini'
  | 'minimax'
  | 'openai'
  | 'openai-compatible';

export type ApiProtocol =
  | 'gemini-generate-content'
  | 'openai-chat-completions'
  | 'openai-responses';

export type ReasoningMode = 'default' | 'disable';

export interface PluginConfig {
  readonly apiKeys: readonly string[];
  readonly customSystemPrompt: string;
  readonly customUserPrompt: string;
  readonly endpoint: string;
  readonly model: string;
  readonly protocol: ApiProtocol;
  readonly provider: ServiceProvider;
  readonly reasoningMode: ReasoningMode;
  readonly stream: boolean;
}

export interface ProviderDefinition {
  readonly defaultEndpoint: string;
  readonly documentationUrl: string;
  readonly protocol: ApiProtocol;
}

export interface ServiceAdapter {
  buildHeaders(apiKey: string): Record<string, string>;
  buildRequestBody(query: TextTranslateQuery): Record<string, unknown>;
  getTextGenerationUrl(): string;
  parseResponse(response: HttpResponse<unknown>): string;
  testApiConnection(
    apiKey: string,
    completion: ValidationCompletion,
  ): Promise<void>;
  translate(query: TextTranslateQuery, apiKey: string): Promise<void>;
}
