import { SHOP, type UpgradeId } from "../data/shop";
import { InventorySystem } from "./InventorySystem";
export class ShopSystem {
  constructor(public owned: UpgradeId[] = []) {}
  purchase(
    id: string,
    gems: number,
    inventory: InventorySystem,
  ): { ok: boolean; gems: number; message: string } {
    const offer = SHOP.find((o) => o.id === id);
    const fail = (message: string) => ({ ok: false, gems, message });
    if (!offer) return fail("That item is not available.");
    if (offer.upgrade && this.owned.includes(offer.upgrade))
      return fail("Already owned and equipped.");
    if (gems < offer.price)
      return fail(`You need ${offer.price - gems} more gems.`);
    // Simulate the entire delivery first. Bundles must never charge for partial stock.
    const next = new InventorySystem(structuredClone(inventory.slots));
    for (const stack of offer.contents ?? [])
      if (next.add(stack.id, stack.count))
        return fail("Make some room in your backpack first.");
    if (offer.upgrade) this.owned.push(offer.upgrade);
    else {
      inventory.slots = next.slots;
      inventory.onChange();
    }
    return {
      ok: true,
      gems: gems - offer.price,
      message: offer.upgrade
        ? `${offer.name} equipped!`
        : `${offer.name} added to your backpack.`,
    };
  }
}
