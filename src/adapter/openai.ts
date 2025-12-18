import type {
  HttpResponse,
  ServiceError,
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';
import type { EventSourceMessage } from 'eventsource-parser';
import type {
  GeminiResponse,
  OpenAiErrorResponse,
  OpenAiResponse,
  ServiceAdapterConfig,
} from '../types';
import {
  generatePrompts,
  handleValidateError,
  replacePromptKeywords,
} from '../utils';
import { BaseAdapter } from './base';

export class OpenAiAdapter extends BaseAdapter {
  constructor(config?: ServiceAdapterConfig) {
    super(
      config || {
        troubleshootingLink:
          'https://bobtranslate.com/service/translate/openai.html',
        baseUrl: $option.apiUrl || 'https://api.openai.com',
      },
    );
  }

  protected getApiPath(): string {
    return $option.apiPath || '/v1/responses';
  }

  protected isChatCompletionsApi(): boolean {
    return this.getApiPath().includes('/chat/completions');
  }

  protected extractStreamDelta(
    data: Record<string, unknown>,
    event: EventSourceMessage,
  ): string | null {
    // Chat Completions API format: choices[0].delta.content
    if (this.isChatCompletionsApi()) {
      return this.extractChatCompletionsDelta(data);
    }

    // Responses API format
    if (
      event.event === 'response.output_text.delta' ||
      data.type === 'response.output_text.delta'
    ) {
      return typeof data.delta === 'string' ? data.delta : null;
    }
    return this.extractDeltaFromData(data);
  }

  private extractChatCompletionsDelta(
    data: Record<string, unknown>,
  ): string | null {
    const choices = data.choices as Array<{
      delta?: { content?: string };
    }>;
    return choices?.[0]?.delta?.content ?? null;
  }

  protected extractStreamError(
    data: Record<string, unknown>,
    troubleshootingLink: string,
  ): ServiceError | null {
    if (!data.error) return null;

    const error = data.error as Record<string, unknown>;
    return {
      type: 'api',
      message: (error.message as string) || 'API request failed',
      addition: error.param ? `Parameter: ${error.param}` : '',
      troubleshootingLink,
    };
  }

  protected extractErrorFromResponse(
    errorResponse: HttpResponse<unknown>,
  ): ServiceError {
    const data = errorResponse.data as
      | OpenAiErrorResponse
      | Record<string, unknown>;
    const statusCode = errorResponse.response?.statusCode;

    const baseError: ServiceError = {
      type: statusCode === 401 ? 'secretKey' : 'api',
      message: 'API request failed',
      addition: JSON.stringify(data),
      troubleshootingLink: this.config.troubleshootingLink,
    };

    // Case 1: error is string
    if (typeof data?.error === 'string') {
      return {
        ...baseError,
        message: data.error,
      };
    }

    // Case 2: error is object with message
    if (
      typeof data === 'object' &&
      'error' in data &&
      data.error &&
      typeof data.error === 'object' &&
      'message' in data.error
    ) {
      const errorObj = data.error as { message: string; param?: string };
      let errorMessage = errorObj.message;
      if (errorObj.param) {
        errorMessage = `${errorMessage} (parameter: ${errorObj.param})`;
      }
      return {
        ...baseError,
        message: errorMessage,
      };
    }

    // Case 3: Generic error
    return baseError;
  }

  public buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  public buildRequestBody(query: TextTranslateQuery): Record<string, unknown> {
    const { customSystemPrompt, customUserPrompt } = $option;
    const { generatedSystemPrompt, generatedUserPrompt } =
      generatePrompts(query);

    let systemPrompt =
      replacePromptKeywords(customSystemPrompt, query) || generatedSystemPrompt;
    const userPrompt =
      replacePromptKeywords(customUserPrompt, query) || generatedUserPrompt;

    const formattingInstructions =
      '\n\nIMPORTANT: Output the translation directly without any quotation marks or special characters wrapping. Do not add quotes like 『』「」"" around the result.';
    systemPrompt += formattingInstructions;

    const model = this.getModel();

    // Use Chat Completions API format if path contains /chat/completions
    if (this.isChatCompletionsApi()) {
      return this.buildChatCompletionsRequestBody(
        model,
        systemPrompt,
        userPrompt,
      );
    }

    // Responses API format (default)
    return this.buildResponsesApiRequestBody(model, systemPrompt, userPrompt);
  }

  private buildChatCompletionsRequestBody(
    model: string,
    systemPrompt: string,
    userPrompt: string,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
      stream: this.isStreamEnabled(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.getTemperature(),
    };

    return body;
  }

  private buildResponsesApiRequestBody(
    model: string,
    systemPrompt: string,
    userPrompt: string,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
      stream: this.isStreamEnabled(),
      instructions: systemPrompt,
      input: userPrompt,
    };

    // GPT-5 series models don't support temperature
    if (!model.includes('gpt-5-')) {
      body.temperature = this.getTemperature();
    }

    if (!this.isThinkingModeEnabled()) {
      // GPT-5 series supports 'minimal', GPT-5.1/5.2 series supports 'none'
      const effort = model.includes('gpt-5-') ? 'minimal' : 'none';
      body.reasoning = { effort };
    }

    return body;
  }

  public parseResponse(
    response: HttpResponse<GeminiResponse | OpenAiResponse>,
  ): string {
    const { data } = response;

    // Handle Chat Completions API format: choices[0].message.content
    if (this.isChatCompletionsApi()) {
      return this.parseChatCompletionsResponse(data);
    }

    // Handle Responses API format
    if (typeof data === 'object' && 'output' in data) {
      const openAiResponse = data as OpenAiResponse;
      // Use the helper field if available
      if (openAiResponse.output_text) {
        return openAiResponse.output_text.trim();
      }
      // Otherwise extract from output array
      if (openAiResponse.output && openAiResponse.output.length > 0) {
        // Look for message type items in the output array
        for (const item of openAiResponse.output) {
          if (
            item.type === 'message' &&
            item.content &&
            item.content.length > 0
          ) {
            const text = item.content
              .filter((c) => c.type === 'output_text')
              .map((c) => c.text)
              .join('');
            if (text) {
              return text.trim();
            }
          }
        }
      }
      throw new Error('No output returned from Responses API');
    }

    throw new Error('Unsupported response type');
  }

  private parseChatCompletionsResponse(data: unknown): string {
    const response = data as {
      choices?: Array<{
        message?: { content?: string };
      }>;
    };
    const content = response?.choices?.[0]?.message?.content;
    if (content) {
      return content.trim();
    }
    throw new Error('No content returned from Chat Completions API');
  }

  public getTextGenerationUrl(): string {
    return `${this.config.baseUrl}${this.getApiPath()}`;
  }

  protected getValidationUrl(): string {
    return `${this.config.baseUrl}/v1/models`;
  }

  private extractDeltaFromData(
    dataObj: Record<string, unknown>,
  ): string | null {
    // Handle new Responses API event stream format
    if (
      dataObj.type === 'response.output_text.delta' &&
      typeof dataObj.delta === 'string'
    ) {
      return dataObj.delta;
    }

    // Handle old Responses API stream format (if still used)
    if (
      dataObj.object === 'response.chunk' &&
      dataObj.delta &&
      typeof dataObj.delta === 'object'
    ) {
      const delta = dataObj.delta as Record<string, unknown>;
      if (Array.isArray(delta.output)) {
        const output = delta.output;
        if (output.length > 0 && output[0] && typeof output[0] === 'object') {
          const firstOutput = output[0] as Record<string, unknown>;
          if (Array.isArray(firstOutput.content)) {
            return (
              firstOutput.content
                .filter(
                  (
                    content: unknown,
                  ): content is { type?: string; text?: string } =>
                    typeof content === 'object' &&
                    content !== null &&
                    'type' in content &&
                    content.type === 'output_text' &&
                    'text' in content &&
                    typeof content.text === 'string',
                )
                .map((content) => content.text)
                .join('') || null
            );
          }
        }
      }
    }

    return null;
  }

  public async testApiConnection(
    apiKey: string,
    _apiUrl: string,
    completion: ValidationCompletion,
  ): Promise<void> {
    const header = this.buildHeaders(apiKey);
    const validationUrl = this.getValidationUrl();

    try {
      const response = await $http.request({
        method: 'GET',
        url: validationUrl,
        header,
      });

      const responseData = response.data;
      if (responseData?.error) {
        return handleValidateError(
          completion,
          this.extractErrorFromResponse(response),
        );
      }

      // Check if we got a valid models list response
      if (
        responseData &&
        (responseData.data || responseData.object === 'list')
      ) {
        return completion({ result: true });
      }
    } catch (error) {
      handleValidateError(completion, error);
    }
  }
}
