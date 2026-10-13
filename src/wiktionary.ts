import { emptyEntry } from './entry.ts';
import type { Definition } from './entry.ts';
import type { Entry } from './entry.ts';
import { languageName } from './languages.ts';
import { stripHtml } from './text.ts';

export const WIKTIONARY_BASE = 'https://en.wiktionary.org/api/rest_v1/page/definition/';

export function wiktionaryUrl(word: string): string {
  return WIKTIONARY_BASE + encodeURIComponent(word.replace(/ /g, '_'));
}

/** Page address a reader can open. */
export function wiktionaryPage(word: string): string {
  return 'https://en.wiktionary.org/wiki/' + encodeURIComponent(word.replace(/ /g, '_'));
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Languages whose entries Wiktionary files under other names. The definition API has no key for these:
 * their rows sit in its "other" list.
 */
const ALSO_NAMED: Record<string, string[]> = {
  no: ['Norwegian Bokmål', 'Norwegian Nynorsk'],
};

/** Signs, codes and symbols shared by every language; the API files them under "en". */
const TRANSLINGUAL = 'Translingual';

export interface WiktionaryResult {
  entry: Entry | null;
  /** Names of the languages the page does have an entry for, when `entry` is null. */
  elsewhere: string[];
}

function exampleOf(def: Record<string, unknown>): string {
  for (const key of ['parsedExamples', 'examples'] as const) {
    const list = def[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const html = typeof item === 'string' ? item : isObject(item) && typeof item.example === 'string' ? item.example : '';
      const text = stripHtml(html);
      if (text) return text;
    }
  }
  return '';
}

/**
 * A definition's own text. Sub-senses come nested in it as a list and again as definitions of their own,
 * so the list is cut off here.
 */
function definitionText(html: string): string {
  const nested = html.search(/<[ou]l[\s>]/i);
  return stripHtml(nested >= 0 ? html.slice(0, nested) : html);
}

/**
 * Reads the REST definition of a page, which holds lists of entries by language code, and keeps the
 * entries of `language`. Definitions arrive as HTML and are reduced to text; empty ones are dropped.
 */
export function parseWiktionary(json: unknown, word: string, language: string): WiktionaryResult {
  if (!isObject(json)) return { entry: null, elsewhere: [] };
  const wanted = new Set([languageName(language), ...(ALSO_NAMED[language] ?? [])]);
  const names: string[] = [];
  const rows: Record<string, unknown>[] = [];
  for (const [code, list] of Object.entries(json)) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!isObject(row)) continue;
      const name = typeof row.language === 'string' ? row.language : '';
      if (name === TRANSLINGUAL) continue;
      if (name && !names.includes(name)) names.push(name);
      if (code === language || wanted.has(name)) rows.push(row);
    }
  }

  const entry = emptyEntry(word, language, languageName(language), 'wiktionary', wiktionaryPage(word));
  for (const row of rows) {
    if (!Array.isArray(row.definitions)) continue;
    const definitions: Definition[] = [];
    for (const d of row.definitions) {
      if (!isObject(d) || typeof d.definition !== 'string') continue;
      const text = definitionText(d.definition);
      if (text) definitions.push({ text, example: exampleOf(d) });
    }
    if (definitions.length === 0) continue;
    const part = (typeof row.partOfSpeech === 'string' && row.partOfSpeech.trim().toLowerCase()) || 'other';
    entry.meanings.push({ partOfSpeech: part, definitions, synonyms: [], antonyms: [] });
  }
  return { entry: entry.meanings.length > 0 ? entry : null, elsewhere: names };
}
