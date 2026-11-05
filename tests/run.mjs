// npm test                  bug checks, every file in tests/checks/, then 60 seconds of random play per screen size
// npm test -- 10            same, with 10 seconds of random play
// npm test -- --only=music  just the files in tests/checks/ whose names contain "music" (no random play)
import { readdirSync } from 'node:fs';
import { regressions } from './regressions.mjs';
import { randomPlay } from './random-play.mjs';
import { runChecks } from './helpers.mjs';

const args = process.argv.slice(2);
const seconds = Number(args.find(a => /^\d+$/.test(a))) || 60;
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7);
let failed = 0;

const report = results => {
  for (const r of results) {
    console.log(`  ${r.ok ? 'pass' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n        ' + r.why}`);
    if (!r.ok) failed++;
  }
};

if (!only) { console.log('Bug checks'); report(await regressions()); }

const files = readdirSync(new URL('./checks/', import.meta.url)).filter(f => f.endsWith('.mjs') && f.includes(only)).sort();
for (const f of files) {
  console.log(`\nChecks: ${f}`);
  report(await runChecks((await import('./checks/' + f)).default));
}

if (!only) {
  console.log(`\nRandom play (${seconds}s per screen size)`);
  for (const r of await randomPlay(seconds)) {
    const errors = Object.entries(r.errors);
    console.log(`  ${errors.length ? 'FAIL' : 'pass'}  ${r.label}: visited ${r.screens.length} screens`);
    for (const [msg, n] of errors) console.log(`        ${n}x ${msg}`);
    if (r.firstError) console.log('        steps before the first error:\n          ' + r.firstError.lastSteps.join('\n          '));
    if (errors.length) failed++;
  }
}

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
