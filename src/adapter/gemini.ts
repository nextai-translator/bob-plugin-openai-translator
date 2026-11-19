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
    if (!data.error || typeof data.error !== 'object') {
      const finishReason = (
        data.candidates as Array<{ finishReason?: unknown }> | undefined
      )?.[0]?.finishReason;
      return typeof finishReason === 'string' && finishReason !== 'STOP'
        ? {
            type: 'api',
            message: `API 响应未完成：${finishReason}`,
            troubleshootingLink,
          }
        : null;
    }

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

  protected override isStreamComplete(data: Record<string, unknown>): boolean {
    return (
      (data.candidates as Array<{ finishReason?: unknown }> | undefined)?.[0]
        ?.finishReason === 'STOP'
    );
  }

  protected override requiresStreamCompletion(): boolean {
    return true;
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
      ...(controls.geminiThinkingLevel
        ? {
            generationConfig: {
              thinkingConfig: { thinkingLevel: controls.geminiThinkingLevel },
            },
          }
        : {}),
    };
  }

  public override getTextGenerationUrl(): string {
    return this.config.stream
      ? this.getOperationUrl('streamGenerateContent', 'alt=sse')
      : this.getOperationUrl('generateContent');
  }

  public parseResponse(response: HttpResponse<unknown>): string {
    const data = response.data as Record<string, unknown>;
    const finishError = this.extractStreamError(
      data,
      PROVIDERS.gemini.documentationUrl,
    );
    if (finishError) throw finishError;

    const text = this.extractText(data);
    if (text) return text;
    throw new Error('Gemini API returned no text');
  }

  public testApiConnection(
    apiKey: string,
    completion: ValidationCompletion,
  ): Promise<void> {
    if (this.config.endpoint !== PROVIDERS.gemini.defaultEndpoint) {
      return this.validateConnection(
        {
          method: 'POST',
          url: this.getOperationUrl('generateContent'),
          header: this.buildHeaders(apiKey),
          body: {
            contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }],
          },
        },
        completion,
        (response) => {
          this.parseResponse(response);
        },
      );
    }

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

  private getOperationUrl(operation: string, parameter?: string): string {
    const [path, ...query] = this.config.endpoint.split('?');
    const parameters = [query.join('?'), parameter].filter(Boolean).join('&');
    const url = `${path}/${this.config.model}:${operation}`;
    return parameters ? `${url}?${parameters}` : url;
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
