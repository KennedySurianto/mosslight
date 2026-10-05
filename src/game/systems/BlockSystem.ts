import { BLOCKS, GAME, ITEMS } from "../data/config";
import type { WorldSystem } from "./WorldSystem";
import type { Player } from "../entities/Player";
import type { SeedSystem } from "./SeedSystem";
import type { InventorySystem } from "./InventorySystem";
export class BlockSystem {
  damage = new Map<string, number>();
  power = 1;
  constructor(
    public world: WorldSystem,
    private player: Player,
    private seeds: SeedSystem,
    private inventory: InventorySystem,
  ) {}
  reachable(x: number, y: number) {
    return (
      Math.hypot(
        x * 32 + 16 - this.player.x,
        y * 32 + 16 - (this.player.y - 18),
      ) <=
      GAME.reach * 32
    );
  }
  placement(x: number, y: number): string | null {
    const s = this.inventory.slots[this.inventory.selected];
    if (!s) return "Select a block or seed";
    if (!this.reachable(x, y)) return "A little closer";
    if (x < 1 || x >= GAME.width - 1 || y < 1 || y >= GAME.height - 2)
      return "World boundary";
    if (this.world.protected(x, y)) return "Leave a little room for home";
    if (this.world.get(x, y)) return "This space is occupied";
    if (this.world.foliageAt(x, y)) return "Break the foliage here first";
    if (this.player.overlaps(x, y)) return "Step aside to build here";
    if (this.seeds.at(x, y)) return "Give this tree room to grow";
    if (ITEMS[s.id].growth) {
      if (
        ![1, 2, ...(s.id === "stoneSeed" ? [3] : [])].includes(
          this.world.get(x, y + 1),
        )
      )
        return "Plant on earth or grass";
      if (
        this.world.get(x, y - 1) ||
        this.world.get(x, y - 2) ||
        this.seeds.trees.some(
          (t) => Math.abs(t.x - x) < 2 && Math.abs(t.y - y) < 3,
        )
      )
        return "This tree needs more room";
    }
    return null;
  }
  hit(x: number, y: number) {
    const id = this.world.get(x, y),
      def = BLOCKS[id];
    if (
      !def ||
      !Number.isFinite(def.durability) ||
      this.world.protected(x, y) ||
      !this.reachable(x, y)
    )
      return null;
    if (this.seeds.trees.some((t) => t.x === x && t.y + 1 === y)) return null;
    const key = `${x},${y}`,
      hits = (this.damage.get(key) ?? 0) + this.power;
    const broken = hits >= def.durability;
    if (broken) {
      this.world.set(x, y, 0);
      this.damage.delete(key);
    } else this.damage.set(key, hits);
    return { def, hits, broken };
  }
  place(x: number, y: number) {
    if (this.placement(x, y)) return false;
    const s = this.inventory.slots[this.inventory.selected]!;
    if (ITEMS[s.id].growth) this.seeds.plant(x, y, s.id);
    else this.world.set(x, y, ITEMS[s.id].tile!);
    this.damage.delete(`${x},${y}`);
    this.inventory.consume(this.inventory.selected);
    return true;
  }
}
