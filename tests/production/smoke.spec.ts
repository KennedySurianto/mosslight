import { test, expect } from "@playwright/test";
test("built static game plays without remote requests, sockets, console errors, or test hooks", async ({
  page,
}) => {
  const errors: string[] = [],
    external: string[] = [],
    sockets: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://localhost:4173/") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  page.on("websocket", (s) => sockets.push(s.url()));
  await page.goto("/");
  await expect(page.locator("#guide-instruction")).toContainText(
    "Walk with A / D",
  );
  await expect(page.locator("#tutorial")).toBeHidden();
  expect(await page.evaluate(() => "__mosslight" in window)).toBe(false);
  const initial = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mosslight_save_v1")!),
  );
  expect(initial.player.x).toBe(624);
  await page.mouse.move(1850, 1000);
  await page.screenshot({ path: "test-results/mosslight-production-1920.png" });
  const frameTime = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const times: number[] = [];
        let previous = performance.now();
        const frame = (now: number) => {
          times.push(now - previous);
          previous = now;
          if (times.length < 120) requestAnimationFrame(frame);
          else resolve(times.sort((a, b) => a - b)[60]);
        };
        requestAnimationFrame(frame);
      }),
  );
  console.log(`Production median animation frame: ${frameTime.toFixed(1)} ms`);
  await page.keyboard.down("d");
  await page.waitForTimeout(500);
  await page.keyboard.up("d");
  await page.keyboard.press("Escape");
  const current = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mosslight_save_v1")!),
  );
  expect(current.player.x).toBeGreaterThan(initial.player.x + 50);
  await page.keyboard.press("Escape");
  await page.locator("#open-shop").click();
  await expect(page.locator("#shop-overlay")).toBeVisible();
  await expect(page.locator(".shop-card")).toHaveCount(16);
  await expect(page.locator('[data-buy="pickaxe"]')).toBeDisabled();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  expect(sockets).toEqual([]);
});
