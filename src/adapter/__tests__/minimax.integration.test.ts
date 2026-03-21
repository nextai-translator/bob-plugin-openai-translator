import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load API key from env file
function loadApiKey(): string {
  try {
    const envPath = resolve(process.env.HOME || '', 'github_pr/.env.local');
    const content = readFileSync(envPath, 'utf-8');
    const match = content.match(/MINIMAX_API_KEY=(.+)/);
    return match?.[1]?.trim() || '';
  } catch {
    return process.env.MINIMAX_API_KEY || '';
  }
}

const MINIMAX_API_KEY = loadApiKey();
const SKIP = !MINIMAX_API_KEY;

// @ts-expect-error - Bun supports describe with options
describe('MiniMax API integration', { timeout: 30000 }, () => {
  it.skipIf(SKIP)(
    'should complete a translation request via Chat Completions API',
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
            model: 'MiniMax-M2.7',
            messages: [
              {
                role: 'system',
                content:
                  'You are a translation engine. Translate the user text to Chinese. Output the translation only.',
              },
              { role: 'user', content: 'Hello, world!' },
            ],
            temperature: 0.2,
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
      // Should contain Chinese characters
      expect(/[\u4e00-\u9fff]/.test(content)).toBe(true);
    },
  );

  it.skipIf(SKIP)(
    'should complete a streaming request via Chat Completions API',
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
            temperature: 0.5,
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
      const decoder = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const parsed = JSON.parse(line.slice(6)) as {
                choices: Array<{
                  delta?: { content?: string };
                }>;
              };
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) fullText += delta;
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      expect(fullText.length).toBeGreaterThan(0);
    },
  );

  it.skipIf(SKIP)(
    'should validate API connection with a test request',
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
            model: 'MiniMax-M2.7',
            messages: [
              { role: 'user', content: "Test connectivity. Reply with 'OK'." },
            ],
            max_tokens: 10,
            temperature: 1.0,
          }),
        },
      );

      expect(response.ok).toBe(true);
      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      expect(data.choices).toBeDefined();
      expect(data.choices[0].message.content).toBeTruthy();
    },
  );
});
