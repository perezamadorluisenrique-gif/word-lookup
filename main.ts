import { ItemView, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, SuggestModal, TFile, moment, normalizePath, requestUrl, setIcon } from 'obsidian';
import type { App, Editor, EditorPosition, WorkspaceLeaf, SettingDefinitionItem } from 'obsidian';

import { relatedWords, SOURCE_LABELS } from './src/entry.ts';
import type { Entry } from './src/entry.ts';
import { LookupHistory } from './src/history.ts';
import { DEFAULT_LANGUAGE, LANGUAGES } from './src/languages.ts';
import { Dictionary, LookupError } from './src/lookup.ts';
import type { HttpGet, LookupOptions } from './src/lookup.ts';
import { cleanQuery, matchCase, trimSpan, wordAt } from './src/query.ts';
import { defaultNote, noteFileName, renderTemplate } from './src/template.ts';
import type { DateFormatter } from './src/template.ts';

/** The part of moment this plugin uses, typed here: the directory's review has no types for `moment`. */
interface Moment {
  format(format: string): string;
}
const now = moment as unknown as () => Moment;

const VIEW_TYPE = 'word-lookup-view';
/** Definitions shown per part of speech before "Show more". */
const SHOWN_DEFINITIONS = 4;

interface WordLookupSettings {
  language: string;
  relatedWords: boolean;
  folder: string;
  templateFile: string;
  openAfterCreate: boolean;
}

const DEFAULT_SETTINGS: WordLookupSettings = {
  language: DEFAULT_LANGUAGE,
  relatedWords: true,
  folder: '',
  templateFile: '',
  openAfterCreate: true,
};

/** Names and descriptions shared by the declarative settings tab and the older `display()`. */
const TEXT = {
  language: {
    name: 'Language of the word',
    desc: 'English words come from the Free Dictionary API, with Wiktionary as a fallback. Every other language comes from Wiktionary, with definitions in English.',
  },
  relatedWords: {
    name: 'Find extra synonyms and antonyms',
    desc: 'When a dictionary entry lists few, ask Datamuse for more. English only. Turn off to send only the word you look up to the dictionary services.',
  },
  folder: { name: 'New note folder', desc: 'Notes made from a lookup are created here. Empty for the vault root.' },
  templateFile: {
    name: 'Template file',
    desc: 'A note with {{word}}, {{phonetic}}, {{definitions}}, {{examples}}, {{partsOfSpeech}}, {{synonyms}}, {{antonyms}}, {{language}}, {{source}}, {{date}} and {{time}}. Empty uses the built-in note.',
  },
  openAfterCreate: { name: 'Open the new note', desc: 'Open a note right after creating it. An existing note is always opened.' },
} as const;

/** A word in an editor: the text to look up and the exact range it sits in. */
interface Target {
  from: EditorPosition;
  to: EditorPosition;
  /** The range as written, which a replacement must find unchanged. */
  raw: string;
  query: string;
}

export default class WordLookupPlugin extends Plugin {
  settings: WordLookupSettings = { ...DEFAULT_SETTINGS };
  dictionary = new Dictionary();

  /**
   * Every request to the dictionary services goes through here. A property, so the end-to-end tests can
   * replace it and run without a network.
   */
  http: HttpGet = async (url, headers) => {
    const res = await requestUrl({ url, headers, throw: false });
    let json: unknown = null;
    try {
      json = res.json;
    } catch {
      // Not JSON (an HTML error page): the status says enough.
    }
    return { status: res.status, json };
  };

