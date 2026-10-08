import * as Phaser from "phaser";
import { ITEMS, GAME, type ItemId } from "../data/config";
import type { WorldSystem } from "./WorldSystem";
import type { Player } from "../entities/Player";
import type { SavedDrop } from "./SaveSystem";
interface Drop extends SavedDrop {
  vx: number;
  vy: number;
  age: number;
  sprite: Phaser.GameObjects.Image;
  baseScale: number;
  homing: boolean;
}
export class DropSystem {
  drops: Drop[] = [];
  constructor(
    private scene: Phaser.Scene,
    private world: WorldSystem,
    private collect: (id: ItemId | "gem", count: number) => number,
  ) {}
  spawn(x: number, y: number, id: ItemId | "gem", count = 1) {
    if (this.drops.length >= 240) {
      const d = this.drops.find((d) => d.id === id && d.count + count <= 999);
      if (d) {
        d.count += count;
        return;
      }
      const left = this.collect(id, count);
      if (!left) return;
      count = left;
      // At the hard entity limit recycle the oldest unclaimed drop, like other
      // finite-lifetime sandbox drops, instead of allowing an unbounded save.
      if (this.drops.length >= 250) this.drops.shift()!.sprite.destroy();
    }
    const key =
      id === "gem" || ITEMS[id].growth ? id : `tile-${ITEMS[id].tile}`;
    const scale = id === "gem" ? 0.65 : 0.45;
    this.drops.push({
      x,
      y,
      id,
      count,
      vx: (Math.random() - 0.5) * 95,
      vy: -130,
      age: 0,
      baseScale: scale,
      homing: true,
      sprite: this.scene.add.image(x, y, key).setScale(scale).setDepth(12),
    });
  }
  visualPickup(x: number, y: number, id: ItemId | "gem", player: Pick<Player, "x" | "y"> & { pickupRange?: number }) {
    const key = id === "gem" || ITEMS[id].growth ? id : `tile-${ITEMS[id].tile}`;
    const sprite = this.scene.add.image(x, y, key).setScale(id === "gem" ? .65 : .45).setDepth(13);
    const flight = { progress: 0 };
    this.scene.tweens.add({
      targets: flight, progress: 1, duration: (player.pickupRange ?? 70) > 70 ? 260 : 420, ease: "Cubic.easeIn",
      onUpdate: () => {
        const t = flight.progress;
        sprite.setPosition(x + (player.x - x) * t, y + (player.y - 18 - y) * t - Math.sin(Math.PI * t) * 16);
        sprite.setAlpha(1 - t * .25);
      },
      onComplete: () => sprite.destroy(),
    });
  }
  update(dt: number, player: Player) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.homing) {
        const targetX = player.x, targetY = player.y - 18;
        const pull = 1 - Math.exp(-6 * (player.pickupRange / 70) * dt);
        d.x += (targetX - d.x) * pull;
        d.y += (targetY - d.y) * pull;
        d.sprite.setPosition(d.x, d.y - Math.sin(Math.min(d.age / .32, 1) * Math.PI) * 10);
        if (d.age > .32 && Math.hypot(targetX - d.x, targetY - d.y) < 18) {
          const left = this.collect(d.id, d.count);
          if (!left) {
            this.scene.tweens.add({ targets: d.sprite, alpha: 0, scale: 0, duration: 110,
              onComplete: () => d.sprite.destroy() });
            this.drops.splice(i, 1);
          } else {
            d.count = left;
            d.homing = false;
            d.vx = 0;
            d.vy = -80;
          }
        }
        continue;
      }
      const distance = Math.hypot(player.x - d.x, player.y - 18 - d.y);
      if (distance < player.pickupRange && d.age > 0.35) {
        d.vx += (player.x - d.x) * dt * 25;
        d.vy += (player.y - 18 - d.y) * dt * 25;
      } else d.vy += 700 * dt;
      d.vx *= Math.pow(0.3, dt);
      let ny = d.y + d.vy * dt;
      const nx = Math.max(
        33,
        Math.min((GAME.width - 1) * 32 - 4, d.x + d.vx * dt),
      );
      if (!this.world.solid(Math.floor(nx / 32), Math.floor(d.y / 32)))
        d.x = nx;
      else d.vx *= -0.4;
      if (
        d.vy > 0 &&
        this.world.solid(Math.floor(d.x / 32), Math.floor((ny + 6) / 32))
      ) {
        ny = Math.floor((ny + 6) / 32) * 32 - 6;
        d.vy = Math.abs(d.vy) > 35 ? -d.vy * 0.23 : 0;
      }
      d.y = Math.max(4, Math.min(GAME.height * 32 - 65, ny));
      d.sprite
        .setPosition(d.x, d.y + Math.sin(d.age * 4) * 1.4)
        .setAngle(Math.sin(d.age * 3) * 8);
      if (distance < 24 && d.age > 0.4) {
        const left = this.collect(d.id, d.count);
        if (left === 0) {
          this.scene.tweens.add({
            targets: d.sprite,
            alpha: 0,
            scale: 0,
            y: player.y - 30,
            duration: 140,
            onComplete: () => d.sprite.destroy(),
          });
          this.drops.splice(i, 1);
        } else d.count = left;
      }
    }
  }
  serialize(): SavedDrop[] {
    return this.drops.map(({ x, y, id, count }) => ({ x, y, id, count }));
  }
}
