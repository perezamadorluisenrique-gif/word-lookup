import { readFileSync } from 'node:fs';

import type { HttpGet, HttpResponse } from '../src/lookup.ts';

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

type Route = HttpResponse | (() => HttpResponse) | 'throw';

/**
 * A fake network: the first route whose key the address starts with answers; anything else is a 404.
 * `calls` lists every address asked, in order.
 */
export function fakeHttp(routes: Record<string, Route>): HttpGet & { calls: string[] } {
  const calls: string[] = [];
  const http = async (url: string): Promise<HttpResponse> => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return { status: 404, json: null };
    const route = routes[key];
    if (route === 'throw') throw new Error('offline');
    return typeof route === 'function' ? route() : route;
  };
  return Object.assign(http, { calls });
}

export const ok = (json: unknown): HttpResponse => ({ status: 200, json });

export const FREEDICT = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
export const WIKI = 'https://en.wiktionary.org/api/rest_v1/page/definition/';
export const MUSE = 'https://api.datamuse.com/words?rel_';
