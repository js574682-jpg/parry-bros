// The opening cutscene (docs/STORY.md, "The opening"): it plays once when a new save file starts,
// leads into the usual first training, can be skipped once seen, and can be watched again from the Guide.
const SMALL = { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

// The frame loop catches drawing errors and logs them, so listen to the console as well as page errors.
function watchErrors(g) {
  const all = [];
  g.page.on('console', m => { if (m.type() === 'error') all.push(m.text()); });
  return () => all.concat(g.errors);
}
const visibleScreens = g => g.page.evaluate(() => [...document.querySelectorAll('section.screen')].filter(s => !s.hidden).map(s => s.id).join(','));
// Taps the canvas once per shot (each shot ignores taps for its first 0.6s, so jump past that first).
async function tapThrough(g, device) {
  const box = await g.page.locator('#stage').boundingBox();
  for (let i = 0; i < 20 && await g.run("mode === 'cutscene'"); i++) {
    await g.run('cutscene.t = Math.max(cutscene.t, .8); 1');
    if (device.hasTouch) await g.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    else await g.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await g.page.waitForTimeout(40);
  }
}
// Play, then "New game" in file n (1-3), then Normal: the same taps a player makes.
async function newGame(g, n) {
  await g.page.click('#btn-start');
  await g.page.locator('#save-list .savecard').nth(n - 1).locator('.savemain').click();
  await g.page.click('#btn-diff-normal');
  await g.page.waitForTimeout(150);
}

export default async ({ check, expect, fresh, PHONE, DESKTOP }) => {
  await check('A new game plays the opening before anything else, then the usual first training', async () => {
    const g = await fresh(PHONE), errors = watchErrors(g);
    await newGame(g, 1);
    expect(await g.run("mode + ':' + (cutscene && cutscene.id)"), 'cutscene:opening', 'playing after picking a difficulty');
    expect(await g.run('run === null && !meta.tutDone && !meta.runs'), true, 'no training or climb has started yet');
    expect(await visibleScreens(g), '', 'no menu over the cutscene');
    expect(await g.run("$('cs-skip').hidden"), true, 'no Skip button the first time');
    await g.page.waitForTimeout(700);                   // let it run for real for a moment
    expect(await g.run('cutscene.i === 0 && cutscene.t > .3'), true, 'the first shot is running');
    await tapThrough(g, PHONE);
    expect(await g.run("mode === 'play' && !!run && run.training && run.tut.from"), 'first', 'ends in the first-time training');
    expect(await g.run("meta.seen['cutscene:opening'] === true"), true, 'marked as seen on this file');
    expect(await g.run("localStorage.getItem('parry-keep-seen-opening')"), '1', 'marked as seen on this device');
    expect(await g.run("JSON.parse(localStorage.getItem('parry-keep-save-v1')).seen['cutscene:opening']"), true, 'saved to the file');
    await g.run('finishTraining(); 1');                 // the rest of the first-time flow is unchanged
    expect(await g.run("mode === 'play' && !!run && !run.training && run.floor"), 1, 'then the first climb');
    expect(errors().length, 0, 'errors: ' + errors().join(' | '));
    await g.context.close();
  });

  await check('Once seen, a new file plays it again but it can be skipped; a file that saw it never replays it', async () => {
    const g = await fresh(DESKTOP), errors = watchErrors(g);
    await newGame(g, 1);
    await tapThrough(g, DESKTOP);
    expect(await g.run("mode === 'play' && run.tut.from"), 'first', 'file 1 reached its training');
    await g.run('run = null; openLobby(false); 1');     // back to file 1 before its training is done: no second showing
    expect(await g.run("mode === 'play' && !!run.tut"), true, 'file 1 goes straight back to training');
    await g.run('run = null; openTitle(); 1');
    await newGame(g, 2);
    expect(await g.run("mode + ':' + cutscene.id + ':' + slot"), 'cutscene:opening:1', 'file 2 starts with the opening');
    expect(await g.run("$('cs-skip').hidden"), false, 'Skip shows: this device has seen it');
    await g.page.click('#cs-skip');
    expect(await g.run("mode === 'play' && run.tut.from"), 'first', 'skipping goes on to the training');
    expect(await g.run("meta.seen['cutscene:opening'] === true"), true, 'file 2 counts it as seen');
    expect(errors().length, 0, 'errors: ' + errors().join(' | '));
    await g.context.close();
  });

  await check('Left alone, it runs 35-60 seconds and then carries on by itself', async () => {
    const g = await fresh(PHONE), errors = watchErrors(g);
    await newGame(g, 1);
    const total = await g.run('CUTSCENES.opening.shots.reduce((a, s) => a + s.dur, 0)');
    expect(total >= 35 && total <= 60, true, 'length ' + total + 's');
    const steps = await g.run("let n = 0; while (mode === 'cutscene' && n < 5000) { updateCutscene(.05); n++; } n");
    expect(Math.abs(steps * .05 - total) < 1, true, 'ended after ' + (steps * .05).toFixed(1) + 's of cutscene time');
    expect(await g.run("mode === 'play' && run.tut.from"), 'first', 'then the first training');
    expect(errors().length, 0, 'errors: ' + errors().join(' | '));
    await g.context.close();
  });

  await check('Existing files, dev mode and files that already saw it skip the opening', async () => {
    const g = await fresh(PHONE), errors = watchErrors(g);
    await g.run("localStorage.setItem('parry-keep-save-v1', JSON.stringify(Object.assign(freshMeta(), { runs:3, tutDone:true, look:{ skin:1, style:0, hair:2, outfit:3 } }))); 1");
    await g.run('useSlot(0); openLobby(false); 1');
    expect(await g.run('mode'), 'lobby', 'an old file opens the lobby');
    await g.run("localStorage.setItem('parry-keep-save-v1-f2', JSON.stringify(Object.assign(freshMeta(), { seen:{ 'cutscene:opening':true } }))); 1");
    await g.run('useSlot(1); openLobby(false); 1');
    expect(await g.run("mode === 'play' && run.tut.from"), 'first', 'a new file that already saw it goes to training');
    await g.run("run = null; switchProfile('dev'); openLobby(false); 1");
    expect(await g.run('mode'), 'lobby', 'dev mode opens the lobby');
    expect(errors().length, 0, 'errors: ' + errors().join(' | '));
    await g.context.close();
  });

  await check('The Guide can replay the opening, then returns to the Guide', async () => {
    const g = await fresh(PHONE), errors = watchErrors(g);
    await g.page.click('#btn-howto');
    expect(await g.run("$('btn-guide-opening').hidden"), false, 'shown on the first page');
    await g.run('guidePage = 2; renderGuide(); 1');
    expect(await g.run("$('btn-guide-opening').hidden"), true, 'not on later pages');
    await g.run('guidePage = 0; renderGuide(); 1');
    await g.page.click('#btn-guide-opening');
    expect(await g.run("mode + ':' + cutscene.id"), 'cutscene:opening', 'plays');
    expect(await g.run("$('cs-skip').hidden"), true, 'not skippable on a device that never saw it');
    await tapThrough(g, PHONE);
    expect(await g.run("mode + ':' + guidePage + ':' + guideFrom"), 'guide:0:title', 'back on the Guide');
    expect(await visibleScreens(g), 's-guide', 'the Guide is showing');
    expect(await g.run("localStorage.getItem('parry-keep-save-v1')"), null, 'watching from the title makes no save file');
    await g.page.click('#btn-guide-opening');
    expect(await g.run("$('cs-skip').hidden"), false, 'skippable the second time');
    await g.page.click('#cs-skip');
    expect(await g.run("mode + ':' + guidePage"), 'guide:0', 'Skip returns to the Guide');
    await g.page.click('#btn-guide-next');
    expect(await g.run('guidePage'), 1, 'the Guide still works');
    expect(errors().length, 0, 'errors: ' + errors().join(' | '));
    await g.context.close();
  });

  for (const [label, device] of [['phone', PHONE], ['desktop', DESKTOP], ['small phone', SMALL]]) {
    await check(`Every shot draws without errors (${label})`, async () => {
      const g = await fresh(device), errors = watchErrors(g);
      const bad = await g.run(`(() => {
        playOpening(() => openTitle()); const out = [];
        CUTSCENES.opening.shots.forEach((s, i) => {
          for (const f of [.05, .3, .5, .7, .95]) {
            cutscene.i = i; cutscene.t = s.dur * f;
            try { drawCutscene(ctx, 50 + i + f); } catch (e) { out.push(i + '@' + f + ': ' + e.message); continue; }
            const d = OP.cv.getContext('2d').getImageData(0, 0, OP.w, OP.h).data, seen = new Set();
            for (let p = 0; p < d.length; p += 4 * 7) seen.add(d[p] << 16 | d[p + 1] << 8 | d[p + 2]);
            if (f > .2 && f < .8 && seen.size < 6) out.push(i + '@' + f + ': looks blank (' + seen.size + ' colours)');
          }
        });
        return out;
      })()`);
      expect(bad.length, 0, bad.join(' | '));
      for (let i = 0; i < 12; i++) {                    // and in the real frame loop, a moment of each shot
        await g.run(`cutscene.i = ${i}; cutscene.t = .2; 1`);
        await g.page.waitForTimeout(120);
      }
      await g.page.setViewportSize({ width: 500, height: 700 });   // a resize mid-cutscene
      await g.page.waitForTimeout(200);
      expect(await g.run("mode + ':' + cutscene.id"), 'cutscene:opening', 'still playing');
      expect(await g.run('OP.kingErr'), false, 'the King drew');
      expect(errors().length, 0, 'errors: ' + errors().join(' | '));
      await g.context.close();
    });
  }

  await check('Captions and the Skip button fit a 360px-wide phone', async () => {
    const g = await fresh(SMALL), errors = watchErrors(g);
    await g.run("localStorage.setItem('parry-keep-seen-opening', '1'); playOpening(() => openTitle()); 1");
    const bad = await g.run(`(() => {
      const out = [];
      CUTSCENES.opening.shots.forEach((s, i) => {
        if (!s.cap) return;
        cutscene.i = i; cutscene.t = s.dur - .6;
        const lay = drawOpeningCaption(ctx, s);
        if (!lay) { out.push(i + ': no layout'); return; }
        if (lay.widths.some(w => w > W - 20 / ZOOM)) out.push(i + ': too wide');
        if (lay.lines.length * lay.lh > lay.bar) out.push(i + ': too tall for the bar');
        if (lay.fs * ZOOM < 11) out.push(i + ': text too small');
      });
      return out;
    })()`);
    expect(bad.length, 0, bad.join(' | '));
    const skip = await g.page.locator('#cs-skip').boundingBox();
    expect(!!skip && skip.x >= 0 && skip.x + skip.width <= 360 && skip.y >= 0 && skip.height >= 36, true, 'Skip is on screen and big enough to tap: ' + JSON.stringify(skip));
    expect(errors().length, 0, 'errors: ' + errors().join(' | '));
    await g.context.close();
  });
};
