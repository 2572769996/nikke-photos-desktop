const assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async function checkUiSounds(win) {
  const web = win.webContents;
  const run = code => web.executeJavaScript(code, true);
  async function until(read, label) {
    for (let i = 0; i < 100; i++) { if (await read()) return; await delay(60); }
    throw Error('等待超时 ' + label);
  }
  async function click(selector, execute = run) {
    const element = `document.querySelector(${JSON.stringify(selector)})`;
    await until(() => execute(`!!${element}`), selector);
    await execute(`${element}.click()`);
  }
  async function observe() {
    await run(`window.plays = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        const promise = play.call(this);
        plays.push({src:this.src, started:promise.then(()=>this.duration)});
        return promise;
      }; void 0;`);
  }
  async function expectSound(expected, action) {
    await run('plays.length=0');
    await action();
    if (expected.length) await until(() => run(`plays.length >= ${expected.length}`), expected.join(', '));
    await delay(80);
    assert.deepEqual(await run("plays.map(p => new URL(p.src).pathname.split('/').pop().split('-')[0])"), expected);
    assert.ok((await run('Promise.all(plays.map(p=>p.started))')).every(duration => duration > 0));
  }
  const interfaceSwitch = '[aria-labelledby="interface-sound-label"]';
  const washSwitch = '[aria-labelledby="wash-sound-label"]';
  async function openSettings() {
    await click('a[href="#/my"]'); await click('a[href="#/settings"]');
    await until(() => run(`!!document.querySelector('${washSwitch}')`), '设置');
  }
  async function settingsAre(ui, wash) {
    for (const [selector, enabled] of [[interfaceSwitch,ui],[washSwitch,wash]]) {
      assert.equal(await run(`document.querySelector('${selector}').getAttribute('aria-checked')`), String(enabled));
    }
  }
  async function reloadSettings() {
    const loaded = new Promise(resolve => web.once('did-finish-load', resolve));
    web.reload(); await loaded;
    await until(() => run(`!!document.querySelector('${washSwitch}')`), '设置重载');
    await observe();
  }
  const frame = () => web.mainFrame.frames.find(f => f.url.includes('/simulator/index.html'));
  const sim = code => frame().executeJavaScript(code, true);
  const simClick = selector => click(selector, sim);
  async function begin() {
    await click('a[href="#/tools"]'); await click('#tab-equipment-simulator');
    await until(() => frame()?.executeJavaScript("!!document.querySelector('.sim-controls')"), '洗练器');
    await simClick('input[value=random]');
    await sim("Math.random=(()=>{const q=[.31,0,.9,.9,0,0,.9,0];return()=>q.length?q.shift():.99})();document.querySelector('.sim-controls .el-button--primary').click()");
    await until(() => sim("!!document.querySelector('.wash-area button:not(:disabled)')"), '装备详情');
    await delay(120);
  }
  async function draw(selector, rng, count) {
    await sim(`Math.random=(()=>{const q=${JSON.stringify(rng)};return()=>q.length?q.shift():.99})();void 0;`);
    await sim(`window.revealTrace = [];
      window.repeatUnlocked = null;
      window.previousBlock = document.querySelector('.new-block');
      window.revealObserver = new MutationObserver(() => {
        const block = document.querySelector('.new-block');
        if (!block || block === previousBlock) return;
        const visible = block.querySelectorAll('.game-affix:not(.game-affix-empty)').length;
        if (revealTrace.at(-1)?.visible !== visible) revealTrace.push({visible, time:performance.now()});
        const again = document.querySelector('.ol-result .btn-again');
        if (again && !again.disabled && !repeatUnlocked) {
          repeatUnlocked = {pending:block.querySelectorAll('.awaiting-reveal').length,
            animating:block.getAnimations({subtree:true}).some(a => a.animationName === 'reveal-affix' && a.playState !== 'finished')};
        }
      });
      revealObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});void 0;`);
    if (selector === '.ol-result .btn-again') {
      await sim("{ const again = document.querySelector('.btn-again'); again.click(); again.click(); }");
    } else await simClick(selector);
    await until(() => sim("!!document.querySelector('.new-block .awaiting-reveal')"), '词条揭晓中');
    assert.equal(await sim("document.querySelector('.btn-again').disabled"), true, '揭晓中必须禁用再洗');
    assert.equal(await sim(`(async function(){
      const block = document.querySelector('.new-block');
      const spent = document.querySelector('.sim-stats').textContent;
      document.querySelector('.btn-again').click();
      await Promise.resolve();
      return spent === document.querySelector('.sim-stats').textContent && document.querySelector('.new-block') === block;
    })()`),true);
    await until(() => sim(`document.querySelectorAll('.new-block .game-affix:not(.game-affix-empty)').length === ${count}`), '结果词条 ' + count);
    await until(() => sim('!!repeatUnlocked'), '再洗按钮就绪');
    assert.deepEqual(await sim('repeatUnlocked'), {pending:0, animating:false});
    const colors = await sim("Array.from(document.querySelectorAll('.ol-result .wash-footer button'), b => getComputedStyle(b).backgroundColor)");
    assert.equal(new Set(colors).size,3);
    assert.ok(!colors.includes('rgba(0, 0, 0, 0)'));
    const trace=await sim('revealObserver.disconnect();revealTrace');
    assert.deepEqual(trace.map(step=>step.visible),Array.from({length:count+1},(_,i)=>i));
    assert.equal(await sim("document.querySelectorAll('.old-block .game-affix').length"),3);
    for(let i=2;i<trace.length;i++) assert.ok(trace[i].time-trace[i-1].time >= 100,'新词条须逐条出现');
  }
  const wash2 = 'uis_equipment_tunning';
  await run("document.querySelector('.cl-mute input')?.click();document.querySelector('.dlg-foot .btn-primary')?.click()");
  await observe();
  await expectSound([], openSettings);
  await settingsAre(false, false);
  // An existing user had enabled the previous single switch.
  await run("localStorage.setItem('nikke.uiSounds.enabled','1')");
  await reloadSettings(); await settingsAre(true, true);
  await click(interfaceSwitch);
  await reloadSettings(); await settingsAre(false, true);
  await begin();
  await simClick('.ol-slot .ol-lock'); await simClick('.ol-slot input[type=checkbox]');
  await expectSound([], () => simClick('.wash-area button'));
  await expectSound([wash2+'_1'], () => draw('.ol-preview .ol-primary', [.99,.99], 1));
  assert.equal(await sim("document.querySelectorAll('.new-block .ol-lock.stone').length"), 1);
  await expectSound([wash2], () => draw('.ol-result .btn-again', [0,.6,.02,.99], 2));
  await expectSound([wash2+'_3'], () => draw('.ol-result .btn-again', [0,.6,.02,0,.5,.02], 3));
  await expectSound(['uis_equipment_setchange'], () => simClick('.ol-result .btn-apply'));
  await openSettings();
  await click(interfaceSwitch);
  await settingsAre(true,true);
  await begin();
  await expectSound(['uis_button'], () => simClick('.wash-area button'));
  await expectSound(['uis_button',wash2+'_1'], () => draw('.ol-preview .ol-primary', [0,.6,.02,.99,.99], 1));
  await expectSound(['uis_button','uis_equipment_setchange'], () => simClick('.ol-result .btn-apply'));

  await openSettings(); await click(washSwitch);
  await reloadSettings(); await settingsAre(true,false);
  await begin(); await simClick('.wash-area button'); await delay(100);
  await expectSound(['uis_button'], () => draw('.ol-preview .ol-primary', [0,.6,.02,.99,.99], 1));
  await expectSound(['uis_button'], () => simClick('.ol-result .btn-apply'));
  await expectSound(['uis_click'], () => click('#tab-sr-collection'));
  const collection = () => web.mainFrame.frames.find(f => f.url.includes('/sr-collection/index.html'));
  await until(async () => await run("!document.querySelector('#panel-sr-collection .tools-status')") &&
    collection()?.executeJavaScript("!!document.querySelector('#load-example:not(:disabled)')"),'收藏品');
  await expectSound(['uis_button'], () => click('#load-example', code => collection().executeJavaScript(code,true)));

  await openSettings(); await click(interfaceSwitch); await settingsAre(false,false);
  await begin(); await simClick('.wash-area button');
  await expectSound([], () => draw('.ol-preview .ol-primary',[0,.6,.02,.99,.99],1));
  await simClick('.ol-result .btn-keep');
  await sim("Array.from(document.querySelectorAll('.sim-controls button')).find(b=>b.textContent.trim()==='结束本局').click()");
  await simClick('input[value=custom]');
  return {silentDefault:true, legacyPreferencePreserved:true, independentModes:4, revealSequences:['0→1','0→1→2','0→1→2→3'], includesLocked:true, repeatWash:true, repeatWaitsForAnimations:true, buttonAndTab:true};
};
