import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type {
  HttpResponse,
  Signal,
  TextTranslateQuery,
  TextTranslateResult,
  ValidationCompletion,
} from '@bob-translate/types';
import { AnthropicAdapter } from '../anthropic';
import { AzureOpenAiAdapter } from '../azure-openai';
import { GeminiAdapter } from '../gemini';
import { getServiceAdapter } from '../index';
import { MiniMaxAdapter } from '../minimax';
import { OpenAiAdapter } from '../openai';
import { createTestConfig } from './fixtures';

type RequestConfig = Parameters<(typeof $http)['request']>[0];
type StreamRequestConfig = Parameters<(typeof $http)['streamRequest']>[0];

let requestHandler: (config: RequestConfig) => Promise<HttpResponse>;
let streamHandler: (config: StreamRequestConfig) => void;

const request = mock((config: RequestConfig) => requestHandler(config));
const streamRequest = mock((config: StreamRequestConfig) =>
  streamHandler(config),
);
Object.assign(globalThis, {
  $http: { request, streamRequest },
});

const successResponse = (data: unknown = {}): HttpResponse =>
  ({
    data,
    rawData: {},
    response: { statusCode: 200, headers: {} },
  }) as unknown as HttpResponse;

const streamCompletionResponse = (
  statusCode = 200,
  error?: NonNullable<HttpResponse['error']>,
): HttpResponse =>
  ({
    ...(error ? { error } : {}),
    response: { statusCode, headers: {} },
  }) as unknown as HttpResponse;

// Transport tests stream untagged text, which the default prompt's result
// extraction would hold back until completion.
const UNTAGGED_PROMPT = 'Translate $sourceTag.';

const createAdapter = (
  stream: boolean,
  customSystemPrompt = '',
): OpenAiAdapter =>
  new OpenAiAdapter(
    createTestConfig({
      customSystemPrompt,
      stream: stream ? 'enable' : 'disable',
    }),
  );

const createQuery = () => {
  const onCompletion = mock(
    (_result: Parameters<TextTranslateQuery['onCompletion']>[0]) => {},
  );
  const onStream = mock(
    (_result: Parameters<TextTranslateQuery['onStream']>[0]) => {},
  );
  const cancelSignal = { id: 'cancel-signal' } as unknown as Signal;
  const query = {
    cancelSignal,
    detectFrom: 'en',
    detectTo: 'zh-Hans',
    from: 'en',
    onCompletion,
    onStream,
    text: 'Hello',
    to: 'zh-Hans',
  } satisfies TextTranslateQuery;
  return { cancelSignal, onCompletion, onStream, query };
};