  /** Plays a recording. A property, for the same reason as `http`. */
  playAudio = (url: string): Promise<void> => new Audio(url).play();

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new WordLookupSettingTab(this.app, this));
    this.registerView(VIEW_TYPE, (leaf) => new WordLookupView(leaf, this));

    this.addRibbonIcon('book-a', 'Look up a word', () => void this.lookUp(''));
    this.addCommand({
      id: 'look-up',
      name: 'Look up the selected word',
      icon: 'book-a',
      callback: () => void this.lookUp(this.queryFromActive()),
    });
    this.addCommand({
      id: 'open',
      name: 'Open the dictionary',
      icon: 'book-open',
      callback: () => void this.lookUp(''),
    });
    this.addCommand({
      id: 'create-note',
      name: 'Create a note for the word in the dictionary',
      icon: 'file-plus',
      callback: () => void this.createNoteFromView(),
    });
    this.addCommand({
      id: 'replace-synonym',
      name: 'Replace the word with a synonym…',
      icon: 'replace',
      editorCheckCallback: (checking, editor) => {
        const target = this.targetIn(editor);
        if (!target) return false;
        if (!checking) void this.replaceWithSynonym(editor, target);
        return true;
      },
    });
    this.addCommand({
      id: 'previous-lookup',
      name: 'Go back to the previous word in the dictionary',
      icon: 'arrow-left',
      checkCallback: (checking) => this.stepHistory(checking, -1),
    });
    this.addCommand({
      id: 'next-lookup',
      name: 'Go forward to the next word in the dictionary',
      icon: 'arrow-right',
      checkCallback: (checking) => this.stepHistory(checking, 1),
    });

    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        const target = this.targetIn(editor);
        if (!target) return;
        const label = target.query.length > 24 ? `${target.query.slice(0, 23)}…` : target.query;
        menu.addItem((item) =>
          item
            .setTitle(`Look up “${label}”`)
            .setIcon('book-a')
            .setSection('selection')
            .onClick(() => void this.lookUp(target.query)),
        );
        menu.addItem((item) =>
          item
            .setTitle(`Replace “${label}” with a synonym…`)
            .setIcon('replace')
            .setSection('selection')
            .onClick(() => void this.replaceWithSynonym(editor, target)),
        );
      }),
    );
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<WordLookupSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
    if (!(this.settings.language in LANGUAGES)) this.settings.language = DEFAULT_SETTINGS.language;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  lookupOptions(): LookupOptions {
    return { language: this.settings.language, related: this.settings.relatedWords };
  }

  // --- The view -----------------------------------------------------------------------------------------------

  private view(): WordLookupView | null {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    return leaf?.view instanceof WordLookupView ? leaf.view : null;
  }

  /** Shows the dictionary in the right sidebar, reusing it when it is already open. */
  async openView(): Promise<WordLookupView | null> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return null;
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
    return leaf.view instanceof WordLookupView ? leaf.view : null;
  }

  /** Looks `query` up in the sidebar. Empty: just open it with the search box ready. */
  async lookUp(query: string): Promise<void> {
    const view = await this.openView();
    if (!view) return;
    if (query) await view.show(query);
    else view.focusSearch();
  }

  private stepHistory(checking: boolean, direction: -1 | 1): boolean {
    const view = this.view();
    if (!view || !(direction < 0 ? view.canBack() : view.canForward())) return false;
    if (!checking) void view.go(direction);
    return true;
  }

  // --- Reading the word to look up ------------------------------------------------------------------------------

  /** The selection of the note being edited, the word at its cursor, or the selected text of a reading view. */
  private queryFromActive(): string {
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (md && md.getMode() === 'source') {
      const query = cleanQuery(md.editor.getSelection());
      if (query) return query;
      const cursor = md.editor.getCursor();
      return wordAt(md.editor.getLine(cursor.line), cursor.ch)?.text ?? '';
    }
    return cleanQuery(activeDocument.getSelection()?.toString() ?? '');
  }

  /**
   * What a lookup or a replacement would act on: a one-line selection, trimmed of punctuation, or the
   * word at the cursor. A selection over several lines can be looked up but has no single range to replace.
   */
  private targetIn(editor: Editor): Target | null {
    const from = editor.getCursor('from');
    const to = editor.getCursor('to');
    if (from.line !== to.line) return null;
    if (from.ch === to.ch) {
      const word = wordAt(editor.getLine(from.line), from.ch);
      if (!word) return null;
      return { from: { line: from.line, ch: word.start }, to: { line: from.line, ch: word.end }, raw: word.text, query: cleanQuery(word.text) };
    }
    const span = trimSpan(editor.getRange(from, to));
    if (!span) return null;
    const start = { line: from.line, ch: from.ch + span.start };
    const end = { line: from.line, ch: from.ch + span.end };
    return { from: start, to: end, raw: editor.getRange(start, end), query: span.text };
  }

  // --- Replacing a word with a synonym --------------------------------------------------------------------------

  async replaceWithSynonym(editor: Editor, target: Target): Promise<void> {
    let entry: Entry;
    try {
      entry = await this.dictionary.lookup(target.query, this.lookupOptions(), this.http);
    } catch (error) {
      new Notice(error instanceof LookupError ? error.message : 'The lookup failed.');
      return;
    }
    const synonyms = relatedWords(entry, 'synonyms');
    if (synonyms.length === 0) {
      new Notice(`No synonyms found for “${target.query}”.`);
      return;
    }
    new SynonymModal(this.app, target.query, synonyms, (choice) => {
      // The note may have changed while the list was open: replace only if the word is still there.
      if (editor.getRange(target.from, target.to) !== target.raw) {
        new Notice('The text changed while you were choosing. Select the word again.');
        return;
      }
      editor.transaction({ changes: [{ from: target.from, to: target.to, text: matchCase(target.raw, choice) }] });
    }).open();
  }

  // --- Notes ------------------------------------------------------------------------------------------------------

  private formatDate: DateFormatter = (format) => now().format(format);

  private async createNoteFromView(): Promise<void> {
    const entry = this.view()?.entry ?? null;
    if (!entry) {
      await this.lookUp('');
      new Notice('Look up a word first, then create its note.');
      return;
    }
    await this.createNote(entry);
  }

  /** Creates the note for a looked-up word, or opens it when one with that name exists. */
  async createNote(entry: Entry): Promise<TFile> {
    const s = this.settings;
    const name = noteFileName(entry.word);
    const path = normalizePath([s.folder.trim(), `${name}.md`].filter(Boolean).join('/'));

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      new Notice(`“${existing.basename}” already exists. Opened it instead.`);
      await this.app.workspace.getLeaf(false).openFile(existing);
      return existing;
    }

    const content = await this.render(entry);
    const folder = path.split('/').slice(0, -1).join('/');
    if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const file = await this.app.vault.create(path, content);
    if (s.openAfterCreate) await this.app.workspace.getLeaf(false).openFile(file);
    return file;
  }

  private async render(entry: Entry): Promise<string> {
    const path = this.settings.templateFile.trim();
    if (path) {
      const template = this.app.metadataCache.getFirstLinkpathDest(normalizePath(path), '');
      if (template) return renderTemplate(await this.app.vault.cachedRead(template), entry, this.formatDate);
      new Notice(`Template “${path}” was not found. Used the built-in note.`);
    }
    return defaultNote(entry);
  }
}

