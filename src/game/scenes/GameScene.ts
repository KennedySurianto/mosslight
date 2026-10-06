import * as Phaser from "phaser";
import { BLOCKS, GAME, HARVEST, ITEMS } from "../data/config";
import { Player } from "../entities/Player";
import { WorldSystem, FOLIAGE_NAMES } from "../systems/WorldSystem";
import { ShopSystem } from "../systems/ShopSystem";
import {
  initialGuide,
  guideSteps,
  type GuideProgress,
} from "../systems/GuideSystem";
import { touchingSign } from "../systems/TutorialSystem";
import { InventorySystem } from "../systems/InventorySystem";
import { SeedSystem, type TreeData } from "../systems/SeedSystem";
import type { UpgradeId } from "../data/shop";
import { SaveSystem, validateSave, type SaveData } from "../systems/SaveSystem";
import { AudioSystem } from "../systems/AudioSystem";
import { DropSystem } from "../systems/DropSystem";
import { BlockSystem } from "../systems/BlockSystem";
import { WorldRenderer } from "../art/WorldRenderer";
import { GameUI } from "../ui/GameUI";
import type { OnlineClient, OnlineSnapshot } from "../../online/OnlineClient";
export class GameScene extends Phaser.Scene {
  online?: OnlineClient;
  onLeaveOnline?: () => void;
  private onlineWorldRevision = -1;
  private onlinePositionAt = 0;
  private onlinePositionPending = false;
  private onlineActionPending = false;
  private peers = new Map<string, Phaser.GameObjects.Sprite>();
  private listeners?: AbortController;
  world!: WorldSystem;
  inventory!: InventorySystem;
  seeds!: SeedSystem;
  player!: Player;
  drops!: DropSystem;
  blocks!: BlockSystem;
  worldRenderer!: WorldRenderer;
  ui!: GameUI;
  shop!: ShopSystem;
  save = new SaveSystem();
  audio = new AudioSystem();
  gems = 0;
  tutorial: number[] = [];
  stats = { broken: 0, placed: 0, planted: 0, harvested: 0 };
  guide!: GuideProgress;
  private guideFinished = false;
  private keys!: Record<"A" | "D" | "W" | "SPACE", Phaser.Input.Keyboard.Key>;
  private follow!: Phaser.GameObjects.Zone;
  private nextHit = 0;
  private nextStatus = 0;
  private autosave = 0;
  private replacingSave = false;
  private paused = false;
  private held = false;
  private mouseX = 0;
  private mouseY = 0;
  private lastHint = "";
  constructor() {
    super("Game");
  }
  create() {
    this.listeners = new AbortController();
    this.peers.clear();
    this.onlineWorldRevision = -1;
    this.onlinePositionAt = 0;
    this.onlinePositionPending = false;
    this.onlineActionPending = false;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.listeners?.abort();
      this.ui?.destroy();
      this.scale.off("resize", this.resize, this);
    });
    const saved = this.online?.snapshot ? this.onlineSave(this.online.snapshot) : this.save.load();
    this.world = new WorldSystem(
      saved?.seed ?? Math.floor(Math.random() * 2147483647),
      saved?.modifications,
      saved?.clearedFoliage,
    );
    this.inventory = new InventorySystem(saved?.inventory);
    this.inventory.selected = saved?.player.selected ?? 0;
    this.seeds = new SeedSystem(
      saved?.trees ??
        [14, 49, 56, 67, 79, 91, 109, 118].map((x, i) => ({
          x,
          y: this.world.surface(x) - 1,
          type: i % 3 === 2 ? "stoneSeed" : "seed",
          plantedAt: Date.now() - 100000,
          growthDuration: i % 3 === 2 ? 75000 : 45000,
        })),
    );
    this.gems = saved?.player.gems ?? 0;
    this.shop = new ShopSystem(saved?.upgrades ?? []);
    for (const tree of this.seeds.trees)
      this.world.clearFoliage(tree.x, tree.y);
    this.tutorial = saved?.tutorial ?? [];
    this.stats = saved?.stats ?? this.stats;
    this.guide = initialGuide(saved?.guide, this.stats);
    this.guideFinished = guideSteps(this.guide, this.stats).every(
      (step) => step.done,
    );
    this.audio.enabled = saved?.settings.sound ?? true;
    this.worldRenderer = new WorldRenderer(this, this.world, this.seeds);
    this.player = new Player(
      this,
      saved?.player.x ?? GAME.spawnX * 32 + 16,
      saved?.player.y ?? GAME.surface * 32,
    );
    this.player.facing = saved?.player.facing ?? 1;
    if (this.player.blocked(this.world, this.player.x, this.player.y))
      this.player.respawn();
    this.player.onJump = () => {
      this.audio.play("jump");
      this.markGuide("jumped");
    };
    this.player.onLand = () =>
      this.worldRenderer.burst(this.player.x, this.player.y, 0xc8bd91, 5);
    this.blocks = new BlockSystem(
      this.world,
      this.player,
      this.seeds,
      this.inventory,
    );
    this.applyUpgrades();
    this.drops = new DropSystem(this, this.world, (id, count) => {
      const left = id === "gem" ? 0 : this.inventory.add(id, count);
      const got = count - left;
      if (got) {
        this.markGuide("collected");
        if (id === "gem") this.gems += got;
        this.audio.play(id === "gem" ? "gem" : "pickup");
        this.worldRenderer.float(
          this.player.x,
          this.player.y - 44,
          `+${got} ${id === "gem" ? "gems" : ITEMS[id].name}`,
          id === "gem" ? "#bcecc4" : "#fff2cd",
        );
        this.changed();
      }
      return left;
    });
    saved?.drops.forEach((d) => this.drops.spawn(d.x, d.y, d.id, d.count));
    this.ui = new GameUI(
      this.inventory,
      {
        save: () => this.changed(),
        backpackOpened: () => this.markGuide("backpack"),
        buy: (id) => this.purchase(id),
        leaveWorld: this.online ? () => this.onLeaveOnline?.() : undefined,
        shopState: () => ({ gems: this.gems, owned: this.shop.owned }),
        feedback: () => this.audio.play("ui"),
        export: () => this.online ? this.ui.toast("Online worlds are saved to your account.") : this.exportSave(),
        import: (file) => this.online ? this.ui.toast("Local saves cannot overwrite online worlds.") : void this.importSave(file),
        reset: () => this.online ? this.ui.toast("Online worlds cannot be reset here.") : this.resetWorld(),
        home: () => {
          this.player.respawn();
          this.changed();
          this.ui.toast("A little closer to home.");
        },
        sound: (enabled) => {
          this.audio.enabled = enabled;
          if (this.online) void this.online.profile({ sound: enabled }).catch((e) => this.ui.toast(e.message));
          this.changed();
        },
        moveInventory: this.online ? (from, to) => {
          void this.online!.profile({ from, to }).then((snapshot) => this.applyOnlineSnapshot(snapshot)).catch((e) => this.ui.toast(e.message));
        } : undefined,
        pause: (paused) => {
          this.paused = paused;
          this.held = false;
          this.keys?.A.reset();
          this.keys?.D.reset();
          this.keys?.W.reset();
          if (paused) this.persist();
        },
      },
      this.audio.enabled,
    );
    this.inventory.onChange = () => {
      this.ui.render();
      this.changed();
    };
    this.keys = this.input.keyboard!.addKeys("A,D,W,SPACE") as typeof this.keys;
    this.follow = this.add.zone(this.player.x, this.player.y - 85, 1, 1);
    const camera = this.cameras.main;
    camera.setBounds(0, 0, GAME.width * 32, GAME.height * 32);
    this.resize();
    camera.startFollow(this.follow, true, 0.09, 0.09);
    camera.centerOn(this.player.x, this.player.y - 85);
    camera.roundPixels = true;
    this.scale.on("resize", this.resize, this);
    const canvas = this.game.canvas;
    canvas.addEventListener("contextmenu", (e) => e.preventDefault(), { signal: this.listeners.signal });
    canvas.addEventListener("pointerdown", (e) => {
      if (this.paused) return;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (e.button === 0) {
        this.held = true;
        this.interact(false, this.time.now);
      } else if (e.button === 2) this.interact(true, this.time.now);
    }, { signal: this.listeners.signal });
    window.addEventListener("pointermove", (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    }, { signal: this.listeners.signal });
    window.addEventListener("pointerup", () => (this.held = false), { signal: this.listeners.signal });
    window.addEventListener("blur", () => {
      this.held = false;
      this.keys.A.reset();
      this.keys.D.reset();
      this.keys.W.reset();
      this.persist();
    }, { signal: this.listeners.signal });
    window.addEventListener("beforeunload", () => this.persist(), { signal: this.listeners.signal });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.held = false;
        this.persist();
      }
    }, { signal: this.listeners.signal });
    if (this.save.error) this.ui.toast(this.save.error);
    else if (!this.online) this.persist();
    if (this.online?.snapshot) this.onlineWorldRevision = this.online.snapshot.world.revision;
  }
  private resize() {
    this.cameras.main.setZoom(this.scale.width >= 1900 ? 3 : 2);
  }
  private cursor() {
    const bounds = this.game.canvas.getBoundingClientRect();
    const p = this.cameras.main.getWorldPoint(
      ((this.mouseX - bounds.left) * this.scale.width) / bounds.width,
      ((this.mouseY - bounds.top) * this.scale.height) / bounds.height,
    );
    return { x: Math.floor(p.x / 32), y: Math.floor(p.y / 32) };
  }
  private interact(place: boolean, now: number) {
    if (this.paused || now < this.nextHit) return;
    const { x, y } = this.cursor();
    if (!this.blocks.reachable(x, y)) {
      this.hint("A little closer — reach is about 4 tiles.");
      return;
    }
    this.nextHit = now + GAME.hitDelay;
    this.player.actionUntil = now + 160;
    this.player.facing = x * 32 + 16 >= this.player.x ? 1 : -1;
    if (this.online) {
      if (this.onlineActionPending) return;
      this.onlineActionPending = true;
      void this.online.position(this.player.x, this.player.y, this.player.facing)
        .then(() => this.online!.action(place ? "place" : "hit", x, y, this.inventory.selected))
        .then(({ data, message }) => { this.applyOnlineSnapshot(data); if (message !== "Keep digging") this.ui.toast(message); })
        .catch((error) => this.ui.toast(error instanceof Error ? error.message : "Action failed"))
        .finally(() => { this.onlineActionPending = false; });
      return;
    }
    if (place) {
      const reason = this.blocks.placement(x, y);
      if (reason) {
        this.hint(reason);
        return;
      }
      const isSeed =
        !!ITEMS[this.inventory.slots[this.inventory.selected]!.id].growth;
      if (this.blocks.place(x, y)) {
        this.stats[isSeed ? "planted" : "placed"]++;
        this.audio.play(isSeed ? "plant" : "hit");
        this.worldRenderer.burst(
          x * 32 + 16,
          y * 32 + 24,
          isSeed ? 0x9bbb60 : 0xddc08b,
          6,
        );
        this.changed();
      }
      return;
    }
    const foliage = this.world.clearFoliage(x, y);
    if (foliage) {
      this.audio.play("break");
      this.worldRenderer.burst(
        x * 32 + 16,
        y * 32 + 22,
        foliage === "mushroom" ? 0xd38e65 : 0x9bbb60,
        10,
      );
      this.worldRenderer.float(
        x * 32 + 16,
        y * 32,
        `${FOLIAGE_NAMES[foliage]} cleared`,
      );
      this.stats.broken++;
      this.changed();
      return;
    }
    const tree = this.seeds.at(x, y);
    if (tree) {
      if (this.seeds.stage(tree) < 3) {
        this.hint(
          `A little patience. Ready in ${this.seeds.remaining(tree)}s.`,
        );
        return;
      }
      this.seeds.trees.splice(this.seeds.trees.indexOf(tree), 1);
      const resource = ITEMS[tree.type].resource!;
      for (let i = 0; i < HARVEST.resources; i++)
        this.drops.spawn(tree.x * 32 + 16, (tree.y + 1) * 32 - 24, resource);
      this.drops.spawn(
        tree.x * 32 + 16,
        tree.y * 32,
        tree.type,
        1 + (Math.random() < HARVEST.bonusSeedChance ? 1 : 0),
      );
      this.drops.spawn(
        tree.x * 32 + 16,
        tree.y * 32,
        "gem",
        HARVEST.gems[0] +
          Math.floor(Math.random() * (HARVEST.gems[1] - HARVEST.gems[0] + 1)),
      );
      this.worldRenderer.burst(
        tree.x * 32 + 16,
        tree.y * 32 - 25,
        0x9bc76d,
        24,
      );
      this.audio.play("harvest");
      this.stats.harvested++;
      this.changed();
      return;
    }
    const result = this.blocks.hit(x, y);
    if (!result) {
      if (this.world.get(x, y) === 7 || this.world.protected(x, y))
        this.hint("A little piece of the world that stays.");
      return;
    }
    const { def, broken } = result;
    if (!broken) this.worldRenderer.flash(x, y);
    this.worldRenderer.burst(
      x * 32 + 16,
      y * 32 + 12,
      def.color,
      broken ? 14 : 5,
    );
    this.audio.play(broken ? "break" : "hit");
    if (broken) {
      this.markGuide("mined");
      this.stats.broken++;
      if (def.item) this.drops.spawn(x * 32 + 16, y * 32 + 12, def.item);
      if (def.seed && Math.random() < def.seedChance)
        this.drops.spawn(x * 32 + 16, y * 32 + 8, def.seed);
      if (Math.random() < def.gemChance)
        this.drops.spawn(
          x * 32 + 16,
          y * 32 + 8,
          "gem",
          def.gems[0] +
            Math.floor(Math.random() * (def.gems[1] - def.gems[0] + 1)),
        );
      this.cameras.main.shake(70, 0.0014);
      this.changed();
    }
  }
  private hint(text: string) {
    if (this.lastHint === text) return;
    this.lastHint = text;
    this.ui.toast(text);
    this.time.delayedCall(1600, () => (this.lastHint = ""));
  }
  private markGuide(key: keyof GuideProgress) {
    if (!this.guide[key]) {
      this.guide[key] = true;
      if (this.online && ["moved", "jumped", "backpack"].includes(key))
        void this.online.profile({ guide: key }).catch(() => {});
      this.changed();
    }
  }
  private applyUpgrades() {
    this.blocks.power = this.shop.owned.includes("pickaxe") ? 2 : 1;
    this.player.speedMultiplier = this.shop.owned.includes("shoes") ? 1.3 : 1;
    this.player.jumpMultiplier = this.shop.owned.includes("boots") ? 1.18 : 1;
    this.player.pickupRange = this.shop.owned.includes("magnet") ? 112 : 70;
  }
  private purchase(id: string) {
    if (this.online) {
      void this.online.purchase(id).then(({ data, message }) => {
        this.applyOnlineSnapshot(data);
        this.ui.shopPanel.refresh(this.gems, this.shop.owned);
        this.ui.shopPanel.message(message);
      }).catch((error) => this.ui.shopPanel.message(error instanceof Error ? error.message : "Purchase failed"));
      return;
    }
    const result = this.shop.purchase(id, this.gems, this.inventory);
    if (result.ok) {
      this.gems = result.gems;
      this.applyUpgrades();
      this.audio.play("gem");
      this.persist();
    }
    this.ui.shopPanel.refresh(this.gems, this.shop.owned);
    this.ui.shopPanel.message(result.message);
    this.ui.root.querySelector("#gem-count")!.textContent =
      this.gems.toLocaleString();
  }
  update(now: number, delta: number) {
    if (!this.player) return;
    const dt = Math.min(delta / 1000, 0.04);
    if (!this.paused && !document.hidden) {
      const direction =
        (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0);
      const jump =
        Phaser.Input.Keyboard.JustDown(this.keys.W) ||
        Phaser.Input.Keyboard.JustDown(this.keys.SPACE);
      const oldX = this.player.x;
      this.player.update(dt, this.world, direction, jump, now);
      if (this.online && now - this.onlinePositionAt > 650) {
        this.onlinePositionAt = now;
        if (!this.onlinePositionPending) {
          this.onlinePositionPending = true;
          void this.online.position(this.player.x, this.player.y, this.player.facing)
            .catch(() => {})
            .finally(() => { this.onlinePositionPending = false; });
        }
      }
      if (Math.abs(this.player.x - oldX) > 1) this.markGuide("moved");
      this.drops.update(dt, this.player);
      if (
        this.player.y > GAME.height * 32 - 32 ||
        this.player.y < 0 ||
        !Number.isFinite(this.player.x)
      )
        this.player.respawn();
      if (
        this.held &&
        document.elementFromPoint(this.mouseX, this.mouseY) === this.game.canvas
      )
        this.interact(false, now);
    }
    this.follow.setPosition(this.player.x, this.player.y - 85);
    this.worldRenderer.update(now);
    this.drawTarget();
    // Evaluate every frame so the popup disappears on the first frame of exit.
    const sign = touchingSign(this.player);
    this.ui.tutorial(sign);
    if (sign >= 0 && !this.tutorial.includes(sign)) {
      this.tutorial.push(sign);
      this.changed();
    }
    if (now > this.nextStatus) {
      this.nextStatus = now + 150;
      if (
        !this.guideFinished &&
        guideSteps(this.guide, this.stats).every((step) => step.done)
      ) {
        this.guideFinished = true;
        this.ui.celebrateGuide();
        this.audio.celebrate();
        this.persist();
      }
      this.ui.status(
        this.gems,
        Math.floor(this.player.x / 32),
        Math.floor(this.player.y / 32),
        this.save.error,
        this.stats,
        this.guide,
        !!this.online,
      );
    }
    if (now > this.autosave) {
      this.autosave = now + 5000;
      this.persist();
    }
  }
  private drawTarget() {
    this.worldRenderer.ghost.setVisible(false);
    const g = this.worldRenderer.target,
      c = this.worldRenderer.cracks;
    g.clear();
    c.clear();
    for (const [key, hits] of this.blocks.damage) {
      const [x, y] = key.split(",").map(Number);
      c.lineStyle(1, 0x423c36, 0.8);
      c.beginPath();
      c.moveTo(x * 32 + 14, y * 32 + 2);
      c.lineTo(x * 32 + 18, y * 32 + 12);
      c.lineTo(x * 32 + 10, y * 32 + 19);
      c.lineTo(x * 32 + 14, y * 32 + 29);
      if (hits > 1) {
        c.moveTo(x * 32 + 18, y * 32 + 12);
        c.lineTo(x * 32 + 28, y * 32 + 17);
      }
      c.strokePath();
    }
    if (
      this.paused ||
      document.elementFromPoint(this.mouseX, this.mouseY) !== this.game.canvas
    ) {
      this.ui.target("", 0, 0);
      return;
    }
    const { x, y } = this.cursor();
    const reachable = this.blocks.reachable(x, y),
      id = this.world.get(x, y),
      tree = this.seeds.at(x, y),
      foliage = this.world.foliageAt(x, y),
      valid = this.blocks.placement(x, y) === null;
    g.lineStyle(
      1,
      reachable && (id || tree || foliage)
        ? 0xffedb6
        : valid
          ? 0xc6e68d
          : 0xd48274,
      0.9,
    );
    g.strokeRect(x * 32 + 1, y * 32 + 1, 30, 30);
    if (!id) {
      const selected = this.inventory.slots[this.inventory.selected];
      if (selected && reachable)
        this.worldRenderer.ghost
          .setTexture(
            ITEMS[selected.id].growth
              ? selected.id
              : `tile-${ITEMS[selected.id].tile}`,
          )
          .setPosition(x * 32, y * 32)
          .setVisible(true);
      g.fillStyle(valid ? 0xb8dd83 : 0xcf7c70, 0.16);
      g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
    }
    const text = foliage
      ? `${FOLIAGE_NAMES[foliage]} · left click to clear`
      : tree
        ? this.seeds.stage(tree) === 3
          ? "Ready to harvest"
          : `Growing · ${this.seeds.remaining(tree)}s`
        : id
          ? `${BLOCKS[id]?.name ?? ""}${reachable ? "" : " · out of reach"}`
          : valid
            ? "Right click to plant / build"
            : "";
    this.ui.target(text, this.mouseX, this.mouseY);
  }
  private onlineSave(data: OnlineSnapshot): SaveData {
    const profile = data.profile.state;
    const world = data.world.state;
    const position = data.session?.state;
    return {
      version: 1, seed: data.world.seed,
      player: { x: position?.x ?? GAME.spawnX * 32 + 16, y: position?.y ?? GAME.surface * 32,
        facing: position?.facing ?? 1, gems: profile.gems, selected: profile.selected },
      inventory: profile.inventory, modifications: world.modifications,
      clearedFoliage: world.clearedFoliage, trees: world.trees, drops: [],
      settings: { sound: profile.sound }, tutorial: profile.tutorial,
      stats: profile.stats, upgrades: profile.upgrades as UpgradeId[],
      guide: profile.guide as unknown as GuideProgress,
    };
  }
  applyOnlineSnapshot(data: OnlineSnapshot) {
    if (!this.world || data.world.id !== this.online?.snapshot?.world.id) return;
    if (data.world.revision > this.onlineWorldRevision) {
      const rebuilt = new WorldSystem(data.world.seed, data.world.state.modifications, data.world.state.clearedFoliage);
      this.world.tiles.set(rebuilt.tiles);
      this.world.modifications = rebuilt.modifications;
      this.world.clearedFoliage = rebuilt.clearedFoliage;
      this.world.foliage = rebuilt.foliage;
      this.world.revision++;
      this.seeds.trees = data.world.state.trees;
      this.onlineWorldRevision = data.world.revision;
    }
    this.inventory.slots = structuredClone(data.profile.state.inventory);
    this.inventory.selected = data.profile.state.selected;
    this.gems = data.profile.state.gems;
    this.shop.owned = data.profile.state.upgrades as UpgradeId[];
    this.stats = data.profile.state.stats;
    this.guide = data.profile.state.guide as unknown as GuideProgress;
    this.tutorial = data.profile.state.tutorial;
    this.applyUpgrades();
    this.ui.render();
    this.ui.status(this.gems, Math.floor(this.player.x / 32), Math.floor(this.player.y / 32), "", this.stats, this.guide, true);
  }
  applyOnlineWorldEvent(event: Record<string, unknown>) {
    if (!this.world || event.actor === this.online?.snapshot?.profile.user_id) return;
    const x = Number(event.x), y = Number(event.y);
    if (event.kind === "tile" && Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(event.id)) {
      this.world.set(x, y, Number(event.id));
    } else if (event.kind === "foliage" && Number.isInteger(x) && Number.isInteger(y)) {
      this.world.clearFoliage(x, y);
    } else if (event.kind === "plant" && event.tree && typeof event.tree === "object") {
      this.seeds.trees.push(event.tree as TreeData);
      this.world.revision++;
    } else if (event.kind === "harvest" && Number.isInteger(x) && Number.isInteger(y)) {
      this.seeds.trees = this.seeds.trees.filter((t) => t.x !== x || t.y !== y);
      this.world.revision++;
    }
  }
  updatePeer(userId: string, x: number, y: number, facing: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    let sprite = this.peers.get(userId);
    if (!sprite) {
      sprite = this.add.sprite(x, y, "player-idle").setOrigin(.5, 1).setScale(.72).setTint(0xb5d7e2).setDepth(9);
      this.peers.set(userId, sprite);
    }
    sprite.setFlipX(facing < 0);
    this.tweens.add({ targets: sprite, x, y, duration: 450 });
  }
  setPeers(ids: string[]) {
    for (const [id, sprite] of this.peers) if (!ids.includes(id)) { sprite.destroy(); this.peers.delete(id); }
  }
  snapshot(): SaveData {
    return {
      version: 1,
      seed: this.world.seed,
      player: {
        x: this.player.x,
        y: this.player.y,
        facing: this.player.facing,
        gems: this.gems,
        selected: this.inventory.selected,
      },
      inventory: this.inventory.slots,
      modifications: this.world.modifications,
      clearedFoliage: [...this.world.clearedFoliage],
      upgrades: [...this.shop.owned],
      guide: { ...this.guide },
      trees: this.seeds.trees,
      drops: this.drops.serialize(),
      settings: { sound: this.audio.enabled },
      tutorial: this.tutorial,
      stats: this.stats,
    };
  }
  private changed() {
    if (this.online) return;
    this.save.schedule(() => this.snapshot());
  }
  private persist() {
    if (this.online) return;
    if (!this.replacingSave && this.world && this.drops)
      this.save.write(this.snapshot());
  }
  private exportSave() {
    const data = JSON.stringify(this.snapshot(), null, 2),
      url = URL.createObjectURL(new Blob([data], { type: "application/json" })),
      a = document.createElement("a");
    a.href = url;
    a.download = `mosslight-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.ui.toast("A little world, safely packed.");
  }
  private async importSave(file: File) {
    try {
      if (file.size > 2_000_000) throw new Error("Save file is too large.");
      const data = validateSave(JSON.parse(await file.text()));
      this.applySave(data);
    } catch (e) {
      this.ui.toast(
        e instanceof Error ? e.message : "Could not read that save.",
      );
    }
  }
  private applySave(data: SaveData) {
    if (!this.save.write(data)) {
      this.ui.toast(this.save.error);
      return;
    } // Disable unload snapshot before reloading a replaced save.
    this.replacingSave = true;
    location.reload();
  }
  private resetWorld() {
    const seed = Math.floor(Math.random() * 2147483647);
    const inventory = new InventorySystem();
    const world = new WorldSystem(seed);
    this.applySave({
      version: 1,
      seed,
      player: {
        x: GAME.spawnX * 32 + 16,
        y: GAME.surface * 32,
        facing: 1,
        gems: 0,
        selected: 0,
      },
      inventory: inventory.slots,
      modifications: {},
      trees: [14, 49, 56, 67, 79, 91, 109, 118].map((x, i) => ({
        x,
        y: world.surface(x) - 1,
        type: i % 3 === 2 ? "stoneSeed" : "seed",
        plantedAt: Date.now() - 100000,
        growthDuration: i % 3 === 2 ? 75000 : 45000,
      })),
      drops: [],
      settings: { sound: this.audio.enabled },
      tutorial: [],
      stats: { broken: 0, placed: 0, planted: 0, harvested: 0 },
    });
  }
}
