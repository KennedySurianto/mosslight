import * as Phaser from "phaser";
import { noise } from "../systems/WorldSystem";
export const iconURLs: Record<string, string> = {};
type Paint = (ctx: CanvasRenderingContext2D) => void;
export function createTextures(scene: Phaser.Scene) {
  const make = (key: string, w: number, h: number, paint: Paint) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    paint(ctx);
    scene.textures.addCanvas(key, c);
    iconURLs[key] = c.toDataURL();
  };
  const rect = (
    c: CanvasRenderingContext2D,
    color: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const earth = (c: CanvasRenderingContext2D, grass = false) => {
    rect(c, "#80553f", 0, 0, 32, 32);
    rect(c, "#a87951", 0, 1, 32, 29);
    for (let i = 0; i < 22; i++) {
      const x = Math.floor(noise(i, 2, 11) * 15) * 2,
        y = Math.floor(noise(i, 4, 12) * 15) * 2;
      rect(c, i % 3 ? "#986a48" : "#bd8d60", x, y, 2 + (i % 3), 2);
    }
    rect(c, "#6f4e3d", 0, 30, 32, 2);
    if (grass) {
      rect(c, "#47764a", 0, 0, 32, 8);
      rect(c, "#71a856", 0, 0, 32, 5);
      rect(c, "#a0c86b", 0, 0, 32, 2);
      for (let x = 0; x < 32; x += 4)
        rect(c, "#71a856", x, 5, 2, 2 + (x % 3) * 2);
    }
  };
  make("tile-1", 32, 32, (c) => earth(c, true));
  make("tile-2", 32, 32, (c) => earth(c));
  for (const id of [3, 5, 7])
    make(`tile-${id}`, 32, 32, (c) => {
      const p =
        id === 3
          ? ["#5c7174", "#819390", "#a0aaa0", "#718683"]
          : id === 5
            ? ["#3e4b5b", "#607182", "#83919d", "#536375"]
            : ["#303e45", "#495b60", "#637574", "#384c52"];
      rect(c, p[0], 0, 0, 32, 32);
      for (let row = 0; row < 3; row++)
        for (let col = -1; col < 3; col++) {
          const x = col * 17 + (row % 2) * 8,
            y = row * 11;
          rect(c, p[1], x + 1, y + 1, 15, 9);
          rect(c, p[2], x + 2, y + 1, 12, 1);
          rect(c, p[3], x + 2, y + 8, 13, 2);
        }
    });
  make("tile-4", 32, 32, (c) => {
    rect(c, "#6c4938", 0, 0, 32, 32);
    for (let i = 0; i < 4; i++) {
      rect(c, "#ad7a4c", i * 8 + 1, 1, 6, 30);
      rect(c, "#d0a16a", i * 8 + 1, 1, 2, 29);
      rect(c, "#885d3e", i * 8 + 4, 5 + i * 3, 2, 8);
    }
    rect(c, "#d0a16a", 0, 0, 32, 1);
  });
  make("tile-6", 32, 32, (c) => {
    c.drawImage(
      scene.textures.get("tile-5").getSourceImage() as HTMLCanvasElement,
      0,
      0,
    );
    for (const [x, y] of [
      [6, 5],
      [20, 17],
      [8, 23],
    ]) {
      rect(c, "#966b38", x - 2, y + 2, 9, 7);
      rect(c, "#e4ae4d", x, y, 6, 6);
      rect(c, "#ffda76", x, y, 4, 2);
      rect(c, "#ffedb5", x + 1, y + 1, 2, 2);
    }
  });
  for (const [key, id] of Object.entries({
    grass: 1,
    dirt: 2,
    stone: 3,
    wood: 4,
    slate: 5,
    amber: 6,
  }))
    iconURLs[key] = iconURLs[`tile-${id}`];
  const seed = (c: CanvasRenderingContext2D, blue = false) => {
    rect(c, "#634b35", 12, 19, 9, 9);
    rect(c, "#ba8551", 12, 18, 7, 8);
    rect(c, "#e4b975", 13, 18, 3, 4);
    rect(c, "#446e49", 16, 10, 2, 12);
    rect(c, blue ? "#a4c7c6" : "#acd079", 8, 8, 9, 5);
    rect(c, blue ? "#729997" : "#7fac55", 10, 13, 8, 3);
    rect(c, blue ? "#b8d6d6" : "#d1df8a", 18, 5, 8, 6);
    rect(c, blue ? "#729997" : "#7fac55", 18, 11, 5, 3);
  };
  make("seed", 32, 32, (c) => seed(c));
  make("stoneSeed", 32, 32, (c) => seed(c, true));
  make("gem", 16, 20, (c) => {
    rect(c, "#226c68", 5, 1, 6, 18);
    rect(c, "#348c7f", 2, 5, 12, 9);
    rect(c, "#69d2b1", 4, 3, 7, 12);
    rect(c, "#c6f3c7", 5, 4, 3, 7);
    rect(c, "#45af94", 9, 5, 3, 10);
    rect(c, "#9ce3b7", 6, 14, 4, 3);
  });
  make("worlds-icon", 20, 20, (c) => {
    rect(c, "#284b38", 2, 8, 16, 10);
    rect(c, "#81aa6c", 3, 7, 14, 10);
    rect(c, "#c8e2a1", 5, 4, 10, 4);
    rect(c, "#46744e", 8, 11, 4, 6);
    rect(c, "#f7e8a6", 5, 10, 2, 2);
    rect(c, "#f7e8a6", 13, 10, 2, 2);
    rect(c, "#e8d390", 7, 2, 6, 2);
  });
  make("chat-icon", 20, 20, (c) => {
    rect(c, "#284b38", 2, 3, 16, 12);
    rect(c, "#e9f0d3", 3, 3, 14, 10);
    rect(c, "#72a279", 4, 5, 12, 7);
    rect(c, "#e9f0d3", 5, 8, 10, 2);
    rect(c, "#284b38", 5, 14, 3, 3);
    rect(c, "#72a279", 6, 13, 3, 3);
  });
  make("door", 48, 76, (c) => {
    rect(c, "#466959", 2, 69, 44, 7);
    rect(c, "#aab4a0", 5, 66, 38, 7);
    rect(c, "#e2e4c9", 8, 4, 32, 64);
    rect(c, "#f9f3db", 12, 1, 24, 69);
    rect(c, "#9ba995", 16, 10, 19, 55);
    rect(c, "#f7f3df", 17, 10, 17, 54);
    rect(c, "#c6d3bc", 20, 15, 11, 20);
    rect(c, "#76afa1", 21, 16, 9, 18);
    rect(c, "#d8eee0", 22, 17, 3, 14);
    rect(c, "#e4e6cb", 20, 39, 11, 19);
    rect(c, "#d1b26b", 29, 37, 3, 4);
    rect(c, "#66875b", 4, 4, 5, 20);
    rect(c, "#88ad69", 0, 10, 9, 5);
    rect(c, "#aec982", 4, 0, 8, 6);
    rect(c, "#66875b", 39, 15, 5, 26);
    rect(c, "#8cac62", 38, 21, 9, 7);
  });
  make("sign", 28, 30, (c) => {
    rect(c, "#765139", 12, 13, 4, 17);
    rect(c, "#664e38", 0, 1, 28, 17);
    rect(c, "#c39c65", 1, 0, 26, 15);
    rect(c, "#e2bf82", 2, 1, 24, 2);
    rect(c, "#f9e3ac", 6, 5, 13, 2);
    rect(c, "#896944", 6, 9, 17, 2);
    rect(c, "#ebcc8c", 2, 4, 2, 2);
  });
  const tree = (c: CanvasRenderingContext2D, blue = false) => {
    const dark = blue ? "#426b6c" : "#3c7353",
      mid = blue ? "#66918b" : "#619552",
      light = blue ? "#96b6a0" : "#89b45e";
    rect(c, "#73533d", 43, 48, 12, 73);
    rect(c, "#a17a4a", 47, 50, 6, 70);
    rect(c, "#c39a59", 48, 77, 2, 37);
    rect(c, "#73533d", 32, 73, 16, 6);
    rect(c, "#73533d", 53, 61, 17, 6);
    rect(c, "#73533d", 31, 57, 6, 20);
    rect(c, "#73533d", 66, 46, 5, 21);
    rect(c, "#826342", 38, 119, 25, 9);
    for (const [x, y, w, h] of [
      [23, 7, 46, 29],
      [10, 25, 73, 34],
      [2, 42, 91, 26],
      [13, 62, 67, 20],
      [29, 0, 27, 16],
    ])
      rect(c, dark, x, y, w, h);
    for (const [x, y, w, h] of [
      [22, 8, 45, 21],
      [11, 28, 65, 24],
      [5, 44, 36, 17],
      [42, 38, 46, 22],
      [20, 58, 45, 16],
    ])
      rect(c, mid, x, y, w, h);
    for (const [x, y, w, h] of [
      [29, 7, 30, 5],
      [23, 13, 9, 4],
      [14, 29, 28, 4],
      [7, 44, 12, 4],
      [50, 37, 23, 4],
      [23, 59, 13, 4],
    ])
      rect(c, light, x, y, w, h);
    for (let i = 0; i < 65; i++) {
      const x = Math.floor(noise(i, 3, 20) * 76) + 10,
        y = Math.floor(noise(i, 7, 90) * 55) + 15;
      if (c.getImageData(x, y, 1, 1).data[3])
        rect(c, i % 3 === 0 ? light : dark, x, y, 2 + (i % 3), 2);
    }
    for (const [x, y] of [
      [28, 32],
      [65, 49],
      [40, 62],
    ]) {
      rect(c, blue ? "#a5d6ca" : "#e1b459", x, y, 3, 5);
      rect(c, blue ? "#d5eada" : "#f7d784", x, y, 2, 2);
    }
  };
  make("tree", 96, 128, (c) => tree(c));
  make("stone-tree", 96, 128, (c) => tree(c, true));
  make("sprout", 32, 40, (c) => {
    c.translate(0, 8);
    seed(c);
    rect(c, "#775b3d", 11, 29, 14, 3);
  });
  make("flower", 24, 18, (c) => {
    for (const [x, y] of [
      [3, 5],
      [12, 1],
      [20, 7],
    ]) {
      rect(c, "#5b874b", x, y + 4, 1, 13 - y);
      rect(c, "#e8c578", x - 2, y, 5, 4);
      rect(c, "#fae8a5", x, y, 2, 2);
    }
  });
  make("fern", 26, 20, (c) => {
    rect(c, "#56844d", 12, 3, 2, 17);
    for (let i = 0; i < 4; i++) {
      rect(
        c,
        i % 2 ? "#78a95b" : "#66974e",
        3 + i * 2,
        3 + i * 4,
        10 - i * 2,
        2,
      );
      rect(c, "#8cb567", 14, 1 + i * 4, 9 - i * 2, 3);
    }
  });
  make("mushroom", 18, 18, (c) => {
    rect(c, "#e5d4a8", 8, 9, 3, 9);
    rect(c, "#a9644e", 2, 6, 14, 5);
    rect(c, "#d38e65", 5, 3, 9, 4);
    rect(c, "#f2c49a", 6, 4, 3, 2);
  });
  for (const state of ["idle", "walk1", "walk2", "jump", "fall", "punch"])
    make(`player-${state}`, 32, 42, (c) => {
      const walk = state === "walk1" ? -3 : state === "walk2" ? 3 : 0;
      rect(c, "#344a49", 8 + walk, 32, 6, 8);
      rect(c, "#344a49", 19 - walk, 32, 5, 8);
      rect(c, "#bd8054", 7 + walk, 38, 8, 3);
      rect(c, "#bd8054", 19 - walk, 38, 8, 3);
      rect(c, "#d89653", 8, 21, 17, 13);
      rect(c, "#efc16f", 9, 21, 14, 10);
      rect(c, "#73917c", 8, 25, 17, 10);
      rect(c, "#567665", 10, 32, 14, 3);
      rect(c, "#e8bb85", 8, 9, 18, 14);
      rect(c, "#f5d29c", 12, 10, 14, 10);
      rect(c, "#5e493a", 8, 7, 17, 6);
      rect(c, "#5e493a", 7, 11, 5, 8);
      rect(c, "#293b3b", 22, 14, 2, 3);
      rect(c, "#bf8f63", 22, 20, 4, 2);
      rect(c, "#6b8a56", 4, 6, 25, 4);
      rect(c, "#94b875", 8, 0, 16, 8);
      rect(c, "#b6cc86", 9, 1, 12, 2);
      rect(c, "#d9b366", 8, 6, 17, 2);
      rect(
        c,
        "#eec894",
        state === "punch" ? 25 : 23,
        state === "punch" ? 20 : 25,
        state === "punch" ? 7 : 4,
        5,
      );
      rect(c, "#be895c", 5, 24, 4, 9);
      rect(c, "#b77e4d", 3, 23, 4, 10);
    });
  make("cloud", 128, 48, (c) => {
    for (const [x, y, w, h] of [
      [0, 24, 128, 14],
      [15, 13, 90, 25],
      [30, 5, 50, 30],
      [47, 0, 30, 30],
    ])
      rect(c, "#f3f3d9", x, y, w, h);
    rect(c, "#e0e9cf", 12, 38, 101, 6);
    rect(c, "#e0e9cf", 36, 44, 44, 3);
  });
  make("pickaxe", 32, 32, (c) => {
    for (let i = 0; i < 9; i++) rect(c, "#8b633f", 6 + i * 2, 25 - i * 2, 4, 4);
    rect(c, "#d5af70", 8, 24, 2, 4);
    rect(c, "#425b58", 9, 5, 17, 7);
    rect(c, "#bfd1bd", 10, 4, 14, 4);
    rect(c, "#f3efd2", 12, 4, 11, 2);
    rect(c, "#78988c", 24, 8, 5, 7);
    rect(c, "#425b58", 27, 12, 3, 5);
  });
  make("shoes", 32, 32, (c) => {
    rect(c, "#526747", 5, 8, 9, 13);
    rect(c, "#b8d77e", 5, 8, 7, 11);
    rect(c, "#e2d6a5", 3, 20, 14, 5);
    rect(c, "#405747", 3, 25, 14, 3);
    rect(c, "#74964c", 17, 13, 8, 10);
    rect(c, "#d6d797", 18, 13, 5, 7);
    rect(c, "#ece2b4", 17, 23, 13, 4);
    rect(c, "#405747", 17, 27, 13, 3);
    rect(c, "#eff2d3", 5, 14, 8, 2);
    rect(c, "#eff2d3", 18, 18, 7, 2);
  });
  make("boots", 32, 32, (c) => {
    rect(c, "#7e5c3c", 5, 5, 10, 17);
    rect(c, "#d8ad5b", 6, 5, 7, 14);
    rect(c, "#f1d285", 5, 5, 10, 3);
    rect(c, "#a48048", 4, 19, 16, 5);
    rect(c, "#c2d3b0", 5, 25, 13, 2);
    rect(c, "#c2d3b0", 7, 28, 10, 2);
    rect(c, "#697f66", 22, 13, 7, 12);
    rect(c, "#d5bd79", 23, 12, 7, 9);
    rect(c, "#c2d3b0", 22, 27, 8, 2);
  });
  make("magnet", 32, 32, (c) => {
    rect(c, "#e0b666", 7, 3, 18, 3);
    rect(c, "#b58a49", 7, 6, 3, 6);
    rect(c, "#b58a49", 22, 6, 3, 6);
    rect(c, "#446e61", 10, 11, 12, 16);
    rect(c, "#85baa0", 8, 14, 16, 10);
    rect(c, "#b7e1bc", 12, 12, 8, 13);
    rect(c, "#e7f2cc", 13, 13, 3, 7);
    rect(c, "#d7af5c", 13, 27, 6, 3);
  });
  make("pixel", 2, 2, (c) => rect(c, "#fff3cb", 0, 0, 2, 2));
}
