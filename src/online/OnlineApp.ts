import type * as Phaser from "phaser";
import { PlayerDirectory } from "./PlayerDirectory";
import type { GameScene } from "../game/scenes/GameScene";
import { OnlineClient, type OnlineSnapshot } from "./OnlineClient";
import { WelcomeLandscape } from "./WelcomeLandscape";

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export class OnlineApp {
  private client = new OnlineClient();
  private root = document.createElement("div");
  private panel = document.createElement("div");
  private directory?: PlayerDirectory;
  private busy = false;
  private mode: "login" | "register" = "login";
  private activeWorldId?: string;
  private overlayHeartbeat?: number;
  private fallingBack = false;
  constructor(private game: Phaser.Game) {
    this.root.id = "online-app";
    new WelcomeLandscape(this.root);
    this.root.append(this.panel);
    document.body.append(this.root);
    window.addEventListener("mosslight:database-full", () => void this.enterSolo());
    this.client.onWorldEvent = (event) => this.scene().applyOnlineWorldEvent(event);
    this.client.onPeerMove = (userId, payload) => this.scene().updatePeer(userId, Number(payload.x), Number(payload.y), Number(payload.facing));
    this.client.onPresence = (players) => this.scene()?.setPeers(players);
    this.client.onChat = (message) => this.scene()?.showChat(message);
    void this.start();
  }
  private scene() { return this.game.scene.getScene("Game") as GameScene; }
  private async start() {
    this.set('<span class="eyebrow">Mosslight · Online</span><h1>Opening the meadow…</h1><p>Checking your world.</p>');
    try {
      if ((await this.client.status()).databaseFull) { await this.enterSolo(); return; }
      if (await this.client.currentUser()) { await this.client.refresh(); this.lobby(); }
      else this.auth();
    } catch (error) {
      if (!this.fallingBack) this.unavailable(error instanceof Error ? error.message : "Online service unavailable");
    }
  }
  private unavailable(message: string) {
    this.set(`<span class="eyebrow">Mosslight · Online</span><h1>Could not reach your world.</h1><p>Your online progress is safe. Please try again.</p><p class="online-error" role="alert">${escape(message)}</p><button id="retry-online" class="primary">Try again ↗</button>`);
    this.root.querySelector("#retry-online")!.addEventListener("click", () => void this.start());
  }
  private async enterSolo() {
    if (this.fallingBack) return;
    this.fallingBack = true;
    this.directory?.destroy();
    window.clearInterval(this.overlayHeartbeat);
    this.overlayHeartbeat = undefined;
    await this.client.leave().catch(() => {});
    this.game.scene.stop("Game");
    const scene = this.scene();
    scene.online = undefined;
    scene.onLeaveOnline = undefined;
    scene.onAccountAction = undefined;
    scene.soloCapacity = true;
    this.activeWorldId = undefined;
    this.root.hidden = true;
    this.game.scene.start("Game");
  }
  private set(html: string) {
    this.panel.innerHTML = `<div class="online-shade"><section class="online-card" role="dialog" aria-modal="true">${html}</section></div>`;
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
    this.set(`<div class="online-head"><div><span class="eyebrow">Mosslight · Online</span><h1>Hello, ${escape(data.profile.username)}.</h1></div>${this.activeWorldId ? '<button id="close-worlds" class="online-close" aria-label="Close Worlds" title="Return to your world">×</button>' : ''}</div><p>One world of your own. A whole meadow of friends.</p>${own ? `<article class="player-card own-world"><div class="player-card-head"><span><b>Your world</b><small>Your home in the meadow</small></span><span class="world-card-mark" aria-hidden="true">⌂</span></div><div class="online-row"><b>${escape(own.name)}</b><button id="visit-own">Visit ↗</button></div></article>` : ''}<section id="player-directory"></section><p class="online-error" role="alert"></p><footer class="online-footer"><button id="logout" class="online-text">Log out</button></footer>`);
    const visit = (id: string) => {
      if (id === this.activeWorldId) this.closeWorlds();
      else void this.run(async () => { await this.enter(id); });
    };
    this.root.querySelector('#visit-own')?.addEventListener('click', () => own && visit(own.id));
    this.root.querySelector('#close-worlds')?.addEventListener('click', () => this.closeWorlds());
    this.root.querySelector('#logout')!.addEventListener('click', () => void this.run(() => this.logout()));
    this.directory = new PlayerDirectory(this.root.querySelector('#player-directory')!,this.client,visit);
  }
  private async logout() {
    await this.client.signOut();
    this.directory?.destroy();
    window.clearInterval(this.overlayHeartbeat);
    this.overlayHeartbeat = undefined;
    this.activeWorldId = undefined;
    this.game.scene.stop("Game");
    this.mode = "login";
    this.auth();
  }
  private accountAction(action: "logout" | "username" | "password") {
    if (action === "logout") {
      this.set('<span class="eyebrow">Mosslight · Account</span><h1>Signing out…</h1><p class="online-error" role="alert"></p>');
      void this.run(() => this.logout());
      return;
    }
    const username = action === "username";
    this.set(`<span class="eyebrow">Mosslight · Account</span><h1>${username ? "Change username" : "Change password"}</h1><p>${username ? "Your world and friends will stay with this account." : "Enter your current password to choose a new one."}</p><form id="account-form">${username ? `<label>New username<input name="username" autocomplete="username" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" value="${escape(this.client.snapshot!.profile.username)}" required></label>` : '<label>Old password<input name="oldPassword" type="password" autocomplete="current-password" required></label><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="10" maxlength="72" required></label><label>Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" maxlength="72" required></label>'}<button class="primary" type="submit">Save change ↗</button></form><button id="cancel-account" class="online-text" type="button">Cancel</button><p class="online-error" role="alert"></p>`);
    this.root.querySelector("#cancel-account")!.addEventListener("click", () => this.activeWorldId ? this.closeWorlds() : this.lobby());
    this.root.querySelector("#account-form")!.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.target as HTMLFormElement);
      void this.run(async () => {
        if (username) {
          const name = await this.client.changeUsername(String(form.get("username")));
          if (this.activeWorldId) this.scene().ui.toast(`Username changed to ${name}`);
        } else {
          await this.client.changePassword(String(form.get("oldPassword")), String(form.get("newPassword")), String(form.get("confirmPassword")));
          if (this.activeWorldId) this.scene().ui.toast("Password updated");
        }
        if (this.activeWorldId) this.closeWorlds(); else this.lobby();
      });
    });
  }
  private async enter(worldId: string) {
    const snapshot: OnlineSnapshot = await this.client.join(worldId);
    this.activeWorldId = worldId;
    const scene = this.scene();
    scene.online = this.client;
    scene.soloCapacity = false;
    scene.onLeaveOnline = () => this.openWorlds();
    scene.onAccountAction = (action) => this.accountAction(action);
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