/** Pick a synonym with the keyboard; typing filters the list. */
class SynonymModal extends SuggestModal<string> {
  constructor(
    app: App,
    word: string,
    private synonyms: string[],
    private onPick: (synonym: string) => void,
  ) {
    super(app);
    this.setPlaceholder(`Replace “${word}” with…`);
    this.emptyStateText = 'No matching synonym.';
  }

  getSuggestions(query: string): string[] {
    const q = query.trim().toLowerCase();
    return q ? this.synonyms.filter((s) => s.toLowerCase().includes(q)) : this.synonyms;
  }

  renderSuggestion(synonym: string, el: HTMLElement) {
    el.setText(synonym);
  }

  onChooseSuggestion(synonym: string) {
    this.onPick(synonym);
  }
}

/** The sidebar: a search box, the entry for the word, and back and forward through the words looked up. */
class WordLookupView extends ItemView {
  entry: Entry | null = null;
  private history = new LookupHistory();
  private message = '';
  private loading = '';
  private token = 0;
  /** Parts of speech whose whole definition list is open, by "word|part". */
  private expanded = new Set<string>();
  private inputEl: HTMLInputElement | null = null;
  private backEl: HTMLButtonElement | null = null;
  private forwardEl: HTMLButtonElement | null = null;
  private resultEl: HTMLElement | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: WordLookupPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Dictionary';
  }

  getIcon(): string {
    return 'book-a';
  }

  onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass('word-lookup-view');

    const bar = root.createDiv({ cls: 'word-lookup-bar' });
    this.backEl = this.navButton(bar, 'arrow-left', 'Back', -1);
    this.forwardEl = this.navButton(bar, 'arrow-right', 'Forward', 1);
    const input = bar.createEl('input', { cls: 'word-lookup-input', type: 'text', placeholder: 'Look up a word', attr: { 'aria-label': 'Word to look up', spellcheck: 'false' } });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.show(input.value);
    });
    this.inputEl = input;

    const language = root.createEl('select', { cls: 'dropdown word-lookup-language', attr: { 'aria-label': 'Language of the word' } });
    for (const [code, name] of Object.entries(LANGUAGES)) language.createEl('option', { value: code, text: name });
    language.value = this.plugin.settings.language;
    language.addEventListener('change', () => {
      this.plugin.settings.language = language.value;
      void this.plugin.saveSettings();
      const word = this.history.current;
      if (word) void this.run(word);
    });

    this.resultEl = root.createDiv({ cls: 'word-lookup-result' });
    this.render();
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    this.token++;
    this.contentEl.empty();
    return Promise.resolve();
  }

  focusSearch(): void {
    this.inputEl?.focus();
    this.inputEl?.select();
  }

  canBack(): boolean {
    return this.history.canBack;
  }

  canForward(): boolean {
    return this.history.canForward;
  }

  /** Looks a word up and adds it to the history. */
  async show(raw: string): Promise<void> {
    const word = cleanQuery(raw);
    if (!word) {
      this.message = 'Type a word to look up.';
      this.entry = null;
      this.render();
      return;
    }
    this.history.push(word);
    await this.run(word);
  }

  async go(direction: -1 | 1): Promise<void> {
    const word = direction < 0 ? this.history.back() : this.history.forward();
    if (word) await this.run(word);
  }

  private async run(word: string): Promise<void> {
    const ticket = ++this.token;
    if (this.inputEl) this.inputEl.value = word;
    this.loading = word;
    this.message = '';
    this.render();
    try {
      const entry = await this.plugin.dictionary.lookup(word, this.plugin.lookupOptions(), this.plugin.http);
      if (ticket !== this.token) return;
      this.entry = entry;
      this.message = '';
    } catch (error) {
      if (ticket !== this.token) return;
      this.entry = null;
      if (error instanceof LookupError) this.message = error.message;
      else {
        console.error('Word Lookup:', error);
        this.message = 'The lookup failed.';
      }
    }
    this.loading = '';
    this.render();
  }

  private navButton(parent: HTMLElement, icon: string, label: string, direction: -1 | 1): HTMLButtonElement {
    const button = parent.createEl('button', { cls: 'clickable-icon word-lookup-nav', attr: { 'aria-label': label } });
    setIcon(button, icon);
    button.addEventListener('click', () => void this.go(direction));
    return button;
  }

  private render(): void {
    const out = this.resultEl;
    if (!out) return;
    if (this.backEl) this.backEl.disabled = !this.history.canBack;
    if (this.forwardEl) this.forwardEl.disabled = !this.history.canForward;
    out.empty();

    if (this.loading) {
      out.createDiv({ cls: 'word-lookup-status', text: `Looking up “${this.loading}”…` });
      return;
    }
    if (this.message) {
      out.createDiv({ cls: 'word-lookup-status word-lookup-error', text: this.message });
      return;
    }
    const entry = this.entry;
    if (!entry) {
      out.createDiv({ cls: 'word-lookup-status', text: 'Type a word and press Enter, or select one in a note and use “Look up the selected word”.' });
      return;
    }
    this.renderEntry(out, entry);
  }

  private renderEntry(out: HTMLElement, entry: Entry): void {
    const head = out.createDiv({ cls: 'word-lookup-head' });
    head.createEl('h2', { cls: 'word-lookup-word', text: entry.word });
    if (entry.audio) {
      const play = head.createEl('button', { cls: 'clickable-icon word-lookup-audio', attr: { 'aria-label': 'Play the pronunciation' } });
      setIcon(play, 'volume-2');
      play.addEventListener('click', () => {
        this.plugin.playAudio(entry.audio).catch(() => new Notice('Could not play the recording.'));
      });
    }
    if (entry.phonetic) out.createDiv({ cls: 'word-lookup-phonetic', text: entry.phonetic });

    for (const meaning of entry.meanings) {
      const section = out.createDiv({ cls: 'word-lookup-meaning' });
      section.createDiv({ cls: 'word-lookup-part', text: meaning.partOfSpeech });
      const key = `${entry.language}:${entry.word}|${meaning.partOfSpeech}|${entry.meanings.indexOf(meaning)}`;
      const open = this.expanded.has(key);
      const shown = open ? meaning.definitions : meaning.definitions.slice(0, SHOWN_DEFINITIONS);
      const list = section.createEl('ol', { cls: 'word-lookup-definitions' });
      for (const def of shown) {
        const item = list.createEl('li');
        item.createSpan({ text: def.text });
        if (def.example) item.createDiv({ cls: 'word-lookup-example', text: def.example });
      }
      const hidden = meaning.definitions.length - shown.length;
      if (hidden > 0) {
        const more = section.createEl('button', { cls: 'word-lookup-more', text: `Show ${hidden} more` });
        more.addEventListener('click', () => {
          this.expanded.add(key);
          this.render();
        });
      }
    }

    this.renderChips(out, 'Synonyms', relatedWords(entry, 'synonyms'));
    this.renderChips(out, 'Antonyms', relatedWords(entry, 'antonyms'));

    const foot = out.createDiv({ cls: 'word-lookup-foot' });
    const create = foot.createEl('button', { cls: 'mod-cta', text: 'Create note' });
    create.addEventListener('click', () => {
      this.plugin.createNote(entry).catch((error: unknown) => {
        console.error('Word Lookup:', error);
        new Notice(`Word Lookup: ${error instanceof Error ? error.message : String(error)}`);
      });
    });
    const source = foot.createDiv({ cls: 'word-lookup-source' });
    source.createSpan({ text: `${entry.languageName} · ` });
    if (entry.sourceUrl) source.createEl('a', { text: SOURCE_LABELS[entry.source], href: entry.sourceUrl, cls: 'external-link' });
    else source.createSpan({ text: SOURCE_LABELS[entry.source] });
  }

  private renderChips(out: HTMLElement, title: string, words: string[]): void {
    if (words.length === 0) return;
    const section = out.createDiv({ cls: 'word-lookup-related' });
    section.createDiv({ cls: 'word-lookup-part', text: title });
    const chips = section.createDiv({ cls: 'word-lookup-chips' });
    for (const word of words.slice(0, 40)) {
      const chip = chips.createEl('button', { cls: 'word-lookup-chip', text: word });
      chip.addEventListener('click', () => void this.show(word));
    }
  }
}

