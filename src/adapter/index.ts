import type { ServiceAdapter, ServiceProvider } from '../types';
import { AzureOpenAiAdapter } from './azure-openai';
import { GeminiAdapter } from './gemini';
import { OpenAiAdapter } from './openai';

export const getServiceAdapter = (
  serviceProvider: ServiceProvider,
): ServiceAdapter => {
  switch (serviceProvider) {
    case 'azure-openai':
      return new AzureOpenAiAdapter();
    case 'gemini':
      return new GeminiAdapter();
    default:
      return new OpenAiAdapter();
  }
};
