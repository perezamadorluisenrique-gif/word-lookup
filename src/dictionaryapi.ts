import { emptyEntry, uniqueWords } from './entry.ts';
import type { Entry, Meaning } from './entry.ts';

export const DICTIONARYAPI_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

export function dictionaryApiUrl(word: string): string {
  return DICTIONARYAPI_BASE + encodeURIComponent(word);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim()) : []);

/**
 * Reads the Free Dictionary API's answer, a list of entries for one spelling, into one Entry. Entries of
 * the same word are merged: the meanings are joined under their part of speech. Returns null when the
 * answer is not a list of entries (the "No Definitions Found" object, or anything unexpected).
 */
export function parseDictionaryApi(json: unknown, word: string): Entry | null {
  if (!Array.isArray(json)) return null;
  const rows = json.filter(isObject);
  if (rows.length === 0) return null;

  const first = rows[0];
  const entry = emptyEntry(str(first.word) || word, 'en', 'English', 'dictionaryapi', sourceUrlOf(rows));
  const byPart = new Map<string, Meaning>();

  for (const row of rows) {
    if (!entry.phonetic) entry.phonetic = str(row.phonetic);
    for (const p of Array.isArray(row.phonetics) ? row.phonetics : []) {
      if (!isObject(p)) continue;
      if (!entry.phonetic) entry.phonetic = str(p.text);
      // The first recording wins; the order of the source puts the common accent first.
      if (!entry.audio && /^https?:\/\//i.test(str(p.audio))) entry.audio = str(p.audio);
    }
    for (const m of Array.isArray(row.meanings) ? row.meanings : []) {
      if (!isObject(m)) continue;
      const part = str(m.partOfSpeech) || 'other';
      let meaning = byPart.get(part);
      if (!meaning) {
        meaning = { partOfSpeech: part, definitions: [], synonyms: [], antonyms: [] };
        byPart.set(part, meaning);
      }
      const syn = strings(m.synonyms);
      const ant = strings(m.antonyms);
      for (const d of Array.isArray(m.definitions) ? m.definitions : []) {
        if (!isObject(d)) continue;
        const text = str(d.definition);
        if (!text) continue;
        meaning.definitions.push({ text, example: str(d.example) });
        syn.push(...strings(d.synonyms));
        ant.push(...strings(d.antonyms));
      }
      meaning.synonyms = uniqueWords([...meaning.synonyms, ...syn], entry.word);
      meaning.antonyms = uniqueWords([...meaning.antonyms, ...ant], entry.word);
    }
  }

  entry.meanings = [...byPart.values()].filter((m) => m.definitions.length > 0);
  return entry.meanings.length > 0 ? entry : null;
}

function sourceUrlOf(rows: Record<string, unknown>[]): string {
  for (const row of rows) {
    const urls = strings(row.sourceUrls);
    if (urls.length > 0 && /^https?:\/\//i.test(urls[0])) return urls[0];
  }
  return '';
}
