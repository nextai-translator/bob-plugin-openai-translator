import type {
  TextTranslateQuery,
  TextTranslateResult,
} from '@bob-translate/types';

// Bob 1.21.0+ renders `content`; earlier versions read `toParagraphs`.
export const createTranslateResult = (
  query: TextTranslateQuery,
  text: string,
): TextTranslateResult => ({
  from: query.detectFrom,
  to: query.detectTo,
  content: { format: 'markdown', text },
  toParagraphs: [text],
});
