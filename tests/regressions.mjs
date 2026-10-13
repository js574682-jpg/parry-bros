// One check per bug that has been fixed, so it can't quietly come back.
import { launch, openGame, testCopy, PHONE, DESKTOP } from './helpers.mjs';

const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, why: e.message }); }
}
function expect(actual, wanted, what) {
  if (actual !== wanted) throw new Error(`${what}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`);
}

export async function regressions() {
  const url = testCopy();
  const browser = await launch();
  const fresh = device => openGame(browser, url, device);

  await check('Dev mode buttons are hidden until the logo is tapped 5 times', async () => {
    const g = await fresh(DESKTOP);
    expect(await g.page.isVisible('#btn-dev'), false, 'title dev button before unlock');
    await g.run("useSlot(0); noFile=false; meta.tutDone=true; beginRun(); setPlay(); pause();");
    expect(await g.page.isVisible('#btn-dev2'), false, 'pause dev button before unlock');
    await g.run("resume(); openTitle();");
    for (let i = 0; i < 5; i++) await g.page.click('#s-title .logo');
    expect(await g.page.isVisible('#btn-dev'), true, 'title dev button after 5 taps');
    expect(g.errors.length, 0, 'page errors: ' + g.errors.join(' | '));
    await g.context.close();
  });

  await check('Switching dev mode from the pause screen keeps the climb and goes to the title', async () => {
    const g = await fresh(DESKTOP);
    await g.run("localStorage.setItem(DEV_UNLOCK_KEY,'1'); useSlot(0); noFile=false; meta.tutDone=true; beginRun(); run.floor=4; startFloor(); setPlay(); pause();");
    await g.page.click('#btn-dev2');
    expect(await g.run('mode'), 'title', 'mode after dev on');
    await g.page.keyboard.press('Escape'); await g.page.keyboard.press('q');
    await g.page.click('#btn-dev');
    expect(await g.run('meta.dev'), false, 'dev mode after switching back');
    expect(await g.run('hasSavedRun()'), true, 'real climb still saved');
    await g.run('continueCurrentRun()');
    expect(await g.run('run && run.floor'), 4, 'continued floor');
    expect(g.errors.length, 0, 'page errors: ' + g.errors.join(' | '));
    await g.context.close();
  });

  await check('Dead Eye and Cleave do not carry into the next floor', async () => {
    const g = await fresh();
    await g.run("useSlot(0); meta.tutDone=true; beginRun(); setPlay(); run.deadeye={t:3,max:3,marks:['boss']}; run.cleave={t:1,max:5,left:5,trails:[]}; run.floor++; startFloor();");
    expect(await g.run('run.deadeye'), null, 'deadeye');
    expect(await g.run('run.cleave'), null, 'cleave');
    await g.page.waitForTimeout(300);
    expect(g.errors.length, 0, 'page errors: ' + g.errors.join(' | '));
    await g.context.close();
  });

  await check('Restoring a backup during practice ends practice; practice settings stick', async () => {
    const g = await fresh();
    await g.run("useSlot(0); practiceSession={meta:JSON.parse(JSON.stringify(meta)),config:{}}; pendingSaveImport=normalizeMeta(JSON.parse(JSON.stringify(meta))); saveImportSlot=0; confirmSaveImport();");
    expect(await g.run('practiceSession'), null, 'practice session after restore');
    await g.run("practiceSession={meta:JSON.parse(JSON.stringify(meta)),config:{}}; meta=normalizeMeta(JSON.parse(JSON.stringify(meta))); meta.screenShake='off'; restorePractice();");
    expect(await g.run('meta.screenShake'), 'off', 'screen shake after practice');
    await g.context.close();
  });

  await check('Save files cannot name inherited keys like "toString"', async () => {
    const g = await fresh();
    await g.run('useSlot(0)');
    const fixed = await g.run("(() => { const m=JSON.parse(JSON.stringify(meta)); m.cls='toString'; m.classes={bro:{xp:0}}; m.diff='valueOf'; m.squad=[]; m.superEquip='toString'; prepareSaveImport(JSON.stringify({game:'Parry Bros',format:1,meta:m})); confirmSaveImport(); buildSprites(); return meta.cls+'/'+meta.diff+'/'+meta.superEquip; })()");
    expect(fixed, 'bro/normal/warden', 'class/difficulty/super bro after import');
    const squad = await g.run("(() => { const m=JSON.parse(JSON.stringify(meta)); m.squad=['toString']; try { prepareSaveImport(JSON.stringify({game:'Parry Bros',format:1,meta:m})); return 'accepted'; } catch(e) { return 'rejected'; } })()");
    expect(squad, 'rejected', 'squad naming toString');
    expect(g.errors.length, 0, 'page errors: ' + g.errors.join(' | '));
    await g.context.close();
  });

  await check('An unreadable save file can be deleted', async () => {
    const g = await fresh();
    const n = await g.run("localStorage.setItem(SLOT_KEYS[2],'{bad'); localStorage.setItem(SLOT_KEYS[2]+'-backup','{bad'); readSave(SLOT_KEYS[2]); openSaves(); document.querySelectorAll('#save-list .savecard')[2].querySelectorAll('.savedel').length");
    expect(n, 1, 'delete buttons on the unreadable file');
    await g.context.close();
  });

  await check('A climb that fails to restore is dropped', async () => {
    const g = await fresh();
    await g.run("useSlot(0); meta.activeRun={v:1,graph:{root:{$ref:0},nodes:[{array:false,data:{floor:1}}]}}; restoreActiveRun();");
    expect(await g.run('hasSavedRun()'), false, 'broken climb still saved');
    await g.context.close();
  });

  await check('A resumed enemy intro card keeps its picture', async () => {
    const g = await fresh();
    await g.run("useSlot(0); noFile=false; meta.tutDone=true; beginRun(); setPlay(); openIntro('stalker'); captureRunSnapshot(); const c=$('intro-cv'); c.width=c.width; restoreActiveRun();");
    await g.page.waitForTimeout(300);
    expect(await g.run('mode'), 'intro', 'mode after restore');
    const drawn = await g.run("(() => { const c=$('intro-cv'); return [...c.getContext('2d').getImageData(0,0,c.width,c.height).data].some((v,i)=>i%4===3&&v>0); })()");
    expect(drawn, true, 'intro picture drawn');
    await g.context.close();
  });

  await check('Banners other than "Floor N" show on boss floors', async () => {
    const g = await fresh();
    const src = await g.run('render.toString()');
    if (!src.includes("run.banner > 0 && !(b && run.bannerText.indexOf('Floor') === 0)")) throw new Error('banner condition changed; check banners still show during boss fights');
    await g.context.close();
  });

  await check('Phone: the training card sits below the top bar', async () => {
    const g = await fresh(PHONE);
    await g.run("useSlot(0); meta.tutDone=false; startTraining('title');");
    await g.page.waitForTimeout(300);
    const hud = await g.run("$('hud').getBoundingClientRect().bottom"), tut = await g.run("$('tut').getBoundingClientRect().top");
    if (tut < hud) throw new Error(`training card top ${tut} overlaps the top bar bottom ${hud}`);
    await g.context.close();
  });

  // ---- Chapter 1 ending, QTEs and cutscenes ----

  await check('The Masked Wraith fights on floor 25 only, not floor 50', async () => {
    const g = await fresh();
    await g.run("useSlot(0); meta.tutDone=true; beginRun();");
    expect(await g.run("storyBossForFloor(25)?.kind"), 'wraith', 'floor 25 boss');
    expect(await g.run("storyBossForFloor(50)?.kind ?? null"), null, 'floor 50 story boss');
    await g.context.close();
  });

  const clearFloor50 = async (g, diff, before = '') => {
    await g.run(`useSlot(0); noFile=false; meta.tutDone=true; ${before} beginRun('${diff}'); run.diff='${diff}'; run.floor=50; startFloor(); setPlay(); run.boss=null; run.enemies=[]; floorCleared();`);
  };

  await check('Clearing floor 50 on Hard finishes Chapter 1 and unlocks the One-Eyed', async () => {
    const g = await fresh();
    await clearFloor50(g, 'hard');
    expect(await g.run('mode'), 'cutscene', 'mode after floor 50');
    expect(await g.run('run.over && run.victory'), true, 'run over as a victory');
    expect(await g.run('ownsClass("oneeyed")'), true, 'One-Eyed owned');
    expect(await g.run('meta.chapters["1"].clears'), 1, 'chapter clears');
    expect(await g.run('hasSavedRun()'), false, 'finished climb is not saved to continue');
    expect(await g.page.isVisible('#cs-skip'), false, 'skip button on a first viewing');
    for (let i = 0; i < 2; i++) { await g.page.waitForTimeout(700); await g.page.mouse.click(200, 400); }
    expect(await g.run('mode'), 'death', 'results screen after the cutscene');
    expect(await g.page.textContent('#death-eyebrow'), 'Chapter 1 complete', 'results heading');
    expect(await g.run("$('s-death').classList.contains('won')"), true, 'win styling (no skull)');
    if (!(await g.page.textContent('#d-extra')).includes('One-Eyed class unlocked')) throw new Error('results do not mention the One-Eyed unlock');
    expect(g.errors.length, 0, 'page errors: ' + g.errors.join(' | '));
    await g.context.close();
  });

  await check('Clearing floor 50 on Normal does not unlock the One-Eyed; replays can skip the cutscene', async () => {
    const g = await fresh();
    await clearFloor50(g, 'normal', "meta.seen=meta.seen||{}; meta.seen['cutscene:chapter1-complete']=true;");
    expect(await g.run('ownsClass("oneeyed")'), false, 'One-Eyed owned');
    expect(await g.page.isVisible('#cs-skip'), true, 'skip button for a seen cutscene');
    await g.page.click('#cs-skip');
    expect(await g.run('mode'), 'death', 'results screen after skipping');
    if (!(await g.page.textContent('#d-extra')).includes('on Hard')) throw new Error('results do not say how to unlock the One-Eyed');
    expect(g.errors.length, 0, 'page errors: ' + g.errors.join(' | '));
    await g.context.close();
  });

  await check('Dying still shows the normal "You have fallen" screen', async () => {
    const g = await fresh();
    await g.run("useSlot(0); noFile=false; meta.tutDone=true; beginRun(); setPlay(); run.hp=0; die();");
    await g.page.waitForTimeout(2600);
    expect(await g.run('mode'), 'death', 'mode after dying');
    expect(await g.page.textContent('#death-eyebrow'), 'You have fallen', 'death heading');
    expect(await g.run("$('s-death').classList.contains('won')"), false, 'win styling on a death');
    expect(g.errors.length, 0, 'page errors: ' + g.errors.join(' | '));
    await g.context.close();
  });

  await check("Pyromaniac's protect-your-bros moment: a miss heals 8%, success holds at half", async () => {
    const g = await fresh();
    await g.run("useSlot(0); meta.tutDone=true; beginRun(); run.floor=30; startFloor(); setPlay(); run.boss.hp=run.boss.maxHp*.52; damageBoss(run.boss.maxHp*.1);");
    expect(await g.run("run.qte && run.qte.id"), 'pyro-protect', 'QTE started');
    expect(await g.run("Math.round(run.boss.hp/run.boss.maxHp*100)"), 50, 'boss held at 50%');
    await g.run("run.qte.ready=0; run.qte.t=0.1; qteInput();");               // too early: a miss
    expect(await g.run("run.qte"), null, 'QTE over after a miss');
    expect(await g.run("Math.round(run.boss.hp/run.boss.maxHp*100)"), 58, 'boss healed to 58%');
    expect(await g.run("pyroState(run.boss).trialDone"), false, 'trial still to do');
    await g.run("damageBoss(run.boss.maxHp*.1); for(let i=0;i<3;i++){ run.qte.ready=0; run.qte.t=.95; qteInput(); }");
    expect(await g.run("pyroState(run.boss).trialDone"), true, 'trial done after 3 good taps');
    expect(await g.run("Math.round(run.boss.hp/run.boss.maxHp*100)"), 50, 'boss at 50% after success');
    expect(g.errors.length, 0, 'page errors: ' + g.errors.join(' | '));
    await g.context.close();
  });

  await check('Mash QTEs fill with taps and fail when time runs out', async () => {
    const g = await fresh();
    await g.run("QTE['test-mash']={type:'mash',presses:6,time:1.5,decay:0,title:'TEST',onDone:(b,ok)=>{window.__mash=ok;}}; useSlot(0); meta.tutDone=true; beginRun(); setPlay(); startQte('test-mash'); run.qte.ready=0;");
    for (let i = 0; i < 6; i++) await g.page.keyboard.press('Space');
    expect(await g.page.evaluate(() => window.__mash), true, 'mash success');
    await g.run("window.__mash=null; startQte('test-mash'); run.qte.ready=0;");
    await g.page.waitForTimeout(1900);
    expect(await g.page.evaluate(() => window.__mash), false, 'mash timeout');
    expect(g.errors.length, 0, 'page errors: ' + g.errors.join(' | '));
    await g.context.close();
  });

  await browser.close();
  return results;
}
