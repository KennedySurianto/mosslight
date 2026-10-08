import * as Phaser from "phaser";
import { createTextures } from "../art/Textures";
import { onlineConfigured } from "../../online/OnlineClient";
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }
  create() {
    createTextures(this);
    // Online builds wait for authentication or a confirmed capacity fallback.
    if (!onlineConfigured) this.scene.start("Game");
  }
}
