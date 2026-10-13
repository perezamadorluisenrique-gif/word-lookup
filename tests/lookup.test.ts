import test from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary, LookupError } from '../src/lookup.ts';
import type { HttpGet } from '../src/lookup.ts';
import { fakeHttp, fixture, FREEDICT, MUSE, ok, WIKI } from './helpers.ts';

const EN = { language: 'en', related: true };

test('English: Free Dictionary API first, Datamuse fills the thin lists', async () => {
  const http = fakeHttp({
    [FREEDICT + 'serene']: ok(fixture('freedict-serene.json')),
    [MUSE + 'syn=serene']: ok(fixture('datamuse-syn-serene.json')),
    [MUSE + 'ant=serene']: ok(fixture('datamuse-ant-hot.json')),
  });
  const entry = await new Dictionary().lookup('  Serene. ', { ...EN }, http).catch((e: unknown) => e);
  // "Serene" is tried as typed, then lower case.
  assert.ok(!(entry instanceof Error), String(entry));
  assert.deepEqual(http.calls.slice(0, 2), [FREEDICT + 'Serene', FREEDICT + 'serene']);
  assert.equal(entry.source, 'dictionaryapi');
  assert.deepEqual(entry.synonyms, ['tranquil', 'clear', 'calm', 'peaceful']);
  assert.deepEqual(entry.antonyms, ['cold', 'cool']);
});

test('English: Datamuse is skipped when the setting is off or the source already has enough', async () => {
  const http = fakeHttp({ [FREEDICT + 'serene']: ok(fixture('freedict-serene.json')) });
  await new Dictionary().lookup('serene', { language: 'en', related: false }, http);
  assert.deepEqual(http.calls, [FREEDICT + 'serene']);
});

test('English: a Datamuse failure leaves the entry without extras', async () => {
  const http = fakeHttp({ [FREEDICT + 'serene']: ok(fixture('freedict-serene.json')), [MUSE]: 'throw' });
  const entry = await new Dictionary().lookup('serene', { ...EN }, http);
  assert.deepEqual(entry.synonyms, []);
});

test('English: falls back to Wiktionary when the first service is down or has no entry', async () => {
  for (const first of [{ status: 522, json: null }, { status: 404, json: fixture('freedict-not-found.json') }, 'throw' as const]) {
    const http = fakeHttp({ [FREEDICT]: first, [WIKI + 'chat']: ok(fixture('wiktionary-chat.json')) });
    const entry = await new Dictionary().lookup('chat', { language: 'en', related: false }, http);
    assert.equal(entry.source, 'wiktionary');
    assert.equal(entry.meanings[0].partOfSpeech, 'verb');
  }
});

test('other languages go straight to Wiktionary', async () => {
  const http = fakeHttp({ [WIKI + 'casa']: ok(fixture('wiktionary-casa.json')) });
  const entry = await new Dictionary().lookup('casa', { language: 'es', related: true }, http);
  assert.deepEqual(http.calls, [WIKI + 'casa']);
  assert.equal(entry.languageName, 'Spanish');
});

test('a phrase is sent as one encoded query', async () => {
  const http = fakeHttp({ [FREEDICT]: ok(fixture('freedict-serene.json')) });
  await new Dictionary().lookup('ice cream', { language: 'en', related: false }, http);
  assert.equal(http.calls[0], FREEDICT + 'ice%20cream');
});

test('not found names the languages Wiktionary does have', async () => {
  const http = fakeHttp({ [WIKI + 'casa']: ok(fixture('wiktionary-casa.json')) });
  await assert.rejects(
    new Dictionary().lookup('casa', { language: 'fr', related: false }, http),
    (e: unknown) => e instanceof LookupError && e.kind === 'not-found' && e.message === 'No French entry for “casa”. Wiktionary has it in: Spanish, Italian.',
  );
  await assert.rejects(new Dictionary().lookup('zzzqx', { ...EN }, fakeHttp({})), (e: unknown) => e instanceof LookupError && e.kind === 'not-found');
});

test('rate limiting and network errors are told apart from not found', async () => {
  await assert.rejects(
    new Dictionary().lookup('casa', { language: 'es', related: false }, fakeHttp({ [WIKI]: { status: 429, json: null } })),
    (e: unknown) => e instanceof LookupError && e.kind === 'rate-limited',
  );
  await assert.rejects(
    new Dictionary().lookup('casa', { language: 'es', related: false }, fakeHttp({ [WIKI]: 'throw' })),
    (e: unknown) => e instanceof LookupError && e.kind === 'network',
  );
  // The first service down and Wiktionary silent: the word may exist, so this is an error, not "not found".
  await assert.rejects(
    new Dictionary().lookup('word', { ...EN }, fakeHttp({ [FREEDICT]: { status: 500, json: null } })),
    (e: unknown) => e instanceof LookupError && e.kind === 'network',
  );
});

