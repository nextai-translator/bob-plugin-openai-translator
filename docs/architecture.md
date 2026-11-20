# Architecture

Last verified: 2026-11-20.

## Runtime boundary

Bob runs plugins in JavaScriptCore, not Node.js or a browser. Runtime code may use JavaScript built-ins, Bob APIs, and bundled pure JavaScript only. The build produces one CommonJS `main.js`; Node.js is limited to build and test scripts.

The runtime path is intentionally small:

```text
$option
  -> parseOptions()
  -> resolveModelControls()
  -> provider codec
  -> shared $http transport
  -> Bob stream/completion callbacks
```

- `src/main.ts` is the Bob entry point.
- `src/config.ts` parses and freezes one configuration object, derives the provider, and rejects invalid complete API URLs.
- `src/utils/model-capabilities.ts` owns the curated model catalog and model-specific reasoning mappings.
- `src/adapter/*.ts` owns provider URL, authentication, wire request, wire response, validation, and stream event shapes.
- `src/adapter/base.ts` owns cancellation, network lifecycle, and stream completion.
- `src/utils/sse.ts` owns bounded SSE parsing independently of provider capability rules.

Adapters never read `$option`. Provider codecs receive a validated configuration and do not know how Bob stores options.

## Configuration contract

Bob's public option schema provides static `text` and `menu` fields. It does not expose a documented conditional-field mechanism. The plugin therefore keeps the common path short instead of exposing every internal adapter choice.

The current configuration uses these decisions:

- The default OpenAI path parses and runs when Bob supplies only an API Key. Runtime defaults cover model, streaming, and reasoning.
- Provider is derived rather than user-selected. With no API URL, the model selects the official Anthropic, Gemini, MiniMax, or OpenAI adapter. With an API URL, the ending selects the wire format: `/messages` uses the Anthropic adapter and `/models` the Gemini adapter. For the two OpenAI endings, Azure hosts and `/openai/deployments/` paths select Azure OpenAI, official MiniMax hosts select the MiniMax request contract, and other URLs use the OpenAI-compatible adapter.
- API URL is optional. Its ending (`/chat/completions`, `/messages`, `/models`, or `/responses`) selects the protocol and its authentication header without separate Base URL, path, or protocol fields. A Gemini URL stops at `/models` because the model and operation are path segments the adapter appends.
- Temperature is absent from the UI and every request. Provider defaults avoid invalid parameters as model sampling contracts evolve.
- Reasoning has two choices. Default sends no control. Disable maps to the lowest verified model-specific setting; models without a verified mapping receive no control.
- The System Prompt is the only editable prompt and supports `$sourceLang`, `$sourceTag`, and `$targetLang`. The Claude and OpenAI prompting guides place rules in the system or developer message and the input in the user message; the Gemini guide also accepts rules at the start of the user prompt. Having no editable user prompt is a product choice: a second static template adds a setting, and editing it can drop the source tags.
- The source is always sent as the user message inside a tag generated at random for each request, such as `<source_text_k3x9ab>`, so source text that mentions the tag cannot close it. `$sourceTag` expands to that tag, and the default system prompt names it as the text to work on and states why: the source is content, not a message to the model. A bare source as the whole user turn reads as a request when it ends in a question or instruction, and a prohibition alone does not reliably keep a model from answering it. The same three guides recommend delimiters to separate instructions from supplied content. The default prompt carries no examples or emphatic wording, so it stays independent of language pair and model family.
- Menu values are case-insensitively sorted by `value`; the `custom` model entry is the only fixed first item.

## Provider contracts

| Provider | Protocol | Authentication | Validation |
| --- | --- | --- | --- |
| Anthropic | Messages | `x-api-key` header | Minimal generation request |
| Azure OpenAI | Responses or Chat Completions | `api-key` header | Minimal generation request |
| Gemini | GenerateContent | `x-goog-api-key` header | Model listing; minimal generation request for a configured URL |
| MiniMax | Chat Completions | Bearer token | Minimal generation request |
| OpenAI | Responses | Bearer token | `GET /v1/models` |
| OpenAI Compatible | Responses or Chat Completions | Bearer token | Minimal generation request |

Provider dispatch is an exhaustive TypeScript switch. A new wire provider requires one union member, one provider definition, one codec, a derivation rule, and contract tests. No user-facing provider menu, dependency-injection container, or secondary class hierarchy is needed.

## Model controls

`resolveModelControls(provider, model, mode)` is the only runtime capability resolver.

