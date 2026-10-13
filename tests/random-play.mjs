// Clicks around the menus and plays randomly for a while, and reports any
// error the game throws. It finds crashes nobody thought to write a check for.
import { launch, openGame, testCopy, PHONE, DESKTOP } from './helpers.mjs';

// Buttons that open file pickers or downloads would stall the test.
const SKIP = /import|export|download|restore/i;
const KEYS = ['Space', 'ArrowLeft', 'ArrowRight', 'KeyE', 'KeyQ', 'KeyR', 'KeyF', 'Escape', 'KeyW', 'KeyA', 'KeyD', 'KeyS', 'Enter'];

async function play(browser, url, device, label, seconds, seed) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const g = await openGame(browser, url, device);
  // unlock the dev buttons so they get exercised too
  await g.run("localStorage.setItem('parry-keep-dev-unlocked','1'); openTitle();");
  const end = Date.now() + seconds * 1000, screens = new Set(), trail = [];
  let firstError = null;
  g.page.on('pageerror', e => { if (!firstError) firstError = { error: e.message, lastSteps: trail.slice(-12) }; });
  while (Date.now() < end) {
    const screen = await g.page.evaluate(() => [...document.querySelectorAll('section.screen')].filter(x => !x.hidden).map(x => x.id).join(',') || 'game').catch(() => 'gone');
    screens.add(screen); trail.push(screen);
    if (screen === 'game' || rnd() < 0.35) {
      if (rnd() < 0.6) {
        const box = await g.page.locator('canvas').first().boundingBox().catch(() => null);
        if (box) {
          const x = box.x + box.width * (0.2 + 0.6 * rnd()), y = box.y + box.height * (0.3 + 0.5 * rnd());
          trail.push('tap');
          await (device.hasTouch ? g.page.touchscreen.tap(x, y) : g.page.mouse.click(x, y)).catch(() => {});
        }
      } else {
        const key = KEYS[Math.floor(rnd() * KEYS.length)];
        trail.push('key ' + key);
        await g.page.keyboard.press(key).catch(() => {});
      }
      await g.page.waitForTimeout(40 + rnd() * 120);
    } else {
      const buttons = [];
      for (const b of await g.page.$$('button:visible:not([disabled]), .list > *:visible')) {
        const name = ((await b.getAttribute('id').catch(() => '')) || '') + ' ' + ((await b.textContent().catch(() => '')) || '');
        if (!SKIP.test(name)) buttons.push([b, name.trim().slice(0, 40)]);
      }
      if (buttons.length) {
        const [b, name] = buttons[Math.floor(rnd() * buttons.length)];
        trail.push('click ' + name);
        await b.click({ timeout: 800 }).catch(() => {});
      }
      await g.page.waitForTimeout(80 + rnd() * 200);
    }
  }
  await g.context.close();
  const counts = {};
  for (const e of g.errors) counts[e] = (counts[e] || 0) + 1;
  return { label, screens: [...screens], errors: counts, firstError };
}

export async function randomPlay(seconds = 60) {
  const url = testCopy();
  const browser = await launch();
  const out = [
    await play(browser, url, DESKTOP, 'desktop', seconds, 11),
    await play(browser, url, PHONE, 'phone', seconds, 23),
  ];
  await browser.close();
  return out;
}