describe('shared transport', () => {
  beforeEach(() => {
    request.mockClear();
    streamRequest.mockClear();
    requestHandler = async () =>
      successResponse({
        output: [
          { type: 'message', content: [{ type: 'output_text', text: '你好' }] },
        ],
      });
    streamHandler = (config) => {
      config.handler?.(streamCompletionResponse());
    };
  });

  it('passes Bob cancellation to non-streaming requests', async () => {
    const { cancelSignal, onCompletion, query } = createQuery();
    let captured: RequestConfig | undefined;
    requestHandler = async (config) => {
      captured = config;
      return successResponse({
        output: [
          { type: 'message', content: [{ type: 'output_text', text: '你好' }] },
        ],
      });
    };

    await createAdapter(false).translate(query, 'key');

    expect(captured?.cancelSignal).toBe(cancelSignal);
    expect(onCompletion).toHaveBeenCalledTimes(1);
    expect(onCompletion.mock.calls[0][0]).toEqual({
      result: {
        content: { format: 'markdown', text: '你好' },
        from: 'en',
        to: 'zh-Hans',
        toParagraphs: ['你好'],
      },
    });
  });

  it('waits for Bob callback completion and parses arbitrary SSE chunks once', async () => {
    const { cancelSignal, onCompletion, onStream, query } = createQuery();
    let captured: StreamRequestConfig | undefined;
    streamHandler = (config) => {
      captured = config;
      queueMicrotask(() => {
        config.streamHandler?.({
          text: 'event: response.output_text.delta\ndata: {"type":"response.output_',
          rawData: {} as never,
        });
        config.streamHandler?.({
          text: 'text.delta","delta":"Invalid token is text"}\n\n',
          rawData: {} as never,
        });
        config.streamHandler?.({
          text: 'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n',
          rawData: {} as never,
        });
        config.handler?.(streamCompletionResponse());
        config.handler?.(streamCompletionResponse());
      });
    };

    await createAdapter(true, UNTAGGED_PROMPT).translate(query, 'key');

    expect(captured?.cancelSignal).toBe(cancelSignal);
    expect(onStream).toHaveBeenCalledTimes(1);
    expect(onCompletion).toHaveBeenCalledTimes(1);
    expect(onCompletion.mock.calls[0][0]).toEqual({
      result: {
        content: { format: 'markdown', text: 'Invalid token is text' },
        from: 'en',
        to: 'zh-Hans',
        toParagraphs: ['Invalid token is text'],
      },
    });
  });

  it('streams only the text inside result tags, hiding text before them', async () => {
    const { onCompletion, onStream, query } = createQuery();
    const delta = (text: string) =>
      `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n\n`;
    streamHandler = (config) => {
      config.streamHandler?.({
        text:
          delta('Note: kept names.\n') +
          delta('<res') +
          delta('ult>\n你') +
          delta('好</re') +
          delta('sult>') +
          'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n',
        rawData: {} as never,
      });
      config.handler?.(streamCompletionResponse());
    };

    await createAdapter(true).translate(query, 'key');

    expect(
      onStream.mock.calls.map(
        ([update]) => (update.result as TextTranslateResult).toParagraphs,
      ),
    ).toEqual([['你'], ['你好'], ['你好']]);
    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      result: { toParagraphs: ['你好'] },
    });
  });

  it('shows result tags as text when the custom prompt does not ask for them', async () => {
    const { onCompletion, query } = createQuery();
    const reply = 'Keep <result>x</result> here.';
    requestHandler = async () =>
      successResponse({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: reply }],
          },
        ],
      });

    await new OpenAiAdapter(
      createTestConfig({
        customSystemPrompt: 'Return the XML for $sourceTag.',
        stream: 'disable',
      }),
    ).translate(query, 'key');

    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      result: { toParagraphs: [reply] },
    });
  });

  it('rejects truncated Responses streams without a completed event', async () => {
    const { onCompletion, onStream, query } = createQuery();
    streamHandler = (config) => {
      config.streamHandler?.({
        text: 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n',
        rawData: {} as never,
      });
      config.handler?.(streamCompletionResponse());
    };

    await createAdapter(true, UNTAGGED_PROMPT).translate(query, 'key');

    expect(onStream).toHaveBeenCalledTimes(1);
    expect(onCompletion).toHaveBeenCalledTimes(1);
    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      error: { type: 'api', message: 'API 流式响应未正常完成' },
    });
  });

  it('turns top-level Responses errors into one failed completion', async () => {
    const { onCompletion, query } = createQuery();
    streamHandler = (config) => {
      config.streamHandler?.({
        text: 'event: error\ndata: {"type":"error","code":"invalid_api_key","message":"bad key"}\n\n',
        rawData: {} as never,
      });
      config.handler?.(streamCompletionResponse());
    };

    await createAdapter(true).translate(query, 'key');

    expect(onCompletion).toHaveBeenCalledTimes(1);
    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      error: { type: 'secretKey', message: 'bad key' },
    });
  });

  it('rejects failed Responses streams after partial output', async () => {
    const { onCompletion, onStream, query } = createQuery();
    streamHandler = (config) => {
      config.streamHandler?.({
        text: 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n',
        rawData: {} as never,
      });
      config.streamHandler?.({
        text: 'event: response.failed\ndata: {"type":"response.failed","response":{"status":"failed","error":{"code":"server_error","message":"provider failed"}}}\n\n',
        rawData: {} as never,
      });
      config.handler?.(streamCompletionResponse());
    };

    await createAdapter(true, UNTAGGED_PROMPT).translate(query, 'key');

    expect(onStream).toHaveBeenCalledTimes(1);
    expect(onCompletion).toHaveBeenCalledTimes(1);
    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      error: { type: 'api', message: 'provider failed' },
    });
  });

  it('rejects malformed SSE instead of returning an empty success', async () => {
    const { onCompletion, query } = createQuery();
    streamHandler = (config) => {
      config.streamHandler?.({
        text: 'data: not-json\n\n',
        rawData: {} as never,
      });
      config.handler?.(streamCompletionResponse());
    };

    await createAdapter(true).translate(query, 'key');

    expect(onCompletion).toHaveBeenCalledTimes(1);
    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      error: { type: 'api', message: '流式响应格式无效' },
    });
  });

  it('ignores SSE extension fields and invalid retry values', async () => {
    const { onCompletion, query } = createQuery();
    streamHandler = (config) => {
      config.streamHandler?.({
        text: [
          'x-vendor: trace',
          'retry: later',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"translated"}',
          '',
          'event: response.completed',
          'data: {"type":"response.completed","response":{"status":"completed"}}',
          '',
          '',
        ].join('\n'),
        rawData: {} as never,
      });
      config.handler?.(streamCompletionResponse());
    };

    await createAdapter(true).translate(query, 'key');

    expect(onCompletion).toHaveBeenCalledTimes(1);
    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      result: { toParagraphs: ['translated'] },
    });
  });

  it('rejects an SSE buffer larger than 1 MiB', async () => {
    const { onCompletion, query } = createQuery();
    streamHandler = (config) => {
      config.streamHandler?.({
        text: `data: ${'x'.repeat(1024 * 1024)}`,
        rawData: {} as never,
      });
      config.handler?.(streamCompletionResponse());
    };

    await createAdapter(true).translate(query, 'key');

    expect(onCompletion).toHaveBeenCalledTimes(1);
    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      error: { type: 'api', message: '流式响应格式无效' },
    });
  });

  it('parses Anthropic, Gemini, and MiniMax stream event shapes', async () => {
    const cases = [
      {
        adapter: new AnthropicAdapter(
          createTestConfig({ model: 'claude-haiku-5-5' }),
        ),
        event:
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}\n\n' +
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Claude"}}\n\n' +
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n' +
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        expected: 'Claude',
      },
      {
        adapter: new GeminiAdapter(
          createTestConfig({
            model: 'gemini-4-hydrogen',
          }),
        ),
        event:
          'data: {"candidates":[{"content":{"parts":[{"text":"Gemini"}]},"finishReason":"STOP"}]}\n\n',
        expected: 'Gemini',
      },
      {
        adapter: new MiniMaxAdapter(
          createTestConfig({
            model: 'MiniMax-M3',
          }),
        ),
        event: 'data: {"choices":[{"delta":{"content":"MiniMax"}}]}\n\n',
        expected: 'MiniMax',
      },
    ];

    for (const { adapter, event, expected } of cases) {
      const { onCompletion, query } = createQuery();
      streamHandler = (config) => {
        config.streamHandler?.({
          text: event,
          rawData: {} as never,
        });
        config.handler?.(streamCompletionResponse());
      };

      await adapter.translate(query, 'key');

      expect(onCompletion).toHaveBeenCalledTimes(1);
      expect(onCompletion.mock.calls[0][0]).toMatchObject({
        result: { toParagraphs: [expected] },
      });
    }
  });

  it('appends MiniMax stream fragments that repeat earlier text', async () => {
    const { onCompletion, onStream, query } = createQuery();
    let captured: StreamRequestConfig | undefined;
    streamHandler = (config) => {
      captured = config;
      config.streamHandler?.({
        text: 'data: {"choices":[{"delta":{"content":"哈"}}]}\n\n',
        rawData: {} as never,
      });
      config.streamHandler?.({
        text: 'data: {"choices":[{"delta":{"content":"哈"}}]}\n\n',
        rawData: {} as never,
      });
      config.handler?.(streamCompletionResponse());
    };

    const adapter = getServiceAdapter(
      createTestConfig({
        apiUrl: 'https://api.minimaxi.com/v1/chat/completions',
        customSystemPrompt: UNTAGGED_PROMPT,
        model: 'MiniMax-M3',
      }),
    );
    await adapter.translate(query, 'key');

    expect(adapter).toBeInstanceOf(MiniMaxAdapter);
    expect(captured?.body).toMatchObject({ reasoning_split: true });
    expect(onStream).toHaveBeenCalledTimes(2);
    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      result: { toParagraphs: ['哈哈'] },
    });
  });

  it('uses a streaming HTTP error body when Bob omits response data', async () => {
    const { onCompletion, query } = createQuery();
    streamHandler = (config) => {
      config.streamHandler?.({
        text: '{"error":{"message":"bad key","type":"authentication_error"}}',
        rawData: {} as never,
      });
      config.handler?.(streamCompletionResponse(401));
    };

    await createAdapter(true).translate(query, 'key');

    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      error: { type: 'secretKey', message: 'bad key' },
    });
  });

  it('reports Anthropic errors and truncation that arrive after HTTP 200', async () => {
    const cases = [
      {
        events:
          'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n',
        error: { type: 'api', message: 'Overloaded' },
      },
      {
        events:
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Par"}}\n\n' +
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n\n' +
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        error: { type: 'api', message: 'API 响应未完成：max_tokens' },
      },
      {
        events:
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Par"}}\n\n',
        error: { type: 'api', message: 'API 流式响应未正常完成' },
      },
    ];

    for (const { events, error } of cases) {
      const { onCompletion, query } = createQuery();
      streamHandler = (config) => {
        config.streamHandler?.({ text: events, rawData: {} as never });
        config.handler?.(streamCompletionResponse());
      };

      await new AnthropicAdapter(
        createTestConfig({ model: 'claude-haiku-5-5' }),
      ).translate(query, 'key');

      expect(onCompletion).toHaveBeenCalledTimes(1);
      expect(onCompletion.mock.calls[0][0]).toMatchObject({ error });
    }
  });

  it('maps an Anthropic streaming HTTP error body', async () => {
    const { onCompletion, query } = createQuery();
    streamHandler = (config) => {
      config.streamHandler?.({
        text: '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"req_1"}',
        rawData: {} as never,
      });
      config.handler?.(streamCompletionResponse(401));
    };

    await new AnthropicAdapter(
      createTestConfig({ model: 'claude-haiku-5-5' }),
    ).translate(query, 'key');

    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      error: { type: 'secretKey', message: 'invalid x-api-key' },
    });
  });

  it('shows a non-JSON streaming HTTP error body but not an HTML page', async () => {
    const cases = [
      {
        body: 'upstream connect error\n',
        message: 'HTTP 502: upstream connect error',
      },
      { body: '<html><body>Bad Gateway</body></html>', message: 'HTTP 502' },
    ];

    for (const { body, message } of cases) {
      const { onCompletion, query } = createQuery();
      streamHandler = (config) => {
        config.streamHandler?.({ text: body, rawData: {} as never });
        config.handler?.(streamCompletionResponse(502));
      };

      await createAdapter(true).translate(query, 'key');

      expect(onCompletion.mock.calls[0][0]).toMatchObject({
        error: { type: 'api', message },
      });
    }
  });

  it('collects a streaming HTTP error body across chunks', async () => {
    const { onCompletion, query } = createQuery();
    streamHandler = (config) => {
      config.streamHandler?.({
        text: ' {"error":{"message":"bad ',
        rawData: {} as never,
      });
      config.streamHandler?.({
        text: 'key","type":"authentication_error"}}',
        rawData: {} as never,
      });
      config.handler?.(streamCompletionResponse(401));
    };

    await createAdapter(true).translate(query, 'key');

    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      error: { type: 'secretKey', message: 'bad key' },
    });
  });

  it('preserves Bob streaming network messages', async () => {
    const { onCompletion, query } = createQuery();
    streamHandler = (config) => {
      config.handler?.(
        streamCompletionResponse(0, {
          message: 'The Internet connection appears to be offline.',
          debugMessage: 'NSURLErrorNotConnectedToInternet',
        }),
      );
    };

    await createAdapter(true).translate(query, 'key');

    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      error: {
        type: 'network',
        message: 'The Internet connection appears to be offline.',
      },
    });
  });

  it('preserves legacy Bob network messages for regular requests', async () => {
    const { onCompletion, query } = createQuery();
    requestHandler = async () =>
      ({
        ...successResponse(),
        error: {
          code: -1009,
          domain: 'NSURLErrorDomain',
          localizedDescription:
            'The Internet connection appears to be offline.',
          localizedFailureReason: '',
          localizedRecoverySuggestion: '',
          userInfo: {},
        },
      }) as HttpResponse;

    await createAdapter(false).translate(query, 'key');

    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      error: {
        type: 'network',
        message: 'The Internet connection appears to be offline.',
      },
    });
  });

  it('maps rejected regular requests to network errors', async () => {
    const { onCompletion, query } = createQuery();
    requestHandler = async () => {
      throw new Error('Connection reset');
    };

    await createAdapter(false).translate(query, 'key');

    expect(onCompletion).toHaveBeenCalledTimes(1);
    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      error: { type: 'network', message: 'Connection reset' },
    });
  });

  it('completes when starting the streaming request throws', async () => {
    const { onCompletion, query } = createQuery();
    streamHandler = () => {
      throw new Error('connection lost');
    };

    await createAdapter(true).translate(query, 'key');

    expect(onCompletion).toHaveBeenCalledTimes(1);
    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      error: { type: 'network', message: 'connection lost' },
    });
  });

  it('maps Gemini stream authentication errors', async () => {
    const { onCompletion, query } = createQuery();
    streamHandler = (config) => {
      config.streamHandler?.({
        text: 'data: {"error":{"status":"PERMISSION_DENIED","message":"API key invalid"}}\n\n',
        rawData: {} as never,
      });
      config.handler?.(streamCompletionResponse());
    };
    const adapter = new GeminiAdapter(
      createTestConfig({
        model: 'gemini-4-hydrogen',
      }),
    );

    await adapter.translate(query, 'key');

    expect(onCompletion).toHaveBeenCalledTimes(1);
    expect(onCompletion.mock.calls[0][0]).toMatchObject({
      error: { type: 'secretKey', message: 'API key invalid' },
    });
  });
});

