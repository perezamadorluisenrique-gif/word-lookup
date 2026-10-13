import { relatedWords, SOURCE_LABELS } from './entry.ts';
import type { Entry } from './entry.ts';

/** Formats today's date with a moment.js format. Supplied by main.ts so this file needs no moment. */
export type DateFormatter = (format: string) => string;

const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';

/** The definitions as Markdown: a bold part of speech, then a numbered list with each example under its definition. */
export function definitionsMarkdown(entry: Entry): string {
  return entry.meanings
    .map((meaning) => {
      const lines = [`**${meaning.partOfSpeech}**`, ''];
      meaning.definitions.forEach((d, i) => {
        lines.push(`${i + 1}. ${d.text}`);
        if (d.example) lines.push(`    - *${d.example}*`);
      });
      return lines.join('\n');
    })
    .join('\n\n');
}

export function examplesMarkdown(entry: Entry): string {
  const out: string[] = [];
  for (const meaning of entry.meanings) for (const d of meaning.definitions) if (d.example) out.push(`- ${d.example}`);
  return out.join('\n');
}

function sourceText(entry: Entry): string {
  const label = SOURCE_LABELS[entry.source];
  return entry.sourceUrl ? `[${label}](${entry.sourceUrl})` : label;
}

/** The note a lookup becomes when the user has no template. */
export function defaultNote(entry: Entry): string {
  const parts = [`# ${entry.word}`];
  if (entry.phonetic) parts.push(`*${entry.phonetic}*`);
  parts.push(definitionsMarkdown(entry));
  const syn = relatedWords(entry, 'synonyms');
  const ant = relatedWords(entry, 'antonyms');
  if (syn.length > 0) parts.push(`**Synonyms:** ${syn.join(', ')}`);
  if (ant.length > 0) parts.push(`**Antonyms:** ${ant.join(', ')}`);
  parts.push(`Source: ${sourceText(entry)}`);
  return parts.join('\n\n') + '\n';
}

/**
 * Fills a template with a word. Variables: {{word}} (also {{title}}, so a core Templates file works),
 * {{phonetic}}, {{definitions}}, {{examples}}, {{partsOfSpeech}}, {{synonyms}}, {{antonyms}}, {{language}},
 * {{source}}, {{audio}}, {{date}}, {{date:FORMAT}} and {{time}}. Anything else stays as written.
 */
export function renderTemplate(template: string, entry: Entry, fmt: DateFormatter): string {
  const values: Record<string, () => string> = {
    word: () => entry.word,
    title: () => entry.word,
    phonetic: () => entry.phonetic,
    definitions: () => definitionsMarkdown(entry),
    examples: () => examplesMarkdown(entry),
    partsofspeech: () => entry.meanings.map((m) => m.partOfSpeech).join(', '),
    synonyms: () => relatedWords(entry, 'synonyms').join(', '),
    antonyms: () => relatedWords(entry, 'antonyms').join(', '),
    language: () => entry.languageName,
    source: () => sourceText(entry),
    audio: () => entry.audio,
    date: () => fmt(DEFAULT_DATE_FORMAT),
    time: () => fmt('HH:mm'),
  };
  return template.replace(/{{\s*(\w+)(?::([^}\n]+?))?\s*}}/g, (whole, name: string, format: string | undefined) => {
    const key = name.toLowerCase();
    if (format !== undefined) return key === 'date' || key === 'time' ? fmt(format.trim()) : whole;
    const value = values[key];
    return value ? value() : whole;
  });
}

/** A file name for a word: the characters a vault path or link cannot hold are removed. */
export function noteFileName(word: string): string {
  const name = word
    .replace(/[\\/:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  return name || 'Word';
}
