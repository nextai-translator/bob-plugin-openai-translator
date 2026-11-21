import type { TextTranslateQuery } from '@bob-translate/types';
import { langMap } from '../lang';
import type { PluginConfig } from '../types';

export const DEFAULT_TRANSLATE_PROMPT =
  'You are a translation engine. Translate the text inside the $sourceTag tags from $sourceLang to $targetLang. Preserve meaning, tone, and formatting. Write only the translation, between <result> and </result>.';

export const DEFAULT_POLISH_PROMPT =
  'You are an editor. Polish the $sourceLang text inside the $sourceTag tags, fixing grammar, spelling, and awkward wording while preserving meaning, tone, and formatting. Write only the polished text, between <result> and </result>.';

const PROMPT_KEYWORD = /\$(sourceLang|sourceTag|targetLang)/g;

// The plugin picks the task from the query instead of leaving the model a
// conditional such as "if the languages match, polish it": weaker models read
// that as permission to return a source unchanged.
export const getSystemPromptTemplate = (
  query: TextTranslateQuery,
  config: PluginConfig,
): string =>
  config.customSystemPrompt ||
  (query.detectFrom === query.detectTo
    ? DEFAULT_POLISH_PROMPT
    : DEFAULT_TRANSLATE_PROMPT);

export const createPrompts = (
  query: TextTranslateQuery,
  config: PluginConfig,
): { system: string; user: string } => {
  // Deriving the tag from the source text keeps a repeated request
  // byte-identical, which a random tag would not, so providers and gateways
  // can still cache it.
  let tagName = '__source_text__';
  for (let suffix = 2; query.text.includes(tagName); suffix++) {
    tagName = `__source_text_${suffix}__`;
  }
  const values: Record<string, string> = {
    sourceLang: langMap.get(query.detectFrom) || query.detectFrom,
    sourceTag: `<${tagName}>`,
    targetLang: langMap.get(query.detectTo) || query.detectTo,
  };
  const systemTemplate = getSystemPromptTemplate(query, config);

  return {
    system: systemTemplate.replace(
      PROMPT_KEYWORD,
      (_, keyword: string) => values[keyword],
    ),
    user: `<${tagName}>${query.text}</${tagName}>`,
  };
};
