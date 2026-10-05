import * as Phaser from "phaser";
import { GAME } from "../data/config";
import { noise } from "../systems/WorldSystem";

/** Viewport-aware parallax, independent of the world's pooled foreground tiles. */
export class Backdrop {
  private sky: Phaser.GameObjects.Graphics;
  private hills: Phaser.GameObjects.Graphics;
  private clouds: Phaser.GameObjects.Image[] = [];
  private size = "";
  private hillKey = "";
  constructor(
    private scene: Phaser.Scene,
    seed: number,
  ) {
    this.sky = scene.add.graphics().setScrollFactor(0).setDepth(-100);
    this.hills = scene.add.graphics().setScrollFactor(0).setDepth(-90);
    for (let i = 0; i < 5; i++)
      this.clouds.push(
        scene.add
          .image(0, 0, "cloud")
          .setScrollFactor(0)
          .setDepth(-95)
          .setAlpha(0.58)
          .setScale(0.6 + noise(i, 2, seed) * 0.45),
      );
  }
  update(now: number) {
    const c = this.scene.cameras.main,
      z = c.zoom,
      w = c.width / z,
      h = c.height / z;
    // Phaser zooms around the viewport center, even for scrollFactor(0) objects.
    const ox = (c.width - w) / 2,
      oy = (c.height - h) / 2;
    this.sky.setPosition(ox, oy);
    this.hills.setPosition(ox, oy);
    const size = `${w},${h}`;
    if (size !== this.size) {
      this.size = size;
      this.sky.clear();
      for (let y = 0; y < h + 8; y += 8) {
        const t = Math.min(1, y / h);
        const color = Phaser.Display.Color.Interpolate.ColorWithColor(
          new Phaser.Display.Color(146, 194, 183),
          new Phaser.Display.Color(234, 235, 190),
          100,
          t * 100,
        );
        this.sky
          .fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b))
          .fillRect(0, y, w, 8);
      }
      this.sky.fillStyle(0xf7edb2, 0.22).fillCircle(w * 0.77, h * 0.29, 42);
      this.sky.fillStyle(0xfff0bc, 0.85).fillCircle(w * 0.77, h * 0.29, 27);
    }
    const ground = GAME.surface * 32 - c.worldView.y;
    const key = `${size},${Math.floor(c.worldView.x / 8)},${Math.floor(ground / 2)}`;
    if (key !== this.hillKey) {
      this.hillKey = key;
      const g = this.hills;
      g.clear();
      for (let layer = 0; layer < 3; layer++) {
        g.fillStyle([0xb8cdae, 0x9dbca0, 0x83a98c][layer]);
        for (let x = -8; x < w + 8; x += 8) {
          const n = x + c.worldView.x * (0.12 + layer * 0.08);
          const top =
            Math.round(
              (ground -
                122 +
                layer * 37 +
                Math.sin(n / (110 - layer * 16) + layer) * 22 +
                Math.sin(n / 43) * 8) /
                4,
            ) * 4;
          g.fillRect(x, top, 8, Math.max(0, h + 100 - top));
        }
      }
      g.fillStyle(0x749b7b, 0.6);
      for (let i = -2; i < w / 48 + 3; i++) {
        const x = i * 48 - ((c.worldView.x * 0.22) % 48),
          y = ground - 40 + Math.sin(i * 1.3) * 12;
        g.fillRect(x + 10, y - 30, 3, 45);
        g.fillRect(x, y - 34, 25, 19);
        g.fillRect(x + 4, y - 44, 17, 18);
      }
    }
    this.clouds.forEach((cloud, i) => {
      const x =
        ((((i * 173 - c.worldView.x * 0.1 + now * 0.0015) % (w + 180)) +
          (w + 180)) %
          (w + 180)) -
        90;
      cloud.setPosition(ox + x, oy + h * (0.17 + (i % 3) * 0.075));
    });
  }
}
