import { GAME, type ItemId } from "../data/config";
export interface Stack {
  id: ItemId;
  count: number;
}
export class InventorySystem {
  slots: (Stack | null)[];
  selected = 0;
  onChange = () => {};
  constructor(slots?: (Stack | null)[]) {
    this.slots =
      slots ??
      Array.from({ length: GAME.slots }, (_, i) =>
        i === 0
          ? { id: "dirt", count: 15 }
          : i === 1
            ? { id: "wood", count: 5 }
            : i === 2
              ? { id: "seed", count: 3 }
              : null,
      );
  }
  add(id: ItemId, count = 1) {
    let left = count;
    for (const slot of this.slots)
      if (slot?.id === id) {
        const n = Math.min(GAME.stack - slot.count, left);
        slot.count += n;
        left -= n;
      }
    for (let i = 0; i < this.slots.length && left; i++)
      if (!this.slots[i]) {
        const n = Math.min(GAME.stack, left);
        this.slots[i] = { id, count: n };
        left -= n;
      }
    if (left !== count) this.onChange();
    return left;
  }
  consume(index: number) {
    const s = this.slots[index];
    if (!s) return false;
    if (--s.count === 0) this.slots[index] = null;
    this.onChange();
    return true;
  }
  move(from: number, to: number) {
    if (from === to || !this.slots[from] || to < 0 || to >= GAME.slots) return;
    const a = this.slots[from]!,
      b = this.slots[to];
    if (b?.id === a.id) {
      const n = Math.min(GAME.stack - b.count, a.count);
      b.count += n;
      a.count -= n;
      if (!a.count) this.slots[from] = null;
    } else
      [this.slots[from], this.slots[to]] = [this.slots[to], this.slots[from]];
    this.onChange();
  }
}
