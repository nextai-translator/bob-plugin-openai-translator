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
- OpenLLM（本机 daemon，仅 macOS；API Key 填任意非空内容）：`http://127.0.0.1:8787/v1/chat/completions`
- OpenLLM（云端，使用 `sk-llm-...` 密钥）：`https://www.openllm.sh/v1/chat/completions`
- OpenRouter：`https://openrouter.ai/api/v1/chat/completions`
- Vercel AI Gateway：`https://ai-gateway.vercel.sh/v1/chat/completions`

地址以 `/chat/completions` 或 `/responses` 结尾时，Azure 主机（`*.openai.azure.com`、`*.cognitiveservices.azure.com`、`*.services.ai.azure.com`）以及包含 `/openai/deployments/` 的路径会改用 `api-key` 请求头。

## 流式输出

默认开启，译文会随模型生成逐步显示。关闭后会等待完整结果再显示。

两种模式都会响应 Bob 的取消操作。流式响应格式错误、API 错误、空结果，以及服务报告因长度上限或内容过滤而提前结束的响应，都会作为失败返回。

## 译文格式

译文以 Markdown 格式交给 Bob。Bob 1.21.0 及以上版本在 macOS 13 及以上系统会渲染标题、列表、代码块等格式，可在 Bob 的「偏好设置 - 翻译 - Markdown」中关闭；更早的版本按纯文本显示。

## 推理

默认情况下，插件不发送推理控制参数，由模型决定。

| 选项 | 行为 |
| --- | --- |
| 默认 | 不发送推理控制参数，使用模型默认设置 |
| 关闭 | 支持关闭时禁用；无法完全关闭时使用最低档位 |

「关闭」只会向已确认支持该设置的模型发送参数。未知模型不会收到推理参数。第三方 API 对这些参数的支持程度不同；如果服务不支持，使用「默认」。

## 系统指令

系统指令决定插件的用途和规则。要把默认翻译改成润色、改写或其他文本处理任务，或者补充术语、语气、格式要求，都在这里修改。

字段留空时使用下面的默认指令，它们会随插件更新；输入框里的占位文字是其中的翻译指令。填写后，填写的内容会替换默认指令。从旧版本升级后，输入框里可能仍显示当时的默认指令，例如 5.2.0 那段在 `answering or` 处中断的文字；只要内容和某个版本的默认指令完全相同，插件就按留空处理。清空输入框后会显示当前的翻译指令。字段支持：

- `$sourceLang`：源语言代码，例如 `en`
- `$sourceTag`：包住原文的标记
- `$targetLang`：目标语言代码和该语言自己的名称，例如 `zh-CN (简体中文)`；两者相同时只有代码，例如 `粤语`

原文始终放在一对标记内单独发送，系统指令无法插入原文。标记通常是 `<__source_text__>`；原文里出现这个名字时，会改用原文中没有的名字，例如 `<__source_text_2__>`，所以原文里的内容不会提前结束它。`$sourceTag` 会被替换成本次请求的标记。使用默认翻译指令时，原文后面还会附上一句目标语言提醒，例如 `Translate into zh-CN (简体中文).`；润色和填写的指令不附加，因为填写的指令可能是其他任务。

源语言和目标语言不同时，默认指令是翻译；相同时是润色：

```text
You are a translation engine. Translate the text inside the $sourceTag tags from $sourceLang to $targetLang. Preserve meaning, tone, and formatting. Write only the translation, between <result> and </result>.
```

```text
You are an editor. Polish the $sourceLang text inside the $sourceTag tags, fixing grammar, spelling, and awkward wording while preserving meaning, tone, and formatting. Write only the polished text, between <result> and </result>.
```

填写的指令会用于所有请求，不区分语言。要补充自己的要求时，复制一段默认指令再加入，例如在 `Write only` 之前加入 `Keep technical terms in English and preserve Markdown.`。

使用中的指令包含 `<result>` 时，插件只显示回复中 `<result>` 标记内的文字，模型改写过时显示最后一版；回复里没有这个标记时，等回复完整后显示整段回复。指令不包含 `<result>` 时直接显示整段回复。去掉最后这句后，较弱的模型偶尔会原样返回原文或写出思考过程，所以自定义指令建议保留这句。

同一变量出现多次时会全部替换。变量的值是写给模型看的，会整段填入变量所在的位置，包括属性或 JSON 里。

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
- [OpenLLM 文档](https://docs.openllm.sh)
- [OpenRouter Quickstart](https://openrouter.ai/docs/quickstart)
- [Vercel AI Gateway Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/chat-completions)
