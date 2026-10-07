import { expect, test } from '@playwright/test';

test('world directory shows the saved build grant and updates its switch', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { PlayerDirectory } = await import('../../src/online/PlayerDirectory');
    const root = document.createElement('section');
    root.id = 'qa-directory';
    root.style.cssText = 'position:fixed;z-index:999;inset:10px auto auto 10px;width:500px;background:#fff;';
    document.body.append(root);
    let canBuild = false;
    const actions: string[] = [];
    (window as any).__socialActions = actions;
    const client = {
      snapshot: { profile: { user_id: 'owner' }, worlds: [{ id: 'world', ownerId: 'owner' }] },
      players: async () => ({ players: [{ userId: 'friend', username: 'willow', status: 'accepted', incoming: false, canBuild, world: { id: 'friend-world', name: 'Willow Grove' } }], next: null }),
      locations: async () => ({ locations: [] }),
      social: async (action: string) => { actions.push(action); canBuild = action === 'builder'; },
    };
    new PlayerDirectory(root, client as any, () => {});
  });
  const card = page.locator('#qa-directory .player-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('button', { name: 'Visit ↗' })).toBeVisible();
  const toggle = card.getByRole('checkbox', { name: 'Allow willow to build in my world' });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
  expect(await page.evaluate(() => (window as any).__socialActions)).toContain('builder');
  await toggle.uncheck();
  expect(await page.evaluate(() => (window as any).__socialActions)).toContain('viewer');
  await expect(card.getByRole('button', { name: 'Remove willow from friends' })).toBeVisible();
});
