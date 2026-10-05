import { ITEMS, type ItemId } from "../data/config";
export interface TreeData {
  x: number;
  y: number;
  type: "seed" | "stoneSeed";
  plantedAt: number;
  growthDuration: number;
}
export class SeedSystem {
  constructor(public trees: TreeData[] = []) {}
  at(x: number, y: number) {
    return this.trees.find(
      (t) =>
        t.x === x &&
        (t.y === y || t.y - 1 === y || (this.stage(t) === 3 && t.y - 2 === y)),
    );
  }
  stage(t: TreeData, now = Date.now()) {
    const elapsed = Math.max(0, now - t.plantedAt);
    return elapsed >= t.growthDuration
      ? 3
      : Math.min(2, Math.floor((elapsed / t.growthDuration) * 3));
  }
  remaining(t: TreeData) {
    return Math.max(
      0,
      Math.ceil((t.growthDuration - (Date.now() - t.plantedAt)) / 1000),
    );
  }
  plant(x: number, y: number, type: ItemId) {
    if (type !== "seed" && type !== "stoneSeed") return;
    this.trees.push({
      x,
      y,
      type,
      plantedAt: Date.now(),
      growthDuration: ITEMS[type].growth!,
    });
  }
}
