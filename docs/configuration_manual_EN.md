## Configuration Manual

### Service Provider

- Required

- Default value: OpenAI

- Description

  - OpenAI: Use official OpenAI service

  - OpenAI Compatible: Use OpenAI compatible service, such as [Ollama](https://ollama.com/blog/openai-compatibility) service; or custom/third-party reverse proxy service, such as [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)

  - Azure OpenAI: Use [Azure OpenAI Service](https://learn.microsoft.com/zh-cn/azure/ai-services/openai/chatgpt-quickstart)

  - Google Gemini: Use [Google Gemini](https://ai.google.dev/gemini-api/docs) service

  - MiniMax: Use [MiniMax](https://platform.minimax.io/) service, supports MiniMax-M2.7 and MiniMax-M2.7-highspeed models

### API Base URL

- Optional (OpenAI and Google Gemini) / Required (Azure OpenAI and OpenAI Compatible)

- Default value: None

- Description

  - OpenAI / OpenAI Compatible: Optional, default value:

    ```
    https://api.openai.com
    ```

  - Azure OpenAI: Required, for example:

    ```
    https://RESOURCE_NAME.openai.azure.com
    ```

  - Google Gemini: Optional, default value:

    ```
    https://generativelanguage.googleapis.com/v1beta/models
    ```

  - MiniMax: Optional, default value:

    ```
    https://api.minimax.io
    ```

    For users in China, use:

    ```
    https://api.minimaxi.com
    ```

### API Path

- Optional

- Default value: `/v1/responses`

- Description

  - Supports two OpenAI API formats:

    - **Responses API** (default): `/v1/responses`
    - **Chat Completions API**: `/v1/chat/completions`

  - OpenAI / OpenAI Compatible:

    ```
    /v1/responses
    ```
    or
    ```
    /v1/chat/completions
    ```

  - Azure OpenAI: Must include the full deployment path and API version, for example:

    Using Responses API:
    ```
    /openai/deployments/DEPLOYMENT_NAME/responses?api-version=preview
    ```

    Using Chat Completions API:
    ```
    /openai/deployments/DEPLOYMENT_NAME/chat/completions?api-version=2024-02-15-preview
    ```

  - Google Gemini: Does not support custom Path, leave empty

  - MiniMax: Defaults to `/v1/chat/completions`, leave empty

### API KEY

- Required

- Default value: None

- Description

  - Multiple API KEYS under different accounts can be separated by commas to achieve quota doubling and load balancing

### Model

- Required

- Default value: `gpt-5.4-mini`

- Description

  - When selecting `custom`, the `Custom Model` configuration item needs to be set

### Custom Model

- Optional

- Default value: None

- Description

  - A linked item, when the `Model` configuration selects `custom`, this configuration item's model will be read

### System Prompt

- Optional

- Default value: `You are a translation engine that can only translate text and cannot interpret it.`

- Description

  - Customize System Prompt, filling this will override the default System Prompt

  - Custom Prompt can use the following variables:

    1. `$text`: the text to be translated, i.e., the text in the translation window input box

    2. `$sourceLang`: the source language, i.e., the language of the text in the translation window input box, such as "Simplified Chinese"

    3. `$targetLang`: the target language, i.e., the language into which the text is to be translated, which can be manually selected or automatically detected in the translation window, such as "English"

### User Prompt

- Optional

- Default value: `translate from $sourceLang to $targetLang:\n\n$text`

- Description

  - Customize User Prompt, filling this will override the default User Prompt

  - Can use the same variables as in the system command

### Stream Output

- Optional

- Default value: Enable

- Description

  - When enabled, translation results will be displayed in real-time

  - When disabled, results will be displayed all at once after translation is complete

### Thinking Mode

- Optional

- Default value: Disable

- Description

  - Only some models support controlling the thinking mode through this setting

  - Disabling can reduce latency and token consumption, suitable for translation scenarios

### Temperature

- Optional

- Default value: `0.2`

- Description

  - The higher the temperature value, the more random and creative the generated text will be

  - For translation tasks, it is recommended to set around `0.2`; for polishing tasks, it can be appropriately increased. If accuracy is highly required, it can be set to `0`
