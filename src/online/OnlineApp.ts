import type * as Phaser from "phaser";
import type { GameScene } from "../game/scenes/GameScene";
import { OnlineClient, type OnlineSnapshot } from "./OnlineClient";

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export class OnlineApp {
  private client = new OnlineClient();
  private root = document.createElement("div");
  private busy = false;
  private mode: "login" | "register" = "login";
  private activeWorldId?: string;
  private overlayHeartbeat?: number;
  constructor(private game: Phaser.Game) {
    this.root.id = "online-app";
    document.body.append(this.root);
    this.client.onWorldEvent = (event) => this.scene().applyOnlineWorldEvent(event);
    this.client.onPeerMove = (userId, payload) => this.scene().updatePeer(userId, Number(payload.x), Number(payload.y), Number(payload.facing));
    this.client.onPresence = (players) => this.scene().setPeers(players.map((p) => p.userId));
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
    } finally { this.busy = false; }
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
    const own = data.worlds.find((world) => world.ownerId === data.profile.user_id);
    const worlds = data.worlds.map((world) => `<article class="online-row"><div><b>${escape(world.name)}</b><small>by ${escape(world.owner)}${world.id === own?.id ? " · Your world" : ""}</small></div><button data-world="${world.id}">Visit ↗</button></article>`).join("");
    const friends = data.friends.map((friend) => `<article class="online-row"><div><b>${escape(friend.username)}</b><small>${friend.status === "accepted" ? "Friend" : friend.incoming ? "Wants to be friends" : "Request sent"}</small></div><div class="online-row-actions">${friend.incoming && friend.status !== "accepted" ? `<button data-social="accept" data-name="${escape(friend.username)}">Accept</button>` : ""}<button data-social="remove" data-name="${escape(friend.username)}">Remove</button>${friend.status === "accepted" && own ? `<button data-social="builder" data-name="${escape(friend.username)}" data-world-id="${own.id}" title="Let this friend build in your world">Allow building</button>` : ""}</div></article>`).join("");
    this.set(`<div class="online-head"><div><span class="eyebrow">Mosslight · Online</span><h1>Hello, ${escape(data.profile.username)}.</h1></div>${this.activeWorldId ? '<button id="close-worlds" class="online-close" aria-label="Close Worlds" title="Return to your world">×</button>' : ""}</div><p>Choose a world, visit friends, and make the meadow your own.</p><h2>Worlds</h2><div class="online-list">${worlds || "Your first world is growing..."}</div><h2>Friends</h2><form id="friend-request" class="online-inline"><input name="username" placeholder="Friend's username" maxlength="20" required><button>Send request</button></form><div class="online-list">${friends || '<p class="online-muted">No friends yet. Send someone a request above.</p>'}</div><p class="online-error" role="alert"></p><footer class="online-footer"><button id="logout" class="online-text">Log out</button></footer>`);
    this.root.querySelector("#close-worlds")?.addEventListener("click", () => this.closeWorlds());
    this.root.querySelector("#logout")!.addEventListener("click", () => void this.run(async () => {
      await this.client.signOut();
      window.clearInterval(this.overlayHeartbeat);
      this.overlayHeartbeat = undefined;
      this.activeWorldId = undefined;
      this.game.scene.stop("Game");
      this.mode = "login";
      this.auth();
    }));
    this.root.querySelectorAll<HTMLButtonElement>("[data-world]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.world === this.activeWorldId) this.closeWorlds();
      else void this.run(async () => { await this.enter(button.dataset.world!); });
    }));
    this.root.querySelector("#friend-request")!.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = String(new FormData(event.target as HTMLFormElement).get("username"));
      void this.run(async () => { this.lobby(await this.client.social("request", name)); });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-social]").forEach((button) => button.addEventListener("click", () => void this.run(async () => {
      this.lobby(await this.client.social(button.dataset.social as "accept" | "remove" | "builder", button.dataset.name!, button.dataset.worldId));
    })));
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
    }, 120_000);
  }
  private closeWorlds() {
    window.clearInterval(this.overlayHeartbeat);
    this.overlayHeartbeat = undefined;
    this.root.hidden = true;
    this.scene().setOnlineOverlay(false);
  }
}
