import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDictionaryApi } from '../src/dictionaryapi.ts';
import { defaultNote, definitionsMarkdown, noteFileName, renderTemplate } from '../src/template.ts';
import { fixture } from './helpers.ts';

const entry = parseDictionaryApi(fixture('freedict-serene.json'), 'serene');
if (!entry) throw new Error('fixture');
entry.synonyms = ['tranquil'];
const fmt = (format: string) => `<${format}>`;

test('definitions: part of speech, numbered list, examples nested', () => {
  assert.equal(
    definitionsMarkdown(entry).split('\n\n**noun**')[0],
    [
      '**adjective**',
      '',
      '1. Calm, peaceful and untroubled; tranquil.',
      '    - *a serene smile*',
      '2. Clear, fair and fine; said of the sky or the weather.',
      '3. A title of respect, as in Serene Highness.',
    ].join('\n'),
  );
});

test('the built-in note', () => {
  const note = defaultNote(entry);
  assert.match(note, /^# serene\n\n\*\/sɪˈɹiːn\/\*\n\n\*\*adjective\*\*/);
  assert.match(note, /\*\*Synonyms:\*\* calm, placid, fair, tranquil\n/);
  assert.match(note, /\*\*Antonyms:\*\* agitated\n/);
  assert.match(note, /Source: \[Free Dictionary API\]\(https:\/\/en\.wiktionary\.org\/wiki\/serene\)\n$/);
});

test('template variables, in any case; unknown ones stay as written', () => {
  const out = renderTemplate('# {{Word}} / {{title}}\n{{phonetic}} {{partsOfSpeech}}\n{{synonyms}}|{{antonyms}}|{{language}}\n{{date}} {{date:YYYY}} {{time}} {{nope}} {{unknown:x}}', entry, fmt);
  assert.equal(
    out,
    '# serene / serene\n/sɪˈɹiːn/ adjective, noun\ncalm, placid, fair, tranquil|agitated|English\n<YYYY-MM-DD> <YYYY> <HH:mm> {{nope}} {{unknown:x}}',
  );
});

test('{{definitions}} and {{examples}} in a template', () => {
  const out = renderTemplate('{{examples}}\n---\n{{ definitions }}', entry, fmt);
  assert.ok(out.startsWith('- a serene smile\n---\n**adjective**'));
});

test('file names lose the characters a vault cannot hold', () => {
  assert.equal(noteFileName('what/ever: [x]#?'), 'whatever x');
  assert.equal(noteFileName('  ice   cream '), 'ice cream');
  assert.equal(noteFileName('..hidden'), 'hidden');
  assert.equal(noteFileName('???'), 'Word');
});
