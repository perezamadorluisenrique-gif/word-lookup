export const DATAMUSE_BASE = 'https://api.datamuse.com/words';

export type Relation = 'synonyms' | 'antonyms';

const CODES: Record<Relation, string> = { synonyms: 'rel_syn', antonyms: 'rel_ant' };

export function datamuseUrl(word: string, relation: Relation, max = 20): string {
  return `${DATAMUSE_BASE}?${CODES[relation]}=${encodeURIComponent(word)}&max=${max}`;
}

/** The words of a Datamuse answer, best first. Anything that is not a list of `{word}` objects gives []. */
export function parseDatamuse(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  const out: string[] = [];
  for (const row of json) {
    const word = typeof row === 'object' && row !== null ? (row as { word?: unknown }).word : undefined;
    if (typeof word === 'string' && word.trim()) out.push(word.trim());
  }
  return out;
}
