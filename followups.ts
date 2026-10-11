export interface FollowUp {
  id: number;
  text: string;
}

export function splitPanelText(text: string): string[] {
  // The host wraps logical lines to the actual terminal width.
  return text.split(/\r\n|\r|\n/);
}

export function renderEditorLine(text: string): string {
  const safeText = text.replace(/[\u0000-\u001f\u007f]/g, "");
  return `  \x1b[97m${safeText}\x1b[5m█\x1b[25m\x1b[0m`;
}

export function renderEditorLines(text: string): string[] {
  const chunks = splitPanelText(text).map((line) =>
    line.replace(/[\u0000-\u001f\u007f]/g, ""),
  );
  return [
    ...chunks.slice(0, -1).map((chunk) => `  \x1b[97m${chunk}\x1b[0m`),
    renderEditorLine(chunks[chunks.length - 1]),
  ];
}

export class FollowUpQueue {
  private items: FollowUp[] = [];
  private nextID = 1;

  list(): readonly FollowUp[] {
    return this.items;
  }

  add(text: string): FollowUp {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("follow-up text cannot be empty");
    const item = { id: this.nextID++, text: trimmed };
    this.items.push(item);
    return item;
  }

  edit(index: number, text: string): FollowUp {
    this.assertIndex(index);
    const trimmed = text.trim();
    if (!trimmed) throw new Error("follow-up text cannot be empty");
    this.items[index] = { ...this.items[index], text: trimmed };
    return this.items[index];
  }

  remove(index: number): FollowUp {
    this.assertIndex(index);
    return this.items.splice(index, 1)[0];
  }

  move(index: number, offset: -1 | 1): number {
    this.assertIndex(index);
    const target = index + offset;
    if (target < 0 || target >= this.items.length) return index;
    [this.items[index], this.items[target]] = [
      this.items[target],
      this.items[index],
    ];
    return target;
  }

  take(index = 0): FollowUp | undefined {
    if (this.items.length === 0) return undefined;
    this.assertIndex(index);
    return this.items.splice(index, 1)[0];
  }

  clear(): void {
    this.items = [];
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) {
      throw new RangeError(`follow-up index out of range: ${index}`);
    }
  }
}
