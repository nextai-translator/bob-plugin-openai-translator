import type { ServiceError, TextTranslateQuery } from '@bob-translate/types';
import {
  createParser,
  type EventSourceMessage,
  type EventSourceParser,
  type ParseError,
} from 'eventsource-parser';

export type DeltaExtractor = (
  data: Record<string, unknown>,
  event: EventSourceMessage,
) => string | null;

export type ErrorExtractor = (
  data: Record<string, unknown>,
  troubleshootingLink: string,
) => ServiceError | null;

export type CompletionDetector = (
  data: Record<string, unknown>,
  event: EventSourceMessage,
) => boolean;

interface SseStreamHandlerConfig {
  extractDelta: DeltaExtractor;
  extractError: ErrorExtractor;
  isComplete: CompletionDetector;
  troubleshootingLink: string;
}

const MAX_SSE_BUFFER_SIZE = 1024 * 1024;

export class SseStreamHandler {
  private complete = false;
  private error: ServiceError | null = null;
  private parser: EventSourceParser | null = null;
  private providerError: ServiceError | null = null;
  private query: TextTranslateQuery | null = null;
  private targetText = '';

  constructor(private readonly config: SseStreamHandlerConfig) {}

  reset(query: TextTranslateQuery): void {
    this.complete = false;
    this.error = null;
    this.providerError = null;
    this.query = query;
    this.targetText = '';
    this.parser = createParser({
      maxBufferSize: MAX_SSE_BUFFER_SIZE,
      onError: (error) => this.handleParseError(error),
      onEvent: (event) => this.handleEvent(event),
    });
  }

  feed(text: string): void {
    if (this.error) return;
    try {
      this.parser?.feed(text);
    } catch (error) {
      this.error = this.createProtocolError(
        error instanceof Error ? error.message : 'Invalid SSE stream',
      );
    }
  }

  finish(): void {
    if (this.error) return;
    try {
      this.parser?.reset({ consume: true });
    } catch (error) {
      this.error = this.createProtocolError(
        error instanceof Error ? error.message : 'Invalid SSE stream ending',
      );
    }
  }

  getError(): ServiceError | null {
    return this.error;
  }

  isComplete(): boolean {
    return this.complete;
  }

  getProviderError(): ServiceError | null {
    return this.providerError;
  }

  getText(): string {
    return this.targetText;
  }

  private createProtocolError(addition: string): ServiceError {
    return {
      type: 'api',
      message: '流式响应格式无效',
      addition,
      troubleshootingLink: this.config.troubleshootingLink,
    };
  }

  private handleParseError(error: ParseError): void {
    if (error.type === 'max-buffer-size-exceeded') {
      this.error = this.createProtocolError(error.message);
      return;
    }
    const line = error.line;
    if (error.type !== 'unknown-field' || !line?.trimStart().startsWith('{')) {
      return;
    }

    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return;
      const providerError = this.config.extractError(
        parsed as Record<string, unknown>,
        this.config.troubleshootingLink,
      );
      if (providerError) {
        this.providerError = providerError;
        this.error = providerError;
      }
    } catch {
      return;
    }
  }

  private handleEvent(event: EventSourceMessage): void {
    if (!event.data || event.data === '[DONE]') return;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      this.error = this.createProtocolError('SSE event data is not valid JSON');
      return;
    }

    try {
      const providerError = this.config.extractError(
        data,
        this.config.troubleshootingLink,
      );
      if (providerError) {
        this.providerError = providerError;
        this.error = providerError;
        return;
      }
      if (this.config.isComplete(data, event)) {
        this.complete = true;
      }

      const delta = this.config.extractDelta(data, event);
      if (!delta || !this.query) return;

      this.targetText += delta;
      this.query.onStream({
        result: {
          from: this.query.detectFrom,
          to: this.query.detectTo,
          toParagraphs: [this.targetText],
        },
      });
    } catch (error) {
      this.error = this.createProtocolError(
        error instanceof Error ? error.message : 'Unable to parse SSE event',
      );
    }
  }
}
