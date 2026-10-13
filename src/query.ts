const LETTER = /[\p{L}\p{N}\p{M}]/u;
const WORD_CHAR = /[\p{L}\p{N}\p{M}'’-]/u;

/** Longest phrase looked up; a dictionary has no entry for a sentence. */
export const MAX_WORDS = 4;

/** A trimmed query and where it sits inside the text it was cut from. */
export interface Span {
  text: string;
  start: number;
  end: number;
}

/**
 * Trims whitespace and punctuation from both ends of `text` and collapses inner whitespace. `start` and
 * `end` are offsets into `text` of what was kept. Returns null when nothing lookup-able is left: no
 * letters, or more than MAX_WORDS words.
 */
export function trimSpan(text: string): Span | null {
  let start = 0;
  let end = text.length;
  while (start < end && !LETTER.test(text[start])) start++;
  while (end > start && !LETTER.test(text[end - 1])) end--;
  if (start >= end) return null;
  const inner = text.slice(start, end);
  const words = inner.split(/\s+/);
  if (words.length > MAX_WORDS || inner.length > 60) return null;
  return { text: words.join(' '), start, end };
}

/** The query for a typed or selected string, or '' when there is nothing to look up. */
export function cleanQuery(text: string): string {
  return trimSpan(text)?.text ?? '';
}

/**
 * The word around column `ch` of `line`: letters, digits, and inner apostrophes and hyphens. A cursor
 * just after a word counts as being in it. Null on whitespace or punctuation.
 */
export function wordAt(line: string, ch: number): Span | null {
  const chars = Array.from(line);
  // Work in UTF-16 offsets, as the editor does.
  const offsets: number[] = [];
  let acc = 0;
  for (const c of chars) {
    offsets.push(acc);
    acc += c.length;
  }
  offsets.push(acc);
  let i = offsets.findIndex((o) => o >= ch);
  if (i < 0) i = chars.length;
  const isWord = (k: number) => k >= 0 && k < chars.length && WORD_CHAR.test(chars[k]);
  if (!isWord(i) && isWord(i - 1)) i--;
  if (!isWord(i)) return null;
  let a = i;
  let b = i;
  while (isWord(a - 1)) a--;
  while (isWord(b + 1)) b++;
  // Quotes and hyphens at the edges belong to the sentence, not the word.
  while (a <= b && !LETTER.test(chars[a])) a++;
  while (b >= a && !LETTER.test(chars[b])) b--;
  if (a > b) return null;
  return { text: chars.slice(a, b + 1).join(''), start: offsets[a], end: offsets[b + 1] };
}

/** Gives `replacement` the capitalization of `original`: Word, WORD or word. */
export function matchCase(original: string, replacement: string): string {
  if (!replacement) return replacement;
  const letters = Array.from(original).filter((c) => c.toLowerCase() !== c.toUpperCase());
  if (letters.length === 0) return replacement;
  const first = letters[0];
  const firstUpper = first === first.toUpperCase();
  if (letters.length > 1 && letters.every((c) => c === c.toUpperCase())) return replacement.toUpperCase();
  if (firstUpper) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}
