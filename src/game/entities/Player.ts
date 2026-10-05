import * as Phaser from "phaser";
import { GAME } from "../data/config";
import type { WorldSystem } from "../systems/WorldSystem";
export class Player {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  width = 20;
  height = 30;
  speedMultiplier = 1;
  jumpMultiplier = 1;
  pickupRange = 70;
  grounded = false;
  facing = 1;
  sprite: Phaser.GameObjects.Sprite;
  actionUntil = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  onJump = () => {};
  onLand = () => {};
  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.x = x;
    this.y = y;
    this.sprite = scene.add
      .sprite(x, y, "player-idle")
      .setOrigin(0.5, 1)
      .setScale(0.72)
      .setDepth(10);
  }
  overlaps(x: number, y: number) {
    return (
      this.x + 10 > x * 32 &&
      this.x - 10 < (x + 1) * 32 &&
      this.y > y * 32 &&
      this.y - this.height < (y + 1) * 32
    );
  }
  blocked(world: WorldSystem, x: number, y: number) {
    for (
      let tx = Math.floor((x - 10) / 32);
      tx <= Math.floor((x + 9.99) / 32);
      tx++
    )
      for (
        let ty = Math.floor((y - this.height) / 32);
        ty <= Math.floor((y - 0.01) / 32);
        ty++
      )
        if (world.solid(tx, ty)) return true;
    return false;
  }
  update(
    dt: number,
    world: WorldSystem,
    direction: number,
    jump: boolean,
    now: number,
  ) {
    if (jump) this.jumpBuffer = 0.12;
    else this.jumpBuffer -= dt;
    if (this.grounded) this.coyote = 0.1;
    else this.coyote -= dt;
    const target = direction * GAME.speed * this.speedMultiplier,
      step = GAME.acceleration * dt * (direction ? 1 : 1.4);
    this.vx += Math.max(-step, Math.min(step, target - this.vx));
    if (direction) this.facing = direction;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = -GAME.jump * this.jumpMultiplier;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.onJump();
    }
    this.vy = Math.min(this.vy + GAME.gravity * dt, 720);
    // Substeps prevent tunneling at thin tile edges after a slow frame.
    const steps =
      Math.ceil(Math.max(Math.abs(this.vx * dt), Math.abs(this.vy * dt)) / 6) ||
      1;
    for (let i = 0; i < steps; i++) {
      const nx = this.x + (this.vx * dt) / steps;
      if (!this.blocked(world, nx, this.y)) this.x = nx;
      else this.vx = 0;
      const ny = this.y + (this.vy * dt) / steps;
      if (!this.blocked(world, this.x, ny)) {
        this.y = ny;
        this.grounded = false;
      } else {
        if (this.vy > 0) {
          if (!this.grounded && this.vy > 200) this.onLand();
          this.y = Math.floor((ny - 0.01) / 32) * 32;
          this.grounded = true;
        }
        this.vy = 0;
      }
    }
    let state = this.grounded
      ? Math.abs(this.vx) > 15
        ? Math.floor(now / 110) % 2
          ? "walk1"
          : "walk2"
        : "idle"
      : this.vy < 0
        ? "jump"
        : "fall";
    if (now < this.actionUntil) state = "punch";
    this.sprite
      .setTexture(`player-${state}`)
      .setPosition(Math.round(this.x), Math.round(this.y))
      .setFlipX(this.facing < 0);
    this.sprite.setScale(
      0.72,
      0.72 * (this.grounded ? 1 : this.vy < 0 ? 1.035 : 0.98),
    );
  }
  respawn() {
    this.x = GAME.spawnX * 32 + 16;
    this.y = GAME.surface * 32;
    this.vx = 0;
    this.vy = 0;
    this.grounded = true;
  }
}
