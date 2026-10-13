import { datamuseUrl, parseDatamuse } from './datamuse.ts';
import type { Relation } from './datamuse.ts';
import { dictionaryApiUrl, parseDictionaryApi } from './dictionaryapi.ts';
import { relatedWords, uniqueWords } from './entry.ts';
import type { Entry } from './entry.ts';
import { languageName } from './languages.ts';
import { cleanQuery } from './query.ts';
import { parseWiktionary, wiktionaryUrl } from './wiktionary.ts';

export interface HttpResponse {
  status: number;
  json: unknown;
}

/** Every request goes through this, so tests and the end-to-end specs can answer without a network. It throws when there is none. */
export type HttpGet = (url: string, headers?: Record<string, string>) => Promise<HttpResponse>;

export type LookupErrorKind = 'empty' | 'not-found' | 'rate-limited' | 'network';

export class LookupError extends Error {
  readonly kind: LookupErrorKind;

  constructor(kind: LookupErrorKind, message: string) {
    super(message);
    this.name = 'LookupError';
    this.kind = kind;
  }
}

export interface LookupOptions {
  /** Wiktionary language code of the word. */
  language: string;
  /** Also ask Datamuse for synonyms and antonyms (English only). */
  related: boolean;
}

/** Wikimedia asks API clients to say who they are; `requestUrl` cannot always set User-Agent, so both are sent. */
export const WIKI_HEADERS = {
  'Api-User-Agent': 'WordLookup/0.1 (https://github.com/perezamadorluisenrique-gif/word-lookup)',
};

/** Fewer own synonyms than this and Datamuse fills the list. */
const ENOUGH_RELATED = 5;

/** Timing of the Free Dictionary API, whose server can stall for 20 seconds before it gives up. */
export interface Timing {
  /** How long to wait for it before asking Wiktionary instead. */
  timeoutMs: number;
  /** After it times out or fails with a server error, how long to go straight to Wiktionary. */
  pauseMs: number;
  now: () => number;
  /** Resolves after `ms`. The view passes the window's timer; without one, nothing times out. */
  sleep?: (ms: number) => Promise<void>;
}

const TIMING: Timing = { timeoutMs: 6000, pauseMs: 5 * 60_000, now: () => Date.now() };

class Timeout extends Error {}

/** `promise`, or a `Timeout` rejection once `ms` have passed. */
function within<T>(promise: Promise<T>, ms: number, sleep: Timing['sleep']): Promise<T> {
  if (!sleep) return promise;
  const late = sleep(ms).then((): never => {
    throw new Timeout();
  });
  return Promise.race([promise, late]);
}

/** Finds words, remembering the answers for the session. */
export class Dictionary {
  private cache = new Map<string, Entry>();

  private readonly limit: number;

  private readonly timing: Timing;

  /** Until when the Free Dictionary API is skipped. */
  private firstDownUntil = 0;

  constructor(limit = 200, timing: Partial<Timing> = {}) {
    this.limit = limit;
    this.timing = { ...TIMING, ...timing };
  }

  clear(): void {
    this.cache.clear();
  }

  cached(raw: string, language: string): Entry | undefined {
    return this.cache.get(this.key(cleanQuery(raw), language));
  }

  private key(word: string, language: string): string {
    return `${language}:${word.toLowerCase()}`;
  }

  async lookup(raw: string, options: LookupOptions, http: HttpGet): Promise<Entry> {
    const word = cleanQuery(raw);
    if (!word) throw new LookupError('empty', 'Type a word to look up.');
    const key = this.key(word, options.language);
    const hit = this.cache.get(key);
    if (hit) {
      // Most recently used last.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }

    const candidates = word === word.toLowerCase() ? [word] : [word, word.toLowerCase()];
    let entry: Entry | null = null;
    let failure: LookupError | null = null;
    let elsewhere: string[] = [];

    if (options.language === 'en' && this.timing.now() >= this.firstDownUntil) {
      for (const candidate of candidates) {
        let res: HttpResponse;
        try {
          res = await within(http(dictionaryApiUrl(candidate)), this.timing.timeoutMs, this.timing.sleep);
        } catch (error) {
          // A stalled server, unlike a missing connection, is likely to stay that way for a while.
          if (error instanceof Timeout) {
            failure = new LookupError('network', 'The dictionary service did not answer in time.');
            this.pauseFirst();
          } else {
            failure = new LookupError('network', 'Could not reach the dictionary. Check your connection.');
          }
          break;
        }
        if (res.status === 200) {
          entry = parseDictionaryApi(res.json, candidate);
          if (entry) break;
        } else if (res.status !== 404) {
          failure = new LookupError('network', `The dictionary service answered with an error (${res.status}).`);
          if (res.status >= 500) this.pauseFirst();
          break;
        }
      }
    }

    if (!entry) {
      // Other languages, and English when the first service has no entry or is down.
      let wikiFailure: LookupError | null = null;
      for (const candidate of candidates) {
        let res: HttpResponse;
        try {
          res = await http(wiktionaryUrl(candidate), WIKI_HEADERS);
        } catch {
          wikiFailure = new LookupError('network', 'Could not reach the dictionary. Check your connection.');
          break;
        }
        if (res.status === 200) {
          const parsed = parseWiktionary(res.json, candidate, options.language);
          if (parsed.entry) {
            entry = parsed.entry;
            break;
          }
          elsewhere = parsed.elsewhere;
        } else if (res.status === 429) {
          wikiFailure = new LookupError('rate-limited', 'Wiktionary is limiting requests right now. Try again in a minute.');
          break;
        } else if (res.status !== 404) {
          wikiFailure = new LookupError('network', `Wiktionary answered with an error (${res.status}).`);
          break;
        }
      }
      if (!entry) {
        // A service that failed beats one that said "not found": the word may exist.
        const error = wikiFailure ?? failure;
        if (error) throw error;
        const others = elsewhere.filter((n) => n !== languageName(options.language));
        const hint = others.length > 0 ? ` Wiktionary has it in: ${others.join(', ')}.` : '';
        throw new LookupError('not-found', `No ${languageName(options.language)} entry for “${word}”.${hint}`);
      }
    }

    if (options.related && entry.language === 'en') await this.addRelated(entry, http);

    this.cache.set(key, entry);
    if (this.cache.size > this.limit) {
      for (const oldest of this.cache.keys()) {
        this.cache.delete(oldest);
        break;
      }
    }
    return entry;
  }

  private pauseFirst(): void {
    this.firstDownUntil = this.timing.now() + this.timing.pauseMs;
  }

  /** Fills thin synonym and antonym lists from Datamuse. A failure there only leaves the lists as they are. */
  private async addRelated(entry: Entry, http: HttpGet): Promise<void> {
    const kinds: Relation[] = (['synonyms', 'antonyms'] as const).filter((k) => relatedWords(entry, k).length < ENOUGH_RELATED);
    const lists = await Promise.all(
      kinds.map(async (kind) => {
        try {
          const res = await http(datamuseUrl(entry.word, kind));
          return res.status === 200 ? parseDatamuse(res.json) : [];
        } catch {
          return [];
        }
      }),
    );
    kinds.forEach((kind, i) => {
      entry[kind] = uniqueWords([...entry[kind], ...lists[i]], entry.word);
    });
  }
}
