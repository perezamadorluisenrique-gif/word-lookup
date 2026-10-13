/** One numbered meaning of a word. */
export interface Definition {
  text: string;
  example: string;
}

/** The definitions of a word under one part of speech. */
export interface Meaning {
  partOfSpeech: string;
  definitions: Definition[];
  synonyms: string[];
  antonyms: string[];
}

export type SourceName = 'dictionaryapi' | 'wiktionary';

/** What a lookup returns, whichever source it came from. */
export interface Entry {
  word: string;
  /** Wiktionary language code of the entry, such as "en" or "es". */
  language: string;
  languageName: string;
  phonetic: string;
  /** Address of a recording, or ''. */
  audio: string;
  meanings: Meaning[];
  /** Related words that belong to no single meaning (Datamuse, or the source's own lists merged). */
  synonyms: string[];
  antonyms: string[];
  source: SourceName;
  sourceUrl: string;
}

export const SOURCE_LABELS: Record<SourceName, string> = {
  dictionaryapi: 'Free Dictionary API',
  wiktionary: 'Wiktionary',
};

/** Removes repeats (ignoring case) and the headword itself, keeping the order. */
export function uniqueWords(list: string[], exclude = ''): string[] {
  const seen = new Set<string>([exclude.toLowerCase()]);
  const out: string[] = [];
  for (const raw of list) {
    const word = raw.trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

/** Every synonym or antonym of an entry: those the source gave per meaning first, then the entry's own (Datamuse). */
export function relatedWords(entry: Entry, kind: 'synonyms' | 'antonyms'): string[] {
  const all: string[] = [];
  for (const meaning of entry.meanings) all.push(...meaning[kind]);
  all.push(...entry[kind]);
  return uniqueWords(all, entry.word);
}

export function emptyEntry(word: string, language: string, languageName: string, source: SourceName, sourceUrl: string): Entry {
  return { word, language, languageName, phonetic: '', audio: '', meanings: [], synonyms: [], antonyms: [], source, sourceUrl };
}
