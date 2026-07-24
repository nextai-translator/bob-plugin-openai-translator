import type {
  HttpResponse,
  ServiceError,
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';
import type { EventSourceMessage } from 'eventsource-parser';
import { resolveModelControls } from '../utils/model-capabilities';
import { createPrompts } from '../utils/prompt';
import { BaseAdapter } from './base';

export class OpenAiAdapter extends BaseAdapter {
  protected extractStreamDelta(
    data: Record<string, unknown>,
    event: EventSourceMessage,
  ): string | null {
    if (this.config.protocol === 'openai-chat-completions') {
      return this.extractChatCompletionsDelta(data);
    }
    if (
      event.event === 'response.output_text.delta' ||
      data.type === 'response.output_text.delta'
    ) {
      return typeof data.delta === 'string' ? data.delta : null;
    }
    return null;
  }

  protected extractStreamError(
    data: Record<string, unknown>,
    troubleshootingLink: string,
  ): ServiceError | null {
    if (this.config.protocol === 'openai-responses') {
      const terminalError = this.extractResponsesTerminalError(
        data,
        troubleshootingLink,
      );
      if (terminalError) return terminalError;
    }
    if (!data.error || typeof data.error !== 'object') return null;

    return this.createApiError(
      data.error as Record<string, unknown>,
      'API request failed',
      troubleshootingLink,
    );
  }

  protected override isStreamComplete(
    data: Record<string, unknown>,
    event: EventSourceMessage,
  ): boolean {
    if (this.config.protocol !== 'openai-responses') return false;
    if (
      event.event !== 'response.completed' &&
      data.type !== 'response.completed'
    ) {
      return false;
    }
    const response =
      data.response && typeof data.response === 'object'
        ? (data.response as Record<string, unknown>)
        : {};
    return response.status === 'completed';
  }

  protected override requiresStreamCompletion(): boolean {
    return this.config.protocol === 'openai-responses';
  }

  protected extractErrorFromResponse(
    response: HttpResponse<unknown>,
  ): ServiceError {
    const statusCode = response.response.statusCode;
    const data =
      response.data && typeof response.data === 'object'
        ? (response.data as Record<string, unknown>)
        : {};
    const error =
      data.error && typeof data.error === 'object'
        ? (data.error as Record<string, unknown>)
        : data;
    const message =
      typeof data.error === 'string'
        ? data.error
        : typeof error.message === 'string'
          ? error.message
          : `HTTP ${statusCode}`;

    return {
      type:
        statusCode === 401 ||
        statusCode === 403 ||
        this.isAuthenticationError(error)
          ? 'secretKey'
          : 'api',
      message,
      addition: JSON.stringify(data),
    };
  }

  public buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  public buildRequestBody(query: TextTranslateQuery): Record<string, unknown> {
    const prompts = createPrompts(query, this.config);
    const controls = resolveModelControls(
      this.config.provider,
      this.config.model,
      this.config.reasoningMode,
    );

    if (this.config.protocol === 'openai-chat-completions') {
      const body: Record<string, unknown> = {
        model: this.config.model,
        stream: this.config.stream,
        messages: [
          { role: 'system', content: prompts.system },
          { role: 'user', content: prompts.user },
        ],
      };
      if (controls.openAiReasoningEffort) {
        body.reasoning_effort = controls.openAiReasoningEffort;
      }
      return body;
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      stream: this.config.stream,
      instructions: prompts.system,
      input: prompts.user,
    };
    if (controls.openAiReasoningEffort) {
      body.reasoning = { effort: controls.openAiReasoningEffort };
    }
    return body;
  }

  public getTextGenerationUrl(): string {
    return this.config.endpoint;
  }

  public parseResponse(response: HttpResponse<unknown>): string {
    if (this.config.protocol === 'openai-chat-completions') {
      const data = response.data as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content) return content.trim();
      throw new Error('Chat Completions API returned no text');
    }

    const rawData = response.data as Record<string, unknown>;
    const terminalError = this.extractResponsesTerminalError(rawData);
    if (terminalError) throw terminalError;

    const data = rawData as {
      output?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
      }>;
      output_text?: string;
    };
    if (typeof data.output_text === 'string' && data.output_text) {
      return data.output_text.trim();
    }

    let text = '';
    for (const item of data.output || []) {
      if (item.type !== 'message') continue;
      for (const content of item.content || []) {
        if (content.type === 'output_text') text += content.text || '';
      }
    }
    if (text) return text.trim();
    throw new Error('Responses API returned no text');
  }

  public testApiConnection(
    apiKey: string,
    completion: ValidationCompletion,
  ): Promise<void> {
    if (this.config.provider === 'openai-compatible') {
      return this.testGenerationConnection(apiKey, completion);
    }

    const validationUrl = this.config.endpoint.replace(
      /\/(?:responses|chat\/completions)(?:\?.*)?$/,
      '/models',
    );

    return this.validateConnection(
      {
        method: 'GET',
        url: validationUrl,
        header: this.buildHeaders(apiKey),
      },
      completion,
      (response) => {
        const data = response.data as {
          data?: unknown[];
          object?: string;
        };
        if (Array.isArray(data.data) || data.object === 'list') return;
        throw {
          type: 'api',
          message: 'Models API returned an unexpected response',
        } satisfies ServiceError;
      },
    );
  }

  protected testGenerationConnection(
    apiKey: string,
    completion: ValidationCompletion,
  ): Promise<void> {
    const body =
      this.config.protocol === 'openai-chat-completions'
        ? {
            model: this.config.model,
            messages: [{ role: 'user', content: 'Reply with OK.' }],
            stream: false,
          }
        : {
            model: this.config.model,
            input: 'Reply with OK.',
            stream: false,
          };

    return this.validateConnection(
      {
        method: 'POST',
        url: this.config.endpoint,
        header: this.buildHeaders(apiKey),
        body,
      },
      completion,
      (response) => {
        this.parseResponse(response);
      },
    );
  }

  private extractChatCompletionsDelta(
    data: Record<string, unknown>,
  ): string | null {
    const choices = data.choices as
      | Array<{ delta?: { content?: string } }>
      | undefined;
    return choices?.[0]?.delta?.content ?? null;
  }

  private createApiError(
    error: Record<string, unknown>,
    fallbackMessage: string,
    troubleshootingLink?: string,
  ): ServiceError {
    const details: string[] = [];
    for (const field of ['code', 'type', 'param']) {
      if (typeof error[field] === 'string' && error[field]) {
        details.push(`${field}: ${error[field]}`);
      }
    }
    return {
      type: this.isAuthenticationError(error) ? 'secretKey' : 'api',
      message:
        typeof error.message === 'string' && error.message
          ? error.message
          : fallbackMessage,
      ...(details.length > 0 ? { addition: details.join(', ') } : {}),
      ...(troubleshootingLink ? { troubleshootingLink } : {}),
    };
  }

  private extractResponsesTerminalError(
    data: Record<string, unknown>,
    troubleshootingLink?: string,
  ): ServiceError | null {
    if (data.type === 'error') {
      return this.createApiError(
        data,
        'Responses API request failed',
        troubleshootingLink,
      );
    }

    const response =
      data.response && typeof data.response === 'object'
        ? (data.response as Record<string, unknown>)
        : data;
    const failed =
      data.type === 'response.failed' || response.status === 'failed';
    if (failed) {
      const error =
        response.error && typeof response.error === 'object'
          ? (response.error as Record<string, unknown>)
          : {};
      return this.createApiError(
        error,
        'Responses API request failed',
        troubleshootingLink,
      );
    }

    const incomplete =
      data.type === 'response.incomplete' || response.status === 'incomplete';
    if (!incomplete) return null;

    const details =
      response.incomplete_details &&
      typeof response.incomplete_details === 'object'
        ? (response.incomplete_details as Record<string, unknown>)
        : {};
    const reason =
      typeof details.reason === 'string' ? details.reason : undefined;
    return {
      type: 'api',
      message: reason ? `API 响应未完成：${reason}` : 'API 响应未完成',
      ...(reason ? { addition: `Reason: ${reason}` } : {}),
      ...(troubleshootingLink ? { troubleshootingLink } : {}),
    };
  }

  private isAuthenticationError(error: Record<string, unknown>): boolean {
    const code = typeof error.code === 'string' ? error.code : '';
    const type = typeof error.type === 'string' ? error.type : '';
    return (
      code.includes('api_key') ||
      type.includes('authentication') ||
      type.includes('permission')
    );
  }
}
