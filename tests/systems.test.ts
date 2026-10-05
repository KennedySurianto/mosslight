import { describe, it, expect, vi } from "vitest";
import { WorldSystem } from "../src/game/systems/WorldSystem";
import { InventorySystem } from "../src/game/systems/InventorySystem";
import { SeedSystem } from "../src/game/systems/SeedSystem";
import {
  validateSave,
  SaveSystem,
  SAVE_KEY,
  type SaveData,
} from "../src/game/systems/SaveSystem";
import { BlockSystem } from "../src/game/systems/BlockSystem";
import { GAME } from "../src/game/data/config";
import type { Player } from "../src/game/entities/Player";
import { ShopSystem } from "../src/game/systems/ShopSystem";
import { SHOP } from "../src/game/data/shop";
import { AudioSystem } from "../src/game/systems/AudioSystem";
import { touchingSign } from "../src/game/systems/TutorialSystem";
import { guideSteps, initialGuide } from "../src/game/systems/GuideSystem";
const fixture = (): SaveData => ({
  version: 1,
  seed: 123,
  player: { x: 624, y: 736, facing: 1, gems: 0, selected: 0 },
  inventory: new InventorySystem().slots,
  modifications: {},
  trees: [],
  drops: [],
  settings: { sound: true },
  tutorial: [],
  stats: { broken: 0, placed: 0, planted: 0, harvested: 0 },
});
describe("deterministic world and deltas", () => {
  it("reproduces terrain and has substantial underground caves", () => {
    const a = new WorldSystem(123),
      b = new WorldSystem(123);
    expect(a.tiles).toEqual(b.tiles);
    expect(a.tiles).not.toEqual(new WorldSystem(456).tiles);
    let caves = 0;
    for (let x = 2; x < 127; x++)
      for (let y = 32; y < 57; y++) if (a.get(x, y) === 0) caves++;
    expect(caves).toBeGreaterThan(30);
  });
  it("keeps tutorial ground flat and spawn clear", () => {
    const w = new WorldSystem(987);
    for (let x = 12; x <= 49; x++) {
      expect(w.get(x, 23)).toBe(1);
      expect(w.get(x, 22)).toBe(0);
    }
    expect(w.set(19, 22, 2)).toBe(false);
    expect(w.set(19, 23, 0)).toBe(false);
    expect(w.set(0, 25, 0)).toBe(false);
  });
  it("round trips compact modifications and removes redundant deltas", () => {
    const w = new WorldSystem(17);
    w.set(25, 23, 0);
    expect(new WorldSystem(17, w.modifications).get(25, 23)).toBe(0);
    w.set(25, 23, 1);
    expect(w.modifications).toEqual({});
  });
});
describe("inventory conservation", () => {
  it("swaps and moves between hotbar and backpack", () => {
    const i = new InventorySystem();
    i.move(0, 8);
    expect(i.slots[0]).toBeNull();
    expect(i.slots[8]?.count).toBe(15);
    i.move(8, 1);
    expect(i.slots[8]?.id).toBe("wood");
    expect(i.slots[1]?.id).toBe("dirt");
  });
  it("merges without exceeding stack size or losing overflow", () => {
    const i = new InventorySystem();
    i.slots[8] = { id: "dirt", count: 995 };
    i.move(0, 8);
    expect(i.slots[8]?.count).toBe(999);
    expect(i.slots[0]?.count).toBe(11);
  });
  it("keeps full-inventory drops uncollected", () => {
    const i = new InventorySystem(
      Array.from({ length: 32 }, () => ({ id: "dirt", count: 999 })),
    );
    expect(i.add("seed", 4)).toBe(4);
    expect(i.slots.every((s) => s?.count === 999)).toBe(true);
  });
  it("consumes the last item and clears slot", () => {
    const i = new InventorySystem();
    i.slots[0] = { id: "wood", count: 1 };
    expect(i.consume(0)).toBe(true);
    expect(i.slots[0]).toBeNull();
    expect(i.consume(0)).toBe(false);
  });
});
describe("tree timestamps", () => {
  it("has four stages and matures while offline", () => {
    const s = new SeedSystem();
    s.plant(25, 22, "seed");
    const t = s.trees[0];
    expect(
      [0, 16000, 31000, 45001].map((d) => s.stage(t, t.plantedAt + d)),
    ).toEqual([0, 1, 2, 3]);
    expect(s.stage(t, t.plantedAt + 44999)).toBe(2);
    const restored = new SeedSystem(JSON.parse(JSON.stringify(s.trees)));
    expect(restored.stage(restored.trees[0], t.plantedAt + 900000)).toBe(3);
  });
});
describe("block safety and durability", () => {
  const setup = () => {
    const w = new WorldSystem(123),
      i = new InventorySystem(),
      s = new SeedSystem();
    for (const key of [...w.foliage.keys()]) {
      const [x, y] = key.split(",").map(Number);
      w.clearFoliage(x, y);
    }
    const p = {
      x: 25 * 32 + 16,
      y: 23 * 32,
      overlaps: (x: number, y: number) => x === 25 && y === 22,
    } as Player;
    return { w, i, s, b: new BlockSystem(w, p, s, i) };
  };
  it("rejects inside-player, occupied, distant, and protected placements", () => {
    const { b } = setup();
    expect(b.placement(25, 22)).toMatch("Step aside");
    expect(b.placement(26, 23)).toMatch("occupied");
    expect(b.placement(35, 22)).toMatch("closer");
    expect(b.placement(20, 22)).not.toBeNull();
  });
  it("breaks meadow in two hits and stone in four", () => {
    const { b, w } = setup();
    expect(b.hit(26, 23)?.broken).toBe(false);
    expect(b.hit(26, 23)?.broken).toBe(true);
    expect(w.get(26, 23)).toBe(0);
    w.set(26, 22, 3);
    for (let n = 0; n < 3; n++) expect(b.hit(26, 22)?.broken).toBe(false);
    expect(b.hit(26, 22)?.broken).toBe(true);
  });
  it("places blocks and charges exactly one item", () => {
    const { b, i, w } = setup();
    expect(b.place(26, 22)).toBe(true);
    expect(w.get(26, 22)).toBe(2);
    expect(i.slots[0]?.count).toBe(14);
    expect(b.place(26, 22)).toBe(false);
    expect(i.slots[0]?.count).toBe(14);
  });
  it("plants seeds only on supported ground and protects their roots", () => {
    const { b, i, s } = setup();
    i.selected = 2;
    expect(b.placement(26, 20)).toMatch("Plant on");
    expect(b.place(27, 22)).toBe(true);
    expect(s.trees).toHaveLength(1);
    expect(i.slots[2]?.count).toBe(2);
    expect(b.hit(27, 23)).toBeNull();
  });
});
describe("save validation and recovery", () => {
  it("round trips a valid save", () =>
    expect(validateSave(JSON.parse(JSON.stringify(fixture())))).toEqual(
      fixture(),
    ));
  it.each([
    null,
    {},
    { ...fixture(), version: 99 },
    { ...fixture(), inventory: [null] },
    { ...fixture(), modifications: { __proto__: 5, "-1,5": 3 } },
    { ...fixture(), player: { ...fixture().player, x: Infinity } },
    {
      ...fixture(),
      trees: [{ x: 1, y: 2, type: "bad", plantedAt: 1, growthDuration: 4 }],
    },
    { ...fixture(), drops: [{ x: 3, y: 4, id: "bad", count: 3 }] },
  ])("rejects malformed data %#", (s) =>
    expect(() => validateSave(s)).toThrow(),
  );
  it("backs up corrupt data and safely recovers", () => {
    const store = new Map([[SAVE_KEY, "{bad"]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    const save = new SaveSystem();
    expect(save.load()).toBeNull();
    expect(store.get(`${SAVE_KEY}_backup`)).toBe("{bad");
    expect(save.write(fixture())).toBe(true);
    expect(save.load()).toEqual(fixture());
    vi.unstubAllGlobals();
  });
  it("reports unavailable storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error("disabled");
      },
      setItem: () => {
        throw Error("full");
      },
    });
    const save = new SaveSystem();
    expect(save.load()).toBeNull();
    expect(save.write(fixture())).toBe(false);
    expect(save.error).toContain("Export");
    vi.unstubAllGlobals();
  });
});

