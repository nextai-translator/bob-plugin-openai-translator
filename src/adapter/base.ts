import type {
  HttpResponse,
  ServiceError,
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';
import type { EventSourceMessage } from 'eventsource-parser';
import { PROVIDERS } from '../config';
import type { PluginConfig, ServiceAdapter } from '../types';
import {
  convertToServiceError,
  handleGeneralError,
  handleValidateError,
} from '../utils/error';
import { SseStreamHandler } from '../utils/sse';

type StreamCompletionResponse = Pick<
  HttpResponse<unknown>,
  'error' | 'response'
>;
type RequestConfig = Parameters<(typeof $http)['request']>[0];

export abstract class BaseAdapter implements ServiceAdapter {
  private readonly sseHandler: SseStreamHandler;

  constructor(protected readonly config: PluginConfig) {
    this.sseHandler = new SseStreamHandler({
      troubleshootingLink: PROVIDERS[config.provider].documentationUrl,
      extractDelta: (data, event) => this.extractStreamDelta(data, event),
      extractError: (data, link) => this.extractStreamError(data, link),
      isComplete: (data, event) => this.isStreamComplete(data, event),
    });
  }

  protected abstract extractStreamDelta(
    data: Record<string, unknown>,
    event: EventSourceMessage,
  ): string | null;

  protected abstract extractStreamError(
    data: Record<string, unknown>,
    troubleshootingLink: string,
  ): ServiceError | null;

  protected abstract extractErrorFromResponse(
    response: HttpResponse<unknown>,
  ): ServiceError;

  protected isStreamComplete(
    _data: Record<string, unknown>,
    _event: EventSourceMessage,
  ): boolean {
    return false;
  }

  protected requiresStreamCompletion(): boolean {
    return false;
  }

  abstract buildHeaders(apiKey: string): Record<string, string>;

  abstract buildRequestBody(query: TextTranslateQuery): Record<string, unknown>;

  abstract getTextGenerationUrl(): string;

  abstract parseResponse(response: HttpResponse<unknown>): string;

  abstract testApiConnection(
    apiKey: string,
    completion: ValidationCompletion,
  ): Promise<void>;

  public async translate(
    query: TextTranslateQuery,
    apiKey: string,
  ): Promise<void> {
    try {
      const url = this.getTextGenerationUrl();
      const headers = this.buildHeaders(apiKey);
      const body = this.buildRequestBody(query);

      if (this.config.stream) {
        await this.makeStreamRequest(url, headers, body, query);
      } else {
        await this.makeRequest(url, headers, body, query);
      }
    } catch (error) {
      this.completeWithError(query, error);
    }
  }

  public makeStreamRequest(
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
    query: TextTranslateQuery,
  ): Promise<void> {
    this.sseHandler.reset(query);

    return new Promise((resolve) => {
      let completed = false;
      const complete = (callback: () => void) => {
        if (completed) return;
        completed = true;
        resolve();
        callback();
      };
      const handleResult = (result: StreamCompletionResponse) => {
        if (completed) return;

        if (result.error) {
          complete(() =>
            this.completeWithError(
              query,
              this.createNetworkError(result.error),
            ),
          );
          return;
        }

        this.sseHandler.finish();
        if (result.response.statusCode >= 400) {
          const statusCode = result.response.statusCode;
          const providerError = this.sseHandler.getProviderError();
          complete(() =>
            this.completeWithError(
              query,
              providerError || {
                type:
                  statusCode === 401 || statusCode === 403
                    ? 'secretKey'
                    : 'api',
                message: `HTTP ${statusCode}`,
              },
            ),
          );
          return;
        }

        const streamError = this.sseHandler.getError();
        if (streamError) {
          complete(() => this.completeWithError(query, streamError));
          return;
        }
        if (this.requiresStreamCompletion() && !this.sseHandler.isComplete()) {
          complete(() =>
            this.completeWithError(query, {
              type: 'api',
              message: 'API 流式响应未正常完成',
            }),
          );
          return;
        }

        const text = this.sseHandler.getText();
        if (!text) {
          complete(() =>
            this.completeWithError(query, {
              type: 'api',
              message: 'API 未返回译文',
            }),
          );
          return;
        }

        complete(() => this.completeWithText(query, text));
      };

      try {
        // Bob returns through handler, not a Promise, when handler is present.
        $http.streamRequest<unknown, HttpResponse<unknown>>({
          method: 'POST',
          url,
          header: headers,
          body,
          cancelSignal: query.cancelSignal,
          streamHandler: (stream) => {
            if (!completed && stream.text) this.sseHandler.feed(stream.text);
          },
          handler: handleResult,
        });
      } catch (error) {
        complete(() =>
          this.completeWithError(query, this.createNetworkError(error)),
        );
      }
    });
  }

  public async makeRequest(
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
    query: TextTranslateQuery,
  ): Promise<void> {
    try {
      const result = await this.performRequest({
        method: 'POST',
        url,
        header: headers,
        body,
        cancelSignal: query.cancelSignal,
      });

      if (result.response.statusCode >= 400) {
        this.completeWithError(query, this.extractErrorFromResponse(result));
        return;
      }

      this.completeWithText(query, this.parseResponse(result));
    } catch (error) {
      this.completeWithError(query, error);
    }
  }

  protected async performRequest(
    config: RequestConfig,
  ): Promise<HttpResponse<unknown>> {
    try {
      const response = await $http.request(config);
      if (response.error) throw this.createNetworkError(response.error);
      return response;
    } catch (error) {
      const serviceError = convertToServiceError(error);
      throw serviceError.type === 'network'
        ? serviceError
        : this.createNetworkError(error);
    }
  }

  protected async validateConnection(
    request: RequestConfig,
    completion: ValidationCompletion,
    validateResponse: (response: HttpResponse<unknown>) => void,
  ): Promise<void> {
    let completed = false;
    const complete: ValidationCompletion = (result) => {
      if (completed) return;
      completed = true;
      completion(result);
    };

    try {
      const response = await this.performRequest(request);
      if (response.response.statusCode >= 400) {
        handleValidateError(
          complete,
          this.withTroubleshootingLink(this.extractErrorFromResponse(response)),
        );
        return;
      }

      validateResponse(response);
      complete({ result: true });
    } catch (error) {
      handleValidateError(complete, this.withTroubleshootingLink(error));
    }
  }

  protected completeWithText(query: TextTranslateQuery, text: string): void {
    query.onCompletion({
      result: {
        from: query.detectFrom,
        to: query.detectTo,
        toParagraphs: [text],
      },
    });
  }

  protected completeWithError(query: TextTranslateQuery, error: unknown): void {
    handleGeneralError(query, this.withTroubleshootingLink(error));
  }

  private createNetworkError(error: unknown): ServiceError {
    const converted = convertToServiceError(error, '网络请求失败');
    return {
      ...converted,
      type: 'network',
      troubleshootingLink: PROVIDERS[this.config.provider].documentationUrl,
    };
  }

  private withTroubleshootingLink(error: unknown): ServiceError {
    const serviceError = convertToServiceError(error);
    return serviceError.troubleshootingLink
      ? serviceError
      : {
          ...serviceError,
          troubleshootingLink: PROVIDERS[this.config.provider].documentationUrl,
        };
  }
}