test('an empty query asks for a word without any request', async () => {
  const http = fakeHttp({});
  await assert.rejects(new Dictionary().lookup(' ... ', { ...EN }, http), (e: unknown) => e instanceof LookupError && e.kind === 'empty');
  assert.deepEqual(http.calls, []);
});

test('answers are cached per language and word, ignoring case; failures are not', async () => {
  const dictionary = new Dictionary();
  const http = fakeHttp({ [FREEDICT]: ok(fixture('freedict-serene.json')) });
  const opts = { language: 'en', related: false };
  const a = await dictionary.lookup('serene', opts, http);
  const b = await dictionary.lookup('SERENE', opts, http);
  assert.equal(a, b);
  assert.equal(http.calls.length, 1);
  assert.equal(dictionary.cached('Serene', 'en'), a);
  assert.equal(dictionary.cached('serene', 'es'), undefined);

  await assert.rejects(dictionary.lookup('nothing', opts, fakeHttp({})));
  assert.equal(dictionary.cached('nothing', 'en'), undefined);
  dictionary.clear();
  assert.equal(dictionary.cached('serene', 'en'), undefined);
});

test('the cache drops the least recently used word beyond its limit', async () => {
  const dictionary = new Dictionary(2);
  const http = fakeHttp({ [FREEDICT]: ok(fixture('freedict-serene.json')) });
  const opts = { language: 'en', related: false };
  await dictionary.lookup('one', opts, http);
  await dictionary.lookup('two', opts, http);
  await dictionary.lookup('one', opts, http);
  await dictionary.lookup('three', opts, http);
  assert.ok(dictionary.cached('one', 'en'));
  assert.equal(dictionary.cached('two', 'en'), undefined);
});

test('English: a stalled or failing first service is skipped for a while', async () => {
  let clock = 0;
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const dictionary = new Dictionary(200, { timeoutMs: 20, pauseMs: 1000, now: () => clock, sleep });
  const stalled: HttpGet = (url) => (url.startsWith(FREEDICT) ? new Promise(() => {}) : fakeHttp({ [WIKI + 'chat']: ok(fixture('wiktionary-chat.json')) })(url));
  const first = await dictionary.lookup('chat', { language: 'en', related: false }, stalled);
  assert.equal(first.source, 'wiktionary');

  // Paused: straight to Wiktionary.
  dictionary.clear();
  const http = fakeHttp({ [FREEDICT]: ok(fixture('freedict-serene.json')), [WIKI + 'chat']: ok(fixture('wiktionary-chat.json')) });
  await dictionary.lookup('chat', { language: 'en', related: false }, http);
  assert.deepEqual(http.calls, [WIKI + 'chat']);

  // Back after the pause; a server error starts another one, a 404 does not.
  clock = 1000;
  dictionary.clear();
  const failing = fakeHttp({ [FREEDICT]: { status: 503, json: null }, [WIKI + 'chat']: ok(fixture('wiktionary-chat.json')) });
  await dictionary.lookup('chat', { language: 'en', related: false }, failing);
  assert.equal(failing.calls[0], FREEDICT + 'chat');
  dictionary.clear();
  const again = fakeHttp({ [WIKI + 'chat']: ok(fixture('wiktionary-chat.json')) });
  await dictionary.lookup('chat', { language: 'en', related: false }, again);
  assert.deepEqual(again.calls, [WIKI + 'chat']);

  clock = 2000;
  dictionary.clear();
  const missing = fakeHttp({ [WIKI + 'chat']: ok(fixture('wiktionary-chat.json')) });
  await dictionary.lookup('chat', { language: 'en', related: false }, missing);
  await dictionary.lookup('word', { language: 'en', related: false }, fakeHttp({ [WIKI + 'word']: ok(fixture('wiktionary-chat.json')) }));
  dictionary.clear();
  const back = fakeHttp({ [FREEDICT]: ok(fixture('freedict-serene.json')) });
  await dictionary.lookup('serene', { language: 'en', related: false }, back);
  assert.deepEqual(back.calls, [FREEDICT + 'serene']);
});
