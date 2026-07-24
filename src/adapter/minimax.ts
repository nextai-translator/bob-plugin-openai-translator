import type {
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';
import type { EventSourceMessage } from 'eventsource-parser';
import { resolveModelControls } from '../utils/model-capabilities';
import { OpenAiAdapter } from './openai';

export class MiniMaxAdapter extends OpenAiAdapter {
  private streamedText = '';

  protected override extractStreamDelta(
    data: Record<string, unknown>,
    event: EventSourceMessage,
  ): string | null {
    const content = super.extractStreamDelta(data, event);
    if (!content) return null;

    const isCumulative = content.startsWith(this.streamedText);
    const delta = isCumulative
      ? content.slice(this.streamedText.length)
      : content;
    this.streamedText = isCumulative ? content : this.streamedText + content;
    return delta || null;
  }

  public override buildRequestBody(
    query: TextTranslateQuery,
  ): Record<string, unknown> {
    this.streamedText = '';
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

  protected override completeWithText(
    query: TextTranslateQuery,
    text: string,
  ): void {
    super.completeWithText(query, this.stripThinkTags(text));
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

  private stripThinkTags(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
  }
}
