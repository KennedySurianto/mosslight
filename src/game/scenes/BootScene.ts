import * as Phaser from "phaser";
import { createTextures } from "../art/Textures";
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }
  create() {
    createTextures(this);
    this.scene.start("Game");
  }
}
