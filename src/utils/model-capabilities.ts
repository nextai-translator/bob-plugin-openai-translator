/**
 * Model capabilities for OpenAI and Gemini models.
 * Based on Vercel AI SDK: https://github.com/vercel/ai/blob/fad04b2e4ad6f927daebb5e7e342f0a98d35c3cd/packages/openai/src/openai-language-model-capabilities.ts
 */

interface OpenAIModelCapabilities {
  isReasoningModel: boolean;
  supportsNonReasoningParameters: boolean;
}

const getOpenAIModelCapabilities = (model: string): OpenAIModelCapabilities => {
  // Non-reasoning models: gpt-3*, gpt-4*, chatgpt-4o*, gpt-*-chat* (e.g. gpt-5.1-chat-latest)
  const isGptChatModel = model.startsWith('gpt-') && model.includes('-chat');
  const isReasoningModel = !(
    model.startsWith('gpt-3') ||
    model.startsWith('gpt-4') ||
    model.startsWith('chatgpt-4o') ||
    isGptChatModel
  );

  // https://platform.openai.com/docs/guides/latest-model#gpt-5-1-parameter-compatibility
  // GPT-5.1 and GPT-5.2 support temperature, topP, logProbs when reasoningEffort is none
  const supportsNonReasoningParameters =
    model.startsWith('gpt-5.1') || model.startsWith('gpt-5.2');

  return { isReasoningModel, supportsNonReasoningParameters };
};

export const getMinimalReasoningEffort = (
  model: string,
): string | undefined => {
  const { isReasoningModel, supportsNonReasoningParameters } =
    getOpenAIModelCapabilities(model);

  if (!isReasoningModel) {
    return undefined;
  }

  if (supportsNonReasoningParameters) {
    return 'none';
  }

  // GPT-5 supports 'minimal' but not 'none'
  if (model.startsWith('gpt-5')) {
    return 'minimal';
  }

  return 'none';
};

export const supportsTemperature = (
  model: string,
  reasoningEffort?: string,
): boolean => {
  const { isReasoningModel, supportsNonReasoningParameters } =
    getOpenAIModelCapabilities(model);

  if (!isReasoningModel) {
    return true;
  }

  return reasoningEffort === 'none' && supportsNonReasoningParameters;
};

const geminiSupportsThinking = (model: string): boolean => {
  return (
    model.includes('thinking') ||
    model.includes('gemini-2.5') ||
    model.includes('gemini-3')
  );
};

export const getGeminiMinimalThinkingConfig = (
  model: string,
): Record<string, unknown> | undefined => {
  if (!geminiSupportsThinking(model)) {
    return undefined;
  }

  // Gemini 3 series uses thinkingLevel, Gemini 2.5 series uses thinkingBudget
  if (model.includes('gemini-3')) {
    return { thinkingLevel: 'minimal' };
  }

  return { thinkingBudget: 0 };
};