Default always omits the provider control.

Only model IDs with a current provider contract receive a control. The Anthropic and Gemini adapters ignore a `vendor/` namespace before the ID, because a gateway that speaks the native format serves the same model; OpenAI-compatible gateways define their own reasoning parameters, so their IDs must match exactly.

| Model ID | Disable |
| --- | --- |
| `claude-fable-5-2`, `claude-opus-5-5` | effort `low` |
| `claude-haiku-5-5` | thinking `disabled` |
| `claude-sonnet-5-5` | thinking `between_tools` |
| `gemini-3-flash-preview`, `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-3.6-flash` | thinking level `minimal` |
| `gemini-3.1-pro-preview`, `gemini-3.8-flash`, `gemini-4-argon`, `gemini-4-carbon`, `gemini-4-hydrogen`, `gemini-4-neon` | thinking level `low` |
| `gpt-5` | effort `minimal` |
| `gpt-5.3-codex`, `gpt-6.2-astra`, `gpt-6.2-sol` | effort `low` |
| `gpt-5.4-mini`, `gpt-5.6`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-luna`, `gpt-6.1-terra` | effort `none` |
| `MiniMax-M3` | thinking `disabled` |
| `MiniMax-M3.1-Flash` | effort `low` |
| Any other ID | omitted |

The curated menu lists two models per provider: the most efficient current model and the next tier above it.

Request codecs translate the normalized result into `reasoning`, `reasoning_effort`, `thinkingConfig`, `thinking`, or `output_config`. Capability code does not construct transport payloads.

MiniMax requests set `reasoning_split` so reasoning arrives in a separate field and does not enter the translated text.

MiniMax validation disables thinking and limits output for M3. A model that cannot disable thinking is validated at its lowest effort without an output cap, because a short limit can end the response before translated content appears.

Anthropic Messages requires `max_tokens`, and thinking spends from the same budget, so the adapter sends one fixed cap below every current model's output limit. A response whose stop reason is anything other than `end_turn` or `stop_sequence` is an error rather than a partial translation, and a stream must end with `message_stop`. A Gemini stream must end with a `STOP` finish reason. Chat Completions (`length`, `content_filter`) and Gemini (any finish reason other than `STOP`) responses are checked the same way. Validation accepts any `message` object because default thinking can use the whole validation budget before text appears.

Gemini uses stateless `generateContent` and `streamGenerateContent` requests because each Bob translation is one independent generation. The Interactions API's stateful and agentic lifecycle is not needed here.

To add a curated model:

1. Add its ID and provider to `MODEL_CATALOG` in sorted order.
2. Add an exact capability entry only when current provider documentation verifies its parameter contract.
3. Add the same menu entry to `public/info.json`.
4. Add or update capability, provider-body, and metadata tests.

The metadata test fails if the menu and runtime catalog differ.

## Transport invariants

- Streaming and non-streaming requests both receive `query.cancelSignal`.
- Every translation calls `query.onCompletion` once.
- Result text reaches Bob unmodified, because leading indentation is Markdown syntax.
- Provider error events are parsed before text deltas.
- Invalid SSE is an API error, not an empty success.
- SSE buffering is limited to 1 MiB.
- Results carry `content` with the `markdown` format for Bob 1.21.0 and later, plus a one-element `toParagraphs` that earlier versions read as plain text.
- A streaming HTTP error whose body is not JSON reports the start of that body unless it is an HTML page.
- Validation completes on every success, error, and unexpected-response path.
- API keys and authorization headers are never logged.

`eventsource-parser` remains bundled because it correctly handles arbitrary chunk boundaries and multiline SSE without relying on browser APIs.

## Performance

`bun run benchmark` rebuilds the bundle, then reports absolute timings for capability resolution, adapter construction, request construction, and SSE parsing together with the current `dist/main.js` size. Each timing is the median of nine samples with 100,000 local operations.

The benchmark excludes network latency. Compare results only when the machine, Bun version, workload, and sampling method are the same; the repository does not claim a cross-version improvement without a freshly reproduced baseline.

## Release safety

Local packages append a lowercase development build suffix to the repository version only inside the generated archive. Bob ignores lower, equal, and extra-component versions during installation; `<current-version>dev<build>` is newer than the matching stable version and older than the next patch release.

Version metadata and its annotated tag are pushed atomically. A new GitHub release stays unpublished until its plugin asset uploads successfully. Reruns build from the tagged source: an unfinished draft asset may be replaced, while a published release is never modified and its existing asset supplies the Appcast hash.

The Appcast is committed only after the release asset is available. If the default branch advances before that commit is pushed, the push fails without moving the tag or replacing the published asset; rerunning the workflow rebuilds the Appcast from those canonical bytes.

## Comparable-project review

The review used current repository heads on 2026-07-23. No reviewed project had a complete model-capability matrix.

| Project | Adopted | Rejected |
| --- | --- | --- |
| [CaicoLeung/bob-plugin-ollama-translator at `1b08311`](https://github.com/CaicoLeung/bob-plugin-ollama-translator/tree/1b0831155aff5ab5faaeaae3e393a9f5cb1f61cf) | Small request bodies, shared streaming transport, bundled SSE parser | Unconstrained provider/model combinations and finish-reason-only completion |
| [kakehashi-inc/multi-ai-translator at `2385e3a`](https://github.com/kakehashi-inc/multi-ai-translator/tree/2385e3a5d7bc2f007d47f26e79f904869f5812cd) | Provider/dispatch responsibility boundary | Browser APIs, SDKs, `fetch`, and fixed cross-model generation parameters |
| [n-AChegYag/bob-plugin-grok-translator at `7a6d8a8`](https://github.com/n-AChegYag/bob-plugin-grok-translator/tree/7a6d8a8f6222c034b866e5ffdbc9eba2455ace46) | Provider-owned native wire shapes | Undocumented `dependsOn`, scattered provider switches, universal Temperature |
| [vitoegg/BobTranslate at `dc19ca7`](https://github.com/vitoegg/BobTranslate/tree/dc19ca7698d4d4035c527282db0348bebe5579e2) | Compact provider metadata and terminal stream handling | Separate plugin packages, unconditional reasoning/Temperature, duplicated model defaults |
| [wuzeyou/bob-plugin-zhipu-translator at `bc6a529`](https://github.com/wuzeyou/bob-plugin-zhipu-translator/tree/bc6a529558a43d7c2696403dc13f235df0d6a08f) | Provider-specific thinking enable/disable mapping | One global rule that assumes thinking always controls Temperature |

## Bob documentation coverage

The official sitemap and plugin sidebar exposed 29 `/plugin/` pages. All 29 were read on 2026-07-23.

| # | Official page | Application |
| ---: | --- | --- |
| 1 | [Develop plugins](https://bobtranslate.com/plugin/) | JavaScriptCore runtime boundary |
| 2 | [Create a plugin](https://bobtranslate.com/plugin/quickstart/create.html) | Required package files |
| 3 | [Configure info.json](https://bobtranslate.com/plugin/quickstart/info.html) | Static option schema and numeric text height |
| 4 | [Implement main.js](https://bobtranslate.com/plugin/quickstart/main.html) | Exported entry functions |
| 5 | [Text translation](https://bobtranslate.com/plugin/quickstart/translate.html) | Query, stream, completion, cancellation, validation, timeout |
| 6 | [OCR](https://bobtranslate.com/plugin/quickstart/ocr.html) | Reviewed; outside this translate plugin |
| 7 | [Text to speech](https://bobtranslate.com/plugin/quickstart/tts.html) | Reviewed; outside this translate plugin |
| 8 | [Debug plugins](https://bobtranslate.com/plugin/quickstart/debug.html) | Bob log and exported-log workflow |
| 9 | [Package plugins](https://bobtranslate.com/plugin/quickstart/pack.html) | Flat `.bobplugin` package layout |
| 10 | [Publish plugins](https://bobtranslate.com/plugin/quickstart/publish.html) | Appcast version, hash, URL, minimum Bob version |
| 11 | [API introduction](https://bobtranslate.com/plugin/api/intro.html) | Available Bob globals |
| 12 | [Modules](https://bobtranslate.com/plugin/api/module.html) | Simplified CommonJS, plugin-local modules only |
| 13 | [Built-in modules](https://bobtranslate.com/plugin/api/builtin.html) | No assumption of Node built-ins |
| 14 | [`$env`](https://bobtranslate.com/plugin/api/env.html) | Reviewed; no runtime need |
| 15 | [`$info`](https://bobtranslate.com/plugin/api/info.html) | Plugin metadata boundary |
| 16 | [`$option`](https://bobtranslate.com/plugin/api/option.html) | Flat string settings read once |
| 17 | [`$log`](https://bobtranslate.com/plugin/api/log.html) | Secret-safe logging boundary |
| 18 | [`$http`](https://bobtranslate.com/plugin/api/http.html) | JSON headers, stream/final handler shape, timeout, cancellation |
| 19 | [`$websocket`](https://bobtranslate.com/plugin/api/websocket.html) | Reviewed; SSE over `$http` is sufficient |
| 20 | [`$file`](https://bobtranslate.com/plugin/api/file.html) | Read-only plugin directory and sandbox scope |
| 21 | [`$data`](https://bobtranslate.com/plugin/api/data.html) | Raw stream data contract |
| 22 | [`$timer`](https://bobtranslate.com/plugin/api/timer.html) | Reviewed; no timer-based batching required |
| 23 | [`$signal`](https://bobtranslate.com/plugin/api/signal.html) | Cancellation signal contract |
| 24 | [Service error](https://bobtranslate.com/plugin/object/serviceerror.html) | Error type, message, addition, troubleshooting link |
| 25 | [Translate result](https://bobtranslate.com/plugin/object/translateresult.html) | `content` format, `toParagraphs` fallback, and optional Bob 1.15 reasoning display |
| 26 | [OCR result](https://bobtranslate.com/plugin/object/ocrresult.html) | Reviewed; outside this translate plugin |
| 27 | [TTS result](https://bobtranslate.com/plugin/object/ttsresult.html) | Reviewed; outside this translate plugin |
| 28 | [Built-in icons](https://bobtranslate.com/plugin/addition/icon.html) | Reviewed; repository icon retained |
| 29 | [Language codes](https://bobtranslate.com/plugin/addition/language.html) | Bob language IDs and supported-language list |

The linked [Bob 1.8 plugin changes](https://bobtranslate.com/blog/2023-05-18-180-plugin.html) were also reviewed for streaming and cancellation behavior, and [Bob 1.21 Markdown results](https://bobtranslate.com/blog/2026-09-21-markdown-plugin.html) for the `content` object.

The option model compiled into Bob 1.22.0 has the same fields as the documented schema: `text` and `menu` options, with no conditional or grouping field.

## Provider sources

- [Azure OpenAI Responses](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses)
- [Claude API errors](https://platform.claude.com/docs/en/api/errors)
- [Claude models](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Claude prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [Claude streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Claude thinking](https://platform.claude.com/docs/en/build-with-claude/thinking)
- [Cloudflare AI Gateway REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/)
- [Gemini models](https://aistudio.google.com/docs/models)
- [Gemini prompting strategies](https://aistudio.google.com/docs/prompting-strategies)
- [Gemini thinking](https://aistudio.google.com/docs/thinking.md?generate-content=true)
- [MiniMax China OpenAI-compatible API](https://platform.minimaxi.com/docs/api-reference/text-chat-openai)
- [MiniMax OpenAI-compatible API](https://platform.minimax.io/docs/api-reference/text-openai-api)
- [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations)
- [OpenAI models](https://developers.openai.com/api/docs/models)
- [OpenAI prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)
- [OpenAI reasoning](https://developers.openai.com/api/docs/guides/reasoning)
- [OpenAI Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [OpenRouter Quickstart](https://openrouter.ai/docs/quickstart)
- [Vercel AI Gateway Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/chat-completions)

## Rejected complexity

- Undocumented Bob option fields such as `dependsOn`
- A user-visible provider or API-protocol selector
- Separate API Base URL and API Path fields
- Provider SDKs, `fetch`, browser streams, or Node.js runtime modules. Bundled for a browser target, `@anthropic-ai/sdk`, `openai`, `@google/genai`, and `@ai-sdk/anthropic` each exceed 350 KB minified and fail in bare JavaScriptCore on missing `Headers`, `Response`, `ReadableStream`, or `TransformStream`
- Displaying model reasoning through `thinkInfo`, which adds a per-protocol delta codec without a translation use case
- A global Temperature override
- An editable user prompt. It could place instructions after the source, or carry them for a model that takes its instructions in the user message, such as Qwen-MT. Neither has a demonstrated need here, and the plugin always sends a system message
- A dependency-injection container or generic protocol framework
- Multiple separately published plugins solely to obtain provider-specific settings forms

## Manual Bob verification

Static checks cannot prove behavior inside the installed Bob host. Before release, install the package in Bob 1.8.0 and a current Bob version, confirm every option renders, validate one configured provider, and complete one streaming and one non-streaming translation without a runtime error.
