# Configuration Manual

Enter an API key to use the default OpenAI configuration: the default model, official API, streaming output, and model-default reasoning behavior.

## Quick start

1. Find OpenAI Translator in Bob's service settings.
2. Enter an OpenAI API key.
3. Save the configuration and translate.

For the official Claude, Gemini, or MiniMax API, select the corresponding model and enter that service's API key. For a third-party API service, enter the model and full API URL specified by the service.

## API key

Separate multiple keys with commas to select one randomly for each request.

A key is sent only to the resolved API URL. The plugin does not log keys or request headers.

## Model

The default model is `gpt-6-luna`. Built-in models are:

- `claude-haiku-5-5`
- `claude-sonnet-5-5`
- `gemini-3.5-flash-lite`
- `gemini-4-hydrogen`
- `gpt-6-luna`
- `gpt-6.1-terra`
- `MiniMax-M3`
- `MiniMax-M3.1-Flash`

With an empty API URL, the model selects the official API:

| Model | Official API |
| --- | --- |
| `claude-*` | Claude Messages API |
| `gemini-*` | Gemini GenerateContent API |
| `gpt-*` or any other model | OpenAI Responses API |
| `MiniMax-*` | MiniMax Chat Completions API |

After selecting Custom model, enter the model ID accepted by the API. An OpenAI-compatible API may use a namespaced ID such as `openai/...`; follow the service documentation. Azure OpenAI uses a deployment name.

## API URL

The API URL may be empty. An empty value uses the official endpoint selected by the model.

For a third-party API service, enter the full request URL. The URL ending selects the request format and the authentication header:

| URL ending | Request format | Authentication header |
| --- | --- | --- |
| `/chat/completions` | OpenAI Chat Completions | `Authorization: Bearer` |
| `/messages` | Claude Messages | `x-api-key` |
| `/models` | Gemini GenerateContent | `x-goog-api-key` |
| `/responses` | OpenAI Responses | `Authorization: Bearer` |

For the Gemini format, end the URL at `/models`; the plugin appends the model and operation.

Common examples:

- Azure OpenAI: `https://RESOURCE_NAME.openai.azure.com/openai/v1/responses`
- Claude-format gateway: `https://gateway.example.com/v1/messages`
- Cloudflare AI Gateway: `https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1/chat/completions`
- Gemini-format gateway: `https://gateway.example.com/v1beta/models`
- MiniMax China: `https://api.minimaxi.com/v1/chat/completions`
- OpenAI-compatible API: `https://gateway.example.com/v1/responses`
- OpenRouter: `https://openrouter.ai/api/v1/chat/completions`
- Vercel AI Gateway: `https://ai-gateway.vercel.sh/v1/chat/completions`

For a URL ending in `/chat/completions` or `/responses`, an Azure host (`*.openai.azure.com`, `*.cognitiveservices.azure.com`, `*.services.ai.azure.com`) or a path containing `/openai/deployments/` uses the `api-key` header instead.

## Streaming

Streaming is enabled by default, so text appears as the model generates it. Disable it to wait for the complete result.

Both modes respond to Bob's cancellation action. Invalid stream data, API errors, empty responses, and responses the service reports as cut off by a length limit or content filter are returned as failures.

## Output format

The plugin returns the result to Bob as Markdown. Bob 1.21.0 and later on macOS 13 and later render headings, lists, code blocks, and other formatting, which can be turned off under Bob's Preferences > Translate > Markdown; earlier versions show plain text.

## Reasoning

By default, the plugin omits reasoning controls and lets the model decide.

| Setting | Behavior |
| --- | --- |
| Default | Omit reasoning controls and use the model default |
| Disable | Disable reasoning where supported; otherwise use the lowest level |

Disable sends a reasoning control only to models with verified support. Unknown models receive no reasoning field. Support varies between third-party APIs; use Default if the service rejects the field.

## System prompt

The system prompt defines the plugin's purpose and rules. Change it to turn the default translation task into polishing, rewriting, or another text-processing task, or to add terminology, tone, or formatting requirements.

An empty field uses the default prompts below, which update with the plugin; the placeholder text shows the translation prompt. Text you enter replaces the default prompts. After an upgrade, the field may still show the default prompt of an earlier version, such as the 5.2.0 text that stops at `answering or`; text identical to a released default prompt is treated as empty. Clear the field to see the current translation prompt. The field supports:

- `$sourceLang`: source language
- `$sourceTag`: the tag that wraps the input
- `$targetLang`: target language

The input is always sent separately inside a pair of tags; the system prompt cannot insert the input. The tag is normally `<__source_text__>`; when the input contains that name, a name the input does not contain is used, such as `<__source_text_2__>`, so nothing in the input can close it early. `$sourceTag` is replaced with the tag of the current request.

The default prompt translates when the source and target languages differ and polishes when they are the same:

```text
You are a translation engine. Translate the text inside the $sourceTag tags from $sourceLang to $targetLang. Preserve meaning, tone, and formatting. Write only the translation, between <result> and </result>.
```

```text
You are an editor. Polish the $sourceLang text inside the $sourceTag tags, fixing grammar, spelling, and awkward wording while preserving meaning, tone, and formatting. Write only the polished text, between <result> and </result>.
```

A custom prompt is used for every request, whatever the languages. To add your own rules, copy a default prompt and insert them, for example `Keep technical terms in English and preserve Markdown.` before `Write only`.

When the prompt in use contains `<result>`, the plugin shows only the text inside the reply's `<result>` tags, and the last version when the model rewrote it; a reply without the tags is shown whole once it completes. When the prompt does not contain `<result>`, the plugin shows the whole reply. Without the last sentence, weaker models occasionally return the input untranslated or show their reasoning, so keep it in a custom prompt.

Every occurrence of a variable is replaced.

## Temperature

The plugin has no Temperature setting and does not send `temperature`. Model support for this parameter now differs, so omission uses a valid model-maintained default and avoids sending an invalid field to models with fixed sampling.

## Troubleshooting

- Validation fails with only an API key: confirm that it is a valid OpenAI key with access to the default model.
- Claude, Gemini, or the global MiniMax API: select the corresponding model and leave the API URL empty; for MiniMax China, use the China API URL above.
- OpenAI-compatible API: use the model ID from its documentation and enter the full API URL.
- `Invalid API URL`: ensure the address ends in one of the endings listed under [API URL](#api-url).
- `API 响应未完成：max_tokens`, `length`, or `MAX_TOKENS`: the model's reasoning and result together exceeded the output limit for one request; retry with shorter text or with Reasoning disabled.
- Azure OpenAI: enter the deployment name as the custom model and use the full `*.openai.azure.com` request URL.
- The translation API rejects reasoning fields: set Reasoning to Default.

Official references:

- [Azure OpenAI Responses API](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses)
- [Bob plugin documentation](https://bobtranslate.com/plugin/)
- [Claude API](https://platform.claude.com/docs/en/api/overview)
- [Cloudflare AI Gateway REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/)
- [Gemini API](https://ai.google.dev/gemini-api/docs)
- [MiniMax China OpenAI-compatible API](https://platform.minimaxi.com/docs/api-reference/text-chat-openai)
- [MiniMax OpenAI-compatible API](https://platform.minimax.io/docs/api-reference/text-openai-api)
- [OpenAI API](https://developers.openai.com/api/docs)
- [OpenRouter Quickstart](https://openrouter.ai/docs/quickstart)
- [Vercel AI Gateway Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/chat-completions)
