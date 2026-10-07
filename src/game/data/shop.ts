import type { Stack } from "../systems/InventorySystem";
export const UPGRADE_IDS = ["pickaxe", "shoes", "boots", "magnet"] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];
export interface ShopOffer {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  category: "Gear" | "Seeds" | "Building" | "Bundles";
  upgrade?: UpgradeId;
  contents?: Stack[];
  badge?: string;
}
export const SHOP: ShopOffer[] = [
  {
    id: "pickaxe",
    name: "Trail pickaxe",
    description: "Twice the breaking power. Every swing counts.",
    price: 18,
    icon: "pickaxe",
    category: "Gear",
    upgrade: "pickaxe",
    badge: "2× POWER",
  },
  {
    id: "shoes",
    name: "Fast shoes",
    description: "Run 30% faster through your little wild.",
    price: 24,
    icon: "shoes",
    category: "Gear",
    upgrade: "shoes",
    badge: "+30% SPEED",
  },
  {
    id: "boots",
    name: "Spring boots",
    description: "Jump 18% harder. Reach a little higher.",
    price: 32,
    icon: "boots",
    category: "Gear",
    upgrade: "boots",
    badge: "HIGHER JUMPS",
  },
  {
    id: "magnet",
    name: "Gathering charm",
    description: "Draw nearby drops from 60% farther away.",
    price: 28,
    icon: "magnet",
    category: "Gear",
    upgrade: "magnet",
    badge: "WIDER PICKUP",
  },
  {
    id: "cedar-seeds",
    name: "Cedar seeds",
    description: "3 seeds · A small forest in your pocket.",
    price: 6,
    icon: "seed",
    category: "Seeds",
    contents: [{ id: "seed", count: 3 }],
  },
  {
    id: "stone-seeds",
    name: "Stonebloom seeds",
    description: "3 seeds · Grow your own riverstone.",
    price: 9,
    icon: "stoneSeed",
    category: "Seeds",
    contents: [{ id: "stoneSeed", count: 3 }],
  },
  {
    id: "earth-pack",
    name: "Earth parcel",
    description: "25 blocks · Make a little more ground.",
    price: 4,
    icon: "dirt",
    category: "Building",
    contents: [{ id: "dirt", count: 25 }],
  },
  {
    id: "meadow-pack",
    name: "Meadow parcel",
    description: "20 blocks · A greener kind of building.",
    price: 6,
    icon: "grass",
    category: "Building",
    contents: [{ id: "grass", count: 20 }],
  },
  {
    id: "cedar-pack",
    name: "Cedar stack",
    description: "15 blocks · Warm wood for cozy corners.",
    price: 8,
    icon: "wood",
    category: "Building",
    contents: [{ id: "wood", count: 15 }],
  },
  {
    id: "stone-pack",
    name: "Riverstone stack",
    description: "20 blocks · Sturdy, simple, timeless.",
    price: 8,
    icon: "stone",
    category: "Building",
    contents: [{ id: "stone", count: 20 }],
  },
  {
    id: "slate-pack",
    name: "Deep slate stack",
    description: "15 blocks · A little underground charm.",
    price: 12,
    icon: "slate",
    category: "Building",
    contents: [{ id: "slate", count: 15 }],
  },
  {
    id: "sunstone-pack",
    name: "Sunstone treasures",
    description: "8 blocks · Build with a golden glow.",
    price: 16,
    icon: "amber",
    category: "Building",
    contents: [{ id: "amber", count: 8 }],
  },
  {
    id: "casino-wheel",
    name: "Casino wheel",
    description: "One placeable wheel · Click to spin 0–36.",
    price: 5,
    icon: "wheel",
    category: "Building",
    contents: [{ id: "wheel", count: 1 }],
    badge: "SPIN TO PLAY",
  },
  {
    id: "garden-kit",
    name: "Pocket garden",
    description: "10 meadow blocks + 3 cedar seeds.",
    price: 8,
    icon: "seed",
    category: "Bundles",
    contents: [
      { id: "grass", count: 10 },
      { id: "seed", count: 3 },
    ],
    badge: "GROW SOMETHING",
  },
  {
    id: "cabin-kit",
    name: "Cabin starter",
    description: "30 cedar wood + 15 riverstone.",
    price: 18,
    icon: "wood",
    category: "Bundles",
    contents: [
      { id: "wood", count: 30 },
      { id: "stone", count: 15 },
    ],
  },
  {
    id: "landscape-kit",
    name: "Landscaper’s crate",
    description: "40 earth + 30 meadow blocks.",
    price: 12,
    icon: "grass",
    category: "Bundles",
    contents: [
      { id: "dirt", count: 40 },
      { id: "grass", count: 30 },
    ],
  },
  {
    id: "rock-garden",
    name: "Rock garden",
    description: "15 slate + 3 stonebloom seeds.",
    price: 16,
    icon: "stoneSeed",
    category: "Bundles",
    contents: [
      { id: "slate", count: 15 },
      { id: "stoneSeed", count: 3 },
    ],
  },
];
