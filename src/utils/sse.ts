import type { ServiceError, TextTranslateQuery } from '@bob-translate/types';
import {
  createParser,
  type EventSourceParser,
  type ParseError,
} from 'eventsource-parser';
import { createTranslateResult } from './result';

interface SseStreamHandlerConfig {
  extractDelta: (data: Record<string, unknown>) => string | null;
  extractError: (
    data: Record<string, unknown>,
    troubleshootingLink: string,
  ) => ServiceError | null;
  isComplete: (data: Record<string, unknown>) => boolean;
  troubleshootingLink: string;
}

const MAX_SSE_BUFFER_SIZE = 1024 * 1024;
const MAX_BODY_PREVIEW_LENGTH = 200;

export class SseStreamHandler {
  private bodyPreview = '';
  private complete = false;
  private error: ServiceError | null = null;
  private readonly parser: EventSourceParser;
  private providerError: ServiceError | null = null;
  private rawJsonChunks: string[] | null = [];
  private rawJsonLength = 0;
  private rawJsonStarted = false;
  private targetText = '';

  constructor(
    private readonly config: SseStreamHandlerConfig,
    private readonly query: TextTranslateQuery,
  ) {
    this.parser = createParser({
      maxBufferSize: MAX_SSE_BUFFER_SIZE,
      onError: (error) => this.handleParseError(error),
      onEvent: (event) => this.handleEvent(event.data),
    });
  }

  feed(text: string): void {
    if (this.error) return;
    this.bodyPreview += text.slice(
      0,
      MAX_BODY_PREVIEW_LENGTH - this.bodyPreview.length,
    );
    this.captureRawJson(text);
    this.parser.feed(text);
  }

  finish(): void {
    if (this.error || !this.rawJsonStarted || !this.rawJsonChunks) return;

    try {
      const providerError = this.config.extractError(
        JSON.parse(this.rawJsonChunks.join('')) as Record<string, unknown>,
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

  getBodyPreview(): string {
    return this.bodyPreview.replace(/\s+/g, ' ').trim();
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

  // Bob can deliver a plain JSON error body through streamHandler while omitting it from handler.
  private captureRawJson(text: string): void {
    if (!this.rawJsonChunks) return;

    this.rawJsonChunks.push(text);
    this.rawJsonLength += text.length;
    if (this.rawJsonLength > MAX_SSE_BUFFER_SIZE) {
      this.rawJsonChunks = null;
      return;
    }
    if (this.rawJsonStarted) return;

    const contentIndex = text.search(/\S/);
    if (contentIndex === -1) return;
    if (text[contentIndex] === '{') {
      this.rawJsonStarted = true;
      return;
    }
    this.rawJsonChunks = null;
  }

  private handleParseError(error: ParseError): void {
    if (error.type === 'max-buffer-size-exceeded') {
      this.error = this.createProtocolError(error.message);
    }
  }

  private handleEvent(eventData: string): void {
    if (!eventData || eventData === '[DONE]') return;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(eventData) as Record<string, unknown>;
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
      if (this.config.isComplete(data)) {
        this.complete = true;
      }

      const delta = this.config.extractDelta(data);
      if (!delta) return;

      this.targetText += delta;
      this.query.onStream({
        result: createTranslateResult(this.query, this.targetText),
      });
    } catch (error) {
      this.error = this.createProtocolError(
        error instanceof Error ? error.message : 'Unable to parse SSE event',
      );
    }
  }
}
