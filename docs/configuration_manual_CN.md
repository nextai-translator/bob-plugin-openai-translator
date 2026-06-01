## 配置手册

### 服务提供商

- 必选项

- 默认值：OpenAI

- 说明

  - OpenAI：使用 OpenAI 官方服务

  - OpenAI Compatible：使用与 OpenAI 兼容的服务，如 [Ollama](https://ollama.com/blog/openai-compatibility) 等；或是自定义/第三方反代服务，如 [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) 等

  - Azure OpenAI：使用 [Azure OpenAI Service](https://learn.microsoft.com/zh-cn/azure/ai-services/openai/chatgpt-quickstart)

  - Google Gemini：使用 [Google Gemini](https://ai.google.dev/gemini-api/docs) 服务

  - MiniMax：使用 [MiniMax](https://platform.minimax.io/) 服务，支持 MiniMax-M3、MiniMax-M2.7 和 MiniMax-M2.7-highspeed 模型


### API Base URL

- 可选项（OpenAI 和 Google Gemini）/ 必填项（Azure OpenAI 和 OpenAI Compatible）

- 默认值：无

- 说明

  - OpenAI / OpenAI Compatible：可选，默认为：

    ```
    https://api.openai.com
    ```

  - Azure OpenAI：必填，例如：

    ```
    https://RESOURCE_NAME.openai.azure.com
    ```

  - Google Gemini：可选，默认为：

    ```
    https://generativelanguage.googleapis.com/v1beta/models
    ```

  - MiniMax：可选，默认为：

    ```
    https://api.minimax.io
    ```

    国内用户可使用：

    ```
    https://api.minimaxi.com
    ```

### API Path

- 可选项

- 默认值：`/v1/responses`

- 说明

  - 支持 OpenAI 的两种 API 格式：

    - **Responses API**（默认）：`/v1/responses`
    - **Chat Completions API**：`/v1/chat/completions`

  - OpenAI / OpenAI Compatible：

    ```
    /v1/responses
    ```
    或
    ```
    /v1/chat/completions
    ```

  - Azure OpenAI：需包含完整的部署路径和 API 版本，例如：

    使用 Responses API：
    ```
    /openai/deployments/DEPLOYMENT_NAME/responses?api-version=preview
    ```

    使用 Chat Completions API：
    ```
    /openai/deployments/DEPLOYMENT_NAME/chat/completions?api-version=2024-02-15-preview
    ```

  - Google Gemini：不支持自定义 Path，留空即可

  - MiniMax：默认使用 `/v1/chat/completions`，留空即可

### API KEY

- 必填项

- 默认值：无

- 说明

  - 可使用英文逗号分割多个账号下不同的 API KEY 以实现额度加倍及负载均衡

### 模型

- 必选项

- 默认值：`gpt-5.4-mini`

- 说明

  - 选择 `custom` 时，需要设置 `自定义模型` 配置项

### 自定义模型

- 可选项

- 默认值：无

- 说明

  - 联动项，当 `模型` 配置选择 `custom` 时，会读取此配置项设置的模型

### 系统指令

- 可选项

- 默认值：`You are a translation engine that can only translate text and cannot interpret it.`

- 说明

  - 自定义 System Prompt，填写则会覆盖默认的 System Prompt

  - 自定义 Prompt可使用以下变量：

    1. `$text`：需要翻译的文本，即翻译窗口输入框内的文本

    2. `$sourceLang`：原文语言，即翻译窗口输入框内文本的语言，比如「简体中文」

    3. `$targetLang`：目标语言，即需要翻译成的语言，可以在翻译窗口中手动选择或自动检测，比如「English」

### 用户指令

- 可选项

- 默认值：`translate from $sourceLang to $targetLang:\n\n$text`

- 说明

  - 自定义 User Prompt，填写则会覆盖默认的 User Prompt

  - 可以使用与系统指令中相同的变量

### 流式输出

- 可选项

- 默认值：`Enable`

- 说明

  - 启用后翻译结果会实时显示

  - 禁用后会等待翻译完成后一次性显示

### 深度思考

- 可选项

- 默认值：`Disable`

- 说明

  - 仅 GPT-5 系列和 Gemini 2.5/3 系列支持此设置，其他模型不受影响

  - 由于 API 限制，GPT-5 系列无法完全禁用推理，Disable 仅将推理降至最低级别以减少延迟和 token 消耗

### 温度

- 可选项

- 默认值：`0.2`

- 说明

  - 温度值越高，生成的文本越随机，更有创意

  - 翻译任务建议设置在 `0.2` 左右，润色任务可以适当调高，如果需要严谨性，可以设置为 `0`
