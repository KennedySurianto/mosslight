import { test, expect, type Page } from "@playwright/test";
import type { GameScene } from "../../src/game/scenes/GameScene";
declare global {
  interface Window {
    __mosslight: { scene: { getScene: (name: string) => GameScene } };
  }
}
const state = (p: Page) =>
  p.evaluate(() => window.__mosslight.scene.getScene("Game").snapshot());
const screen = async (p: Page, x: number, y: number) =>
  p.evaluate(
    ({ x, y }) => {
      const c = window.__mosslight.scene.getScene("Game").cameras.main;
      return {
        x: (x * 32 + 16 - c.worldView.x) * c.zoom,
        y: (y * 32 + 16 - c.worldView.y) * c.zoom,
      };
    },
    { x, y },
  );
async function aim(
  p: Page,
  x: number,
  y: number,
  button: "left" | "right" = "left",
) {
  const pos = await screen(p, x, y);
  if (
    button === "right" &&
    (await p.evaluate(
      ({ x, y }) =>
        !!window.__mosslight.scene.getScene("Game").world.foliageAt(x, y),
      { x, y },
    ))
  ) {
    await p.mouse.click(pos.x, pos.y);
    await p.waitForTimeout(270);
  }
  await p.mouse.click(pos.x, pos.y, { button });
  await p.waitForTimeout(270);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => !!window.__mosslight?.scene.getScene("Game")?.ui,
  );
});
test("slash opens chat, closes an empty draft, and stays usable in a message", async ({ page }) => {
  await page.evaluate(async () => {
    const { WorldHud } = await import('../../src/online/WorldHud');
    const scene = window.__mosslight.scene.getScene('Game');
    const client = { snapshot: { world: { owner_id: 'me', name: 'The First Meadow' }, profile: { user_id: 'me' } }, chat: async () => {} };
    new WorldHud(scene.ui.root, client as any, open => scene.setOnlineOverlay(open), () => {});
  });
  await page.keyboard.press('/');
  await expect(page.locator('#world-chat')).toBeVisible();
  await expect(page.locator('#chat-message')).toBeFocused();
  await page.keyboard.press('/');
  await expect(page.locator('#world-chat')).toBeHidden();
  await page.keyboard.press('/');
  await page.locator('#chat-message').fill('hello');
  await page.keyboard.press('/');
  await expect(page.locator('#chat-message')).toHaveValue('hello/');
  await expect(page.locator('#world-chat')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#world-chat')).toBeHidden();
});
test("a new drop immediately flies to a stationary player and is collected", async ({ page }) => {
  const start = await page.evaluate(() => {
    const scene = window.__mosslight.scene.getScene('Game');
    scene.drops.spawn(scene.player.x + 96, scene.player.y - 28, 'wood');
    return { x: scene.drops.drops[0].x, wood: scene.inventory.slots.find(s => s?.id === 'wood')?.count };
  });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__mosslight.scene.getScene('Game').drops.drops[0]?.x)).toBeLessThan(start.x);
  await expect.poll(() => page.evaluate(() => {
    const scene = window.__mosslight.scene.getScene('Game');
    return { remaining: scene.drops.drops.length, wood: scene.inventory.slots.find(s => s?.id === 'wood')?.count };
  })).toEqual({ remaining: 0, wood: (start.wood ?? 0) + 1 });
});
test("casino wheel costs five gems, spins on click, and breaks when held", async ({ page }) => {
  await page.evaluate(() => {
    const scene = window.__mosslight.scene.getScene("Game");
    scene.gems = 5;
    scene.world.clearFoliage(22, 22);
    scene.world.set(22, 22, 0);
  });
  await page.getByRole("button", { name: "Open gem shop" }).click();
  await page.getByRole("button", { name: "Buy Casino wheel for 5 gems" }).click();
  await expect.poll(() => page.evaluate(() => window.__mosslight.scene.getScene("Game").gems)).toBe(0);
  await page.getByRole("button", { name: "Close shop" }).click();
  await page.evaluate(() => {
    const scene = window.__mosslight.scene.getScene("Game");
    scene.inventory.selected = scene.inventory.slots.findIndex(s => s?.id === "wheel");
  });
  const point = await screen(page, 22, 22);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect.poll(() => page.evaluate(() => window.__mosslight.scene.getScene("Game").world.get(22, 22))).toBe(8);
  await page.waitForTimeout(260);
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => page.evaluate(() => (window.__mosslight.scene.getScene("Game") as any).wheelResults.has("22,22"))).toBe(true);
  const result = await page.evaluate(() => {
    const label = (window.__mosslight.scene.getScene("Game") as any).wheelResults.get("22,22");
    return { number: Number(label?.text), color: label?.style.color };
  });
  expect(result.number).toBeGreaterThanOrEqual(0);
  expect(result.number).toBeLessThanOrEqual(36);
  if (result.number === 0) expect(result.color).toBe("#14854b");
  else expect(result.color).toMatch(/^#(b43632|171c24)$/);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__mosslight.scene.getScene("Game").world.get(22, 22))).toBe(0);
});
test("fresh world, WAD movement, jump, collisions, all seven signs, resize and console", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let s = await state(page);
  expect(s.player.x).toBe(624);
  expect(s.player.y).toBe(736);
  expect(s.inventory[0]?.count).toBe(15);
  await expect(page.locator("#tutorial")).toBeHidden();
  await expect(page.locator("#guide-instruction")).toContainText(
    "Walk with A / D",
  );
  await page.keyboard.down("d");
  await page.waitForTimeout(450);
  await page.keyboard.up("d");
  await page.waitForTimeout(200);
  s = await state(page);
  expect(s.player.x).toBeGreaterThan(680);
  expect(s.player.y).toBe(736);
  await expect(page.locator("#tutorial")).toBeVisible();
  await expect(page.locator("#tutorial-title")).toHaveText(
    "Make yourself at home.",
  );
  await page.keyboard.down("w");
  await page.waitForTimeout(200);
  expect((await state(page)).player.y).toBeLessThan(700);
  await page.keyboard.up("w");
  await page.waitForTimeout(700);
  expect((await state(page)).player.y).toBe(736);
  for (const [x, title] of [
    [25, "Good things start with dirt."],
    [29, "Finders, keepers."],
    [33, "Make something yours."],
    [37, "A pocketful of possibilities."],
    [41, "Plant a little tomorrow."],
    [45, "Your world remembers."],
  ] as const) {
    await page.keyboard.down("d");
    await expect
      .poll(async () => (await state(page)).player.x, { timeout: 6000 })
      .toBeGreaterThan(x * 32);
    await page.keyboard.up("d");
    await expect(page.locator("#tutorial-title")).toHaveText(title);
  }
  await page.keyboard.down("d");
  await page.waitForTimeout(700);
  await page.keyboard.up("d");
  await expect(page.locator("#tutorial")).toHaveClass(/hidden/);
  for (const [width, height] of [
    [1920, 1080],
    [2560, 1440],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
    expect(
      await page
        .locator("canvas")
        .evaluate((c) => c.getBoundingClientRect().width),
    ).toBe(width);
    const hot = await page.locator("#hotbar").boundingBox();
    expect(hot!.y + hot!.height).toBeLessThanOrEqual(height);
  }
  expect(errors).toEqual([]);
});
test("break feedback, physical drops, pickup, placement protection, persistent changes", async ({
  page,
}) => {
  await aim(page, 21, 23);
  expect(
    await page.evaluate(() =>
      window.__mosslight.scene.getScene("Game").blocks.damage.get("21,23"),
    ),
  ).toBe(1);
  await aim(page, 21, 23);
  expect((await state(page)).modifications["21,23"]).toBe(0);
  expect((await state(page)).drops.length).toBeGreaterThan(0);
  await page.keyboard.down("d");
  await page.waitForTimeout(330);
  await page.keyboard.up("d");
  await page.waitForTimeout(850);
  expect((await state(page)).inventory.some((s) => s?.id === "grass")).toBe(
    true,
  );
  const tile = await page.evaluate(() => {
    const p = window.__mosslight.scene.getScene("Game").player;
    return { x: Math.floor(p.x / 32), y: Math.floor((p.y - 16) / 32) };
  });
  const count = (await state(page)).inventory[0]!.count;
  await aim(page, tile.x, tile.y, "right");
  expect((await state(page)).inventory[0]!.count).toBe(count);
  await aim(page, 22, 22, "right");
  expect((await state(page)).modifications["22,22"]).toBe(2);
  expect((await state(page)).inventory[0]!.count).toBe(count - 1);
  await page.waitForTimeout(650);
  const before = await state(page);
  await page.reload();
  await page.waitForFunction(
    () => !!window.__mosslight?.scene.getScene("Game")?.ui,
  );
  const after = await state(page);
  expect(after.modifications).toEqual(before.modifications);
  expect(after.inventory).toEqual(before.inventory);
});
test("drag drawer and move, swap, merge stacks without punching behind UI", async ({
  page,
}) => {
  const handle = await page.locator("#inventory-handle").boundingBox();
  await page.mouse.move(handle!.x + 50, handle!.y + 12);
  await page.mouse.down();
  await page.mouse.move(handle!.x + 50, handle!.y - 250, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator("#inventory")).toHaveClass(/open/);
  await page.waitForTimeout(350);
  const drag = async (from: number, to: number) => {
    const a = await page.locator(`[data-slot="${from}"]`).boundingBox(),
      b = await page.locator(`[data-slot="${to}"]`).boundingBox();
    await page.mouse.move(a!.x + 28, a!.y + 28);
    await page.mouse.down();
    await page.mouse.move(b!.x + 28, b!.y + 28, { steps: 10 });
    await page.mouse.up();
  };
  await drag(0, 8);
  expect((await state(page)).inventory[8]?.id).toBe("dirt");
  await drag(8, 1);
  expect((await state(page)).inventory[1]?.id).toBe("dirt");
  expect((await state(page)).inventory[8]?.id).toBe("wood");
  await drag(8, 9);
  expect((await state(page)).inventory[9]?.id).toBe("wood");
  await page.evaluate(() => {
    const s = window.__mosslight.scene.getScene("Game");
    s.inventory.slots[10] = { id: "dirt", count: 5 };
    s.ui.render();
  });
  await drag(1, 10);
  expect((await state(page)).inventory[10]?.count).toBe(20);
  expect((await state(page)).inventory[1]).toBeNull();
  expect((await state(page)).stats.broken).toBe(0);
  await page.keyboard.press("e");
  await expect(page.locator("#inventory")).not.toHaveClass(/open/);
});
test("plant, actual offline growth, harvest, gems, and reset confirmation", async ({
  page,
}) => {
  await page.keyboard.press("3");
  await aim(page, 22, 22, "right");
  let s = await state(page);
  expect(s.stats.planted).toBe(1);
  expect(s.inventory[2]?.count).toBe(2);
  const planted = s.trees.find((t) => t.x === 22)!;
  expect(planted.plantedAt).toBeGreaterThan(Date.now() - 10000);
  await page.waitForTimeout(650);
  await page.goto("about:blank");
  await page.clock.install({ time: Date.now() + 60000 });
  await page.goto("/");
  await page.waitForFunction(
    () => !!window.__mosslight?.scene.getScene("Game")?.ui,
  );
  await aim(page, 22, 22);
  expect((await state(page)).stats.harvested).toBe(1);
  expect((await state(page)).drops.some((d) => d.id === "gem")).toBe(true);
  await page.keyboard.down("d");
  await page.waitForTimeout(450);
  await page.keyboard.up("d");
  await page.waitForTimeout(800);
  expect((await state(page)).player.gems).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#export, #import, #save-file")).toHaveCount(0);
  await page.locator("#reset").click();
  await expect(page.locator("#confirm-reset")).toBeVisible();
  await page.locator("#cancel-reset").click();
  expect((await state(page)).stats.harvested).toBe(1);
  await page.locator("#reset").click();
  await page.locator("#do-reset").click();
  await page.waitForFunction(
    () => !!window.__mosslight?.scene.getScene("Game")?.ui,
  );
  s = await state(page);
  expect(s.stats).toEqual({ broken: 0, placed: 0, planted: 0, harvested: 0 });
  expect(s.player.gems).toBe(0);
  expect(s.inventory[0]?.count).toBe(15);
});
test("fresh visual quality capture", async ({ page }) => {
  await page.mouse.move(1100, 350);
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/mosslight-desktop.png" });
  await page.keyboard.press("e");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/mosslight-backpack.png" });
});

