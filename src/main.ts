import * as Phaser from "phaser";
import { BootScene } from "./game/scenes/BootScene";
import { GameScene } from "./game/scenes/GameScene";
import "./style.css";
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#b3cdb5",
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [BootScene, GameScene],
  input: { mouse: { preventDefaultWheel: false } },
  audio: { noAudio: true },
  render: { powerPreference: "high-performance" },
});
// Development-only access for reproducible gameplay regression tests; removed by Vite in production.
if (import.meta.env.DEV) Object.assign(window, { __mosslight: game });
