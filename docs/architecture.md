# Architecture

Last verified: 2026-07-23.

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
- `src/adapter/base.ts` owns cancellation, network lifecycle, and exactly-once completion.
- `src/utils/sse.ts` owns bounded SSE parsing independently of provider capability rules.

Adapters never read `$option`. Provider codecs receive a validated configuration and do not know how Bob stores options.

## Configuration contract

Bob's public option schema provides static `text` and `menu` fields. It does not expose a documented conditional-field mechanism. The plugin therefore keeps the common path short instead of exposing every internal adapter choice.

The current configuration uses these decisions:

- The default OpenAI path parses and runs when Bob supplies only an API Key. Runtime defaults cover model, streaming, and reasoning.
- Provider is derived rather than user-selected. With no API URL, the model selects the official OpenAI, Gemini, or MiniMax adapter. With an API URL, Azure hosts and paths select Azure OpenAI, verified MiniMax official hosts retain the MiniMax stream codec, and other URLs use the OpenAI-compatible adapter.
- API URL is optional and complete. The `/responses` or `/chat/completions` suffix selects the protocol without separate Base URL, path, or protocol fields.
- Temperature is absent from the UI and every request. Provider defaults avoid invalid parameters as model sampling contracts evolve.
- Reasoning has two choices. Default sends no control. Disable maps to the lowest verified model-specific setting; models without a verified mapping receive no control.
- Editable System Prompt and User Prompt defaults preserve their distinct roles: the system prompt defines purpose, while the user prompt shapes each input within that purpose. Both support `$text`, `$sourceLang`, and `$targetLang`.
- The default system prompt starts with the translation role and explicitly prevents instruction-like source text from becoming a command. The raw source remains a separate user message.
- Menu values are case-insensitively sorted by `value`; the `custom` model entry is the only fixed first item.

## Provider contracts

| Provider | Protocol | Authentication | Validation |
| --- | --- | --- | --- |
| Azure OpenAI | Responses or Chat Completions | `api-key` header | Minimal generation request |
| Gemini | GenerateContent | `x-goog-api-key` header | Model listing |
| MiniMax | Chat Completions | Bearer token | Minimal generation request |
| OpenAI | Responses | Bearer token | `GET /v1/models` |
| OpenAI Compatible | Responses or Chat Completions | Bearer token | Minimal generation request |

Provider dispatch is an exhaustive TypeScript switch. A new wire provider requires one union member, one provider definition, one codec, a derivation rule, and contract tests. No user-facing provider menu, dependency-injection container, or secondary class hierarchy is needed.

## Model controls

`resolveModelControls(provider, model, mode)` is the only runtime capability resolver.

Default always omits the provider control.

Only exact model IDs with a current provider contract receive a control:

| Model ID | Disable |
| --- | --- |
| `gemini-2.5-flash`, `gemini-2.5-flash-lite` | thinking budget `0` |
| `gemini-2.5-pro` | thinking budget `128` |
| `gemini-3-flash-preview`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.6-flash` | thinking level `minimal` |
| `gemini-3-pro-preview`, `gemini-3.1-pro-preview` | thinking level `low` |
| `gpt-5` | `minimal` |
| `gpt-5.3-codex` | `low` |
| `gpt-5.4-mini`, `gpt-5.6`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra` | `none` |
| `gpt-5-pro` | `high` |
| `MiniMax-M3` | thinking `disabled` |
| Any other ID | omitted |

Request codecs translate the normalized result into `reasoning`, `reasoning_effort`, `thinkingConfig`, or `thinking`. Capability code does not construct transport payloads.

MiniMax requests set `reasoning_split` so reasoning does not enter the translated text. Its documented cumulative stream content is converted back to deltas before Bob callbacks.

MiniMax validation disables thinking and limits output for M3. It does not cap M2.x output because those models cannot disable thinking, and a short limit can end the response before translated content appears.

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
- Provider error events are parsed before text deltas.
- Invalid SSE is an API error, not an empty success.
- SSE buffering is limited to 1 MiB.
- Non-streaming output is returned as one paragraph so Bob preserves model formatting and blank lines.
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
| 25 | [Translate result](https://bobtranslate.com/plugin/object/translateresult.html) | Paragraph preservation and optional Bob 1.15 reasoning display |
| 26 | [OCR result](https://bobtranslate.com/plugin/object/ocrresult.html) | Reviewed; outside this translate plugin |
| 27 | [TTS result](https://bobtranslate.com/plugin/object/ttsresult.html) | Reviewed; outside this translate plugin |
| 28 | [Built-in icons](https://bobtranslate.com/plugin/addition/icon.html) | Reviewed; repository icon retained |
| 29 | [Language codes](https://bobtranslate.com/plugin/addition/language.html) | Bob language IDs and supported-language list |

The linked [Bob 1.8 plugin changes](https://bobtranslate.com/blog/2023-05-18-180-plugin.html) were also reviewed for streaming and cancellation behavior.

## Provider sources

- [Azure OpenAI Responses](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses)
- [Cloudflare AI Gateway REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/)
- [Gemini API selection](https://ai.google.dev/api)
- [Gemini latest models and sampling changes](https://ai.google.dev/gemini-api/docs/generate-content/latest-model)
- [Gemini prompting strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)
- [Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking)
- [MiniMax China OpenAI-compatible API](https://platform.minimaxi.com/docs/api-reference/text-chat-openai)
- [MiniMax OpenAI-compatible API](https://platform.minimax.io/docs/api-reference/text-openai-api)
- [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)
- [OpenAI reasoning](https://developers.openai.com/api/docs/guides/reasoning)
- [OpenAI Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [OpenRouter Quickstart](https://openrouter.ai/docs/quickstart)
- [OrcaRouter](https://www.orcarouter.ai)
- [Vercel AI Gateway Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/chat-completions)

## Rejected complexity

- Undocumented Bob option fields such as `dependsOn`
- A user-visible provider or API-protocol selector
- Separate API Base URL and API Path fields
- Provider SDKs, `fetch`, browser streams, or Node.js runtime modules
- A global Temperature override
- A dependency-injection container or generic protocol framework
- Multiple separately published plugins solely to obtain provider-specific settings forms

## Manual Bob verification

Static checks cannot prove behavior inside the installed Bob host. Before release, install the package in Bob 1.8.0 and a current Bob version, confirm every option renders, validate one configured provider, and complete one streaming and one non-streaming translation without a runtime error.
