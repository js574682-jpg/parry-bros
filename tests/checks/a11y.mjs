// Accessibility and comfort options (Settings › Accessibility) and keyboard play.
// The game loop catches drawing errors and logs them with console.error, so these checks also
// watch the console, not just uncaught page errors.
export default async ({ check, expect, fresh, PHONE, DESKTOP }) => {
  const open = async device => {
    const g = await fresh(device);
    g.logged = [];
    g.page.on('console', m => { if (m.type() === 'error') g.logged.push(m.text()); });
    return g;
  };
  const clean = g => {
    expect(g.errors.length, 0, 'page errors: ' + g.errors.join(' | '));
    expect(g.logged.length, 0, 'console errors: ' + g.logged.join(' | '));
  };
  const lobby = "useSlot(0); noFile=false; meta.tutDone=true; meta.look={...DEFAULT_LOOK}; openLobby(false);";
  // A stand-in 2D context that records what was drawn, for checking draw code directly.
  const recorder = "window.__rec=[]; window.__g=new Proxy({}, { get:(o,k)=>k in o?o[k]:(...a)=>{__rec.push(k);}, set:(o,k,v)=>{o[k]=v;__rec.push(k+'='+v);return true;} });";

  await check('Accessibility options save, load after a reload, and ignore bad saved data', async () => {
    const g = await open(PHONE);
    await g.run(lobby + " openSettings('lobby');");
    expect(await g.page.isVisible('#btn-set-cues'), false, 'options start folded away');
    await g.page.click('#set-a11y summary');
    for (const id of ['#btn-set-cues', '#btn-set-flash', '#btn-set-text', '#btn-set-vibrate']) await g.page.click(id);
    expect(await g.page.textContent('#btn-set-cues'), 'Color-blind cues: on', 'cues label');
    expect(await g.page.textContent('#btn-set-flash'), 'Flashing: off', 'flashing label');
    expect(await g.page.textContent('#btn-set-text'), 'Text size: large', 'text label');
    expect(await g.page.textContent('#btn-set-vibrate'), 'Vibration: off', 'vibration label');
    await g.page.reload(); await g.page.waitForTimeout(1000);
    expect(await g.run("JSON.stringify(a11yPrefs)"), JSON.stringify({ cues:true, flashing:'off', text:'large', vibration:false }), 'options after a reload');
    expect(await g.run("['a11y-text','a11y-noflash'].every(c => document.documentElement.classList.contains(c))"), true, 'page classes after a reload');
    // they belong to the device, not a save file
    await g.run("useSlot(1); startNewGame(2, 'hard');");
    expect(await g.run("a11yPrefs.cues && a11yNoFlash() && a11yPrefs.text"), 'large', 'options in another, new save file');
    await g.run(lobby + " openSettings('lobby');");
    expect(await g.page.isVisible('#btn-set-cues'), true, 'group opens itself when an option is on');
    for (const bad of ['{"cues":"yes","flashing":"strobe","text":5,"vibration":"x"}', '[1,2,3]', '{bad', '"large"', '{"__proto__":{"cues":true},"text":"large"}']) {
      await g.run(`localStorage.setItem(A11Y_KEY, ${JSON.stringify(bad)})`);
      await g.page.reload(); await g.page.waitForTimeout(800);
      const want = { cues:false, flashing:null, text:bad.includes('__proto__') ? 'large' : 'normal', vibration:null };
      expect(await g.run("JSON.stringify(a11yPrefs)"), JSON.stringify(want), 'options read from ' + bad);
    }
    clean(g);
    await g.context.close();
  });

  await check('Vibration follows Sound until it is set, then works on its own', async () => {
    const g = await open(PHONE);
    await g.run(lobby + " window.__buzz=0; Object.defineProperty(navigator, 'vibrate', { configurable:true, value:() => { window.__buzz++; return true; } });");
    const buzzes = async code => g.run(`window.__buzz=0; ${code}; buzz(20); window.__buzz`);
    expect(await buzzes("meta.sound=true"), 1, 'buzzes with sound on (as before)');
    expect(await buzzes("meta.sound=false"), 0, 'silent with sound off (as before)');
    await g.run("openSettings('lobby'); $('set-a11y').open=true;");
    expect(await g.page.textContent('#btn-set-vibrate'), 'Vibration: off', 'label follows sound');
    await g.page.click('#btn-set-vibrate');
    expect(await buzzes("meta.sound=false"), 1, 'buzzes with sound off once vibration is on');
    await g.page.click('#btn-set-vibrate');
    expect(await buzzes("meta.sound=true"), 0, 'silent with sound on once vibration is off');
    clean(g);
    await g.context.close();
  });

  await check('The system reduced-motion setting turns flashing off until the player chooses', async () => {
    const g = await open(PHONE);
    await g.page.emulateMedia({ reducedMotion:'reduce' });
    await g.run(lobby + " openSettings('lobby');");
    expect(await g.run("a11yNoFlash()"), true, 'flashing off by default');
    expect(await g.page.textContent('#btn-set-flash'), 'Flashing: off', 'label');
    await g.page.click('#btn-set-flash');
    expect(await g.run("a11yNoFlash()"), false, 'flashing on after choosing it');
    await g.page.emulateMedia({ reducedMotion:'no-preference' });
    expect(await g.run("a11yNoFlash()"), false, 'choice sticks');
    clean(g);
    await g.context.close();
  });

  await check('Flashing: off removes the screen flashes and the Illusionist eruption flash', async () => {
    const g = await open(DESKTOP);
    await g.run("useSlot(0); meta.tutDone=true; beginRun(); setPlay(); run.enemies=[]; run.spawnQueue=[]; run.pending=[]; run.eproj=[];");
    // draw one frame by hand with the flashes held at full, and read pixels before the next frame
    const frame = async (flashing, flash) => g.run(`(() => { a11yPrefs.flashing='${flashing}';
      Object.assign(run, { shake:0, parts:[], texts:[], banner:0, impactFlash:${flash}, flashAll:${flash}, hitFlash:${flash} });
      render(3); const px=[], c=ctx.canvas; for (const [x,y] of [[3,3],[c.width-4,3],[3,c.height-4],[c.width-4,c.height-4]]) px.push(...ctx.getImageData(x,y,1,1).data); return px.join(','); })()`);
    const none = await frame('on', 0), on = await frame('on', 1), off = await frame('off', 1);
    if (on === none) throw new Error('flashes did not show with flashing on, so this check proves nothing');
    expect(off, none, 'frame with flashing off and every flash at full');
    // the Illusionist's eruption, drawn into a recorder with a stand-in boss (put back before the next frame)
    const erupt = async flashing => g.run(recorder + ` a11yPrefs.flashing='${flashing}'; const real=run.boss;
      run.boss={def:{kind:'illusionist'},dead:false,state:'storyrecover',story:{attack:'divide',safe:1,zoneFlash:.3,zoneT:0,zoneMax:1}};
      try { drawStoryZones(__g,1); } finally { run.boss=real; } __rec.filter(s=>s.startsWith('fillStyle=rgba(')).join(' ')`);
    if (!(await erupt('on')).includes('.65')) throw new Error('eruption flash missing with flashing on');
    if ((await erupt('off')).includes('.65')) throw new Error('eruption still flashes with flashing off');
    clean(g);
    await g.context.close();
  });

  await check('Color-blind cues: fakes are hollow, the Perfect window has a ring, labels name shapes', async () => {
    const g = await open(PHONE);
    await g.run(recorder + " useSlot(0); meta.tutDone=true; beginRun(); setPlay(); run.enemies=[]; run.spawnQueue=[]; run.pending=[]; run.eproj=[];");
    expect(await g.run("a11yFakeShot(__g, fireShot('orb', L.cx, L.cy-150, 'boss', 5, '#ff515c', 1, null, {fake:true, fakeColor:'#68adff'}))"), false, 'fakes drawn normally with cues off');
    await g.run("a11yPrefs.cues=true; __rec.length=0;");
    expect(await g.run("a11yFakeShot(__g, run.eproj[0])"), true, 'fake drawn by the cue');
    expect(await g.run("__rec.includes('setLineDash') && __rec.includes('arc') && !__rec.includes('fill')"), true, 'a dashed ring, not filled');
    expect(await g.run("a11yFakeShot(__g, fireShot('orb', L.cx, L.cy-150, 'boss', 5, '#ff515c', 1))"), false, 'real shots keep their normal drawing');
    const ring = async p => g.run(`run.eproj=[]; const p=fireShot('orb', HX(), HY()-${p}, 'boss', 5, '#ff515c', 1); __rec.length=0; a11yAttackCues(__g); __rec.filter(s=>s==='arc').length`);
    expect(await ring(28), 1, 'ring on a shot about to land');
    expect(await ring(200), 0, 'no ring while the shot is far away');
    expect(await g.run("a11yText('RED IS REAL · BLUE IS AN ILLUSION')"), 'SOLID IS REAL · HOLLOW IS FAKE', 'Illusionist label');
    expect(await g.run("a11yText('GOLD: PARRY · RED FLOOR: MOVE')"), 'FIREBALLS: PARRY · STRIPED FLOOR: MOVE', 'Pyromaniac label');
    expect(await g.run("a11yPrefs.cues=false; a11yText('VOLLEY · WATCH THE RED SHOTS')"), 'VOLLEY · WATCH THE RED SHOTS', 'labels unchanged with cues off');
    clean(g);
    await g.context.close();
  });

  await check('Color-blind cues draw without errors in the Illusionist, Mirage and hazard fights', async () => {
    const g = await open(PHONE);
    // count what the cues actually draw while the real game runs
    await g.run("a11yPrefs.cues=true; window.__cue={stripes:0,fakes:0,rings:0};" +
      "a11yStripes=(f=>(...a)=>{__cue.stripes++;return f(...a);})(a11yStripes);" +
      "a11yFakeShot=(f=>(g,p)=>{const r=f(g,p);if(r)__cue.fakes++;return r;})(a11yFakeShot);" +
      "a11yHeavyNote=(f=>(...a)=>{__cue.rings++;return f(...a);})(a11yHeavyNote);");
    const fight = "useSlot(0); meta.tutDone=true; for (const k of INTRO_TYPES) meta.seen[k]=true; for (const b of BOSSES) meta.seen['boss:'+b.name]=true; beginRun();";
    const boss = kind => `run.enemies=[]; run.spawnQueue=[]; run.pending=[]; run.eproj=[]; run.hazards=[]; run.necro=null; run.twist=null;
      const def=BOSSES.find(b=>b.kind==='${kind}'); run.bossName=def.name;
      const b=run.boss={def,x:L.cx,y:L.bossY,hp:1e9,maxHp:1e9,state:'idle',timer:.2,windupT:0,windupMax:1,patIdx:0,flash:0,bob:0,pattern:null,shots:null,dead:false};`;
    // each scene starts its attack directly (a busy test machine slows the game's own timers), then the
    // real game loop draws it; the check waits until the cue has been drawn
    const scenes = [
      ['Illusionist volleys and clones', `run.floor=20; startFloor(); setPlay(); run.hp=run.maxHp=1e9; run.enemies=[]; run.spawnQueue=[]; const b=run.boss; b.hp=b.maxHp=1e9; b.y=L.bossY; b.state='storycombo'; b.timer=9; storyState(b).copies=4; storyState(b).shotIndex=0; fireIllusionShot(b); fireIllusionShot(b);`, 'fakes'],
      ['Illusionist splits the arena', `const b=run.boss; storyState(b).cycle=2; storyState(b).attack=''; b.state='idle'; b.timer=0;`, 'stripes'],
      ['Mirages', `run.floor=26; startFloor(); setPlay(); run.hp=run.maxHp=1e9; run.boss=null; run.twist=null; run.enemies=[]; run.spawnQueue=[]; for (let i=0;i<3;i++) spawnEnemy('mirage'); for (const e of run.enemies) { clampToArena(e,.8); enemyFire(e); }`, 'fakes'],
      ['Sapper bombs', `run.enemies=[]; run.eproj=[]; spawnEnemy('sapper'); for (const e of run.enemies) { clampToArena(e,.8); enemyFire(e); }`, 'stripes'],
      ['Cinder Wizard cone', `run.enemies=[]; run.eproj=[]; spawnEnemy('firemage'); for (const e of run.enemies) { clampToArena(e,.8); e.state='windup'; e.windupT=e.windupMax=9; e.fireAim=Math.atan2(HY()-e.y,HX()-e.x); }`, 'stripes'],
      ['Pyromaniac floor fire', `run.floor=30; startFloor(); setPlay(); run.hp=run.maxHp=1e9; run.enemies=[]; run.spawnQueue=[]; run.boss.hp=run.boss.maxHp=1e9; run.boss.y=L.bossY; beginPyroAttack(run.boss);`, 'stripes'],
      ['Three Sisters storm circles', boss('sisters') + " initSisters(b); for (const q of b.sis) q.state='idle'; b.state='fight'; b.cd=99; run.hazards.push({x:HX(),y:HY(),R:46,t:0,T:9,color:'#b77dff',dmg:1});", 'stripes'],
      ['Bell Ringer red marks', boss('ringer') + " b.ring={bars:[{start:run.etime+.2,beat:.5,notes:'x...X...'}],n:1,beatKey:-1,hitT:9,heavyHit:false,dangerCd:99}; b.state='fight'; b.ring.dangers=[{kind:'burst',x:HX(),y:HY(),ang:0,warn:9,t:0,radius:53,width:28,range:L.R*2.8,hit:false},{kind:'sweep',x:b.x,y:b.y,ang:1,warn:9,t:0,radius:53,width:28,range:L.R*2.8,hit:false}];", 'stripes'],
      ['Bell Ringer heavy notes', '', 'rings'],
      ['Necromancer grave hands', boss('necromancer') + " initNecromancer(b, true); run.necro.phase='duel'; necroHand(HX(),HY()); necroHand(HX()-80,HY()+30,.3);", 'stripes'],
    ];
    await g.run(fight);
    for (const [name, code, cue] of scenes) {
      await g.run(`__cue={stripes:0,fakes:0,rings:0}; ${code}`);
      let seen = 0;
      for (let i = 0; i < 40 && !seen; i++) { await g.page.waitForTimeout(200); seen = await g.run('__cue[' + JSON.stringify(cue) + ']'); }
      if (!seen) throw new Error(`${name}: no ${cue} drawn in 8 s (${await g.run('JSON.stringify(__cue)')})`);
    }
    clean(g);
    await g.context.close();
  });

  await check('Keyboard: Tab moves through Settings, Escape goes back, focus returns to the gear', async () => {
    const g = await open(DESKTOP);
    await g.run(lobby);
    await g.page.waitForTimeout(200);
    const focused = () => g.run("document.activeElement.id || document.activeElement.tagName");
    await g.page.keyboard.press('Tab'); await g.page.keyboard.press('Tab');
    expect(await focused(), 'btn-settings', 'second Tab in the lobby');
    await g.page.keyboard.press('Enter');
    expect(await g.run('mode'), 'settings', 'Enter on the focused gear opens Settings, not a station');
    const order = [];
    for (let i = 0; i < 7; i++) { await g.page.keyboard.press('Tab'); order.push(await focused()); }
    expect(order.join(' '), 'btn-set-diff btn-set-sound btn-set-shake btn-set-effects SUMMARY btn-set-saves btn-save-export', 'Tab order (group folded)');
    await g.page.keyboard.press('Shift+Tab'); await g.page.keyboard.press('Shift+Tab');
    expect(await focused(), 'SUMMARY', 'back on the Accessibility heading');
    await g.page.keyboard.press('Enter');
    const inside = [];
    for (let i = 0; i < 5; i++) { await g.page.keyboard.press('Tab'); inside.push(await focused()); }
    expect(inside.join(' '), 'btn-set-cues btn-set-flash btn-set-text btn-set-vibrate btn-set-saves', 'Tab order inside the open group');
    await g.page.keyboard.press('Shift+Tab'); await g.page.keyboard.press('Shift+Tab'); await g.page.keyboard.press('Shift+Tab'); await g.page.keyboard.press('Shift+Tab');
    await g.page.keyboard.press('Space');
    expect(await g.run('a11yPrefs.cues'), true, 'Space on Color-blind cues switches them on');
    await g.page.keyboard.press('Escape');
    expect(await g.run('mode'), 'lobby', 'Escape leaves Settings');
    expect(await focused(), 'btn-settings', 'focus back on the gear');
    await g.page.keyboard.press('ArrowRight');
    expect(await focused(), 'BODY', 'walking gives the keys back to the lobby');
    // pause › settings › escape › escape
    await g.run("beginRun(); setPlay();");
    await g.page.keyboard.press('Escape');
    expect(await g.run('mode'), 'pause', 'Escape pauses');
    await g.run("openSettings('pause')");
    await g.page.keyboard.press('Escape');
    expect(await g.run('mode'), 'pause', 'Escape from pause settings goes back to pause');
    await g.page.keyboard.press('Escape');
    expect(await g.run('mode'), 'play', 'second Escape resumes');
    // other menus go back too
    for (const [open, from, to] of [["openSaves()", 'saves', 'title'], ["openGuide('title')", 'guide', 'title'], [lobby + " openInv()", 'inv', 'lobby'], [lobby + " openSanctum('lobby')", 'sanctum', 'lobby']]) {
      await g.run(open);
      expect(await g.run('mode'), from, 'opened ' + from);
      await g.page.keyboard.press('Escape');
      expect(await g.run('mode'), to, 'Escape from ' + from);
    }
    clean(g);
    await g.context.close();
  });

  await check('Keyboard: a new menu takes focus without pressing anything; Enter finishes training', async () => {
    const g = await open(DESKTOP);
    await g.run("useSlot(0); noFile=false; meta.tutDone=true; beginRun(); setPlay();");
    await g.page.keyboard.press('Space');
    await g.run("openBoons()");
    await g.page.waitForTimeout(100);
    expect(await g.run("document.activeElement.id"), 's-boon', 'the boon screen itself has focus');
    await g.page.keyboard.press('Enter'); await g.page.keyboard.press('Space');
    expect(await g.run('mode'), 'boon', 'a stray Enter or Space picks no boon');
    await g.page.keyboard.press('Tab'); await g.page.keyboard.press('Enter');
    expect(await g.run('mode') !== 'boon', true, 'Tab then Enter picks one');
    // the training's last card has a Next button that Enter presses
    await g.run("startTraining('title'); run.tut.i=run.tut.steps.length-1; renderTut();");
    expect(await g.page.isVisible('#tut-next'), true, 'Next button showing');
    await g.page.keyboard.press('Enter');
    expect(await g.run('mode'), 'guide', 'Enter finished the training');
    expect(await g.run("GUIDE[GUIDE.length-1].includes('<h2>Controls</h2>')"), true, 'the guide ends with Controls');
    // a cutscene seen before: Escape skips it, and so does Enter on its focused Skip button
    const cutscene = "meta.seen=meta.seen||{}; meta.seen['cutscene:chapter1-complete']=true; window.__done=0; playCutscene('chapter1-complete', () => { window.__done++; });";
    await g.run(cutscene);
    await g.page.keyboard.press('Escape');
    expect(await g.run('window.__done'), 1, 'Escape skipped the cutscene');
    await g.run(cutscene + " $('cs-skip').focus();");
    await g.page.keyboard.press('Enter');
    expect(await g.run('window.__done'), 1, 'Enter on the focused Skip button skipped the cutscene');
    clean(g);
    await g.context.close();
  });

  await check('Large text enlarges menu text and small canvas captions, and fits the phone', async () => {
    const g = await open(PHONE);
    await g.run(lobby + " openSettings('lobby');");
    const size = () => g.run("parseFloat(getComputedStyle($('set-note')).fontSize)");
    const canvasFont = () => g.run("ctx.font='700 10px Parry Pixel, monospace'; ctx.font");
    expect(await size(), 16, 'normal note size');
    if (!(await canvasFont()).includes('10px')) throw new Error('canvas font changed with large text off');
    await g.run("$('set-a11y').open=true;");
    await g.page.click('#btn-set-text');
    expect(await size(), 19, 'large note size');
    if (!(await canvasFont()).includes('13px')) throw new Error('small canvas captions did not grow: ' + await canvasFont());
    expect(await g.run("ctx.font='800 60px Parry Pixel, monospace'; parseFloat(ctx.font.split(' ')[1])"), 60, 'banners keep their size');
    // nothing on these screens is wider than the phone
    for (const screen of ["openSettings('lobby')", "openSaves()", "openGuide('title'); guidePage=GUIDE.length-1; renderGuide();", lobby + " openSanctum('lobby')", "beginRun(); setPlay(); openBoons()"]) {
      await g.run(screen);
      const wide = await g.run("[...document.querySelectorAll('#app .screen:not([hidden]) *')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().right>innerWidth+1).map(e=>e.id||e.className||e.tagName).slice(0,5).join(', ')");
      expect(wide, '', 'elements wider than the phone after ' + screen);
    }
    await g.run("openSettings('lobby')");
    await g.page.click('#btn-set-text');
    expect(await size(), 16, 'normal again');
    clean(g);
    await g.context.close();
  });
};
