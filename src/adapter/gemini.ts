import type {
  HttpResponse,
  ServiceError,
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';
import type { GeminiResponse, OpenAiResponse } from '../types';
import { generatePrompts, handleValidateError } from '../utils';
import { BaseAdapter } from './base';

export class GeminiAdapter extends BaseAdapter {
  constructor() {
    super({
      troubleshootingLink:
        'https://bobtranslate.com/service/translate/gemini.html',
      baseUrl:
        $option.apiUrl ||
        'https://generativelanguage.googleapis.com/v1beta/models',
    });
  }

  protected extractStreamDelta(data: Record<string, unknown>): string | null {
    const candidates = data.candidates as Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    return candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  }

  protected extractStreamError(
    data: Record<string, unknown>,
    troubleshootingLink: string,
  ): ServiceError | null {
    const errorData = data.error as { status?: string; message?: string };
    if (!errorData) return null;

    const isAuthError =
      errorData.status === 'UNAUTHENTICATED' ||
      errorData.status === 'PERMISSION_DENIED' ||
      errorData.message?.includes('API key');

    return {
      type: isAuthError ? 'secretKey' : 'api',
      message: errorData.message || 'Gemini API error',
      addition: errorData.status || '',
      troubleshootingLink,
    };
  }

  protected extractErrorFromResponse(
    response: HttpResponse<unknown>,
  ): ServiceError {
    const data = response.data as Record<string, unknown>;
    const streamError = this.extractStreamError(
      data,
      this.config.troubleshootingLink,
    );
    if (streamError) return streamError;

    return {
      type: 'api',
      message: 'Gemini API error',
      addition: JSON.stringify(response.data),
      troubleshootingLink: this.config.troubleshootingLink,
    };
  }

  public buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    };
  }

  public buildRequestBody(query: TextTranslateQuery): Record<string, unknown> {
    const { generatedSystemPrompt, generatedUserPrompt } =
      generatePrompts(query);

    const generationConfig: Record<string, unknown> = {
      temperature: this.getTemperature(),
    };

    if (!this.isThinkingModeEnabled()) {
      const model = this.getModel();
      // Gemini 3 series uses thinkingLevel, Gemini 2.5 series uses thinkingBudget
      if (model.includes('gemini-3')) {
        generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
      } else {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }
    }

    return {
      system_instruction: {
        parts: {
          text: generatedSystemPrompt,
        },
      },
      contents: {
        parts: {
          text: generatedUserPrompt,
        },
      },
      generationConfig,
    };
  }

  public getTextGenerationUrl(_apiUrl: string): string {
    const operationName = this.isStreamEnabled()
      ? 'streamGenerateContent'
      : 'generateContent';
    const baseUrl = `${this.config.baseUrl}/${this.getModel()}:${operationName}`;
    return this.isStreamEnabled() ? `${baseUrl}?alt=sse` : baseUrl;
  }

  public parseResponse(
    response: HttpResponse<GeminiResponse | OpenAiResponse>,
  ): string {
    const { data } = response;
    if (typeof data === 'object' && 'candidates' in data) {
      if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid response format from Gemini API');
      }
      return data.candidates[0].content.parts[0].text.trim();
    }

    throw new Error('Unsupported response type');
  }

  public async testApiConnection(
    apiKey: string,
    _apiUrl: string,
    completion: ValidationCompletion,
  ): Promise<void> {
    const header = this.buildHeaders(apiKey);

    try {
      const response = await $http.request({
        method: 'GET',
        url: this.config.baseUrl || '',
        header,
      });

      const data = response.data as {
        error?: unknown;
        models?: Array<unknown>;
      };

      if (data.error) {
        handleValidateError(
          completion,
          this.extractErrorFromResponse(response),
        );
        return;
      }

      if (data.models && data.models.length > 0) {
        completion({ result: true });
      }
    } catch (error) {
      handleValidateError(completion, error);
    }
  }

}
