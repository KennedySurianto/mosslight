import { BLOCKS, GAME, SIGNS } from "../data/config";
export type Foliage = "flower" | "mushroom" | "fern";
export const FOLIAGE_NAMES: Record<Foliage, string> = {
  flower: "Wildflowers",
  mushroom: "Mushroom",
  fern: "Tall grass",
};
export function noise(x: number, y: number, seed: number) {
  let n = Math.imul(x + seed, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export class WorldSystem {
  readonly base = new Uint8Array(GAME.width * GAME.height);
  readonly tiles: Uint8Array;
  modifications: Record<string, number>;
  revision = 0;
  foliage = new Map<string, Foliage>();
  clearedFoliage: Set<string>;
  constructor(
    public seed: number,
    modifications: Record<string, number> = {},
    clearedFoliage: string[] = [],
  ) {
    this.clearedFoliage = new Set(clearedFoliage);
    for (let x = 0; x < GAME.width; x++)
      for (let y = 0; y < GAME.height; y++) {
        const surface = this.surface(x);
        let id = 0;
        if (y >= surface)
          id = y === surface ? 1 : y < surface + 6 ? 2 : y < 43 ? 3 : 5;
        if (
          y > surface + 5 &&
          Math.sin(x * 0.33 + seed) +
            Math.sin(y * 0.57) +
            Math.cos(x * 0.17 + y * 0.31) >
            1.8
        )
          id = 0;
        if (id >= 3 && noise(x, y, seed) > 0.96) id = 6;
        if (x === 0 || x === GAME.width - 1 || y >= GAME.height - 2) id = 7;
        if (this.protected(x, y) && y >= GAME.surface)
          id = y === GAME.surface ? 1 : 2;
        this.base[y * GAME.width + x] = id;
      }
    this.tiles = this.base.slice();
    this.modifications = { ...modifications };
    for (const [key, value] of Object.entries(modifications)) {
      const [x, y] = key.split(",").map(Number);
      if (!this.protected(x, y)) this.tiles[y * GAME.width + x] = value;
    }
    for (let x = 3; x < GAME.width - 3; x++) {
      const y = this.surface(x) - 1,
        key = `${x},${y}`;
      if (
        noise(x, 0, seed) > 0.53 &&
        !this.protected(x, y) &&
        !SIGNS.some((s) => s.x === x) &&
        ![14, 49, 56, 67, 79, 91, 109, 118].includes(x) &&
        !this.clearedFoliage.has(key)
      ) {
        // Older saves may already contain a building or excavation here.
        // Treat that foliage as cleared instead of regrowing it on a later reload.
        if (this.get(x, y) || this.get(x, y + 1) !== 1) {
          this.clearedFoliage.add(key);
          continue;
        }
        this.foliage.set(
          key,
          noise(x, 1, seed) > 0.6
            ? "flower"
            : noise(x, 3, seed) > 0.8
              ? "mushroom"
              : "fern",
        );
      }
    }
  }
  foliageAt(x: number, y: number) {
    return this.foliage.get(`${x},${y}`);
  }
  clearFoliage(x: number, y: number) {
    const key = `${x},${y}`,
      type = this.foliage.get(key);
    if (type) {
      this.foliage.delete(key);
      this.clearedFoliage.add(key);
      this.revision++;
    }
    return type;
  }
  surface(x: number) {
    const distance = x < 12 ? 12 - x : x > 49 ? x - 49 : 0;
    return (
      GAME.surface +
      Math.round(
        (Math.sin(x * 0.19) * 2 + Math.sin(x * 0.071) * 2) *
          Math.min(1, distance / 8),
      )
    );
  }
  protected(x: number, y: number) {
    return (
      x >= GAME.spawnX - 1 &&
      x <= GAME.spawnX + 1 &&
      y >= GAME.surface - 4 &&
      y <= GAME.surface + 1
    );
  }
  get(x: number, y: number): number {
    if (x < 0 || x >= GAME.width || y < 0 || y >= GAME.height) return 7;
    return this.tiles[y * GAME.width + x];
  }
  solid(x: number, y: number) {
    return !!BLOCKS[this.get(x, y)]?.solid;
  }
  set(x: number, y: number, id: number) {
    if (this.protected(x, y) || this.get(x, y) === 7) return false;
    // Removing a plant's support clears it permanently, even if grass is rebuilt.
    if (id === 0) this.clearFoliage(x, y - 1);
    this.tiles[y * GAME.width + x] = id;
    const key = `${x},${y}`;
    if (this.base[y * GAME.width + x] === id) delete this.modifications[key];
    else this.modifications[key] = id;
    this.revision++;
    return true;
  }
}
