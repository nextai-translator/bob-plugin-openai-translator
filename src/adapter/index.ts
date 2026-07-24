import type { PluginConfig, ServiceAdapter } from '../types';
import { AzureOpenAiAdapter } from './azure-openai';
import { GeminiAdapter } from './gemini';
import { MiniMaxAdapter } from './minimax';
import { OpenAiAdapter } from './openai';

export const getServiceAdapter = (config: PluginConfig): ServiceAdapter => {
  switch (config.provider) {
    case 'azure-openai':
      return new AzureOpenAiAdapter(config);
    case 'gemini':
      return new GeminiAdapter(config);
    case 'minimax':
      return new MiniMaxAdapter(config);
    case 'openai':
    case 'openai-compatible':
      return new OpenAiAdapter(config);
  }
};