test("solid walls stop movement, jumps clear blocks, pause freezes motion, return home prevents softlocks", async ({
  page,
}) => {
  await aim(page, 22, 22, "right");
  await page.keyboard.down("d");
  await page.waitForTimeout(950);
  await page.keyboard.up("d");
  expect((await state(page)).player.x).toBeLessThanOrEqual(22 * 32 - 10);
  expect((await state(page)).player.x).toBeGreaterThan(685);
  await page.keyboard.down("d");
  await page.keyboard.down("w");
  await page.waitForTimeout(600);
  await page.keyboard.up("w");
  await page.keyboard.up("d");
  await page.waitForTimeout(500);
  expect((await state(page)).player.x).toBeGreaterThan(23 * 32);
  await page.keyboard.press("Escape");
  const before = (await state(page)).player;
  await page.keyboard.down("a");
  await page.waitForTimeout(250);
  await page.keyboard.up("a");
  expect((await state(page)).player).toEqual(before);
  await page.locator("#home").click();
  expect((await state(page)).player.x).toBe(624);
  await page.evaluate(() => {
    window.__mosslight.scene.getScene("Game").player.y = 2100;
  });
  await page.waitForTimeout(100);
  expect((await state(page)).player.y).toBe(736);
});

test("bulk breaking yields resources, seeds and gems without walking to the drops", async ({
  page,
}) => {
  const startX = (await state(page)).player.x;
  // Exercise the real hit/drop path with a deterministic RNG and isolated target.
  await page.evaluate(() => {
    let seed = 912;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => {
      const s = window.__mosslight.scene.getScene("Game");
      s.world.set(22, 22, 2);
      s.blocks.damage.clear();
    });
    await aim(page, 22, 22);
    await aim(page, 22, 22);
  }
  await expect.poll(async () => (await state(page)).inventory[0]!.count).toBeGreaterThan(15);
  await expect.poll(async () => (await state(page)).inventory.find(s => s?.id === "seed")?.count ?? 0).toBeGreaterThan(3);
  await expect.poll(async () => (await state(page)).player.gems).toBeGreaterThan(0);
  expect((await state(page)).player.x).toBe(startX);
});

