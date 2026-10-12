// npm test           runs the bug checks and 60 seconds of random play per screen size
// npm test -- 10     same, with 10 seconds of random play
import { regressions } from './regressions.mjs';
import { randomPlay } from './random-play.mjs';

const seconds = Number(process.argv[2]) || 60;
let failed = 0;

console.log('Bug checks');
for (const r of await regressions()) {
  console.log(`  ${r.ok ? 'pass' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n        ' + r.why}`);
  if (!r.ok) failed++;
}

console.log(`\nRandom play (${seconds}s per screen size)`);
for (const r of await randomPlay(seconds)) {
  const errors = Object.entries(r.errors);
  console.log(`  ${errors.length ? 'FAIL' : 'pass'}  ${r.label}: visited ${r.screens.length} screens`);
  for (const [msg, n] of errors) console.log(`        ${n}x ${msg}`);
  if (r.firstError) console.log('        steps before the first error:\n          ' + r.firstError.lastSteps.join('\n          '));
  if (errors.length) failed++;
}

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
