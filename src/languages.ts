/** Languages offered in the settings. Wiktionary's codes; English also has the Free Dictionary API. */
export const LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  ca: 'Catalan',
  gl: 'Galician',
  pl: 'Polish',
  cs: 'Czech',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  ru: 'Russian',
  uk: 'Ukrainian',
  el: 'Greek',
  tr: 'Turkish',
  ar: 'Arabic',
  he: 'Hebrew',
  hi: 'Hindi',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  la: 'Latin',
};

export const DEFAULT_LANGUAGE = 'en';

export function languageName(code: string): string {
  return LANGUAGES[code] ?? code;
}
