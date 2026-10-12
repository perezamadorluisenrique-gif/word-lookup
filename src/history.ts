/** The words looked up in one window, with back and forward like a browser. */
export class LookupHistory {
  private items: string[] = [];
  private index = -1;

  get current(): string | null {
    return this.items[this.index] ?? null;
  }

  get canBack(): boolean {
    return this.index > 0;
  }

  get canForward(): boolean {
    return this.index >= 0 && this.index < this.items.length - 1;
  }

  get size(): number {
    return this.items.length;
  }

  /** Visits a word. Looking up the word already shown changes nothing; a new word drops the forward list. */
  push(word: string): void {
    if (this.current?.toLowerCase() === word.toLowerCase()) return;
    this.items = this.items.slice(0, this.index + 1);
    this.items.push(word);
    this.index = this.items.length - 1;
    if (this.items.length > 100) {
      this.items.shift();
      this.index--;
    }
  }

  back(): string | null {
    if (!this.canBack) return null;
    return this.items[--this.index];
  }

  forward(): string | null {
    if (!this.canForward) return null;
    return this.items[++this.index];
  }
}
