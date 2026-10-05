export const GAME = {
  title: "Mosslight",
  tile: 32,
  width: 128,
  height: 60,
  surface: 23,
  spawnX: 19,
  reach: 4.6,
  gravity: 1500,
  speed: 185,
  acceleration: 1600,
  jump: 440,
  stack: 999,
  slots: 32,
  hotbar: 8,
  hitDelay: 230,
};
export const HARVEST = {
  resources: 5,
  bonusSeedChance: 0.25,
  gems: [2, 5] as const,
};
export type ItemId =
  | "dirt"
  | "grass"
  | "wood"
  | "stone"
  | "slate"
  | "amber"
  | "seed"
  | "stoneSeed";
export interface ItemDef {
  name: string;
  color: string;
  description: string;
  tile?: number;
  growth?: number;
  resource?: ItemId;
}
export const ITEMS: Record<ItemId, ItemDef> = {
  dirt: {
    name: "Earth",
    color: "#a9754d",
    description: "A little foundation for a big idea.",
    tile: 2,
  },
  grass: {
    name: "Meadow block",
    color: "#77ac54",
    description: "Bring a little green wherever you go.",
    tile: 1,
  },
  wood: {
    name: "Cedar wood",
    color: "#bc8750",
    description: "Warm, sturdy, and full of possibility.",
    tile: 4,
  },
  stone: {
    name: "Riverstone",
    color: "#899590",
    description: "A dependable building companion.",
    tile: 3,
  },
  slate: {
    name: "Deep slate",
    color: "#606d78",
    description: "Unearthed from the quiet below.",
    tile: 5,
  },
  amber: {
    name: "Sunstone",
    color: "#e9b44f",
    description: "A little sunshine, buried in the earth.",
    tile: 6,
  },
  seed: {
    name: "Cedar seed",
    color: "#a1c75d",
    description: "Plant on earth or grass. Grows in 45 seconds.",
    growth: 45000,
    resource: "wood",
  },
  stoneSeed: {
    name: "Stonebloom seed",
    color: "#a7b9c7",
    description: "Plant on earth, grass or stone. Grows in 75 seconds.",
    growth: 75000,
    resource: "stone",
  },
};
export interface BlockDef {
  name: string;
  solid: boolean;
  durability: number;
  item?: ItemId;
  seed?: ItemId;
  seedChance: number;
  gemChance: number;
  gems: [number, number];
  color: number;
  placeable: boolean;
  layer: "foreground";
}
const block = (
  name: string,
  durability: number,
  item: ItemId | undefined,
  color: number,
  seed: ItemId = "seed",
  seedChance = 0.11,
  gemChance = 0.2,
  gems: [number, number] = [1, 3],
): BlockDef => ({
  name,
  solid: true,
  durability,
  item,
  color,
  seed,
  seedChance,
  gemChance,
  gems,
  placeable: !!item,
  layer: "foreground",
});
export const BLOCKS: Record<number, BlockDef> = {
  1: block("Meadow", 2, "grass", 0x87b75c),
  2: block("Earth", 2, "dirt", 0xb18358),
  3: block("Riverstone", 4, "stone", 0x8b9e9b, "stoneSeed"),
  4: block("Cedar wood", 3, "wood", 0xc69560),
  5: block("Deep slate", 5, "slate", 0x71808d, "stoneSeed", 0.13, 0.25),
  6: block("Sunstone", 5, "amber", 0xe9b44f, "stoneSeed", 0.12, 0.9, [3, 8]),
  7: block("Bedrock", Infinity, undefined, 0x424d59),
};
export const SIGNS = [
  {
    x: 21,
    title: "Make yourself at home.",
    label: "WELCOME",
    body: "A little world. A lot of possibility. Walk with A and D. Press W to jump.",
    keys: "A  D  ·  W",
  },
  {
    x: 25,
    title: "Good things start with dirt.",
    label: "01 / BREAK",
    body: "Aim at a nearby block and hold left click to punch. Watch the cracks — tougher blocks take a few hits.",
    keys: "LEFT CLICK",
  },
  {
    x: 29,
    title: "Finders, keepers.",
    label: "02 / COLLECT",
    body: "Blocks can drop resources, seeds, and shiny gems. Walk over them to collect your little discoveries.",
    keys: "WALK TO COLLECT",
  },
  {
    x: 33,
    title: "Make something yours.",
    label: "03 / BUILD",
    body: "Select a block below. Right click a nearby empty space to place it. Green means you can build there.",
    keys: "1–8  ·  RIGHT CLICK",
  },
  {
    x: 37,
    title: "A pocketful of possibilities.",
    label: "04 / BACKPACK",
    body: "Drag the handle above your hotbar upward. Drag stacks between slots to move, swap, or combine them.",
    keys: "DRAG UP  ·  E",
  },
  {
    x: 41,
    title: "Plant a little tomorrow.",
    label: "05 / GROW",
    body: "Select a seed, then right click just above earth or grass. Trees keep growing while you are away. Punch a mature tree to harvest!",
    keys: "PLANT  ·  WAIT  ·  HARVEST",
  },
  {
    x: 45,
    title: "Your world remembers.",
    label: "06 / SAVE",
    body: "Your progress saves in this browser. Export a backup from settings to take your world with you.",
    keys: "ESC  ·  SETTINGS",
  },
];
