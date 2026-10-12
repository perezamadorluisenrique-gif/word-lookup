# Changelog

The release workflow uses the section named after the version being released
as the release description, so every version needs one. `npm version <x.y.z>`
renames the `Unreleased` heading below to that version.

## 0.1.0

- Sidebar dictionary with definitions, examples, pronunciation, and synonyms and antonyms you can click to look up.
- Look up a word from the command palette, the right-click menu or the ribbon; works on a selection, the word at the cursor, or text selected in Reading view.
- Back and forward through the words you looked up, and a language picker (English from the Free Dictionary API with Wiktionary as a fallback; other languages from Wiktionary).
- Replace a word with a synonym in one undoable edit, keeping its capitalization.
- Create a note for a word, from the built-in layout or a template file.
