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
 * Reads the REST definition of a page, which holds one list of entries per language code, and keeps
 * the entry of `language`. Definitions arrive as HTML and are reduced to text; empty ones are dropped.
 */
export function parseWiktionary(json: unknown, word: string, language: string): WiktionaryResult {
  if (!isObject(json)) return { entry: null, elsewhere: [] };
  const names: string[] = [];
  for (const rows of Object.values(json)) {
    const name = Array.isArray(rows) && isObject(rows[0]) && typeof rows[0].language === 'string' ? rows[0].language : '';
    if (name && !names.includes(name)) names.push(name);
  }
  const rows = json[language];
  if (!Array.isArray(rows)) return { entry: null, elsewhere: names };

  const entry = emptyEntry(word, language, languageName(language), 'wiktionary', wiktionaryPage(word));
  for (const row of rows) {
    if (!isObject(row) || !Array.isArray(row.definitions)) continue;
    const definitions: Definition[] = [];
    for (const d of row.definitions) {
      if (!isObject(d) || typeof d.definition !== 'string') continue;
      const text = stripHtml(d.definition);
      if (text) definitions.push({ text, example: exampleOf(d) });
    }
    if (definitions.length === 0) continue;
    const part = (typeof row.partOfSpeech === 'string' && row.partOfSpeech.trim().toLowerCase()) || 'other';
    entry.meanings.push({ partOfSpeech: part, definitions, synonyms: [], antonyms: [] });
  }
  return { entry: entry.meanings.length > 0 ? entry : null, elsewhere: names };
}