test("corrupt save recovery keeps a backup and starts a safe world", async ({
  page,
}) => {
  await page.goto("about:blank");
  await page.addInitScript(() => {
    if (
      location.hostname === "localhost" &&
      !sessionStorage.getItem("corrupted-once")
    ) {
      localStorage.setItem("mosslight_save_v1", "{broken");
      sessionStorage.setItem("corrupted-once", "true");
    }
  });
  await page.goto("/");
  await page.waitForFunction(
    () => !!window.__mosslight?.scene.getScene("Game")?.ui,
  );
  expect(
    await page.evaluate(() => localStorage.getItem("mosslight_save_v1_backup")),
  ).toBe("{broken");
  expect((await state(page)).inventory[0]?.count).toBe(15);
});

test("player crosses a one-tile-high tunnel with a one-tile-sized sprite", async ({
  page,
}) => {
  await page.evaluate(() => {
    const s = window.__mosslight.scene.getScene("Game");
    for (let x = 23; x <= 32; x++) {
      s.world.set(x, 21, 3);
      s.world.set(x, 22, 0);
      s.world.set(x, 23, 3);
    }
    s.player.x = 24 * 32 + 16;
    s.player.y = 23 * 32;
    s.player.vx = 0;
    s.player.vy = 0;
  });
  await page.keyboard.down("d");
  await page.waitForTimeout(1000);
  await page.keyboard.up("d");
  const dimensions = await page.evaluate(() => {
    const p = window.__mosslight.scene.getScene("Game").player;
    return {
      x: p.x,
      y: p.y,
      height: p.height,
      drawHeight: p.sprite.displayHeight,
      drawWidth: p.sprite.displayWidth,
    };
  });
  expect(dimensions.x).toBeGreaterThan(29 * 32);
  expect(dimensions.y).toBe(736);
  expect(dimensions.height).toBeLessThanOrEqual(32);
  expect(dimensions.drawHeight).toBeLessThanOrEqual(32);
  expect(dimensions.drawWidth).toBeLessThanOrEqual(32);
});

