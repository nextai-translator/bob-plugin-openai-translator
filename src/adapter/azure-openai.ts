import type { ValidationCompletion } from '@bob-translate/types';
import { OpenAiAdapter } from './openai';

export class AzureOpenAiAdapter extends OpenAiAdapter {
  public override buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    };
  }

  public override testApiConnection(
    apiKey: string,
    completion: ValidationCompletion,
  ): Promise<void> {
    return this.testGenerationConnection(apiKey, completion);
  }
}
