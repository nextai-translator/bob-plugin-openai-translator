import type { PluginValidate, TextTranslate } from '@bob-translate/types';
import { getServiceAdapter } from './adapter';
import { parseOptions, selectApiKey } from './config';
import { supportLanguageList } from './lang';
import { handleGeneralError, handleValidateError } from './utils/error';

export const translate: TextTranslate = (query) => {
  try {
    const config = parseOptions($option);
    const adapter = getServiceAdapter(config);
    void adapter
      .translate(query, selectApiKey(config.apiKeys))
      .catch((error: unknown) => handleGeneralError(query, error));
  } catch (error) {
    handleGeneralError(query, error);
  }
};

export const pluginValidate: PluginValidate = (completion) => {
  try {
    const config = parseOptions($option);
    const adapter = getServiceAdapter(config);
    void adapter
      .testApiConnection(selectApiKey(config.apiKeys), completion)
      .catch((error: unknown) => handleValidateError(completion, error));
  } catch (error) {
    handleValidateError(completion, error);
  }
};

export const pluginTimeoutInterval = () => 120;

export const supportLanguages = () =>
  supportLanguageList.map(([standardLang]) => standardLang);