test("other players block placement and receive their own pickup animation", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__mosslight?.scene.getScene("Game")?.ui);
  const result = await page.evaluate(() => {
    const scene = window.__mosslight.scene.getScene("Game") as GameScene;
    const game = scene as any;
    let sent = false;
    game.online = { snapshot: { profile: { user_id: "me" } }, action: () => { sent = true; } };
    scene.setPeers([{ userId: "peer", username: "willow", x: 688, y: 736, facing: 1 }]);
    game.interact(true, scene.time.now, false, { x: 21, y: 22 });
    let targetIsPeer = false;
    const original = scene.drops.visualPickup;
    scene.drops.visualPickup = (_x, _y, _id, target) => { targetIsPeer = target === game.peers.get("peer"); };
    scene.applyOnlineWorldEvent({ kind: "tile", actor: "peer", x: 21, y: 23, id: 0, rewards: [{ id: "dirt", count: 1 }] });
    scene.drops.visualPickup = original;
    game.online = undefined;
    return { sent, targetIsPeer };
  });
  expect(result).toEqual({ sent: false, targetIsPeer: true });
});

test("foliage blocks building until punched and clearing survives refresh", async ({
  page,
}) => {
  const target = await page.evaluate(() => {
    const s = window.__mosslight.scene.getScene("Game");
    const key = [...s.world.foliage.keys()].find(
      (k) => Number(k.split(",")[0]) > 23,
    )!;
    const [x, y] = key.split(",").map(Number);
    s.player.x = (x - 2) * 32 + 16;
    s.player.y = (y + 1) * 32;
    s.player.vx = 0;
    s.player.vy = 0;
    return { x, y, key };
  });
  await page.waitForTimeout(600);
  const pos = await screen(page, target.x, target.y);
  const count = (await state(page)).inventory[0]!.count;
  await page.mouse.click(pos.x, pos.y, { button: "right" });
  await page.waitForTimeout(300);
  expect((await state(page)).inventory[0]!.count).toBe(count);
  await expect(page.locator("#toast")).toContainText("Break the foliage");
  await aim(page, target.x, target.y);
  expect((await state(page)).clearedFoliage).toContain(target.key);
  await aim(page, target.x, target.y, "right");
  expect((await state(page)).modifications[target.key]).toBe(2);
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForFunction(
    () => !!window.__mosslight?.scene.getScene("Game")?.ui,
  );
  expect((await state(page)).clearedFoliage).toContain(target.key);
  expect(
    await page.evaluate(
      ({ x, y }) =>
        window.__mosslight.scene.getScene("Game").world.foliageAt(x, y),
      target,
    ),
  ).toBeUndefined();
});

