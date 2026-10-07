import { test, expect } from '@playwright/test';

// Run against disposable, mutually accepted QA accounts; never use a player's account.
test('shared avatars, chat, cracks, naming, directory, and departure', async ({ browser }) => {
  test.skip(!process.env.MOSSLIGHT_QA_A || !process.env.MOSSLIGHT_QA_B, 'Requires disposable QA accounts');
  const a = await browser.newContext(), b = await browser.newContext();
  const pa = await a.newPage(), pb = await b.newPage();
  const errors: string[]=[];
  for(const p of [pa,pb]) p.on('pageerror',e=>{errors.push(e.message); console.error('Browser error:',e.message);});
  const base=process.env.MOSSLIGHT_QA_URL || 'http://127.0.0.1:4175/';
  try {
    for(const [p,name] of [[pa,process.env.MOSSLIGHT_QA_A!],[pb,process.env.MOSSLIGHT_QA_B!]] as const) {
      await p.goto(base);
      await p.locator('input[name=username]').fill(name);
      await p.locator('input[name=password]').fill(process.env.MOSSLIGHT_QA_PASSWORD!);
      await p.getByRole('button',{name:'Enter the meadow'}).click();
      await expect(p.getByRole('heading',{name:`Hello, ${name}.`})).toBeVisible();
    }
    await pa.locator('#visit-own').click();
    await expect(pa.locator('#online-app')).toBeHidden();
    await pb.locator('#player-search').fill(process.env.MOSSLIGHT_QA_A!);
    const friend=pb.locator('.player-card').filter({has:pb.locator(`summary b`,{hasText:process.env.MOSSLIGHT_QA_A!})});
    await friend.locator('summary').click(); await friend.getByRole('button',{name:'Visit ↗'}).click();
    await expect(pb.locator('#online-app')).toBeHidden();
    await expect.poll(()=>pa.evaluate(()=> (window as any).__mosslight.scene.getScene('Game').peers.size),{timeout:20000}).toBe(1);
    await expect.poll(()=>pb.evaluate(()=> (window as any).__mosslight.scene.getScene('Game').peers.size),{timeout:20000}).toBe(1);
    await expect.poll(()=>pa.evaluate(()=> (window as any).__mosslight.scene.getScene('Game').labels.size)).toBe(2);
    const before=await pa.locator('#coordinates').innerText();
    await pa.getByRole('button',{name:'Open world chat'}).click();
    await pa.locator('#chat-message').pressSequentially('wad hello meadow');
    await expect(pa.locator('#chat-message')).toHaveValue('wad hello meadow');
    expect(await pa.locator('#coordinates').innerText()).toBe(before);
    await pa.locator('#chat-message').press('Enter');
    await expect(pa.locator('#world-chat')).toBeHidden();
    await expect.poll(()=>pb.evaluate(()=>Array.from((window as any).__mosslight.scene.getScene('Game').bubbles.values()).map((b:any)=>b.text.text).join('|'))).toContain('wad hello meadow');
    await pa.screenshot({path:'test-results/social-chat.png'});
    await expect.poll(()=>pb.evaluate(()=> (window as any).__mosslight.scene.getScene('Game').bubbles.size),{timeout:11000}).toBe(0);
    await pa.locator('#world-name').click();
    await pa.locator('#world-name-input').fill('QA Willow Garden'); await pa.locator('#world-name-input').press('Enter');
    await expect(pa.locator('#world-name')).toHaveText('QA Willow Garden');
    await expect(pb.locator('#world-name')).toHaveText('QA Willow Garden');
    expect(await pb.locator('button#world-name').count()).toBe(0);
    // Move away from spawn with real keyboard input, then verify modal close preserves that position.
    await pa.keyboard.down('d'); await pa.waitForTimeout(350); await pa.keyboard.up('d');
    const moved=await pa.locator('#coordinates').innerText(); expect(moved).not.toBe(before);
    await pa.getByRole('button',{name:'Worlds ↗'}).click();
    await pa.locator('#player-search').pressSequentially('wad');
    expect(await pa.locator('#coordinates').innerText()).toBe(moved);
    await pa.getByRole('button',{name:'Close Worlds'}).click();
    expect(await pa.locator('#coordinates').innerText()).toBe(moved);
    // Hit through the game interaction path and inspect the rendered damage state.
    await pa.evaluate(()=>{const s=(window as any).__mosslight.scene.getScene('Game');s.interact(false,s.time.now,false,{x:21,y:23});});
    await expect.poll(()=>pa.evaluate(()=> (window as any).__mosslight.scene.getScene('Game').blocks.damage.get('21,23'))).toBe(1);
    await expect.poll(()=>pb.evaluate(()=> (window as any).__mosslight.scene.getScene('Game').blocks.damage.get('21,23'))).toBe(1);
    await pb.getByRole('button',{name:'Worlds ↗'}).click(); await pb.locator('#visit-own').click();
    await expect.poll(()=>pa.evaluate(()=> (window as any).__mosslight.scene.getScene('Game').peers.size),{timeout:10000}).toBe(0);
    // A delayed move must not recreate the departed avatar.
    await pa.evaluate(()=>{const s=(window as any).__mosslight.scene.getScene('Game');s.updatePeer('departed-user',624,736,1);});
    expect(await pa.evaluate(()=> (window as any).__mosslight.scene.getScene('Game').peers.size)).toBe(0);
    await pa.getByRole('button',{name:'Worlds ↗'}).click();
    await expect(pa.locator('.player-location').first()).toContainText('In their world');
    await pa.screenshot({path:'test-results/social-directory.png'});
    // Exercise a full directory page without creating 21 real accounts.
    const searches: string[]=[];
    await pa.route('**/functions/v1/mosslight-game', async route=>{
      const body=route.request().postDataJSON();
      if(body.type!=='players'||!body.query.startsWith('zz')) return route.continue();
      searches.push(body.query);
      const count=body.after?1:20,start=body.after?20:0;
      await route.fulfill({json:{players:Array.from({length:count},(_,i)=>({userId:`00000000-0000-0000-0000-${String(start+i).padStart(12,'0')}`,username:`zzplayer${String(start+i).padStart(2,'0')}`,status:'none',incoming:false,world:null})),next:body.after?null:'zzplayer19'}});
    });
    await pa.locator('#player-search').pressSequentially('zzplayer',{delay:30});
    await expect(pa.locator('#player-directory .player-card')).toHaveCount(20);
    expect(searches).toEqual(['zzplayer']);
    await pa.locator('.directory-more').scrollIntoViewIfNeeded();
    await expect(pa.locator('#player-directory .player-card')).toHaveCount(21);
    await expect(pa.locator('.directory-more')).toBeHidden();
    expect(errors).toEqual([]);
  } finally {
    if(errors.length) console.error(errors);
    await a.close(); await b.close();
  }
});
