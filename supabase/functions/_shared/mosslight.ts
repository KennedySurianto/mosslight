// Pure game rules shared by the Supabase functions. No browser or Deno APIs.
export const WIDTH = 128;
export const HEIGHT = 60;
export const SURFACE = 23;
export const SPAWN_X = 19;
export const TILE = 32;
export const REACH = 4.6 * TILE;
export const ITEM_IDS = ["dirt", "grass", "wood", "stone", "slate", "amber", "seed", "stoneSeed"] as const;
export type ItemId = (typeof ITEM_IDS)[number];
export type Stack = { id: ItemId; count: number };
export type Tree = { x: number; y: number; type: "seed" | "stoneSeed"; plantedAt: number; growthDuration: number };
export type WorldState = { modifications: Record<string, number>; clearedFoliage: string[]; trees: Tree[] };
export type ProfileState = {
  inventory: (Stack | null)[];
  gems: number;
  upgrades: string[];
  selected: number;
  sound: boolean;
  guide: Record<string, boolean>;
  tutorial: number[];
  stats: { broken: number; placed: number; planted: number; harvested: number };
};
export type SessionState = { x: number; y: number; facing: number; damageKey: string; damageHits: number; lastAction: number; lastPositionAt: number };
const GROWTH = { seed: 45000, stoneSeed: 75000 };
const BLOCK_ITEM: Record<number, ItemId | null> = { 1: "grass", 2: "dirt", 3: "stone", 4: "wood", 5: "slate", 6: "amber" };
const DURABILITY: Record<number, number> = { 1: 2, 2: 2, 3: 4, 4: 3, 5: 5, 6: 5 };
const ITEM_TILE: Partial<Record<ItemId, number>> = { grass: 1, dirt: 2, stone: 3, wood: 4, slate: 5, amber: 6 };
const OFFERS: Record<string, { price: number; upgrade?: string; contents?: Stack[] }> = {
  pickaxe: { price: 18, upgrade: "pickaxe" }, shoes: { price: 24, upgrade: "shoes" },
  boots: { price: 32, upgrade: "boots" }, magnet: { price: 28, upgrade: "magnet" },
  "cedar-seeds": { price: 6, contents: [{ id: "seed", count: 3 }] },
  "stone-seeds": { price: 9, contents: [{ id: "stoneSeed", count: 3 }] },
  "earth-pack": { price: 4, contents: [{ id: "dirt", count: 25 }] },
  "meadow-pack": { price: 6, contents: [{ id: "grass", count: 20 }] },
  "cedar-pack": { price: 8, contents: [{ id: "wood", count: 15 }] },
  "stone-pack": { price: 8, contents: [{ id: "stone", count: 20 }] },
  "slate-pack": { price: 12, contents: [{ id: "slate", count: 15 }] },
  "sunstone-pack": { price: 16, contents: [{ id: "amber", count: 8 }] },
  "garden-kit": { price: 8, contents: [{ id: "grass", count: 10 }, { id: "seed", count: 3 }] },
  "cabin-kit": { price: 18, contents: [{ id: "wood", count: 30 }, { id: "stone", count: 15 }] },
  "landscape-kit": { price: 12, contents: [{ id: "dirt", count: 40 }, { id: "grass", count: 30 }] },
  "rock-garden": { price: 16, contents: [{ id: "slate", count: 15 }, { id: "stoneSeed", count: 3 }] },
};
export const usernamePattern = /^[a-z0-9_]{3,20}$/;
export function noise(x: number, y: number, seed: number) {
  let n = Math.imul(x + seed, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function surface(x: number, seed: number) {
  const distance = x < 12 ? 12 - x : x > 49 ? x - 49 : 0;
  return SURFACE + Math.round((Math.sin(x * .19) * 2 + Math.sin(x * .071) * 2) * Math.min(1, distance / 8));
}
export function protectedTile(x: number, y: number) {
  return x >= SPAWN_X - 1 && x <= SPAWN_X + 1 && y >= SURFACE - 4 && y <= SURFACE + 1;
}
export function baseTile(x: number, y: number, seed: number) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT || x === 0 || x === WIDTH - 1 || y >= HEIGHT - 2) return 7;
  const top = surface(x, seed);
  let id = y >= top ? y === top ? 1 : y < top + 6 ? 2 : y < 43 ? 3 : 5 : 0;
  if (y > top + 5 && Math.sin(x * .33 + seed) + Math.sin(y * .57) + Math.cos(x * .17 + y * .31) > 1.8) id = 0;
  if (id >= 3 && noise(x, y, seed) > .96) id = 6;
  if (protectedTile(x, y) && y >= SURFACE) id = y === SURFACE ? 1 : 2;
  return id;
}
export function tileAt(world: WorldState, x: number, y: number, seed: number) {
  const key = `${x},${y}`;
  return Object.prototype.hasOwnProperty.call(world.modifications, key) ? world.modifications[key] : baseTile(x, y, seed);
}
export function foliageAt(world: WorldState, x: number, y: number, seed: number) {
  if (x < 3 || x >= WIDTH - 3 || y !== surface(x, seed) - 1 || protectedTile(x, y) ||
    [14, 49, 56, 67, 79, 91, 109, 118, 21, 25, 29, 33, 37, 41, 45].includes(x) ||
    world.clearedFoliage.includes(`${x},${y}`) || tileAt(world, x, y, seed) !== 0 || tileAt(world, x, y + 1, seed) !== 1 ||
    noise(x, 0, seed) <= .53) return false;
  return true;
}
export function initialProfile(): ProfileState {
  return {
    inventory: Array.from({ length: 32 }, (_, i) => i === 0 ? { id: "dirt", count: 15 } : i === 1 ? { id: "wood", count: 5 } : i === 2 ? { id: "seed", count: 3 } : null),
    gems: 0, upgrades: [], selected: 0, sound: true,
    guide: { moved: false, jumped: false, mined: false, collected: false, backpack: false }, tutorial: [],
    stats: { broken: 0, placed: 0, planted: 0, harvested: 0 },
  };
}
export function initialWorld(seed: number): WorldState {
  return { modifications: {}, clearedFoliage: [], trees: [14, 49, 56, 67, 79, 91, 109, 118].map((x, i) => ({
    x, y: surface(x, seed) - 1, type: i % 3 === 2 ? "stoneSeed" : "seed",
    plantedAt: Date.now() - 100000, growthDuration: i % 3 === 2 ? 75000 : 45000,
  })) };
}
export function initialSession(): SessionState {
  return { x: SPAWN_X * TILE + 16, y: SURFACE * TILE, facing: 1, damageKey: "", damageHits: 0, lastAction: 0, lastPositionAt: Date.now() };
}
function addItem(profile: ProfileState, id: ItemId, count: number) {
  let left = count;
  for (const slot of profile.inventory) if (slot?.id === id && left) {
    const n = Math.min(999 - slot.count, left); slot.count += n; left -= n;
  }
  for (let i = 0; i < profile.inventory.length && left; i++) if (!profile.inventory[i]) {
    const n = Math.min(999, left); profile.inventory[i] = { id, count: n }; left -= n;
  }
  return left;
}
function consume(profile: ProfileState) {
  const slot = profile.inventory[profile.selected];
  if (!slot) throw new Error("Select an item first");
  slot.count--;
  if (!slot.count) profile.inventory[profile.selected] = null;
}
function setTile(world: WorldState, x: number, y: number, id: number, seed: number) {
  const key = `${x},${y}`;
  const clearsAbove = id === 0 && foliageAt(world, x, y - 1, seed);
  if (id === baseTile(x, y, seed)) delete world.modifications[key];
  else world.modifications[key] = id;
  if (clearsAbove) world.clearedFoliage.push(`${x},${y - 1}`);
}
function treeAt(world: WorldState, x: number, y: number, now: number) {
  return world.trees.find(t => t.x === x && (t.y === y || t.y - 1 === y || (now - t.plantedAt >= t.growthDuration && t.y - 2 === y)));
}
export function playerPositionValid(world: WorldState, seed: number, x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 32 || x > (WIDTH - 1) * TILE || y < 32 || y > (HEIGHT - 2) * TILE) return false;
  for (let tx = Math.floor((x - 10) / TILE); tx <= Math.floor((x + 9.99) / TILE); tx++)
    for (let ty = Math.floor((y - 30) / TILE); ty <= Math.floor((y - .01) / TILE); ty++)
      if (tileAt(world, tx, ty, seed) !== 0) return false;
  return true;
}
export function moveSession(session: SessionState, world: WorldState, seed: number, x: number, y: number, facing: number, now: number): SessionState {
  if (!playerPositionValid(world, seed, x, y)) throw new Error("Invalid player position");
  const seconds = Math.max(.1, Math.min(3, (now - session.lastPositionAt) / 1000));
  if (Math.hypot(x - session.x, y - session.y) > 48 + 340 * seconds) throw new Error("Movement was too fast");
  return { ...session, x, y, facing: facing < 0 ? -1 : 1, lastPositionAt: now };
}
export function applyShop(profileInput: ProfileState, offerId: string) {
  const profile = structuredClone(profileInput);
  const offer = OFFERS[offerId];
  if (!offer) throw new Error("Item unavailable");
  if (profile.gems < offer.price) throw new Error("Not enough gems");
  if (offer.upgrade && profile.upgrades.includes(offer.upgrade)) throw new Error("Already owned");
  if (offer.contents) for (const item of offer.contents) if (addItem(profile, item.id, item.count)) throw new Error("Make room in your backpack");
  profile.gems -= offer.price;
  if (offer.upgrade) profile.upgrades.push(offer.upgrade);
  return profile;
}
export function applyAction(input: { world: WorldState; profile: ProfileState; session: SessionState; seed: number; kind: "hit" | "place"; x: number; y: number; now: number; canBuild: boolean }) {
  const { seed, kind, x, y, now, canBuild } = input;
  if (!canBuild) throw new Error("This world is view-only for you");
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || x >= WIDTH - 1 || y < 1 || y >= HEIGHT - 2) throw new Error("World boundary");
  if (protectedTile(x, y)) throw new Error("Leave room for home");
  if (Math.hypot(x * TILE + 16 - input.session.x, y * TILE + 16 - (input.session.y - 18)) > REACH) throw new Error("A little closer");
  if (now - input.session.lastAction < 190) throw new Error("Slow down a little");
  const world = structuredClone(input.world), profile = structuredClone(input.profile), session = structuredClone(input.session);
  session.lastAction = now;
  let changed = false;
  let event: Record<string, unknown> | null = null;
  let message = "";
  const current = tileAt(world, x, y, seed);
  const tree = treeAt(world, x, y, now);
  if (kind === "place") {
    const slot = profile.inventory[profile.selected];
    if (!slot) throw new Error("Select a block or seed");
    if (current || tree || foliageAt(world, x, y, seed)) throw new Error("This space is occupied");
    if (Math.abs(session.x - (x * TILE + 16)) < 26 && session.y > y * TILE && session.y - 30 < (y + 1) * TILE) throw new Error("Step aside to build");
    if (slot.id === "seed" || slot.id === "stoneSeed") {
      const support = tileAt(world, x, y + 1, seed);
      if (![1, 2, ...(slot.id === "stoneSeed" ? [3] : [])].includes(support) || tileAt(world, x, y - 1, seed) || tileAt(world, x, y - 2, seed) ||
        world.trees.some(t => Math.abs(t.x - x) < 2 && Math.abs(t.y - y) < 3)) throw new Error("This seed needs more room");
      if (world.trees.length >= 100) throw new Error("This world has enough trees for now");
      const planted: Tree = { x, y, type: slot.id, plantedAt: now, growthDuration: GROWTH[slot.id] };
      world.trees.push(planted);
      profile.stats.planted++;
      event = { kind: "plant", tree: planted };
      message = "Seed planted";
    } else {
      const id = ITEM_TILE[slot.id];
      if (!id) throw new Error("This item cannot be placed");
      setTile(world, x, y, id, seed);
      profile.stats.placed++;
      event = { kind: "tile", x, y, id };
      message = "Block placed";
    }
    consume(profile); changed = true;
  } else if (foliageAt(world, x, y, seed)) {
    world.clearedFoliage.push(`${x},${y}`);
    profile.stats.broken++;
    changed = true; event = { kind: "foliage", x, y }; message = "Foliage cleared";
  } else if (tree) {
    if (now - tree.plantedAt < tree.growthDuration) throw new Error("This tree is still growing");
    world.trees.splice(world.trees.indexOf(tree), 1);
    const resource = tree.type === "seed" ? "wood" : "stone";
    addItem(profile, resource, 5); addItem(profile, tree.type, 1 + (Math.random() < .25 ? 1 : 0));
    profile.gems += 2 + Math.floor(Math.random() * 4);
    profile.stats.harvested++; profile.guide.collected = true;
    changed = true; event = { kind: "harvest", x: tree.x, y: tree.y }; message = "Tree harvested";
  } else if (current > 0 && current < 7) {
    const key = `${x},${y}`;
    session.damageHits = session.damageKey === key ? session.damageHits + (profile.upgrades.includes("pickaxe") ? 2 : 1) : (profile.upgrades.includes("pickaxe") ? 2 : 1);
    session.damageKey = key;
    if (session.damageHits >= DURABILITY[current]) {
      session.damageKey = ""; session.damageHits = 0;
      setTile(world, x, y, 0, seed);
      const item = BLOCK_ITEM[current]; if (item) addItem(profile, item, 1);
      if (Math.random() < (current >= 5 ? .13 : .11)) addItem(profile, current >= 3 ? "stoneSeed" : "seed", 1);
      if (Math.random() < (current === 6 ? .9 : current === 5 ? .25 : .2)) profile.gems += current === 6 ? 3 + Math.floor(Math.random() * 6) : 1 + Math.floor(Math.random() * 3);
      profile.stats.broken++; profile.guide.mined = true; profile.guide.collected = true;
      changed = true; event = { kind: "tile", x, y, id: 0 }; message = "Block broken";
    } else message = "Keep digging";
  } else throw new Error("Nothing to break here");
  if (Object.keys(world.modifications).length > 3500 || world.clearedFoliage.length > 128 || JSON.stringify(world).length > 131072)
    throw new Error("World edit limit reached");
  if (profile.gems > 1000000 || JSON.stringify(profile).length > 8192) throw new Error("Player limit reached");
  return { world, profile, session, changed, event, message };
}
