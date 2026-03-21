import type {
  HttpResponse,
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';
import type { GeminiResponse, OpenAiResponse } from '../types';
import { handleValidateError } from '../utils/error';
import { OpenAiAdapter } from './openai';

export class MiniMaxAdapter extends OpenAiAdapter {
  constructor() {
    super({
      troubleshootingLink:
        'https://platform.minimax.io/docs/api-reference/text-openai-api',
      baseUrl: $option.apiUrl || 'https://api.minimax.io',
    });
  }

  protected override getApiPath(): string {
    return $option.apiPath || '/v1/chat/completions';
  }

  protected override getTemperature(): number {
    const temp = Number($option.temperature) ?? 0.2;
    // MiniMax requires temperature in (0.0, 1.0]
    if (temp <= 0) return 0.01;
    if (temp > 1) return 1.0;
    return temp;
  }

  private stripThinkTags(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
  }

  public override parseResponse(
    response: HttpResponse<GeminiResponse | OpenAiResponse>,
  ): string {
    const text = super.parseResponse(response);
    return this.stripThinkTags(text);
  }

  protected override handleStreamCompletion(
    query: TextTranslateQuery,
    targetText: string,
  ) {
    super.handleStreamCompletion(query, this.stripThinkTags(targetText));
  }

  public override async testApiConnection(
    apiKey: string,
    _apiUrl: string,
    completion: ValidationCompletion,
  ): Promise<void> {
    const header = this.buildHeaders(apiKey);
    const url = this.getTextGenerationUrl();

    try {
      const response = await $http.request({
        method: 'POST',
        url,
        header,
        body: {
          model: 'MiniMax-M2.7',
          messages: [
            { role: 'user', content: "Test connectivity. Reply with 'OK'." },
          ],
          max_tokens: 10,
          temperature: 1.0,
        },
      });

      const responseData = response.data;
      if (responseData?.error) {
        return handleValidateError(
          completion,
          this.extractErrorFromResponse(response),
        );
      }

      if (responseData?.choices) {
        return completion({ result: true });
      }
    } catch (error) {
      handleValidateError(completion, error);
    }
  }
}
