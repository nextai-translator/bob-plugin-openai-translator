# 配置手册

填写 API Key 后即可使用默认的 OpenAI 配置，包括默认模型、官方 API、流式输出和模型默认推理设置。

## 最快开始

1. 在 Bob 的服务配置中找到 OpenAI Translator。
2. 填写 OpenAI API Key。
3. 保存配置并开始翻译。

使用 Claude、Gemini 或 MiniMax 官方 API 时，选择对应模型并填写该服务的 API Key。使用第三方 API 服务时，按其文档填写模型和完整 API URL。

## API Key

多个 Key 可用英文逗号分隔，插件每次请求会随机选择一个。

Key 只会发送到最终使用的 API URL。插件不会记录 Key 或请求头。

## 模型

默认模型为 `gpt-6-luna`。内置模型包括：

- `claude-haiku-5-5`
- `claude-sonnet-5-5`
- `gemini-3.5-flash-lite`
- `gemini-4-hydrogen`
- `gpt-6-luna`
- `gpt-6.1-terra`
- `MiniMax-M3`
- `MiniMax-M3.1-Flash`

API URL 留空时，插件按模型自动选择官方 API：

| 模型 | 使用的官方 API |
| --- | --- |
| `claude-*` | Claude Messages API |
| `gemini-*` | Gemini GenerateContent API |
| `gpt-*` 或其他模型 | OpenAI Responses API |
| `MiniMax-*` | MiniMax Chat Completions API |

选择「自定义模型」后，填写 API 实际接受的模型 ID。OpenAI 兼容 API 可能使用带命名空间的模型 ID，例如 `openai/...`，应以服务文档为准。Azure OpenAI 使用部署名。

## API URL

API URL 可留空。留空时使用模型对应的官方地址。

使用第三方 API 服务时填写完整请求 URL。插件根据地址结尾选择请求格式和认证请求头：

| 地址结尾 | 请求格式 | 认证请求头 |
| --- | --- | --- |
| `/chat/completions` | OpenAI Chat Completions | `Authorization: Bearer` |
| `/messages` | Claude Messages | `x-api-key` |
| `/models` | Gemini GenerateContent | `x-goog-api-key` |
| `/responses` | OpenAI Responses | `Authorization: Bearer` |

Gemini 格式的地址填到 `/models` 为止，插件会补上模型和操作名。

常见示例：

- Azure OpenAI：`https://RESOURCE_NAME.openai.azure.com/openai/v1/responses`
- Claude 格式的中转服务：`https://gateway.example.com/v1/messages`
- Cloudflare AI Gateway：`https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1/chat/completions`
- Gemini 格式的中转服务：`https://gateway.example.com/v1beta/models`
- MiniMax 中国区：`https://api.minimaxi.com/v1/chat/completions`
- OpenAI 兼容 API：`https://gateway.example.com/v1/responses`
- OpenRouter：`https://openrouter.ai/api/v1/chat/completions`
- Vercel AI Gateway：`https://ai-gateway.vercel.sh/v1/chat/completions`

地址以 `/chat/completions` 或 `/responses` 结尾时，Azure 主机（`*.openai.azure.com`、`*.cognitiveservices.azure.com`、`*.services.ai.azure.com`）以及包含 `/openai/deployments/` 的路径会改用 `api-key` 请求头。

## 流式输出

默认开启，译文会随模型生成逐步显示。关闭后会等待完整结果再显示。

两种模式都会响应 Bob 的取消操作。流式响应格式错误、API 错误、空结果以及未生成完就中止的响应都会作为失败返回，不会产生空白或不完整的成功结果。

## 译文格式

译文以 Markdown 格式交给 Bob。Bob 1.21.0 及以上版本在 macOS 13 及以上系统会渲染标题、列表、代码块等格式，可在 Bob 的「偏好设置 - 翻译 - Markdown」中关闭；更早的版本按纯文本显示。

## 推理

默认情况下，插件不发送推理控制参数，由模型决定。

| 选项 | 行为 |
| --- | --- |
| 默认 | 不发送推理控制参数，使用模型默认设置 |
| 关闭 | 支持关闭时禁用；无法完全关闭时使用最低档位 |

「关闭」只会向已确认支持该设置的模型发送参数。未知模型不会收到推理参数。第三方 API 对这些参数的支持程度不同；如果服务不支持，使用「默认」。

## 系统指令和用户指令

系统指令决定插件的用途和基本规则。要把默认翻译改成润色、改写或其他文本处理任务，应修改系统指令。

用户指令决定每次如何把原文交给模型。用途不变时，可在这里补充术语、语气、格式等本次请求规则。

两个字段都有可直接编辑的默认值，并支持：

- `$text`：原文
- `$sourceLang`：源语言
- `$targetLang`：目标语言

例如，系统指令保持翻译用途时，可以把用户指令改为：

```text
保留技术术语的英文原文，并保持 Markdown 格式：

$text
```

同一变量出现多次时会全部替换。

## Temperature

插件不提供 Temperature 配置，也不会发送 `temperature`。不同模型对该参数的支持正在分化，省略它可以使用模型维护的有效默认值，并避免向固定采样参数的模型发送无效字段。

## 排错

- 只填 API Key 仍验证失败：确认它是有效的 OpenAI Key，并可访问默认模型。
- 使用 Claude、Gemini 或 MiniMax 全球 API：选择对应模型，不要填写 API URL；MiniMax 中国区使用上面的中国区地址。
- 使用 OpenAI 兼容 API：确认模型 ID 与服务文档一致，并填写完整 API URL。
- `API URL 格式不正确`：检查地址是否以 [API URL](#api-url) 中列出的结尾之一结束。
- `API 响应未完成：max_tokens`、`length` 或 `MAX_TOKENS`：模型的推理和译文合计超过了单次输出上限，缩短原文或将「推理」设为关闭后重试。
- Azure OpenAI：自定义模型填写部署名，API URL 使用 `*.openai.azure.com` 的完整请求地址。
- 翻译接口不支持推理参数：将「推理」改为「默认」。

官方参考：

- [Azure OpenAI Responses API](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses)
- [Bob 插件文档](https://bobtranslate.com/plugin/)
- [Claude API](https://platform.claude.com/docs/en/api/overview)
- [Cloudflare AI Gateway REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/)
- [Gemini API](https://ai.google.dev/gemini-api/docs)
- [MiniMax OpenAI-compatible API](https://platform.minimax.io/docs/api-reference/text-openai-api)
- [MiniMax 中国区 OpenAI-compatible API](https://platform.minimaxi.com/docs/api-reference/text-chat-openai)
- [OpenAI API](https://developers.openai.com/api/docs)
- [OpenRouter Quickstart](https://openrouter.ai/docs/quickstart)
- [Vercel AI Gateway Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/chat-completions)
