import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.skip(!process.env.MOSSLIGHT_ACCOUNT_QA, "Requires a disposable QA account");
const qa = process.env.MOSSLIGHT_ACCOUNT_QA
  ? JSON.parse(readFileSync(process.env.MOSSLIGHT_ACCOUNT_QA, "utf8")) as { username: string; password: string }
  : null;

test("online menu updates account details after checking the old password", async ({ page }) => {
  const base = process.env.MOSSLIGHT_QA_URL || "http://127.0.0.1:4175/";
  const name = `${qa!.username}_x`;
  const newPassword = `${qa!.password}x`;
  await page.goto(base);
  await page.locator('input[name="username"]').fill(qa!.username);
  await page.locator('input[name="password"]').fill(qa!.password);
  await page.getByRole("button", { name: "Enter the meadow" }).click();
  await expect(page.getByRole("heading", { name: `Hello, ${qa!.username}.` })).toBeVisible({ timeout: 30000 });
  await page.locator("#visit-own").click();
  await expect(page.locator("#online-app")).toBeHidden({ timeout: 20000 });

  await page.locator("#settings").click();
  await expect(page.locator("#change-username, #change-password, #menu-logout")).toHaveCount(3);
  await page.locator("#change-username").click();
  const before = await page.locator("#coordinates").innerText();
  await page.locator('#account-form input[name="username"]').fill(name);
  await page.locator('#account-form input[name="username"]').pressSequentially("wad");
  expect(await page.locator("#coordinates").innerText()).toBe(before);
  await page.locator('#account-form input[name="username"]').fill(name);
  await page.locator('#account-form button[type="submit"]').click();
  await expect(page.locator("#online-app")).toBeHidden({ timeout: 20000 });
  await expect.poll(() => page.evaluate(() => window.__mosslight.scene.getScene("Game").online?.snapshot?.profile.username)).toBe(name);

  await page.locator("#settings").click();
  await page.locator("#change-password").click();
  await page.locator('#account-form input[name="oldPassword"]').fill("wrong-password");
  await page.locator('#account-form input[name="newPassword"]').fill(newPassword);
  await page.locator('#account-form input[name="confirmPassword"]').fill(newPassword);
  await page.locator('#account-form button[type="submit"]').click();
  await expect(page.locator(".online-error")).toContainText("Old password is incorrect", { timeout: 20000 });
  await page.locator('#account-form input[name="oldPassword"]').fill(qa!.password);
  await page.locator('#account-form button[type="submit"]').click();
  await expect(page.locator("#online-app")).toBeHidden({ timeout: 20000 });

  await page.locator("#settings").click();
  await page.locator("#menu-logout").click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible({ timeout: 20000 });
  await page.locator('input[name="username"]').fill(name);
  await page.locator('input[name="password"]').fill(qa!.password);
  await page.getByRole("button", { name: "Enter the meadow" }).click();
  await expect(page.locator(".online-error")).toContainText("Invalid username or password", { timeout: 20000 });
  await page.locator('input[name="password"]').fill(newPassword);
  await page.getByRole("button", { name: "Enter the meadow" }).click();
  await expect(page.getByRole("heading", { name: `Hello, ${name}.` })).toBeVisible({ timeout: 30000 });
});
