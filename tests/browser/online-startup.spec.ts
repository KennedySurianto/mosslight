import { expect, test } from "@playwright/test";

test.skip(!process.env.MOSSLIGHT_ONLINE_QA, "Run with the production Supabase public configuration");
const base = process.env.MOSSLIGHT_QA_URL || "http://127.0.0.1:4175/";

test("a confirmed full database opens the separate solo save", async ({ page }) => {
  await page.route("**/functions/v1/mosslight-auth", async route => {
    if (route.request().postDataJSON().action === "status")
      await route.fulfill({ json: { databaseFull: true } });
    else await route.continue();
  });
  await page.goto(base);
  await expect(page.locator("#online-app")).toBeHidden();
  await expect(page.locator(".world-label")).toContainText("SOLO WORLD · ONLINE STORAGE FULL");
  await expect(page.locator("#change-username, #change-password, #menu-logout")).toHaveCount(0);
});

test("an ordinary service error does not switch to solo", async ({ page }) => {
  await page.route("**/functions/v1/mosslight-auth", async route => {
    await route.fulfill({ status: 503, json: { error: "Temporary failure" } });
  });
  await page.goto(base);
  await expect(page.getByRole("heading", { name: "Could not reach your world." })).toBeVisible();
  await expect(page.locator(".world-label")).toHaveCount(0);
});

test("healthy online startup waits for login without creating a solo world", async ({ page }) => {
  await page.route("**/functions/v1/mosslight-auth", async route => {
    if (route.request().postDataJSON().action === "status")
      await route.fulfill({ json: { databaseFull: false } });
    else await route.continue();
  });
  await page.goto(base);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.locator(".world-label")).toHaveCount(0);
  await page.getByRole("button", { name: "New here? Register" }).click();
  await expect(page.getByRole("heading", { name: "Plant a new beginning" })).toBeVisible();
});

test("a confirmed capacity error during login switches to solo", async ({ page }) => {
  await page.route("**/functions/v1/mosslight-auth", async route => {
    const action = route.request().postDataJSON().action;
    await route.fulfill(action === "status"
      ? { json: { databaseFull: false } }
      : { status: 507, json: { error: "Database storage limit reached", code: "DATABASE_FULL" } });
  });
  await page.goto(base);
  await page.locator('input[name="username"]').fill("forest_tester");
  await page.locator('input[name="password"]').fill("testing-password-123");
  await page.getByRole("button", { name: "Enter the meadow" }).click();
  await expect(page.locator(".world-label")).toContainText("SOLO WORLD · ONLINE STORAGE FULL");
  await expect(page.locator("#online-app")).toBeHidden();
});
