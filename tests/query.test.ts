import test from 'node:test';
import assert from 'node:assert/strict';

import { LookupHistory } from '../src/history.ts';
import { cleanQuery, matchCase, trimSpan, wordAt } from '../src/query.ts';

test('cleanQuery trims punctuation and refuses sentences', () => {
  assert.equal(cleanQuery('  “Serene,” '), 'Serene');
  assert.equal(cleanQuery('ice   cream.'), 'ice cream');
  assert.equal(cleanQuery("don't"), "don't");
  assert.equal(cleanQuery('!!! ...'), '');
  assert.equal(cleanQuery('one two three four five'), '');
  assert.equal(cleanQuery('x'.repeat(61)), '');
  assert.equal(cleanQuery('naïve façade'), 'naïve façade');
  assert.equal(cleanQuery('日本語'), '日本語');
});

test('trimSpan reports where the kept text sits in the selection', () => {
  assert.deepEqual(trimSpan('  ("Hello") '), { text: 'Hello', start: 4, end: 9 });
  assert.equal(trimSpan(''), null);
});

test('wordAt finds the word around or just before the cursor', () => {
  const line = 'The "serene" lake, well-known (and don’t forget).';
  assert.deepEqual(wordAt(line, 7), { text: 'serene', start: 5, end: 11 });
  assert.deepEqual(wordAt(line, 5), { text: 'serene', start: 5, end: 11 });
  assert.deepEqual(wordAt(line, 11), { text: 'serene', start: 5, end: 11 });
  assert.equal(wordAt(line, 12), null, 'a quote after the word is not the word');
  assert.equal(wordAt(line, 20)?.text, 'well-known');
  assert.equal(wordAt(line, 36)?.text, 'don’t');
  assert.equal(wordAt('a  b', 2), null);
  assert.equal(wordAt('', 0), null);
  assert.equal(wordAt('--', 1), null);
  assert.equal(wordAt('-ing-', 2)?.text, 'ing');
});

test('wordAt counts offsets in UTF-16 units, as the editor does', () => {
  assert.deepEqual(wordAt('😀 café', 5), { text: 'café', start: 3, end: 7 });
});

test('matchCase follows the original', () => {
  assert.equal(matchCase('Happy', 'joyful'), 'Joyful');
  assert.equal(matchCase('HAPPY', 'joyful'), 'JOYFUL');
  assert.equal(matchCase('happy', 'joyful'), 'joyful');
  assert.equal(matchCase('A', 'an'), 'An');
  assert.equal(matchCase('1', 'one'), 'one');
  assert.equal(matchCase('Happy', 'ice cream'), 'Ice cream');
});

test('history works like a browser', () => {
  const h = new LookupHistory();
  assert.equal(h.current, null);
  assert.equal(h.back(), null);
  h.push('one');
  h.push('two');
  h.push('Two');
  h.push('three');
  assert.equal(h.size, 3);
  assert.deepEqual([h.canBack, h.canForward], [true, false]);
  assert.equal(h.back(), 'two');
  assert.equal(h.back(), 'one');
  assert.equal(h.back(), null);
  assert.equal(h.forward(), 'two');
  h.push('four');
  assert.equal(h.canForward, false, 'a new word drops the forward list');
  assert.equal(h.back(), 'two');
});

test('history keeps the last hundred', () => {
  const h = new LookupHistory();
  for (let i = 0; i < 150; i++) h.push(`w${i}`);
  assert.equal(h.size, 100);
  assert.equal(h.current, 'w149');
  for (let i = 0; i < 99; i++) h.back();
  assert.equal(h.current, 'w50');
  assert.equal(h.canBack, false);
});