type Key = keyof WordLookupSettings;

class WordLookupSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: WordLookupPlugin,
  ) {
    super(app, plugin);
  }

  /**
   * The settings of Obsidian 1.13 and later: it renders this itself and indexes it for the settings
   * search. Older versions ignore it and call `display()`.
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: 'group',
        heading: 'Lookup',
        items: [
          { ...TEXT.language, control: { type: 'dropdown', key: 'language', options: LANGUAGES, defaultValue: DEFAULT_SETTINGS.language } },
          { ...TEXT.relatedWords, control: { type: 'toggle', key: 'relatedWords', defaultValue: true } },
        ],
      },
      {
        type: 'group',
        heading: 'New notes',
        items: [
          { ...TEXT.folder, control: { type: 'folder', key: 'folder', placeholder: 'Vocabulary' } },
          { ...TEXT.templateFile, control: { type: 'file', key: 'templateFile', placeholder: 'Templates/Word' } },
          { ...TEXT.openAfterCreate, control: { type: 'toggle', key: 'openAfterCreate', defaultValue: true } },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    Object.assign(this.plugin.settings, { [key]: value });
    await this.plugin.saveSettings();
  }

  /** The pre-1.13 rendering, from the same text. Obsidian skips it once `getSettingDefinitions()` returns anything. */
  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();
    new Setting(containerEl).setName('Lookup').setHeading();
    new Setting(containerEl)
      .setName(TEXT.language.name)
      .setDesc(TEXT.language.desc)
      .addDropdown((d) => d.addOptions(LANGUAGES).setValue(s.language).onChange((v) => this.setControlValue('language', v)));
    this.toggle('relatedWords', TEXT.relatedWords);
    new Setting(containerEl).setName('New notes').setHeading();
    this.text('folder', TEXT.folder);
    this.text('templateFile', TEXT.templateFile);
    this.toggle('openAfterCreate', TEXT.openAfterCreate);
  }

  private text(key: Key, text: { name: string; desc: string }) {
    new Setting(this.containerEl)
      .setName(text.name)
      .setDesc(text.desc)
      .addText((t) => t.setValue(String(this.plugin.settings[key])).onChange((v) => this.setControlValue(key, v)));
  }

  private toggle(key: Key, text: { name: string; desc: string }) {
    new Setting(this.containerEl)
      .setName(text.name)
      .setDesc(text.desc)
      .addToggle((t) => t.setValue(Boolean(this.plugin.settings[key])).onChange((v) => this.setControlValue(key, v)));
  }
}
