import { GAME, ITEMS, SIGNS } from "../data/config";
import { iconURLs } from "../art/Textures";
import type { InventorySystem } from "../systems/InventorySystem";
import { ShopPanel } from "./ShopPanel";
import type { UpgradeId } from "../data/shop";
import { guideSteps, type GuideProgress } from "../systems/GuideSystem";
export interface UIActions {
  feedback: () => void;
  save: () => void;
  backpackOpened: () => void;
  export: () => void;
  import: (file: File) => void;
  reset: () => void;
  home: () => void;
  sound: (enabled: boolean) => void;
  pause: (paused: boolean) => void;
  buy: (id: string) => void;
  shopState: () => { gems: number; owned: UpgradeId[] };
  moveInventory?: (from: number, to: number) => void;
  leaveWorld?: () => void;
}
export class GameUI {
  private listeners = new AbortController();
  root = document.querySelector<HTMLDivElement>("#ui")!;
  open = false;
  paused = false;
  shopPanel: ShopPanel;
  private dragFrom = -1;
  private dragStart = { x: 0, y: 0 };
  private ghost?: HTMLElement;
  private pointerId = -1;
  private handleStart = 0;
  private initialOpen = false;
  private activeSign = -2;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private slots: HTMLButtonElement[] = [];
  private guideKey = "";
  constructor(
    public inventory: InventorySystem,
    private actions: UIActions,
    sound: boolean,
  ) {
    this.root.innerHTML = `<header class="hud"><div class="identity"><div class="brand"><span class="brand-sprout" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M11 20v-8"/><path d="M11 13C6 13 4 10 4 6c4 0 7 2 7 7Z"/><path d="M12 10c0-4 3-6 8-6 0 4-3 7-8 7Z"/></svg></span> mosslight<span class="brand-dot">.</span></div><div class="world-label"><i></i> YOUR LITTLE WILD <span> / </span> SOLO WORLD</div></div><div class="location"><span class="location-icon">⌖</span><div><b>The First Meadow</b><small>A place to begin</small></div></div><div class="hud-actions"><button id="open-shop" class="gems" aria-label="Open gem shop" title="Spend gems · Meadow Market"><img src="${iconURLs.gem}" alt="Gem"/><b id="gem-count">0</b><span>GEMS <i class="shop-link">SHOP ↗</i></span></button><button id="sound" class="square" aria-label="Toggle sound" title="Sound">${sound ? "♫" : "♩"}</button><button id="settings" class="square" aria-label="Settings" title="Settings · Esc">⚙</button></div></header>
  <section id="tutorial" class="tutorial hidden" aria-live="polite"><span class="tutorial-emblem">✦</span><div><div id="tutorial-label" class="eyebrow"></div><h1 id="tutorial-title"></h1><p id="tutorial-body"></p><span id="tutorial-keys" class="key-hint"></span></div><span class="sign-dots"></span></section>
  <aside class="field-notes" aria-label="Getting started guide"><div class="eyebrow">GETTING STARTED <span id="guide-count">0 / 6</span></div><h2>Your first adventure</h2><ol id="guide-steps"></ol><p id="guide-instruction" aria-live="polite"></p><div class="quest-track"><i id="quest-progress"></i></div></aside>
  <div id="toast" class="toast" role="status"></div><div id="target-tip" class="target-tip"></div>
  <div class="bottom-hints"><div><kbd>A</kbd><kbd>D</kbd> move <span>·</span> <kbd>W</kbd> jump</div><small>LEFT CLICK <b>break</b><span> / </span>RIGHT CLICK <b>build</b></small></div>
  <div class="world-status"><span id="save-status"><i></i> Saved in this browser</span><small id="coordinates">MEADOW · 19, 23</small></div>
  <section id="inventory" class="inventory"><button id="inventory-handle" class="inventory-handle" aria-label="Drag up to open backpack" aria-expanded="false"><span></span><b>BACKPACK</b><i>⌃</i></button><div class="hotbar-label"><span id="selected-name">Earth</span><small>1–8 TO SELECT</small></div><div id="hotbar" class="slot-grid hotbar"></div><div class="backpack"><div class="backpack-heading"><div><span class="eyebrow">THE THINGS YOU FIND</span><h2>Your backpack</h2></div><span id="capacity"></span></div><div id="pack-grid" class="slot-grid pack-grid"></div><footer>Drag to move · Drop on a matching stack to combine <kbd>E</kbd> to close</footer></div></section>
  <div id="modal-overlay" class="modal-overlay hidden"><section class="menu" role="dialog" aria-modal="true" aria-labelledby="menu-title"><span class="eyebrow">TAKE A BREATHER</span><h2 id="menu-title">Your little world.</h2><p>Right here when you get back.</p><button id="resume" class="primary">Back to the meadow <span>↗</span></button><button id="home">Return to the white door <span>⌂</span></button><button id="export">Export save <span>↓</span></button><button id="import">Import save <span>↑</span></button><button id="menu-sound">Sound <span>${sound ? "ON" : "OFF"}</span></button><div class="menu-divider"></div><button id="reset" class="danger">Reset world <span>↺</span></button><p class="menu-note">Only on this device. Export a little backup.</p><div id="confirm-reset" class="confirm hidden"><h3>Reset your world?</h3><p>All blocks, inventory, gems, and progress will be deleted.</p><button id="cancel-reset">Keep my world</button><button id="do-reset" class="danger">Yes, reset everything</button></div></section></div><input type="file" id="save-file" accept="application/json,.json" hidden/>`;
    this.shopPanel = new ShopPanel(this.root, actions.buy, (open) => {
      this.paused = open;
      actions.pause(open);
      actions.feedback();
      if (open) this.toggleInventory(false);
    });
    if (actions.leaveWorld) {
      const button = document.createElement("button");
      button.id = "leave-world";
      button.className = "hud-social";
      button.setAttribute("aria-label", "Worlds ↗");
      button.title = "Explore worlds";
      button.innerHTML = `<span class="hud-social-icon" aria-hidden="true"><img src="${iconURLs['worlds-icon']}" alt=""></span><span class="hud-social-copy"><b>WORLDS</b><small>EXPLORE ↗</small></span>`;
      button.addEventListener("click", actions.leaveWorld);
      this.root.querySelector(".hud-actions")!.prepend(button);
      this.root.querySelector(".world-label")!.innerHTML = "<i></i> SHARED WORLD";
      this.root.querySelector(".menu-note")!.textContent = "Worlds and inventory are saved online.";
    }
    for (let i = 0; i < GAME.slots; i++) {
      const s = document.createElement("button");
      s.className = "slot";
      s.dataset.slot = String(i);
      s.setAttribute("aria-label", `Inventory slot ${i + 1}`);
      this.slots.push(s);
      this.root
        .querySelector(i < GAME.hotbar ? "#hotbar" : "#pack-grid")!
        .append(s);
      s.addEventListener("pointerdown", (e) => this.startDrag(e, i));
      s.addEventListener("click", () => {
        if (i < 8) this.select(i);
      });
    }
    const on = (id: string, cb: () => void) =>
      this.root.querySelector(`#${id}`)!.addEventListener("click", cb);
    on("settings", () => this.togglePause());
    on("open-shop", () => {
      const state = actions.shopState();
      this.shopPanel.refresh(state.gems, state.owned);
      this.shopPanel.toggle(true);
    });
    on("resume", () => this.togglePause(false));
    on("home", () => {
      actions.home();
      this.togglePause(false);
    });
    on("export", actions.export);
    on("import", () =>
      this.root.querySelector<HTMLInputElement>("#save-file")!.click(),
    );
    on("reset", () =>
      this.root.querySelector("#confirm-reset")!.classList.remove("hidden"),
    );
    on("cancel-reset", () =>
      this.root.querySelector("#confirm-reset")!.classList.add("hidden"),
    );
    on("do-reset", actions.reset);
    const toggleSound = () => {
      sound = !sound;
      actions.sound(sound);
      this.root.querySelector("#sound")!.textContent = sound ? "♫" : "♩";
      this.root.querySelector("#menu-sound span")!.textContent = sound
        ? "ON"
        : "OFF";
    };
    on("sound", toggleSound);
    on("menu-sound", toggleSound);
    this.root
      .querySelector<HTMLInputElement>("#save-file")!
      .addEventListener("change", (e) => {
        const el = e.target as HTMLInputElement;
        const file = el.files?.[0];
        if (file) actions.import(file);
        el.value = "";
      });
    const handle =
      this.root.querySelector<HTMLButtonElement>("#inventory-handle")!;
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.pointerId = e.pointerId;
      this.handleStart = e.clientY;
      this.initialOpen = this.open;
      handle.setPointerCapture(e.pointerId);
      this.root.querySelector("#inventory")!.classList.add("dragging");
    });
    handle.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.pointerId) return;
      const delta = this.handleStart - e.clientY;
      const h = this.drawerHeight();
      const amount = Math.max(
        0,
        Math.min(h, (this.initialOpen ? h : 0) + delta),
      );
      (this.root.querySelector("#inventory") as HTMLElement).style.setProperty(
        "--lift",
        `${amount}px`,
      );
    });
    handle.addEventListener("pointerup", (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = -1;
      const delta = this.handleStart - e.clientY;
      this.root.querySelector("#inventory")!.classList.remove("dragging");
      this.toggleInventory(Math.abs(delta) < 6 ? !this.initialOpen : delta > 0);
    });
    handle.addEventListener("pointercancel", () => {
      this.pointerId = -1;
      this.root.querySelector("#inventory")!.classList.remove("dragging");
      this.toggleInventory(this.initialOpen);
    });
    handle.addEventListener("click", (e) => {
      if (e.detail === 0) this.toggleInventory();
    });
    window.addEventListener("pointermove", (e) => this.moveDrag(e), { signal: this.listeners.signal });
    window.addEventListener("pointerup", (e) => this.endDrag(e), { signal: this.listeners.signal });
    window.addEventListener("pointercancel", () => this.cancelDrag(), { signal: this.listeners.signal });
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (document.querySelector("#online-app:not([hidden])")) return;
      if (this.shopPanel.open) {
        if (e.code === "Escape") {
          e.preventDefault();
          this.shopPanel.toggle(false);
        } else if (e.code === "Tab") this.shopPanel.trapFocus(e);
        return;
      }
      if (this.paused && e.code === "Tab") {
        const confirmation = this.root.querySelector("#confirm-reset")!;
        const scope = confirmation.classList.contains("hidden")
          ? this.root.querySelector(".menu")!
          : confirmation;
        const buttons = Array.from(
          scope.querySelectorAll<HTMLButtonElement>("button"),
        ).filter((b) => b.offsetParent !== null);
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        e.preventDefault();
        buttons[
          (index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length
        ]?.focus();
        return;
      }
      if (e.repeat) return;
      if (e.code === "KeyE" && !this.paused) this.toggleInventory();
      if (e.code === "Escape") {
        if (this.open) this.toggleInventory(false);
        else this.togglePause();
      }
      if (/^Digit[1-8]$/.test(e.code) && !this.paused)
        this.select(Number(e.code.slice(-1)) - 1);
    }, { signal: this.listeners.signal });
    window.addEventListener("resize", () => this.toggleInventory(this.open), { signal: this.listeners.signal });
    this.render();
    this.toggleInventory(false);
  }
  destroy() { this.listeners.abort(); this.cancelDrag(); }
  private drawerHeight() {
    return (this.root.querySelector(".backpack") as HTMLElement).offsetHeight;
  }
  toggleInventory(open = !this.open) {
    if (open) this.actions.backpackOpened();
    if (open !== this.open) this.actions.feedback();
    this.open = open;
    (this.root.querySelector(".backpack") as HTMLElement).inert = !open;
    const panel = this.root.querySelector<HTMLElement>("#inventory")!;
    panel.style.setProperty("--lift", `${open ? this.drawerHeight() : 0}px`);
    panel.classList.toggle("open", open);
    this.root
      .querySelector("#inventory-handle")!
      .setAttribute("aria-expanded", String(open));
  }
  togglePause(paused = !this.paused) {
    this.actions.feedback();
    this.paused = paused;
    this.root
      .querySelector("#modal-overlay")!
      .classList.toggle("hidden", !paused);
    this.root.querySelector("#confirm-reset")!.classList.add("hidden");
    this.actions.pause(paused);
    if (paused) (this.root.querySelector("#resume") as HTMLElement).focus();
  }
  select(index: number) {
    this.inventory.selected = index;
    this.render();
    this.actions.save();
  }
  render() {
    this.slots.forEach((el, i) => {
      const s = this.inventory.slots[i];
      el.classList.toggle("selected", i === this.inventory.selected);
      el.innerHTML = `${i < 8 ? `<span class="slot-key">${i + 1}</span>` : ""}${s ? `<img src="${iconURLs[s.id]}" alt="${ITEMS[s.id].name}" draggable="false"/><span class="count">${s.count}</span>` : '<span class="empty-dot">·</span>'}`;
      el.title = s
        ? `${ITEMS[s.id].name} ×${s.count}\n${ITEMS[s.id].description}`
        : "Empty slot";
      el.setAttribute(
        "aria-label",
        s ? `${ITEMS[s.id].name}, ${s.count}` : `Empty slot ${i + 1}`,
      );
      el.setAttribute("aria-pressed", String(i === this.inventory.selected));
    });
    const s = this.inventory.slots[this.inventory.selected];
    this.root.querySelector("#selected-name")!.textContent = s
      ? ITEMS[s.id].name
      : "Empty hand";
    this.root.querySelector("#capacity")!.textContent =
      `${this.inventory.slots.filter(Boolean).length} / ${GAME.slots} slots`;
  }
  private startDrag(e: PointerEvent, i: number) {
    if (e.button !== 0) return;
    this.dragFrom = i;
    this.dragStart = { x: e.clientX, y: e.clientY };
  }
  private moveDrag(e: PointerEvent) {
    if (this.dragFrom < 0 || !this.inventory.slots[this.dragFrom]) return;
    if (
      !this.ghost &&
      Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) > 5
    ) {
      this.ghost = this.slots[this.dragFrom].cloneNode(true) as HTMLElement;
      this.ghost.className = "slot drag-ghost";
      document.body.append(this.ghost);
      this.slots[this.dragFrom].classList.add("drag-source");
    }
    if (this.ghost) {
      this.ghost.style.left = `${e.clientX - 28}px`;
      this.ghost.style.top = `${e.clientY - 28}px`;
      this.slots.forEach((s) => s.classList.remove("drag-target"));
      document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest(".slot")
        ?.classList.add("drag-target");
    }
  }
  private endDrag(e: PointerEvent) {
    if (this.ghost) {
      const target = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-slot]");
      if (target) {
        if (this.actions.moveInventory) this.actions.moveInventory(this.dragFrom, Number(target.dataset.slot));
        else this.inventory.move(this.dragFrom, Number(target.dataset.slot));
        target.animate(
          [{ transform: "scale(.88)" }, { transform: "scale(1)" }],
          { duration: 180 },
        );
      }
    }
    this.cancelDrag();
  }
  private cancelDrag() {
    this.ghost?.remove();
    this.ghost = undefined;
    this.dragFrom = -1;
    this.slots.forEach((s) => s.classList.remove("drag-source", "drag-target"));
  }
  tutorial(index: number) {
    if (index === this.activeSign) return;
    this.activeSign = index;
    this.root.classList.toggle("reading-sign", index >= 0);
    const el = this.root.querySelector("#tutorial")!;
    el.classList.toggle("hidden", index < 0);
    if (index < 0) return;
    const s = SIGNS[index];
    this.root.querySelector("#tutorial-label")!.textContent = s.label;
    this.root.querySelector("#tutorial-title")!.textContent = s.title;
    this.root.querySelector("#tutorial-body")!.textContent = s.body;
    this.root.querySelector("#tutorial-keys")!.textContent = s.keys;
    this.root.querySelector(".sign-dots")!.innerHTML = SIGNS.map(
      (_, i) => `<i class="${i === index ? "active" : ""}"></i>`,
    ).join("");
  }
  status(
    gems: number,
    x: number,
    y: number,
    error: string,
    stats: {
      broken: number;
      placed: number;
      planted: number;
      harvested: number;
    },
    guide: GuideProgress,
    online = false,
  ) {
    this.root.querySelector("#gem-count")!.textContent = gems.toLocaleString();
    this.root.querySelector("#coordinates")!.textContent =
      `${y > 31 ? "THE QUIET BELOW" : "MEADOW"} · ${x}, ${y}`;
    if (!online) {
      this.root.querySelector(".location b")!.textContent =
        y > 31 ? "The Quiet Below" : "The First Meadow";
      this.root.querySelector(".location small")!.textContent =
        y > 31 ? "There is more beneath the surface" : "A place to begin";
    }
    this.root.querySelector("#save-status")!.innerHTML = error
      ? "Export to keep your progress"
      : online ? "<i></i> Synced online" : "<i></i> Saved in this browser";
    const steps = guideSteps(guide, stats),
      key = steps.map((s) => `${s.done}:${s.help}`).join("|");
    if (key !== this.guideKey) {
      this.guideKey = key;
      const completed = steps.filter((s) => s.done).length,
        current = steps.findIndex((s) => !s.done);
      this.root.querySelector<HTMLElement>(".field-notes")!.hidden =
        completed === steps.length;
      this.root.querySelector("#guide-count")!.textContent =
        `${completed} / ${steps.length}`;
      this.root.querySelector("#guide-steps")!.innerHTML = steps
        .map(
          (s, i) =>
            `<li class="${s.done ? "done" : i === current ? "current" : ""}" ${i === current ? 'aria-current="step"' : ""}><span class="guide-check">${s.done ? "✓" : i + 1}</span><span>${s.title}</span>${s.done ? '<span class="sr-only"> completed</span>' : ""}</li>`,
        )
        .join("");
      this.root.querySelector("#guide-instruction")!.textContent =
        current < 0 ? "" : steps[current].help;
      (this.root.querySelector("#quest-progress") as HTMLElement).style.width =
        `${(completed / steps.length) * 100}%`;
    }
  }
  toast(message: string) {
    clearTimeout(this.toastTimer);
    const el = this.root.querySelector("#toast")!;
    el.textContent = message;
    el.classList.add("visible");
    this.toastTimer = setTimeout(() => el.classList.remove("visible"), 3500);
  }
  celebrateGuide() {
    const banner = document.createElement("section");
    banner.id = "guide-complete";
    banner.className = "guide-complete";
    banner.setAttribute("role", "status");
    banner.innerHTML =
      '<span class="completion-star" aria-hidden="true">✦</span><div><span class="eyebrow">ALL SIX STEPS COMPLETE</span><h2>You did it, explorer!</h2><p>Congratulations! You’ve learned to gather, build, and grow.<br/>Your little world is yours to make.</p></div><button aria-label="Dismiss congratulations">×</button>';
    this.root.append(banner);
    const timer = setTimeout(() => banner.remove(), 8000);
    banner.querySelector("button")!.addEventListener("click", () => {
      clearTimeout(timer);
      banner.remove();
    });
  }
  target(text: string, x: number, y: number) {
    const el = this.root.querySelector<HTMLElement>("#target-tip")!;
    el.textContent = text;
    el.style.left = `${Math.min(window.innerWidth - 180, x + 18)}px`;
    el.style.top = `${Math.max(100, y - 35)}px`;
    el.classList.toggle("visible", !!text);
  }
}