test("gem counter opens a stocked shop, upgrades work and purchases persist", async ({
  page,
}) => {
  await page.locator("#open-shop").click();
  await expect(page.locator("#shop-overlay")).toBeVisible();
  await expect(page.locator(".shop-card")).toHaveCount(17);
  await expect(page.locator('[data-buy="pickaxe"]')).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#shop-overlay")).toBeHidden();
  await page.evaluate(() => {
    window.__mosslight.scene.getScene("Game").gems = 150;
  });
  await page.locator("#open-shop").click();
  await page.locator('[data-buy="pickaxe"]').click();
  expect((await state(page)).player.gems).toBe(132);
  await expect(page.locator('[data-buy="pickaxe"]')).toBeDisabled();
  expect(
    await page.evaluate(
      () => window.__mosslight.scene.getScene("Game").blocks.power,
    ),
  ).toBe(2);
  await page.locator('[data-buy="shoes"]').click();
  await page.locator('[data-buy="boots"]').click();
  await page.locator('[data-buy="magnet"]').click();
  expect((await state(page)).player.gems).toBe(48);
  expect(
    await page.evaluate(() => {
      const p = window.__mosslight.scene.getScene("Game").player;
      return [p.speedMultiplier, p.jumpMultiplier, p.pickupRange];
    }),
  ).toEqual([1.3, 1.18, 112]);
  await page.locator('[data-filter="Bundles"]').click();
  await expect(page.locator(".shop-card:visible")).toHaveCount(4);
  await page.locator('[data-buy="cabin-kit"]').click();
  expect((await state(page)).player.gems).toBe(30);
  expect(
    (await state(page)).inventory.find((s) => s?.id === "wood")?.count,
  ).toBe(35);
  await page.locator('[data-filter="All"]').click();
  await page.screenshot({ path: "test-results/mosslight-market.png" });
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForFunction(
    () => !!window.__mosslight?.scene.getScene("Game")?.ui,
  );
  expect((await state(page)).upgrades).toEqual([
    "pickaxe",
    "shoes",
    "boots",
    "magnet",
  ]);
  expect((await state(page)).player.gems).toBe(30);
  expect(
    await page.evaluate(
      () => window.__mosslight.scene.getScene("Game").blocks.power,
    ),
  ).toBe(2);
  await page.keyboard.down("d");
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () => window.__mosslight.scene.getScene("Game").player.vx,
    ),
  ).toBeGreaterThan(235);
  await page.keyboard.up("d");
});