describe("foliage and shop progression", () => {
  it("foliage must be cleared before building and remains cleared after reload", () => {
    const w = new WorldSystem(123);
    const [key] = w.foliage.keys();
    const [x, y] = key.split(",").map(Number);
    const player = {
      x: (x - 2) * 32 + 16,
      y: (y + 1) * 32,
      overlaps: () => false,
    } as Player;
    const b = new BlockSystem(
      w,
      player,
      new SeedSystem(),
      new InventorySystem(),
    );
    expect(b.placement(x, y)).toBe("Break the foliage here first");
    expect(b.place(x, y)).toBe(false);
    w.clearFoliage(x, y);
    expect(b.place(x, y)).toBe(true);
    expect(
      new WorldSystem(123, w.modifications, [...w.clearedFoliage]).foliageAt(
        x,
        y,
      ),
    ).toBeUndefined();
  });
  it("breaking the support clears foliage even after grass is rebuilt", () => {
    const w = new WorldSystem(123);
    const [key] = w.foliage.keys();
    const [x, y] = key.split(",").map(Number);
    w.set(x, y + 1, 0);
    w.set(x, y + 1, 1);
    expect(
      new WorldSystem(123, w.modifications, [...w.clearedFoliage]).foliageAt(
        x,
        y,
      ),
    ).toBeUndefined();
  });
  it("all sixteen offers deliver exact rewards and deduct the right price", () => {
    expect(SHOP).toHaveLength(16);
    for (const offer of SHOP) {
      const shop = new ShopSystem(),
        inventory = new InventorySystem(Array(32).fill(null));
      const result = shop.purchase(offer.id, 100, inventory);
      expect(result.ok).toBe(true);
      expect(result.gems).toBe(100 - offer.price);
      if (offer.upgrade) expect(shop.owned).toContain(offer.upgrade);
      for (const stack of offer.contents ?? [])
        expect(inventory.slots.find((s) => s?.id === stack.id)?.count).toBe(
          stack.count,
        );
    }
  });
  it("rejects insufficient funds and duplicate equipment without charging", () => {
    const shop = new ShopSystem(),
      inventory = new InventorySystem();
    expect(shop.purchase("pickaxe", 0, inventory).gems).toBe(0);
    expect(shop.owned).toEqual([]);
    expect(shop.purchase("pickaxe", 100, inventory).ok).toBe(true);
    expect(shop.purchase("pickaxe", 82, inventory)).toMatchObject({
      ok: false,
      gems: 82,
    });
  });
  it("does not partially deliver a bundle into a full inventory", () => {
    const inventory = new InventorySystem(
      Array.from({ length: 32 }, () => ({ id: "wood", count: 999 })),
    );
    inventory.slots[0]!.count = 970;
    const before = structuredClone(inventory.slots);
    expect(
      new ShopSystem().purchase("cabin-kit", 100, inventory),
    ).toMatchObject({ ok: false, gems: 100 });
    expect(inventory.slots).toEqual(before);
  });
  it("old saves still load, new progression round trips, invalid upgrades are rejected", () => {
    expect(validateSave(fixture()).upgrades).toBeUndefined();
    const save = {
      ...fixture(),
      upgrades: ["pickaxe", "shoes"],
      clearedFoliage: ["22,22"],
    };
    expect(validateSave(save)).toEqual(save);
    expect(() => validateSave({ ...save, upgrades: ["godmode"] })).toThrow(
      "equipment",
    );
    expect(() => validateSave({ ...save, clearedFoliage: ["-1,22"] })).toThrow(
      "foliage",
    );
  });
});

