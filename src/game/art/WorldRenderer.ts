import * as Phaser from "phaser";
import { Backdrop } from "./Backdrop";
import { GAME, SIGNS } from "../data/config";
import { WorldSystem, noise } from "../systems/WorldSystem";
import type { SeedSystem, TreeData } from "../systems/SeedSystem";
export class WorldRenderer {
  private tiles: Phaser.GameObjects.Image[] = [];
  private walls: Phaser.GameObjects.Rectangle[] = [];
  private tileKey = "";
  private treeSprites = new Map<TreeData, Phaser.GameObjects.Image>();
  private backdrop: Backdrop;

  private motes: Phaser.GameObjects.Image[] = [];
  private effects = 0;
  target: Phaser.GameObjects.Graphics;
  cracks: Phaser.GameObjects.Graphics;
  ghost: Phaser.GameObjects.Image;
  constructor(
    private scene: Phaser.Scene,
    private world: WorldSystem,
    private seeds: SeedSystem,
  ) {
    this.backdrop = new Backdrop(scene, world.seed);
    for (const [key, type] of world.foliage) {
      const [x, y] = key.split(",").map(Number);
      scene.add
        .image(x * 32 + 16, (y + 1) * 32, type)
        .setOrigin(0.5, 1)
        .setDepth(2)
        .setName(`plant-${key}`);
    }
    scene.add
      .image(GAME.spawnX * 32 + 16, GAME.surface * 32, "door")
      .setOrigin(0.5, 1)
      .setDepth(3);
    const home = scene.add
      .text(GAME.spawnX * 32 + 16, GAME.surface * 32 - 91, "HOME", {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#52705a",
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setDepth(4);
    home.setAlpha(0.9);
    SIGNS.forEach((s, i) => {
      scene.add
        .image(s.x * 32 + 16, GAME.surface * 32, "sign")
        .setOrigin(0.5, 1)
        .setDepth(4);
      scene.add
        .text(s.x * 32 + 16, GAME.surface * 32 - 39, i === 0 ? "?" : `${i}`, {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#fcf1ca",
          backgroundColor: "#557354",
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(4);
    });
    for (let i = 0; i < 26; i++)
      this.motes.push(
        scene.add.image(0, 0, "pixel").setDepth(15).setAlpha(0.4),
      );
    this.target = scene.add.graphics().setDepth(13);
    this.cracks = scene.add.graphics().setDepth(11);
    this.ghost = scene.add
      .image(0, 0, "tile-2")
      .setOrigin(0)
      .setDepth(12)
      .setAlpha(0.4)
      .setVisible(false);
    scene.scale.on("resize", () => {
      this.tileKey = "";
    });
  }
  update(now: number) {
    this.backdrop.update(now);
    const camera = this.scene.cameras.main,
      v = camera.worldView;
    const x0 = Math.max(0, Math.floor(v.x / 32) - 2),
      y0 = Math.max(0, Math.floor(v.y / 32) - 2),
      x1 = Math.min(GAME.width - 1, Math.ceil(v.right / 32) + 2),
      y1 = Math.min(GAME.height - 1, Math.ceil(v.bottom / 32) + 2);
    const key = `${x0},${y0},${x1},${y1},${this.world.revision}`;
    if (key !== this.tileKey) {
      this.tileKey = key;
      let used = 0,
        wall = 0;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const id = this.world.get(x, y);
          if (id) {
            let image = this.tiles[used];
            if (!image) {
              image = this.scene.add
                .image(0, 0, `tile-${id}`)
                .setOrigin(0)
                .setDepth(1);
              this.tiles.push(image);
            }
            image
              .setTexture(`tile-${id}`)
              .setPosition(x * 32, y * 32)
              .setVisible(true);
            used++;
          } else if (y > this.world.surface(x)) {
            let bg = this.walls[wall];
            if (!bg) {
              bg = this.scene.add
                .rectangle(0, 0, 32, 32, 0x554b43)
                .setOrigin(0)
                .setDepth(0);
              this.walls.push(bg);
            }
            bg.setPosition(x * 32, y * 32)
              .setFillStyle(y > 38 ? 0x39494e : 0x665846)
              .setVisible(true);
            wall++;
          }
        }
      this.tiles.slice(used).forEach((t) => t.setVisible(false));
      this.walls.slice(wall).forEach((t) => t.setVisible(false));
      this.scene.children.list.forEach((o) => {
        if (o.name?.startsWith("plant-")) {
          const key = o.name.slice(6);
          (o as Phaser.GameObjects.Image).setVisible(
            this.world.foliage.has(key),
          );
        }
      });
    }
    for (const [tree, sprite] of this.treeSprites)
      if (!this.seeds.trees.includes(tree)) {
        sprite.destroy();
        this.treeSprites.delete(tree);
      }
    for (const tree of this.seeds.trees) {
      let sprite = this.treeSprites.get(tree);
      if (!sprite) {
        sprite = this.scene.add
          .image(tree.x * 32 + 16, (tree.y + 1) * 32, "tree")
          .setOrigin(0.5, 1)
          .setDepth(5);
        this.treeSprites.set(tree, sprite);
      }
      const stage = this.seeds.stage(tree);
      sprite
        .setTexture(
          stage < 2
            ? "sprout"
            : tree.type === "stoneSeed"
              ? "stone-tree"
              : "tree",
        )
        .setScale(
          stage === 0 ? 0.5 : stage === 1 ? 0.8 : stage === 2 ? 0.57 : 1,
        );
      sprite.setVisible(tree.x >= x0 - 3 && tree.x <= x1 + 3);
    }
    this.motes.forEach((m, i) => {
      const x = v.x + ((i * 97 + now * 0.008) % (v.width + 20)),
        y =
          GAME.surface * 32 -
          20 -
          ((i * 37) % 200) +
          Math.sin(now / 2100 + i) * 14;
      m.setPosition(x, y).setAlpha(0.15 + Math.sin(now / 1000 + i) * 0.15);
    });
  }
  flash(x: number, y: number) {
    const flash = this.scene.add
      .rectangle(x * 32 + 16, y * 32 + 16, 30, 30, 0xfff1c8, 0.45)
      .setDepth(11);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 130,
      onComplete: () => flash.destroy(),
    });
  }
  burst(x: number, y: number, color: number, count = 8) {
    for (let i = 0; i < count && this.effects < 130; i++) {
      this.effects++;
      const p = this.scene.add
        .rectangle(x, y, 2 + Math.random() * 2, 2 + Math.random() * 2, color)
        .setDepth(20);
      this.scene.tweens.add({
        targets: p,
        x: x + (Math.random() - 0.5) * 65,
        y: y - 12 - Math.random() * 35,
        alpha: 0,
        angle: Math.random() * 180,
        duration: 380 + Math.random() * 250,
        ease: "Cubic.Out",
        onComplete: () => {
          p.destroy();
          this.effects--;
        },
      });
    }
  }
  float(x: number, y: number, text: string, color = "#fff2cd") {
    const label = this.scene.add
      .text(x, y, text, {
        fontFamily: "monospace",
        fontSize: "10px",
        color,
        stroke: "#354b42",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.scene.tweens.add({
      targets: label,
      y: y - 35,
      alpha: 0,
      duration: 1100,
      ease: "Cubic.Out",
      onComplete: () => label.destroy(),
    });
  }
}
