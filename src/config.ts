import type { ServiceError } from '@bob-translate/types';
import type {
  ApiProtocol,
  PluginConfig,
  ProviderDefinition,
  ReasoningMode,
  ServiceProvider,
} from './types';
import { DEFAULT_MODEL } from './utils/model-capabilities';

export const CONFIGURATION_GUIDE_URL =
  'https://github.com/nextai-translator/bob-plugin-openai-translator/blob/main/docs/configuration_manual_CN.md';

export const PROVIDERS = {
  anthropic: {
    defaultEndpoint: 'https://api.anthropic.com/v1/messages',
    documentationUrl: 'https://platform.claude.com/docs/en/api/overview',
    protocol: 'anthropic-messages',
  },
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
} satisfies Record<ServiceProvider, ProviderDefinition>;

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
  return endpoint.replace(/\/+(?=\?|$)/, '');
};

const PROTOCOL_SUFFIXES: ReadonlyArray<readonly [string, ApiProtocol]> = [
  ['/chat/completions', 'openai-chat-completions'],
  ['/messages', 'anthropic-messages'],
  ['/models', 'gemini-generate-content'],
  ['/responses', 'openai-responses'],
];

const detectProtocol = (endpoint: string): ApiProtocol => {
  const path = endpoint.split('?')[0];
  const match = PROTOCOL_SUFFIXES.find(([suffix]) => path.endsWith(suffix));
  if (match) return match[1];
  throw createConfigError(
    '配置错误：API URL 须以 /chat/completions、/messages、/models 或 /responses 结尾',
    '请填写完整的请求地址，而不是服务的 Base URL。',
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
      '选择「自定义模型」后，模型名称不能为空。',
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
    `不支持的推理模式：${value}`,
  );
};

const parseStream = (value: string): boolean => {
  if (value === 'enable') return true;
  if (value === 'disable') return false;
  throw createConfigError(
    '配置错误：未知流式输出设置',
    `不支持的流式输出设置：${value}`,
  );
};

const inferOfficialProvider = (model: string): ServiceProvider => {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'gemini';
  if (model.startsWith('MiniMax-')) return 'minimax';
  return 'openai';
};

// `/openai/v1` alone is not Azure: other services serve Bearer-authenticated APIs there.
const isAzureEndpoint = (endpoint: string): boolean =>
  /^https?:\/\/[^/?]+\.(?:cognitiveservices|openai|services\.ai)\.azure\.com(?::\d+)?(?:[/?]|$)/i.test(
    endpoint,
  ) || /^[^?]*\/openai\/deployments\//i.test(endpoint);

const isMiniMaxEndpoint = (endpoint: string): boolean =>
  /^https?:\/\/api\.(?:minimax\.io|minimaxi\.com)(?::\d+)?(?:\/|$)/i.test(
    endpoint,
  );

const deriveCustomProvider = (
  endpoint: string,
  protocol: ApiProtocol,
): ServiceProvider => {
  if (protocol === 'anthropic-messages') return 'anthropic';
  if (protocol === 'gemini-generate-content') return 'gemini';
  if (isAzureEndpoint(endpoint)) return 'azure-openai';
  return isMiniMaxEndpoint(endpoint) && protocol === 'openai-chat-completions'
    ? 'minimax'
    : 'openai-compatible';
};

export const parseOptions = (
  options: Readonly<Record<string, string>>,
): PluginConfig => {
  const model = parseModel(
    options.model || DEFAULT_MODEL,
    options.customModel || '',
  );
  const configuredEndpoint = normalizeEndpoint(options.apiUrl || '');
  const configuredProtocol = configuredEndpoint
    ? detectProtocol(configuredEndpoint)
    : undefined;
  const provider = configuredProtocol
    ? deriveCustomProvider(configuredEndpoint, configuredProtocol)
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