describe("touch-only signs and the getting-started guide", () => {
  it("shows a sign only when avatar bounds touch its 28 by 30 bounds", () => {
    const p = { x: 624, y: 736, width: 20, height: 30 };
    expect(touchingSign(p)).toBe(-1);
    expect(touchingSign({ ...p, x: 663.9 })).toBe(-1);
    expect(touchingSign({ ...p, x: 664 })).toBe(0);
    expect(touchingSign({ ...p, x: 712 })).toBe(0);
    expect(touchingSign({ ...p, x: 712.1 })).toBe(-1);
    expect(touchingSign({ ...p, x: 688, y: 705.9 })).toBe(-1);
    expect(touchingSign({ ...p, x: 688, y: 766.1 })).toBe(-1);
  });
  it("requires all six concrete tasks and tracks partial move/gather steps", () => {
    const stats = { broken: 0, placed: 0, planted: 0, harvested: 0 },
      p = initialGuide(undefined, stats);
    expect(guideSteps(p, stats).filter((s) => s.done)).toHaveLength(0);
    p.moved = true;
    expect(guideSteps(p, stats)[0].done).toBe(false);
    p.jumped = true;
    p.mined = true;
    expect(guideSteps(p, stats)[1].done).toBe(false);
    p.collected = true;
    p.backpack = true;
    expect(
      guideSteps(p, { broken: 1, placed: 1, planted: 1, harvested: 1 }).every(
        (s) => s.done,
      ),
    ).toBe(true);
  });
  it("keeps accomplished legacy worlds complete and preserves new guide progress", () => {
    const stats = { broken: 5, placed: 2, planted: 1, harvested: 1 };
    expect(
      guideSteps(initialGuide(undefined, stats), stats).every((s) => s.done),
    ).toBe(true);
    const guide = initialGuide(undefined, fixture().stats);
    guide.moved = true;
    expect(validateSave({ ...fixture(), guide }).guide).toEqual(guide);
    expect(() =>
      validateSave({ ...fixture(), guide: { moved: true } }),
    ).toThrow("guide");
  });
});

describe("completion fanfare", () => {
  it("schedules four notes and respects the saved mute setting", () => {
    const oscillators = Array.from({ length: 4 }, () => ({
      type: "",
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    }));
    let index = 0;
    const create = vi.fn(function () {
      return {
        state: "running",
        currentTime: 10,
        destination: {},
        createOscillator: () => oscillators[index++],
        createGain: () => ({
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          disconnect: vi.fn(),
        }),
      };
    });
    vi.stubGlobal("AudioContext", create);
    const audio = new AudioSystem();
    audio.enabled = false;
    audio.celebrate();
    expect(create).not.toHaveBeenCalled();
    audio.enabled = true;
    audio.celebrate();
    expect(index).toBe(4);
    expect(oscillators[0].start).toHaveBeenCalledWith(10);
    expect(oscillators[3].start).toHaveBeenCalledWith(10.42);
    vi.unstubAllGlobals();
  });
});
