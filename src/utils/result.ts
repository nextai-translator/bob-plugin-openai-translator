import type {
  TextTranslateQuery,
  TextTranslateResult,
} from '@bob-translate/types';

export const RESULT_OPEN = '<result>';
const RESULT_CLOSE = '</result>';

const withoutPartialClose = (text: string): string => {
  for (let length = RESULT_CLOSE.length - 1; length > 0; length--) {
    if (text.endsWith(RESULT_CLOSE.slice(0, length))) {
      return text.slice(0, -length);
    }
  }
  return text;
};

// Leading blank lines go, but the first line keeps its indentation, which can
// be Markdown structure such as an indented code block.
const trimBlock = (text: string): string =>
  text.replace(/^\s*\n/, '').trimEnd();

// Used only when the active system prompt asks for <result> tags. A weak model
// sometimes writes notes or reasoning outside the block, or a second block
// after correcting itself, so nothing outside a block is shown and the last
// closed non-empty block is the answer. When the source itself contains the
// tag, the translation does too, so the result runs from the first opening tag
// to the last closing tag instead.
export const extractResultText = (
  reply: string,
  complete: boolean,
  source: string,
): string => {
  const sourceHasTag =
    source.includes(RESULT_OPEN) || source.includes(RESULT_CLOSE);
  const start = reply.indexOf(RESULT_OPEN);
  if (start === -1) {
    if (!complete) return '';
    return sourceHasTag ? reply : reply.replace(/<\/result>\s*$/, '');
  }

  const body = reply.slice(start + RESULT_OPEN.length);
  if (sourceHasTag) {
    const end = body.lastIndexOf(RESULT_CLOSE);
    if (
      end !== -1 &&
      (complete || !body.slice(end + RESULT_CLOSE.length).trim())
    ) {
      return trimBlock(body.slice(0, end));
    }
    return trimBlock(complete ? body : withoutPartialClose(body));
  }

  const blocks = body.split(RESULT_OPEN).map((part) => {
    const end = part.indexOf(RESULT_CLOSE);
    return end === -1
      ? { closed: false, text: trimBlock(withoutPartialClose(part)) }
      : { closed: true, text: trimBlock(part.slice(0, end)) };
  });
  // A closed block stays the answer until a later block closes, so neither a
  // correction still being written nor an unfinished one replaces it.
  const nonEmpty = blocks.filter((block) => block.text.trim()).reverse();
  return (
    nonEmpty.find((block) => block.closed)?.text ?? nonEmpty[0]?.text ?? ''
  );
};

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
