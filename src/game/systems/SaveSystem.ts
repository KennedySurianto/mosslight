import { GAME, ITEMS } from "../data/config";
import type { Stack } from "./InventorySystem";
import type { TreeData } from "./SeedSystem";
import { UPGRADE_IDS, type UpgradeId } from "../data/shop";
import { GUIDE_KEYS, type GuideProgress } from "./GuideSystem";
export const SAVE_KEY = "mosslight_save_v1";
export interface SavedDrop {
  x: number;
  y: number;
  id: keyof typeof ITEMS | "gem";
  count: number;
}
export interface SaveData {
  version: 1;
  seed: number;
  player: {
    x: number;
    y: number;
    facing: number;
    gems: number;
    selected: number;
  };
  inventory: (Stack | null)[];
  modifications: Record<string, number>;
  trees: TreeData[];
  drops: SavedDrop[];
  settings: { sound: boolean };
  tutorial: number[];
  stats: { broken: number; placed: number; planted: number; harvested: number };
  clearedFoliage?: string[];
  upgrades?: UpgradeId[];
  guide?: GuideProgress;
}
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const coord = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
export function validateSave(value: unknown): SaveData {
  if (!value || typeof value !== "object")
    throw new Error("This is not a Mosslight save.");
  const s = value as SaveData;
  if (
    s.guide !== undefined &&
    (!s.guide ||
      typeof s.guide !== "object" ||
      Array.isArray(s.guide) ||
      GUIDE_KEYS.some((key) => typeof s.guide![key] !== "boolean"))
  )
    throw new Error("Invalid guide progress.");
  // Additive v1 fields are optional so existing worlds load without losing progress.
  if (
    s.upgrades !== undefined &&
    (!Array.isArray(s.upgrades) ||
      s.upgrades.length > UPGRADE_IDS.length ||
      new Set(s.upgrades).size !== s.upgrades.length ||
      s.upgrades.some((id) => !UPGRADE_IDS.includes(id)))
  )
    throw new Error("Invalid equipment data.");
  if (
    s.clearedFoliage !== undefined &&
    (!Array.isArray(s.clearedFoliage) ||
      s.clearedFoliage.length > GAME.width ||
      new Set(s.clearedFoliage).size !== s.clearedFoliage.length ||
      s.clearedFoliage.some((key) => {
        if (typeof key !== "string") return true;
        const [x, y, ...rest] = key.split(",").map(Number);
        return (
          rest.length > 0 ||
          !integer(x, 1, GAME.width - 2) ||
          !integer(y, 0, GAME.height - 3) ||
          key !== `${x},${y}`
        );
      }))
  )
    throw new Error("Invalid foliage data.");
  if (s.version !== 1 || !integer(s.seed, 0, 2147483647))
    throw new Error("Unsupported save version or world seed.");
  if (
    !s.player ||
    !coord(s.player.x, GAME.width * 32) ||
    !coord(s.player.y, GAME.height * 32) ||
    !integer(s.player.gems, 0, 1e9) ||
    !integer(s.player.selected, 0, 7) ||
    ![-1, 1].includes(s.player.facing)
  )
    throw new Error("Invalid player data.");
  if (
    !Array.isArray(s.inventory) ||
    s.inventory.length !== GAME.slots ||
    s.inventory.some(
      (a) =>
        a !== null &&
        (!a || !Object.hasOwn(ITEMS, a.id) || !integer(a.count, 1, GAME.stack)),
    )
  )
    throw new Error("Invalid inventory.");
  if (
    !s.modifications ||
    typeof s.modifications !== "object" ||
    Array.isArray(s.modifications) ||
    Object.keys(s.modifications).length > GAME.width * GAME.height
  )
    throw new Error("Invalid world data.");
  for (const [key, id] of Object.entries(s.modifications)) {
    const [x, y, ...rest] = key.split(",").map(Number);
    if (
      rest.length ||
      !integer(x, 1, GAME.width - 2) ||
      !integer(y, 0, GAME.height - 3) ||
      !integer(id, 0, 6) ||
      key !== `${x},${y}`
    )
      throw new Error("Invalid tile data.");
  }
  if (
    !Array.isArray(s.trees) ||
    s.trees.length > 1000 ||
    s.trees.some(
      (t) =>
        !t ||
        !integer(t.x, 1, GAME.width - 2) ||
        !integer(t.y, 2, GAME.height - 3) ||
        !["seed", "stoneSeed"].includes(t.type) ||
        !coord(t.plantedAt, Date.now() + 86400000) ||
        t.growthDuration !== ITEMS[t.type].growth,
    )
  )
    throw new Error("Invalid tree data.");
  if (new Set(s.trees.map((t) => `${t.x},${t.y}`)).size !== s.trees.length)
    throw new Error("Duplicate trees.");
  if (
    !Array.isArray(s.drops) ||
    s.drops.length > 250 ||
    s.drops.some(
      (d) =>
        !d ||
        !(d.id === "gem" || Object.hasOwn(ITEMS, d.id)) ||
        !coord(d.x, GAME.width * 32) ||
        !coord(d.y, GAME.height * 32) ||
        !integer(d.count, 1, 999),
    )
  )
    throw new Error("Invalid dropped items.");
  if (
    !s.settings ||
    typeof s.settings.sound !== "boolean" ||
    !Array.isArray(s.tutorial) ||
    s.tutorial.some((t) => !integer(t, 0, 6)) ||
    !s.stats ||
    ["broken", "placed", "planted", "harvested"].some(
      (k) => !integer(s.stats[k as keyof typeof s.stats], 0, 1e9),
    )
  )
    throw new Error("Invalid settings or progress.");
  return structuredClone(s);
}
export class SaveSystem {
  error = "";
  lastSaved = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      try {
        return validateSave(JSON.parse(raw));
      } catch (e) {
        try {
          localStorage.setItem(`${SAVE_KEY}_backup`, raw);
        } catch {}
        throw e;
      }
    } catch (e) {
      console.warn("Save recovery:", e);
      this.error =
        "Could not load your save. A fresh world is ready; a backup was kept if storage allowed.";
      return null;
    }
  }
  write(data: SaveData) {
    clearTimeout(this.timer);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.lastSaved = Date.now();
      this.error = "";
      return true;
    } catch {
      this.error =
        "Browser storage is unavailable or full. Export your world to keep it safe.";
      return false;
    }
  }
  schedule(get: () => SaveData) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.write(get()), 500);
  }
}
