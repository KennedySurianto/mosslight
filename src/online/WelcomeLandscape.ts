/** A decorative meadow for the welcome overlay. It never reads or renders a player world. */
export class WelcomeLandscape {
  readonly canvas = document.createElement("canvas");
  private context = this.canvas.getContext("2d")!;
  private frame = 0;
  private lastDraw = 0;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  constructor(private host: HTMLElement) {
    this.canvas.className = "welcome-landscape";
    this.canvas.setAttribute("aria-hidden", "true");
    this.host.append(this.canvas);
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.sync);
    this.reducedMotion.addEventListener("change", this.sync);
    new MutationObserver(this.sync).observe(host, { attributes: true, attributeFilter: ["hidden"] });
    this.resize();
    this.sync();
  }

  private resize = () => {
    this.canvas.width = Math.max(160, Math.ceil(window.innerWidth / 4));
    this.canvas.height = Math.max(120, Math.ceil(window.innerHeight / 4));
    this.context.imageSmoothingEnabled = false;
    this.draw(performance.now());
  };

  private sync = () => {
    if (this.host.hidden || document.hidden || this.reducedMotion.matches) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      if (this.reducedMotion.matches) this.draw(0);
    } else if (!this.frame) {
      this.frame = requestAnimationFrame(this.tick);
    }
  };

  private tick = (now: number) => {
    this.frame = 0;
    if (now - this.lastDraw > 50) {
      this.lastDraw = now;
      this.draw(now);
    }
    this.sync();
  };

  private draw(now: number) {
    const c = this.context;
    const { width: w, height: h } = this.canvas;
    const t = now / 1000;
    const block = (x: number, y: number, width: number, height: number, color: string) => {
      c.fillStyle = color;
      c.fillRect(Math.round(x), Math.round(y), Math.ceil(width), Math.ceil(height));
    };

    // Low-resolution sky and the same stepped hill palette used in the game.
    for (let y = 0; y < h; y += 3) {
      const p = y / h;
      block(0, y, w, 3, `rgb(${Math.round(146 + 88 * p)},${Math.round(194 + 41 * p)},${Math.round(183 + 7 * p)})`);
    }
    const sunX = w * .78, sunY = h * .25;
    block(sunX - 9, sunY - 11, 18, 22, "#f8edba");
    block(sunX - 12, sunY - 7, 24, 14, "#f8edba");
    block(sunX - 6, sunY - 8, 12, 16, "#fff4c9");

    for (let i = 0; i < 6; i++) {
      const span = w + 80;
      const x = ((i * 91 + t * (1.6 + i % 2) - 40) % span + span) % span - 40;
      const y = h * (.11 + (i % 3) * .09);
      block(x, y + 4, 30, 6, "#e9f2de");
      block(x + 6, y, 16, 12, "#f6f7e8");
      block(x + 22, y + 3, 12, 7, "#f6f7e8");
    }

    for (let layer = 0; layer < 3; layer++) {
      const colors = ["#b8cdae", "#9dbca0", "#83a98c"];
      for (let x = 0; x < w; x += 4) {
        const n = x + t * (1.2 + layer * .7);
        const top = Math.round((h * (.63 + layer * .085) + Math.sin(n / (34 - layer * 5) + layer) * 8 + Math.sin(n / 13) * 3) / 2) * 2;
        block(x, top, 4, h - top, colors[layer]);
      }
    }

    const ground = Math.round(h * .79 / 4) * 4;
    for (let x = 0; x < w + 18; x += 18) {
      const y = ground + Math.sin(x * .16) * 4;
      block(x + 8, y - 13, 2, 23, "#658b70");
      block(x + 2, y - 16, 14, 9, "#749b7b");
      block(x + 5, y - 21, 9, 8, "#82a985");
    }
    block(0, ground + 7, w, h - ground, "#769b69");
    block(0, ground + 7, w, 3, "#a9c97b");
    for (let x = 0; x < w; x += 7) {
      const sway = Math.round(Math.sin(t * 2 + x * .19));
      const y = ground + 8 + (x * 7 % 11);
      block(x + sway, y, 1, 5, "#527e55");
      block(x - 1 + sway, y + 2, 3, 1, "#527e55");
      if (x % 35 === 0) {
        block(x + 3, y - 2, 2, 4, "#4b8455");
        block(x + 1, y - 4, 6, 3, x % 70 ? "#f0d19b" : "#f6e6c0");
        block(x + 3, y - 3, 2, 2, "#d69b83");
      }
    }
    for (let i = 0; i < 20; i++) {
      const x = (i * 73 + Math.sin(t * .8 + i) * 5) % w;
      const y = h * (.13 + (i * 13 % 59) / 100) + Math.sin(t * 1.4 + i * 3) * 3;
      block(x, y, 1, 1, i % 3 ? "#fff2c9" : "#d9efdc");
    }
  }
}
