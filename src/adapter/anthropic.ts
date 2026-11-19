import type {
  HttpResponse,
  ServiceError,
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';
import { resolveModelControls } from '../utils/model-capabilities';
import { createPrompts } from '../utils/prompt';
import { BaseAdapter } from './base';

const API_VERSION = '2026-10-21';

// Messages requires an output cap, and thinking spends from the same budget.
const MAX_TOKENS = 32000;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

export class AnthropicAdapter extends BaseAdapter {
  protected extractStreamDelta(data: Record<string, unknown>): string | null {
    if (data.type !== 'content_block_delta') return null;
    const delta = asRecord(data.delta);
    return delta.type === 'text_delta' && typeof delta.text === 'string'
      ? delta.text
      : null;
  }

  protected extractStreamError(
    data: Record<string, unknown>,
    troubleshootingLink: string,
  ): ServiceError | null {
    if (data.type === 'error') {
      return {
        ...this.createApiError(asRecord(data.error)),
        troubleshootingLink,
      };
    }
    if (data.type !== 'message_delta') return null;

    const stopError = this.createStopError(asRecord(data.delta).stop_reason);
    return stopError ? { ...stopError, troubleshootingLink } : null;
  }

  protected override isStreamComplete(data: Record<string, unknown>): boolean {
    return data.type === 'message_stop';
  }

  protected override requiresStreamCompletion(): boolean {
    return true;
  }

  protected extractErrorFromResponse(
    response: HttpResponse<unknown>,
  ): ServiceError {
    const statusCode = response.response.statusCode;
    const data = asRecord(response.data);
    if (data.type === 'error') return this.createApiError(asRecord(data.error));
    return {
      type: statusCode === 401 || statusCode === 403 ? 'secretKey' : 'api',
      message: `HTTP ${statusCode}`,
      addition: JSON.stringify(data),
    };
  }

  public buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'anthropic-version': API_VERSION,
      'x-api-key': apiKey,
    };
  }

  public buildRequestBody(query: TextTranslateQuery): Record<string, unknown> {
    const prompts = createPrompts(query, this.config);
    const { anthropicReasoning } = resolveModelControls(
      this.config.provider,
      this.config.model,
      this.config.reasoningMode,
    );
    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: MAX_TOKENS,
      stream: this.config.stream,
      system: prompts.system,
      messages: [{ role: 'user', content: prompts.user }],
    };
    if (anthropicReasoning && 'thinking' in anthropicReasoning) {
      body.thinking = { type: anthropicReasoning.thinking };
    } else if (anthropicReasoning) {
      body.output_config = { effort: anthropicReasoning.effort };
    }
    return body;
  }

  public parseResponse(response: HttpResponse<unknown>): string {
    const data = asRecord(response.data);
    const stopError = this.createStopError(data.stop_reason);
    if (stopError) throw stopError;

    const text = this.extractText(data);
    if (text) return text;
    throw new Error('Messages API returned no text');
  }

  public testApiConnection(
    apiKey: string,
    completion: ValidationCompletion,
  ): Promise<void> {
    return this.validateConnection(
      {
        method: 'POST',
        url: this.config.endpoint,
        header: this.buildHeaders(apiKey),
        body: {
          model: this.config.model,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Reply with OK.' }],
        },
      },
      completion,
      (response) => {
        // Default thinking can spend the whole validation budget before any text.
        const { content, type } = asRecord(response.data);
        if (type === 'message' && Array.isArray(content)) return;
        throw {
          type: 'api',
          message: 'Messages API returned an unexpected response',
        } satisfies ServiceError;
      },
    );
  }

  private extractText(data: Record<string, unknown>): string {
    const blocks = Array.isArray(data.content) ? data.content : [];
    return blocks
      .map((block) => {
        const { type, text } = asRecord(block);
        return type === 'text' && typeof text === 'string' ? text : '';
      })
      .join('');
  }

  private createApiError(error: Record<string, unknown>): ServiceError {
    const type = typeof error.type === 'string' ? error.type : '';
    return {
      type:
        type === 'authentication_error' || type === 'permission_error'
          ? 'secretKey'
          : 'api',
      message:
        typeof error.message === 'string' && error.message
          ? error.message
          : 'Messages API request failed',
      ...(type ? { addition: `type: ${type}` } : {}),
    };
  }

  private createStopError(stopReason: unknown): ServiceError | null {
    if (
      typeof stopReason !== 'string' ||
      stopReason === 'end_turn' ||
      stopReason === 'stop_sequence'
    ) {
      return null;
    }
    return {
      type: 'api',
      message: `API 响应未完成：${stopReason}`,
    };
  }
}
