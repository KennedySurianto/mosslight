import type * as Phaser from "phaser";
import { PlayerDirectory } from "./PlayerDirectory";
import type { GameScene } from "../game/scenes/GameScene";
import { OnlineClient, type OnlineSnapshot } from "./OnlineClient";

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export class OnlineApp {
  private client = new OnlineClient();
  private root = document.createElement("div");
  private directory?: PlayerDirectory;
  private busy = false;
  private mode: "login" | "register" = "login";
  private activeWorldId?: string;
  private overlayHeartbeat?: number;
  constructor(private game: Phaser.Game) {
    this.root.id = "online-app";
    document.body.append(this.root);
    this.client.onWorldEvent = (event) => this.scene().applyOnlineWorldEvent(event);
    this.client.onPeerMove = (userId, payload) => this.scene().updatePeer(userId, Number(payload.x), Number(payload.y), Number(payload.facing));
    this.client.onPresence = (players) => this.scene()?.setPeers(players);
    this.client.onChat = (message) => this.scene()?.showChat(message);
    void this.start();
  }
  private scene() { return this.game.scene.getScene("Game") as GameScene; }
  private async start() {
    try {
      if (await this.client.currentUser()) { await this.client.refresh(); this.lobby(); }
      else this.auth();
    } catch { this.auth(); }
  }
  private set(html: string) {
    this.root.innerHTML = `<div class="online-shade"><section class="online-card" role="dialog" aria-modal="true">${html}</section></div>`;
    this.root.hidden = false;
    // Auth can appear before Phaser has booted the Game scene.
    (this.game.scene.getScene("Game") as GameScene | null)?.setOnlineOverlay(true);
  }
  private error(message: string) {
    const target = this.root.querySelector<HTMLElement>(".online-error");
    if (target) target.textContent = message;
  }
  private async run(action: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => button.disabled = true);
    try { await action(); } catch (error) {
      this.error(error instanceof Error ? error.message : "Something went wrong");
      this.root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => button.disabled = false);
    } finally { this.busy = false; this.root.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.disabled = false); }
  }
  private auth() {
    const register = this.mode === "register";
    this.set(`<span class="eyebrow">Mosslight · Online</span><h1>${register ? "Plant a new beginning" : "Welcome back"}</h1><p>Explore one little world together. Your progress follows your account.</p><form id="online-auth"><label>Username<input name="username" autocomplete="username" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" required></label><label>Password<input name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" minlength="10" required></label>${register ? '<label>Confirm password<input name="confirm" type="password" autocomplete="new-password" required></label>' : ""}<button class="primary">${register ? "Create account" : "Enter the meadow"}</button></form><button class="online-text" id="switch-auth">${register ? "Already have an account? Log in" : "New here? Register"}</button><p class="online-error" role="alert"></p><small>Use a unique password. Username-only accounts cannot recover a lost password.</small>`);
    this.root.querySelector("#switch-auth")!.addEventListener("click", () => { this.mode = register ? "login" : "register"; this.auth(); });
    this.root.querySelector("#online-auth")!.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.target as HTMLFormElement);
      void this.run(async () => {
        await this.client.auth(this.mode, String(form.get("username")), String(form.get("password")), String(form.get("confirm") || ""));
        this.lobby();
      });
    });
  }
  private lobby(data = this.client.snapshot!) {
    this.directory?.destroy();
    const own = data.worlds.find(world => world.ownerId === data.profile.user_id);
    this.set(`<div class="online-head"><div><span class="eyebrow">Mosslight · Online</span><h1>Hello, ${escape(data.profile.username)}.</h1></div>${this.activeWorldId ? '<button id="close-worlds" class="online-close" aria-label="Close Worlds" title="Return to your world">×</button>' : ''}</div><p>One world of your own. A whole meadow of friends.</p>${own ? `<details class="player-card" open><summary><b>Your world</b><span aria-hidden="true">⌄</span></summary><div class="online-row"><b>${escape(own.name)}</b><button id="visit-own">Visit ↗</button></div></details>` : ''}<section id="player-directory"></section><p class="online-error" role="alert"></p><footer class="online-footer"><button id="logout" class="online-text">Log out</button></footer>`);
    const visit = (id: string) => {
      if (id === this.activeWorldId) this.closeWorlds();
      else void this.run(async () => { await this.enter(id); });
    };
    this.root.querySelector('#visit-own')?.addEventListener('click', () => own && visit(own.id));
    this.root.querySelector('#close-worlds')?.addEventListener('click', () => this.closeWorlds());
    this.root.querySelector('#logout')!.addEventListener('click', () => void this.run(async () => {
      await this.client.signOut(); this.directory?.destroy();
      window.clearInterval(this.overlayHeartbeat); this.overlayHeartbeat = undefined;
      this.activeWorldId = undefined; this.game.scene.stop('Game'); this.mode='login'; this.auth();
    }));
    this.directory = new PlayerDirectory(this.root.querySelector('#player-directory')!,this.client,visit);
  }
  private async enter(worldId: string) {
    const snapshot: OnlineSnapshot = await this.client.join(worldId);
    this.activeWorldId = worldId;
    const scene = this.scene();
    scene.online = this.client;
    scene.onLeaveOnline = () => this.openWorlds();
    this.game.scene.stop("Game");
    this.game.scene.start("Game");
    this.client.snapshot = snapshot;
    this.closeWorlds();
  }
  private openWorlds() {
    this.lobby();
    window.clearInterval(this.overlayHeartbeat);
    this.overlayHeartbeat = window.setInterval(() => {
      const player = this.scene().player;
      if (player && !this.root.hidden) void this.client.position(player.x, player.y, player.facing).catch(() => {});
    }, 10_000);
  }
  private closeWorlds() {
    this.directory?.destroy();
    window.clearInterval(this.overlayHeartbeat);
    this.overlayHeartbeat = undefined;
    this.root.hidden = true;
    this.scene().setOnlineOverlay(false);
  }
}
