import type {
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';
import { resolveModelControls } from '../utils/model-capabilities';
import { OpenAiAdapter } from './openai';

export class MiniMaxAdapter extends OpenAiAdapter {
  public override buildRequestBody(
    query: TextTranslateQuery,
  ): Record<string, unknown> {
    const body = super.buildRequestBody(query);
    body.reasoning_split = true;
    const controls = resolveModelControls(
      this.config.provider,
      this.config.model,
      this.config.reasoningMode,
    );
    if (controls.miniMaxThinking) {
      body.thinking = { type: controls.miniMaxThinking };
    }
    return body;
  }

  public override testApiConnection(
    apiKey: string,
    completion: ValidationCompletion,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      reasoning_split: true,
      stream: false,
    };
    const controls = resolveModelControls(
      this.config.provider,
      this.config.model,
      'disable',
    );
    if (controls.miniMaxThinking) {
      body.max_completion_tokens = 8;
      body.thinking = { type: controls.miniMaxThinking };
    }
    if (controls.openAiReasoningEffort) {
      body.reasoning_effort = controls.openAiReasoningEffort;
    }

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
}
