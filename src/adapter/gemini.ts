import type {
  HttpResponse,
  ServiceError,
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';
import { PROVIDERS } from '../config';
import { resolveModelControls } from '../utils/model-capabilities';
import { createPrompts } from '../utils/prompt';
import { BaseAdapter } from './base';

export class GeminiAdapter extends BaseAdapter {
  protected extractStreamDelta(data: Record<string, unknown>): string | null {
    return this.extractText(data) || null;
  }

  protected extractStreamError(
    data: Record<string, unknown>,
    troubleshootingLink: string,
  ): ServiceError | null {
    if (!data.error || typeof data.error !== 'object') return null;

    const error = data.error as Record<string, unknown>;
    const status = typeof error.status === 'string' ? error.status : '';
    const message =
      typeof error.message === 'string' ? error.message : 'Gemini API error';
    return {
      type:
        status === 'UNAUTHENTICATED' ||
        status === 'PERMISSION_DENIED' ||
        message.includes('API key')
          ? 'secretKey'
          : 'api',
      message,
      addition: status,
      troubleshootingLink,
    };
  }

  protected extractErrorFromResponse(
    response: HttpResponse<unknown>,
  ): ServiceError {
    const data =
      response.data && typeof response.data === 'object'
        ? (response.data as Record<string, unknown>)
        : {};
    return (
      this.extractStreamError(data, PROVIDERS.gemini.documentationUrl) || {
        type: response.response.statusCode === 401 ? 'secretKey' : 'api',
        message: `Gemini API returned HTTP ${response.response.statusCode}`,
        addition: JSON.stringify(data),
      }
    );
  }

  public buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    };
  }

  public buildRequestBody(query: TextTranslateQuery): Record<string, unknown> {
    const prompts = createPrompts(query, this.config);
    const controls = resolveModelControls(
      this.config.provider,
      this.config.model,
      this.config.reasoningMode,
    );
    const generationConfig: Record<string, unknown> = {};
    if (controls.geminiThinking) {
      generationConfig.thinkingConfig = controls.geminiThinking;
    }

    return {
      system_instruction: {
        parts: [{ text: prompts.system }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompts.user }],
        },
      ],
      ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
    };
  }

  public getTextGenerationUrl(): string {
    const operation = this.config.stream
      ? 'streamGenerateContent'
      : 'generateContent';
    const endpoint = `${this.config.endpoint}/${this.config.model}:${operation}`;
    return this.config.stream ? `${endpoint}?alt=sse` : endpoint;
  }

  public parseResponse(response: HttpResponse<unknown>): string {
    const text = this.extractText(response.data as Record<string, unknown>);
    if (text) return text.trim();
    throw new Error('Gemini API returned no text');
  }

  public testApiConnection(
    apiKey: string,
    completion: ValidationCompletion,
  ): Promise<void> {
    return this.validateConnection(
      {
        method: 'GET',
        url: this.config.endpoint,
        header: this.buildHeaders(apiKey),
      },
      completion,
      (response) => {
        const data = response.data as { models?: unknown[] };
        if (Array.isArray(data.models)) return;
        throw {
          type: 'api',
          message: 'Gemini Models API returned an unexpected response',
        } satisfies ServiceError;
      },
    );
  }

  private extractText(data: Record<string, unknown>): string {
    const candidates = data.candidates as
      | Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>
      | undefined;
    return (candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || '')
      .join('');
  }
}
