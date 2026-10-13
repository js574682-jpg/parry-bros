// Shared setup for the browser tests: opens the game in headless Chromium and
// gives tests a way to run code inside the game's private scope.
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The game's script is wrapped in (() => { ... })(), so tests can't reach its
// variables. This writes a copy of index.html with one extra line just before
// the wrapper closes, exposing `__eval` so a test can run code in that scope.
// The real index.html is never changed.
export function testCopy() {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const end = html.lastIndexOf('})();\n</script>');
  if (end < 0) throw new Error('Could not find the end of the game script in index.html');
  const out = join(mkdtempSync(join(tmpdir(), 'parry-test-')), 'index.html');
  writeFileSync(out, html.slice(0, end) + 'window.__eval = s => eval(s);\n' + html.slice(end));
  return pathToFileURL(out).href;
}

export const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
export const DESKTOP = { viewport: { width: 1366, height: 800 } };

// Set CHROMIUM_PATH to use an already-installed Chromium instead of Playwright's own.
export function launch() {
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}

// Opens a fresh game page (empty save storage) and collects any errors it throws.
export async function openGame(browser, url, device = PHONE) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(1000);
  const run = code => page.evaluate(c => window.__eval(c), code);
  return { context, page, errors, run };
}
