# Word Lookup

Look up any word in a sidebar dictionary: definitions, phonetics with audio, examples, and synonyms and antonyms you can click to look up in turn. Replace a word with a synonym from the right-click menu, or make a note for it.

Word Lookup is a successor to [Dictionary](https://github.com/phibr0/obsidian-dictionary), which has not been updated since 2022.

## What it does

- **Look up the selected word** (or the word at the cursor, or the text selected in Reading view) opens the **Dictionary** in the right sidebar. The right-click menu has the same entry: **Look up "word"**.
- **The entry** shows the word, its pronunciation (with a play button when a recording exists), the definitions under each part of speech with their examples, and synonyms and antonyms as buttons. Click one to look it up. A search box, a language picker, and back and forward buttons sit on top; the commands **Go back to the previous word** and **Go forward to the next word** do the same from the keyboard.
- **Replace the word with a synonym** (right-click menu or command) lists the synonyms in a picker you can filter by typing. The replacement keeps the capital letter or capitals of the original (`Happy` becomes `Joyful`) and is one edit, so one undo takes it back. If you change the note while the list is open, nothing is replaced.
- **Create a note** from the entry, with the built-in layout or your own template. If a note for the word already exists, it is opened, not overwritten.
- **Languages.** English uses the [Free Dictionary API](https://dictionaryapi.dev), with [Wiktionary](https://en.wiktionary.org) as a fallback when it has no entry or is down. Spanish, French, German, Italian, Portuguese and about twenty other languages come from Wiktionary, with definitions in English. Pick the language in the sidebar or in the settings. When a word has no entry in the chosen language but Wiktionary has it in others, the message says which.
- **Remembers lookups** for the session, so going back, or looking up the same word again, makes no request.

## Default note

Without a template, a note looks like this:

```markdown
# serene

*/sɪˈɹiːn/*

**adjective**

1. Calm, peaceful and untroubled; tranquil.
    - *a serene smile*

**Synonyms:** calm, placid, tranquil

**Antonyms:** agitated

Source: [Free Dictionary API](https://en.wiktionary.org/wiki/serene)
```

## Templates

Set a **Template file** in the settings and write it with variables in double braces, matched without regard to case. Names it does not know are left as written.

| Variable | Value |
| --- | --- |
| `{{word}}`, `{{title}}` | The word |
| `{{phonetic}}` | Pronunciation, if the source gives one |
| `{{definitions}}` | Each part of speech in bold, then a numbered list with examples under their definition |
| `{{examples}}` | The examples, one per line |
| `{{partsOfSpeech}}` | The parts of speech, joined with ", " |
| `{{synonyms}}`, `{{antonyms}}` | Joined with ", " |
| `{{language}}` | Language of the entry |
| `{{source}}` | Link to the source |
| `{{audio}}` | Address of the recording, if any |
| `{{date}}`, `{{time}}`, `{{date:FORMAT}}` | Today, with an optional [moment.js format](https://momentjs.com/docs/#/displaying/format/) |

## Settings

Language of the word, whether to find extra synonyms and antonyms, new note folder, template file, and whether to open the new note. They appear in Obsidian's settings search.

## Network use

Word Lookup talks to the network only when you look up a word, and only to these hosts, through Obsidian's own `requestUrl`:

- `api.dictionaryapi.dev`: English entries, and the recordings (`api.dictionaryapi.dev/media/...`, loaded when you press play).
- `en.wiktionary.org`: other languages, and English when the first service has no entry or is unavailable.
- `api.datamuse.com`: extra synonyms and antonyms for English entries whose source lists few. Turn it off in the settings ("Find extra synonyms and antonyms") to send only the word you look up to the dictionary services.

The word you look up is sent to those services, and nothing else: no note text, no account, no telemetry. The services are free and can be slow, rate-limited (Wiktionary asks clients to slow down) or down; the sidebar says so, and a failed lookup is not remembered.

## Not included

No offline dictionary, no definitions in languages other than English, no hover popups, and no lookup of whole sentences (selections of more than four words are ignored).

## Installation

In Obsidian, open **Settings → Community plugins → Browse** and search for "Word Lookup".

## More plugins by Siulved54

| Plugin | What it does | Source |
| --- | --- | --- |
| [Shared Blocks](https://obsidian.md/plugins?id=shared-blocks) | Write a block of text once and reuse it in any note. Edit the source and every reference re-renders live. | [shared-blocks](https://github.com/perezamadorluisenrique-gif/shared-blocks) |
| [Text Case and Cleanup](https://obsidian.md/plugins?id=text-format) | Change case, make camelCase or slugs, sort lines and remove duplicates, and repair text pasted out of a PDF, without touching code or URLs. | [text-format](https://github.com/perezamadorluisenrique-gif/text-format) |
| [Typography as You Type](https://obsidian.md/plugins?id=typography-as-you-type) | Curly quotes, dashes and ellipses as you type, kept out of code and maths, with Backspace to take one back. | [smart-typography-plugin](https://github.com/perezamadorluisenrique-gif/smart-typography-plugin) |
| [Section Numbering](https://obsidian.md/plugins?id=section-numbering) | Number headings as an outline (1, 1.1, 1.2) and keep every link to them working when they renumber. | [section-numbering](https://github.com/perezamadorluisenrique-gif/section-numbering) |
| [Spreadsheet to Table](https://obsidian.md/plugins?id=spreadsheet-to-table) | Paste cells from Excel or Google Sheets as a Markdown table with a real header, insert CSV files, and copy tables back out. | [spreadsheet-to-table](https://github.com/perezamadorluisenrique-gif/spreadsheet-to-table) |
| [Hybrid Line Numbers](https://obsidian.md/plugins?id=hybrid-line-numbers) | Relative and hybrid line numbers for Vim-style jumps, where a folded section counts as one line. | [hybrid-line-numbers](https://github.com/perezamadorluisenrique-gif/hybrid-line-numbers) |
| [List Item Callouts](https://obsidian.md/plugins?id=list-item-callouts) | Colour a single list item as a callout by starting it with a character such as `&`, `!` or `?`. | [list-item-callouts](https://github.com/perezamadorluisenrique-gif/list-item-callouts) |
| [Folder Counts](https://obsidian.md/plugins?id=folder-counts) | See how many notes or files each folder holds, right in the file explorer, with a vault total and folder exclusions. | [folder-counts](https://github.com/perezamadorluisenrique-gif/folder-counts) |
| [Note Reading Time](https://obsidian.md/plugins?id=note-reading-time) | Reading time of the current note or your selection in the status bar, optionally saved to a property. | [note-reading-time](https://github.com/perezamadorluisenrique-gif/note-reading-time) |
| [Task Rollover](https://obsidian.md/plugins?id=task-rollover) | Roll unfinished tasks from your last daily note into today's when it is created, with a real undo. | [task-rollover](https://github.com/perezamadorluisenrique-gif/task-rollover) |
| [Zoom Into Section](https://obsidian.md/plugins?id=zoom-into-section) | Zoom into a heading or list item to see only it and its contents, with a breadcrumb bar to climb back out. | [zoom-into-section](https://github.com/perezamadorluisenrique-gif/zoom-into-section) |
| [Link Title on Paste](https://obsidian.md/plugins?id=link-title-on-paste) | Paste a web address and get a Markdown link with the page's title, fetched in the background and undone in one step. | [link-title-on-paste](https://github.com/perezamadorluisenrique-gif/link-title-on-paste) |
| [Update Radar](https://obsidian.md/plugins?id=update-radar) | Checks your installed community plugins for updates in the background, shows what changed, and flags the ones that look abandoned. | [community-update-checker](https://github.com/perezamadorluisenrique-gif/community-update-checker) |
| [Dataview to Bases](https://obsidian.md/plugins?id=dataview-to-bases) | Convert Dataview queries into Bases blocks, and see which queries in your vault can be converted. | [dataview-to-bases](https://github.com/perezamadorluisenrique-gif/dataview-to-bases) |
| [Line Editing Commands](https://obsidian.md/plugins?id=line-editing-commands) | Duplicate, join, sort and reverse lines, insert blank lines and jump to a line number, with multi-cursor support. | [line-editing-commands](https://github.com/perezamadorluisenrique-gif/line-editing-commands) |
| [Note Mover Rules](https://obsidian.md/plugins?id=note-mover-rules) | Move notes into folders by ordered rules on tags, properties, titles and paths, with a preview before any bulk move. | [note-mover-rules](https://github.com/perezamadorluisenrique-gif/note-mover-rules) |
| [Tab History](https://obsidian.md/plugins?id=tab-history) | Keeps each tab's back and forward history across restarts, and adds commands to move, maximize and close tabs. | [tab-history](https://github.com/perezamadorluisenrique-gif/tab-history) |
| [URL Cards](https://obsidian.md/plugins?id=url-cards) | Shows web addresses as cards with title, description and image, and reads existing cardlink blocks. | [url-cards](https://github.com/perezamadorluisenrique-gif/url-cards) |
| [Vim Config](https://obsidian.md/plugins?id=vim-config) | Loads a vimrc-style file from your vault so your key mappings and editor commands are ready when vim mode starts. | [vim-config](https://github.com/perezamadorluisenrique-gif/vim-config) |
| [Task Archive](https://obsidian.md/plugins?id=task-archive) | Moves completed tasks, with their sub-items, into an archive section or note. | [task-archive](https://github.com/perezamadorluisenrique-gif/task-archive) |
| [Revisit Later](https://obsidian.md/plugins?id=revisit-later) | Link the current note into a future daily note, with a date typed in plain English, so it comes back when you want to review it. | [revisit-later](https://github.com/perezamadorluisenrique-gif/revisit-later) |
| [Explorer Colors Plus](https://obsidian.md/plugins?id=explorer-colors-plus) | Color files and folders in the file explorer, with a palette, cascading to children, and import from File Color. | [explorer-colors-plus](https://github.com/perezamadorluisenrique-gif/explorer-colors-plus) |
| [Book Lookup](https://obsidian.md/plugins?id=book-lookup) | Create book notes from Open Library or Google Books, with cover images, ISBN search and Book Search compatible templates. | [book-lookup](https://github.com/perezamadorluisenrique-gif/book-lookup) |
| [Web Search Menu](https://obsidian.md/plugins?id=web-search-menu) | Search the web for selected text or the note title from the right-click menu, with engines you define. | [web-search-menu](https://github.com/perezamadorluisenrique-gif/web-search-menu) |
| [Quick Translate](https://obsidian.md/plugins?id=quick-translate) | Translate the selection or a whole note into another language with no account, keeping links, code and front matter untouched. | [quick-translate](https://github.com/perezamadorluisenrique-gif/quick-translate) |
| [Dice Rolls](https://obsidian.md/plugins?id=dice-rolls) | Inline dice rolls you click to reroll, in Live Preview and Reading view, with full dice notation, a roll dialog and a roll history. Reads Dice Roller notes. | [dice-rolls](https://github.com/perezamadorluisenrique-gif/dice-rolls) |
| [Claude Studio](https://obsidian.md/plugins?id=claude-studio) | Notion-style AI writing, chat and vault tools powered by your local Claude Code CLI. | [claude-studio](https://github.com/perezamadorluisenrique-gif/claude-studio) |

All of them are in the community directory: Settings -> Community plugins ->
Browse, then search for the name.

Follow new plugins and updates on X: [@luenpereza](https://x.com/luenpereza)
