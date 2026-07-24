import type { ServiceError } from '@bob-translate/types';
import type {
  ApiProtocol,
  PluginConfig,
  ProviderDefinition,
  ReasoningMode,
  ServiceProvider,
} from './types';
import {
  DEFAULT_MODEL,
  getCatalogModelProvider,
} from './utils/model-capabilities';

export const CONFIGURATION_GUIDE_URL =
  'https://github.com/nextai-translator/bob-plugin-openai-translator/blob/main/docs/configuration_manual_CN.md';

export const PROVIDERS = Object.freeze({
  'azure-openai': {
    defaultEndpoint: '',
    documentationUrl:
      'https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses',
    protocol: 'openai-responses',
  },
  gemini: {
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    documentationUrl: 'https://ai.google.dev/gemini-api/docs',
    protocol: 'gemini-generate-content',
  },
  minimax: {
    defaultEndpoint: 'https://api.minimax.io/v1/chat/completions',
    documentationUrl:
      'https://platform.minimax.io/docs/api-reference/text-openai-api',
    protocol: 'openai-chat-completions',
  },
  openai: {
    defaultEndpoint: 'https://api.openai.com/v1/responses',
    documentationUrl: 'https://developers.openai.com/api/docs',
    protocol: 'openai-responses',
  },
  'openai-compatible': {
    defaultEndpoint: '',
    documentationUrl: CONFIGURATION_GUIDE_URL,
    protocol: 'openai-responses',
  },
} satisfies Record<ServiceProvider, ProviderDefinition>);

const createConfigError = (
  message: string,
  addition: string,
): ServiceError => ({
  type: 'param',
  message,
  addition,
  troubleshootingLink: CONFIGURATION_GUIDE_URL,
});

const normalizeEndpoint = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const endpoint = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  if (!/^https?:\/\/\S+$/i.test(endpoint)) {
    throw createConfigError(
      '配置错误：API URL 格式不正确',
      '请填写以 http:// 或 https:// 开头的完整请求地址。',
    );
  }
  return endpoint;
};

export const detectOpenAiProtocol = (endpoint: string): ApiProtocol => {
  const path = endpoint.split('?')[0].replace(/\/+$/, '');
  if (path.endsWith('/chat/completions')) {
    return 'openai-chat-completions';
  }
  if (path.endsWith('/responses')) {
    return 'openai-responses';
  }
  throw createConfigError(
    '配置错误：API URL 格式不正确',
    '完整地址必须以 /responses 或 /chat/completions 结尾。',
  );
};

const parseApiKeys = (value: string): readonly string[] => {
  const apiKeys = value
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  if (apiKeys.length === 0) {
    throw {
      type: 'secretKey',
      message: '配置错误：请填写 API Key',
      troubleshootingLink: CONFIGURATION_GUIDE_URL,
    } satisfies ServiceError;
  }
  return Object.freeze(apiKeys);
};

const parseModel = (selectedModel: string, customModel: string): string => {
  const model =
    selectedModel === 'custom' ? customModel.trim() : selectedModel.trim();
  if (!model) {
    throw createConfigError(
      '配置错误：请填写自定义模型',
      '选择 Custom model 后，模型名称不能为空。',
    );
  }
  return model;
};

const parseReasoningMode = (value: string): ReasoningMode => {
  if (value === 'default' || value === 'disable') {
    return value;
  }
  throw createConfigError(
    '配置错误：未知推理模式',
    `不支持的推理模式：${value || '(empty)'}`,
  );
};

const parseStream = (value: string): boolean => {
  if (value === 'enable') return true;
  if (value === 'disable') return false;
  throw createConfigError(
    '配置错误：未知流式输出设置',
    `不支持的流式输出设置：${value || '(empty)'}`,
  );
};

const inferOfficialProvider = (model: string): ServiceProvider => {
  const catalogProvider = getCatalogModelProvider(model);
  if (catalogProvider) return catalogProvider;
  if (model.startsWith('gemini-')) return 'gemini';
  if (model.startsWith('MiniMax-')) return 'minimax';
  return 'openai';
};

const isAzureEndpoint = (endpoint: string): boolean =>
  /^https?:\/\/[^/]+\.openai\.azure\.com(?:\/|$)/i.test(endpoint) ||
  /\/openai\/(?:v1|deployments\/)/i.test(endpoint);

const isMiniMaxEndpoint = (endpoint: string): boolean =>
  /^https?:\/\/api\.(?:minimax\.io|minimaxi\.com)(?::\d+)?(?:\/|$)/i.test(
    endpoint,
  );

export const parseOptions = (
  options: Readonly<Record<string, string>>,
): PluginConfig => {
  const model = parseModel(
    options.model || DEFAULT_MODEL,
    options.customModel || '',
  );
  const configuredEndpoint = normalizeEndpoint(options.apiUrl || '');
  const configuredProtocol = configuredEndpoint
    ? detectOpenAiProtocol(configuredEndpoint)
    : undefined;
  const provider = configuredEndpoint
    ? isAzureEndpoint(configuredEndpoint)
      ? 'azure-openai'
      : isMiniMaxEndpoint(configuredEndpoint) &&
          configuredProtocol === 'openai-chat-completions'
        ? 'minimax'
        : 'openai-compatible'
    : inferOfficialProvider(model);
  const definition = PROVIDERS[provider];
  const endpoint = configuredEndpoint || definition.defaultEndpoint;
  const protocol = configuredProtocol || definition.protocol;
  const customSystemPrompt = options.customSystemPrompt || '';
  const customUserPrompt = options.customUserPrompt || '';

  const config: PluginConfig = {
    apiKeys: parseApiKeys(options.apiKeys || ''),
    customSystemPrompt: customSystemPrompt.trim() ? customSystemPrompt : '',
    customUserPrompt: customUserPrompt.trim() ? customUserPrompt : '',
    endpoint,
    model,
    protocol,
    provider,
    reasoningMode: parseReasoningMode(options.reasoningMode || 'default'),
    stream: parseStream(options.stream || 'enable'),
  };

  return Object.freeze(config);
};

export const selectApiKey = (apiKeys: readonly string[]): string =>
  apiKeys[Math.floor(Math.random() * apiKeys.length)];
