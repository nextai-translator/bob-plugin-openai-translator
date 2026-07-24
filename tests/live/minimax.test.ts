import { describe, expect, it, setDefaultTimeout } from 'bun:test';
import { createParser } from 'eventsource-parser';

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const SKIP = process.env.RUN_LIVE_TESTS !== '1' || !MINIMAX_API_KEY;

setDefaultTimeout(30_000);

describe('MiniMax live API', () => {
  it.skipIf(SKIP)(
    'completes a translation request via Chat Completions API',
    async () => {
      const response = await fetch(
        'https://api.minimax.io/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${MINIMAX_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'MiniMax-M3',
            messages: [
              {
                role: 'system',
                content:
                  'You are a translation engine. Translate the user text to Chinese. Output the translation only.',
              },
              { role: 'user', content: 'Hello, world!' },
            ],
            reasoning_split: true,
            stream: false,
          }),
        },
      );

      expect(response.ok).toBe(true);
      const data = (await response.json()) as {
        choices: Array<{
          message: { content: string };
        }>;
      };
      expect(data.choices).toBeDefined();
      expect(data.choices.length).toBeGreaterThan(0);
      const content = data.choices[0].message.content;
      expect(content).toBeTruthy();
      expect(/[\u4e00-\u9fff]/.test(content)).toBe(true);
    },
  );

  it.skipIf(SKIP)(
    'completes a streaming request via Chat Completions API',
    async () => {
      const response = await fetch(
        'https://api.minimax.io/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${MINIMAX_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'MiniMax-M2.7-highspeed',
            messages: [
              {
                role: 'system',
                content:
                  'You are a translation engine. Translate to English. Output only the translation.',
              },
              { role: 'user', content: '你好世界' },
            ],
            reasoning_split: true,
            stream: true,
          }),
        },
      );

      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toContain(
        'text/event-stream',
      );

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      let fullText = '';
      const parser = createParser({
        onEvent: (event) => {
          if (!event.data || event.data === '[DONE]') return;
          const parsed = JSON.parse(event.data) as {
            choices: Array<{
              delta?: { content?: string };
            }>;
          };
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText = content.startsWith(fullText)
              ? content
              : fullText + content;
          }
        },
      });
      const decoder = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
      parser.reset({ consume: true });

      expect(fullText.length).toBeGreaterThan(0);
    },
  );
});
