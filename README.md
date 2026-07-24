<p align="right">
  <strong>简体中文</strong> · <a href="./docs/README_EN.md">English</a>
</p>

# OpenAI Translator for Bob

使用 OpenAI、Google Gemini、MiniMax 或 OpenAI 兼容 API 进行翻译、润色和语法修正的 [Bob](https://bobtranslate.com/) 插件。

默认配置使用 OpenAI。安装后填写 API Key 即可开始翻译，其他选项按需修改。

## 安装与使用

1. 安装 [Bob](https://bobtranslate.com/guide/) 1.8.0 或更高版本。
2. 下载并打开最新的 [openai-translator.bobplugin](https://github.com/nextai-translator/bob-plugin-openai-translator/releases/latest)。
3. 打开 Bob 的服务配置，找到 OpenAI Translator，填写 API Key。
4. 保存配置后即可翻译。

## 配置

使用 Gemini 或 MiniMax 时，在[模型](./docs/configuration_manual_CN.md#模型)中选择对应选项；使用第三方 API 服务时，按其文档填写[模型](./docs/configuration_manual_CN.md#模型)和完整 [API URL](./docs/configuration_manual_CN.md#api-url)。

[推理](./docs/configuration_manual_CN.md#推理)、[系统指令和用户指令](./docs/configuration_manual_CN.md#系统指令和用户指令)等设置见配置手册。

## 功能

- 翻译 Bob 支持的语言。
- 源语言与目标语言相同时，自动进行润色和语法修正。
- 默认启用流式输出，并支持取消请求。
- 默认使用模型自身的推理设置，也可降至模型支持的最低档位。
- 系统指令可改变用途，用户指令可调整每次请求的术语、语气或格式。

## 开发与贡献

开发环境、验证命令和提交要求见[贡献指南](./.github/contributing.md)。运行时设计和外部文档依据见[架构说明](./docs/architecture.md)。
