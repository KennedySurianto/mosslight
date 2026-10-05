import { SHOP, type UpgradeId } from "../data/shop";
import { iconURLs } from "../art/Textures";

export class ShopPanel {
  open = false;
  private overlay: HTMLDivElement;
  private filter = "All";
  private balance = 0;
  private owned: UpgradeId[] = [];
  constructor(
    root: HTMLElement,
    private buy: (id: string) => void,
    private onToggle: (open: boolean) => void,
  ) {
    this.overlay = document.createElement("div");
    this.overlay.id = "shop-overlay";
    this.overlay.className = "modal-overlay shop-overlay hidden";
    this.overlay.innerHTML = `<section class="shop-panel" role="dialog" aria-modal="true" aria-labelledby="shop-title"><header class="shop-header"><div><span class="eyebrow">LITTLE FINDS. BIG POSSIBILITIES.</span><h2 id="shop-title">The Meadow Market<span>✦</span></h2><p>A little something for your next adventure.</p></div><div class="shop-top-actions"><div class="shop-wallet"><img src="${iconURLs.gem}" alt=""/><b id="shop-balance">0</b><span>GEMS</span></div><button id="close-shop" class="square" aria-label="Close shop">×</button></div></header><div class="shop-toolbar"><nav class="shop-filters" aria-label="Shop categories">${["All", "Gear", "Seeds", "Building", "Bundles"].map((c) => `<button data-filter="${c}" aria-pressed="${c === "All"}">${c}</button>`).join("")}</nav><span id="shop-stock">16 little finds</span></div><div class="shop-grid">${SHOP.map((o) => `<article class="shop-card" data-offer="${o.id}"><div class="shop-item-art"><img src="${iconURLs[o.icon]}" alt=""/><span>${o.badge ?? o.category.toUpperCase()}</span></div><h3>${o.name}</h3><p>${o.description}</p><button data-buy="${o.id}" aria-label="Buy ${o.name} for ${o.price} gems"><span>Buy${o.upgrade ? " & equip" : ""}</span><b><img src="${iconURLs.gem}" alt=""/>${o.price}</b></button></article>`).join("")}</div><footer class="shop-footer"><span id="shop-message" role="status">Earn gems by breaking blocks and harvesting trees.</span><small>Gear is permanent · Supplies go to your backpack</small></footer></section>`;
    root.append(this.overlay);
    this.overlay
      .querySelector("#close-shop")!
      .addEventListener("click", () => this.toggle(false));
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.toggle(false);
    });
    this.overlay
      .querySelectorAll<HTMLButtonElement>("[data-buy]")
      .forEach((b) =>
        b.addEventListener("click", () => this.buy(b.dataset.buy!)),
      );
    this.overlay
      .querySelectorAll<HTMLButtonElement>("[data-filter]")
      .forEach((b) =>
        b.addEventListener("click", () => {
          this.filter = b.dataset.filter!;
          this.render();
        }),
      );
  }
  toggle(open = !this.open) {
    this.open = open;
    this.overlay.classList.toggle("hidden", !open);
    this.onToggle(open);
    if (open) {
      this.render();
      this.overlay.querySelector<HTMLButtonElement>("#close-shop")!.focus();
    } else document.querySelector<HTMLButtonElement>("#open-shop")?.focus();
  }
  refresh(gems: number, owned: UpgradeId[]) {
    this.balance = gems;
    this.owned = owned;
    this.render();
  }
  message(text: string) {
    this.overlay.querySelector("#shop-message")!.textContent = text;
  }
  private render() {
    this.overlay.querySelector("#shop-balance")!.textContent =
      this.balance.toLocaleString();
    let visible = 0;
    this.overlay
      .querySelectorAll<HTMLButtonElement>("[data-filter]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(this.filter === b.dataset.filter),
        ),
      );
    for (const offer of SHOP) {
      const card = this.overlay.querySelector<HTMLElement>(
        `[data-offer="${offer.id}"]`,
      )!;
      const show = this.filter === "All" || this.filter === offer.category;
      card.hidden = !show;
      if (show) visible++;
      const button = card.querySelector<HTMLButtonElement>("[data-buy]")!;
      const owned = !!offer.upgrade && this.owned.includes(offer.upgrade);
      button.disabled = owned || this.balance < offer.price;
      button.classList.toggle("owned", owned);
      button.querySelector("span")!.textContent = owned
        ? "✓ Equipped"
        : this.balance < offer.price
          ? `Need ${offer.price - this.balance} more`
          : `Buy${offer.upgrade ? " & equip" : ""}`;
    }
    this.overlay.querySelector("#shop-stock")!.textContent =
      `${visible} little finds`;
  }
  trapFocus(e: KeyboardEvent) {
    const buttons = Array.from(
      this.overlay.querySelectorAll<HTMLButtonElement>("button"),
    ).filter((b) => !b.disabled && b.offsetParent !== null);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    buttons[
      (i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length
    ]?.focus();
  }
}
