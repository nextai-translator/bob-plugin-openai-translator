import type { ServiceError, TextTranslateQuery } from '@bob-translate/types';
import {
  createParser,
  type EventSourceMessage,
  type EventSourceParser,
} from 'eventsource-parser';

export type DeltaExtractor = (
  data: Record<string, unknown>,
  event: EventSourceMessage,
) => string | null;

export type ErrorExtractor = (
  data: Record<string, unknown>,
  troubleshootingLink: string,
) => ServiceError | null;

interface SseStreamHandlerConfig {
  extractDelta: DeltaExtractor;
  extractError: ErrorExtractor;
  troubleshootingLink: string;
}

interface StreamState {
  targetText: string;
  query: TextTranslateQuery | null;
  error: ServiceError | null;
}

export class SseStreamHandler {
  private parser: EventSourceParser | null = null;
  private state: StreamState = { targetText: '', query: null, error: null };
  private readonly config: SseStreamHandlerConfig;

  constructor(config: SseStreamHandlerConfig) {
    this.config = config;
  }

  reset(): void {
    this.state = { targetText: '', query: null, error: null };
    this.parser = createParser({
      onEvent: (event) => this.handleEvent(event),
    });
  }

  feed(
    text: string,
    query: TextTranslateQuery,
    currentTargetText: string,
  ): string {
    this.state.query = query;
    this.state.targetText = currentTargetText;

    this.parser?.feed(text);

    if (this.state.error) {
      throw this.state.error;
    }

    return this.state.targetText;
  }

  private handleEvent(event: EventSourceMessage): void {
    // Ignore [DONE] messages
    if (event.data === '[DONE]' || event.data.startsWith('[DONE]')) {
      return;
    }

    try {
      const data = JSON.parse(event.data) as Record<string, unknown>;

      // Check for errors first
      const error = this.config.extractError(
        data,
        this.config.troubleshootingLink,
      );
      if (error) {
        this.state.error = error;
        return;
      }

      // Extract delta text
      const delta = this.config.extractDelta(data, event);
      if (delta && this.state.query) {
        this.state.targetText += delta;
        this.state.query.onStream({
          result: {
            from: this.state.query.detectFrom,
            to: this.state.query.detectTo,
            toParagraphs: [this.state.targetText],
          },
        });
      }
    } catch {
      // Ignore parsing errors for non-JSON events
    }
  }
}
