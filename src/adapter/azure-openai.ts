import type {
  HttpResponse,
  ServiceError,
  ValidationCompletion,
} from '@bob-translate/types';
import { handleValidateError } from '../utils';
import { OpenAiAdapter } from './openai';

export class AzureOpenAiAdapter extends OpenAiAdapter {
  constructor() {
    super({
      troubleshootingLink:
        'https://bobtranslate.com/service/translate/azureopenai.html',
      baseUrl: $option.apiUrl,
    });
  }

  public override buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    };
  }

  public override getTextGenerationUrl(): string {
    return `${this.config.baseUrl}${this.getApiPath()}`;
  }

  protected override extractErrorFromResponse(
    response: HttpResponse<unknown>,
  ): ServiceError {
    const result = super.extractErrorFromResponse(response);
    // Azure uses 403 for auth errors too
    if (response.response?.statusCode === 403) {
      result.type = 'secretKey';
    }
    return {
      ...result,
      troubleshootingLink: this.config.troubleshootingLink,
    };
  }

  public override async testApiConnection(
    apiKey: string,
    _apiUrl: string,
    completion: ValidationCompletion,
  ): Promise<void> {
    const header = this.buildHeaders(apiKey);
    const url = this.getTextGenerationUrl();
    const apiPath = this.getApiPath();

    try {
      // Extract deployment name from path
      // Format: /openai/deployments/{deployment}/responses or /openai/deployments/{deployment}/chat/completions
      const deploymentMatch = apiPath.match(/\/deployments\/([^/]+)\//);
      const model = deploymentMatch ? deploymentMatch[1] : 'gpt-4';

      // Build request body based on API type
      const body = this.isChatCompletionsApi()
        ? {
            model,
            messages: [
              { role: 'user', content: "Test connectivity. Reply with 'OK'." },
            ],
          }
        : {
            model,
            input: "Test connectivity. You ONLY need to reply 'OK'.",
          };

      const response = await $http.request({
        method: 'POST',
        url,
        header,
        body,
      });

      if (response.data.error) {
        return handleValidateError(
          completion,
          this.extractErrorFromResponse(response),
        );
      }

      // Accept any successful response from Azure OpenAI
      if (response.data && !response.data.error) {
        return completion({ result: true });
      }
    } catch (error) {
      handleValidateError(completion, error);
    }
  }
}
