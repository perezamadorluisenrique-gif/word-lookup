import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDatamuse } from '../src/datamuse.ts';
import { parseDictionaryApi } from '../src/dictionaryapi.ts';
import { relatedWords } from '../src/entry.ts';
import { decodeEntities, stripHtml } from '../src/text.ts';
import { parseWiktionary } from '../src/wiktionary.ts';
import { fixture } from './helpers.ts';

test('Free Dictionary API: merges the entries of a word under their part of speech', () => {
  const entry = parseDictionaryApi(fixture('freedict-serene.json'), 'serene');
  assert.ok(entry);
  assert.equal(entry.word, 'serene');
  assert.equal(entry.phonetic, '/sɪˈɹiːn/');
  assert.equal(entry.audio, 'https://api.dictionaryapi.dev/media/pronunciations/en/serene-us.mp3');
  assert.equal(entry.sourceUrl, 'https://en.wiktionary.org/wiki/serene');
  assert.deepEqual(
    entry.meanings.map((m) => [m.partOfSpeech, m.definitions.length]),
    [
      ['adjective', 3],
      ['noun', 1],
    ],
  );
  const adjective = entry.meanings[0];
  assert.equal(adjective.definitions[0].example, 'a serene smile');
  assert.deepEqual(adjective.synonyms, ['calm', 'placid', 'fair']);
  assert.deepEqual(adjective.antonyms, ['agitated']);
});

test('Free Dictionary API: the not-found object and junk give null', () => {
  assert.equal(parseDictionaryApi(fixture('freedict-not-found.json'), 'zzz'), null);
  assert.equal(parseDictionaryApi(null, 'x'), null);
  assert.equal(parseDictionaryApi([], 'x'), null);
  assert.equal(parseDictionaryApi([{ word: 'x', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: '  ' }] }] }], 'x'), null);
});

test('Free Dictionary API: audio must be an http(s) address', () => {
  const json = [{ word: 'a', phonetics: [{ audio: 'javascript:alert(1)' }, { audio: '//x/y.mp3' }], meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'd' }] }] }];
  assert.equal(parseDictionaryApi(json, 'a')?.audio, '');
});

test('Datamuse: words in order, junk ignored', () => {
  assert.deepEqual(parseDatamuse(fixture('datamuse-syn-serene.json')), ['tranquil', 'clear', 'calm', 'peaceful']);
  assert.deepEqual(parseDatamuse({ error: 1 }), []);
  assert.deepEqual(parseDatamuse([{ word: '' }, { score: 3 }, null, { word: ' ok ' }]), ['ok']);
});

test('Wiktionary: keeps the chosen language, strips HTML, drops empty definitions', () => {
  const { entry } = parseWiktionary(fixture('wiktionary-chat.json'), 'chat', 'en');
  assert.ok(entry);
  assert.equal(entry.languageName, 'English');
  assert.deepEqual(
    entry.meanings.map((m) => [m.partOfSpeech, m.definitions.length]),
    [
      ['verb', 2],
      ['noun', 1],
    ],
  );
  assert.equal(entry.meanings[0].definitions[0].text, 'To be engaged in informal conversation.');
  assert.equal(entry.meanings[0].definitions[0].example, 'She chatted with her friend in the cafe.');
  assert.equal(entry.meanings[0].definitions[1].text, 'To talk & type live online.');
  assert.equal(entry.meanings[0].definitions[1].example, "Let's chat tonight.");
  assert.equal(entry.sourceUrl, 'https://en.wiktionary.org/wiki/chat');
});

test('Wiktionary: a word of another language, and the languages that exist when it is missing', () => {
  const es = parseWiktionary(fixture('wiktionary-casa.json'), 'casa', 'es');
  assert.equal(es.entry?.meanings[0].definitions[0].text, 'house, home');
  assert.equal(es.entry?.meanings[0].definitions[0].example, 'Vivo en una casa grande.');
  assert.equal(es.entry?.meanings[1].definitions[0].text, 'first-person singular present indicative of casar');
  const missing = parseWiktionary(fixture('wiktionary-casa.json'), 'casa', 'fr');
  assert.equal(missing.entry, null);
  assert.deepEqual(missing.elsewhere, ['Spanish', 'Italian']);
  assert.deepEqual(parseWiktionary('nope', 'x', 'en'), { entry: null, elsewhere: [] });
});

test('stripHtml and decodeEntities', () => {
  assert.equal(stripHtml('a <b>b</b>\n  c &amp; d &#39;e&#x27; &nbsp;f &unknown;'), "a b c & d 'e' f &unknown;");
  assert.equal(decodeEntities('&#0; &#99999999;'), '&#0; &#99999999;');
});

test('relatedWords joins the meanings and the entry without repeats or the headword', () => {
  const entry = parseDictionaryApi(fixture('freedict-serene.json'), 'serene');
  assert.ok(entry);
  entry.synonyms = ['Calm', 'serene', 'quiet'];
  assert.deepEqual(relatedWords(entry, 'synonyms'), ['calm', 'placid', 'fair', 'quiet']);
});

test('Wiktionary: nested sub-senses are not repeated, Translingual rows are not English, Norwegian is found', () => {
  const json = {
    en: [
      { partOfSpeech: 'Symbol', language: 'Translingual', definitions: [{ definition: 'ISO 639-3 language code for Kirundi.' }] },
      {
        partOfSpeech: 'Verb',
        language: 'English',
        definitions: [
          { definition: 'To move <a href="/wiki/swiftly">swiftly</a>.\n<ol><li>To move forward quickly upon two feet.</li></ol>' },
          { definition: 'To move forward quickly upon two feet.' },
        ],
      },
    ],
    other: [
      { partOfSpeech: 'Noun', language: 'Norwegian Bokmål', definitions: [{ definition: 'a house' }] },
      { partOfSpeech: 'Noun', language: 'Old English', definitions: [{ definition: 'house' }] },
    ],
  };
  const en = parseWiktionary(json, 'run', 'en');
  assert.deepEqual(
    en.entry?.meanings.map((m) => [m.partOfSpeech, m.definitions.map((d) => d.text)]),
    [['verb', ['To move swiftly.', 'To move forward quickly upon two feet.']]],
  );
  assert.deepEqual(parseWiktionary(json, 'hus', 'no').entry?.meanings[0].definitions[0].text, 'a house');
  const fr = parseWiktionary(json, 'hus', 'fr');
  assert.equal(fr.entry, null);
  assert.deepEqual(fr.elsewhere, ['English', 'Norwegian Bokmål', 'Old English']);
});