describe('connection validation', () => {
  const validationCases = [
    {
      create: () => createAdapter(false),
      validResponse: { object: 'list', data: [] },
    },
    {
      create: () =>
        new OpenAiAdapter(
          createTestConfig({
            apiUrl: 'https://gateway.example/v1/responses',
            stream: 'disable',
          }),
        ),
      validResponse: {
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'OK' }] },
        ],
      },
    },
    {
      create: () =>
        new AzureOpenAiAdapter(
          createTestConfig({
            apiUrl: 'https://resource.openai.azure.com/openai/v1/responses',
            customModel: 'deployment',
            model: 'custom',
            stream: 'disable',
          }),
        ),
      validResponse: {
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'OK' }] },
        ],
      },
    },
    {
      create: () =>
        new GeminiAdapter(
          createTestConfig({
            model: 'gemini-4-hydrogen',
            stream: 'disable',
          }),
        ),
      validResponse: { models: [] },
    },
    {
      create: () =>
        new GeminiAdapter(
          createTestConfig({
            apiUrl: 'https://gateway.example/v1beta/models',
            model: 'gemini-4-hydrogen',
          }),
        ),
      validResponse: {
        candidates: [{ content: { parts: [{ text: 'OK' }] } }],
      },
    },
    {
      create: () =>
        new MiniMaxAdapter(
          createTestConfig({
            model: 'MiniMax-M3',
            stream: 'disable',
          }),
        ),
      validResponse: {
        choices: [{ message: { content: 'OK' } }],
      },
    },
    {
      create: () =>
        new AnthropicAdapter(createTestConfig({ model: 'claude-haiku-5-5' })),
      validResponse: { type: 'message', content: [] },
    },
  ];

  beforeEach(() => {
    request.mockClear();
    requestHandler = async () => successResponse({});
  });

  it('always reports unexpected successful responses as validation failures', async () => {
    for (const { create } of validationCases) {
      const completion = mock(
        (_result: Parameters<ValidationCompletion>[0]) => {},
      );
      const adapter = create();
      await adapter.testApiConnection('key', completion);
      expect(completion).toHaveBeenCalledTimes(1);
      expect(completion.mock.calls[0][0]).toMatchObject({ result: false });
    }
  });

  it('accepts each provider validation response contract', async () => {
    for (const { create, validResponse } of validationCases) {
      requestHandler = async () => successResponse(validResponse);
      const completion = mock(
        (_result: Parameters<ValidationCompletion>[0]) => {},
      );
      const adapter = create();

      await adapter.testApiConnection('key', completion);

      expect(completion).toHaveBeenCalledTimes(1);
      expect(completion.mock.calls[0][0]).toEqual({ result: true });
    }
  });

  it('invokes validation completion once when the callback throws', async () => {
    requestHandler = async () => successResponse({ object: 'list', data: [] });
    const completion = mock(() => {
      throw new Error('callback failed');
    });

    await createAdapter(false).testApiConnection('key', completion);

    expect(completion).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty MiniMax generation response', async () => {
    requestHandler = async () => successResponse({ choices: [] });
    const completion = mock(
      (_result: Parameters<ValidationCompletion>[0]) => {},
    );
    const adapter = new MiniMaxAdapter(
      createTestConfig({ model: 'MiniMax-M3', stream: 'disable' }),
    );

    await adapter.testApiConnection('key', completion);

    expect(completion).toHaveBeenCalledTimes(1);
    expect(completion.mock.calls[0][0]).toMatchObject({ result: false });
  });

  it('sends the verified MiniMax validation request', async () => {
    let captured: RequestConfig | undefined;
    requestHandler = async (config) => {
      captured = config;
      return successResponse({
        choices: [{ message: { content: 'OK' } }],
      });
    };
    const completion = mock(
      (_result: Parameters<ValidationCompletion>[0]) => {},
    );
    const adapter = new MiniMaxAdapter(
      createTestConfig({
        model: 'MiniMax-M3',
        reasoningMode: 'disable',
        stream: 'disable',
      }),
    );

    await adapter.testApiConnection('key', completion);

    expect(captured).toMatchObject({
      method: 'POST',
      url: 'https://api.minimax.io/v1/chat/completions',
      header: {
        Authorization: 'Bearer key',
        'Content-Type': 'application/json',
      },
      body: {
        model: 'MiniMax-M3',
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        max_completion_tokens: 8,
        reasoning_split: true,
        stream: false,
        thinking: { type: 'disabled' },
      },
    });
    expect(completion).toHaveBeenCalledTimes(1);
    expect(completion.mock.calls[0][0]).toEqual({ result: true });
  });

  it('validates M3.1 Flash at low effort without an output cap because thinking cannot be disabled', async () => {
    let captured: RequestConfig | undefined;
    requestHandler = async (config) => {
      captured = config;
      return successResponse({
        choices: [{ message: { content: 'OK' } }],
      });
    };
    const completion = mock(
      (_result: Parameters<ValidationCompletion>[0]) => {},
    );
    const adapter = new MiniMaxAdapter(
      createTestConfig({
        model: 'MiniMax-M3.1-Flash',
        reasoningMode: 'disable',
        stream: 'disable',
      }),
    );

    await adapter.testApiConnection('key', completion);

    expect(captured?.body).toEqual({
      model: 'MiniMax-M3.1-Flash',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      reasoning_effort: 'low',
      reasoning_split: true,
      stream: false,
    });
    expect(completion).toHaveBeenCalledTimes(1);
    expect(completion.mock.calls[0][0]).toEqual({ result: true });
  });
});