test("sign text appears at contact and is removed on the first frame outside", async ({
  page,
}) => {
  const showAt = (x: number, y = 736) =>
    page.evaluate(
      ({ x, y }) =>
        new Promise<boolean>((resolve) => {
          const s = window.__mosslight.scene.getScene("Game");
          s.player.x = x;
          s.player.y = y;
          s.player.vx = 0;
          s.player.vy = 0;
          s.events.once("postupdate", () =>
            resolve(
              getComputedStyle(document.querySelector("#tutorial")!).display !==
                "none",
            ),
          );
        }),
      { x, y },
    );
  expect(await showAt(650)).toBe(false);
  expect(await showAt(664)).toBe(true);
  expect(await showAt(663)).toBe(false);
  expect(await showAt(688)).toBe(true);
  expect(await showAt(713)).toBe(false);
  expect(await showAt(688, 690)).toBe(false);
});

test("guide explains the next task and stays hidden after all six tasks are completed", async ({
  page,
}) => {
  await page.evaluate(() => {
    const audio = window.__mosslight.scene.getScene("Game").audio,
      play = audio.celebrate.bind(audio);
    document.body.dataset.celebrations = "0";
    audio.celebrate = () => {
      document.body.dataset.celebrations = String(
        Number(document.body.dataset.celebrations) + 1,
      );
      play();
    };
  });
  await expect(page.locator("#guide-count")).toHaveText("0 / 6");
  await expect(page.locator("#guide-instruction")).toContainText(
    "Walk with A / D",
  );
  await page.keyboard.down("d");
  await page.waitForTimeout(350);
  await page.keyboard.up("d");
  await page.keyboard.down("w");
  await page.waitForTimeout(200);
  await page.keyboard.up("w");
  await page.waitForTimeout(600);
  await expect(page.locator("#guide-count")).toHaveText("1 / 6");
  await expect(page.locator("#guide-instruction")).toContainText(
    "Hold left click",
  );
  await aim(page, 21, 23);
  await aim(page, 21, 23);
  await page.waitForTimeout(1100);
  await expect(page.locator("#guide-count")).toHaveText("2 / 6");
  await page.keyboard.press("e");
  await expect(page.locator("#guide-count")).toHaveText("3 / 6");
  await page.keyboard.press("e");
  await page.waitForTimeout(350);
  await aim(page, 22, 22, "right");
  await expect(page.locator("#guide-count")).toHaveText("4 / 6");
  await page.keyboard.press("3");
  await aim(page, 23, 22, "right");
  await expect(page.locator("#guide-count")).toHaveText("5 / 6");
  await expect(page.locator("#guide-instruction")).toContainText(
    "Wait 45 seconds",
  );
  await page.evaluate(() => {
    const s = window.__mosslight.scene.getScene("Game");
    s.seeds.trees.find((t) => t.x === 23)!.plantedAt -= 46000;
  });
  await aim(page, 23, 22);
  await expect(page.locator(".field-notes")).toBeHidden();
  await expect(page.locator("#guide-complete")).toContainText(
    "Congratulations!",
  );
  expect(await page.locator("body").getAttribute("data-celebrations")).toBe(
    "1",
  );
  await page.screenshot({ path: "test-results/guide-complete.png" });
  await page.waitForTimeout(650);
  await page.reload();
  await page.waitForFunction(
    () => !!window.__mosslight?.scene.getScene("Game")?.ui,
  );
  await expect(page.locator(".field-notes")).toBeHidden();
  await expect(page.locator("#guide-complete")).toHaveCount(0);
});
