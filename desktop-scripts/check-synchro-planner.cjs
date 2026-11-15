const { app, BrowserWindow, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const project = path.resolve(__dirname, '..');
const restore = process.argv.includes('--restore');
const root = restore ? process.argv[process.argv.indexOf('--restore') + 1] : path.join('E:/博哥/codex temp/nikke-desktop/synchro-planner', 'ui-' + Date.now());
fs.mkdirSync(root, { recursive: true });
app.setPath('userData', path.join(root, 'data'));
app.setPath('sessionData', path.join(root, 'session'));
app.on('window-all-closed', () => {});
protocol.registerSchemesAsPrivileged([{ scheme: 'nikke', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const result = { root, restore };

app.whenReady().then(async () => {
  protocol.handle('nikke', request => {
    const url = new URL(request.url);
    const base = path.join(project, url.host === 'app' ? 'dist' : 'dist/tools');
    const file = path.resolve(base, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
  const win = new BrowserWindow({ width: 1440, height: 1080, show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false, offscreen: true } });
  const web = win.webContents;
  const run = source => web.executeJavaScript(source);
  web.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_request, callback) => callback({ cancel: true }));
  const errors = [];
  web.on('console-message', event => { if (/Uncaught|React error/i.test(event.message)) errors.push(event.message); });
  async function until(source) {
    for (let n=0;n<200;n++) { if (await run(source)) return; await delay(60); }
    throw Error('Timed out: ' + source);
  }
  async function fill(id, value) {
    await run(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await delay(25);
  }
  async function shot(name) { await delay(150); fs.writeFileSync(path.join(root,name+'.png'),(await web.capturePage()).toPNG()); }
  const key = 'nikke-tools:synchro-planner:v1';
  try {
    await win.loadURL('nikke://app/#/tools');
    await until("!!document.querySelector('#tab-synchro-planner')");
    await run("document.querySelector('.dlg[aria-label=版本更新] .dlg-x')?.click();document.querySelector('#tab-synchro-planner').click()");
    await until("!!document.querySelector('#syn-current')");
    if (restore) {
      assert.equal(await run("document.querySelector('#syn-current').value"),'386');
      assert.equal(await run("document.querySelector('#syn-box-credit-2').value"),'11111');
      assert.equal(await run("document.querySelector('#syn-monthly').value"),'20');
      assert.ok(await run("!!document.querySelector('#syn-joint')"));
      result.coldRestart = true;
    } else {
      for (const [input, expected] of [['1.001K','1,001'],['2.01M','2,010,000'],['1.07B','1,070,000,000'],['0.07万','700'],['0.29亿','29,000,000']]) {
        await fill('syn-cash-credit',input);
        assert.ok(await run("!!document.querySelector('#syn-joint')"),input+' should be accepted');
        assert.equal(await run("document.querySelector('.syn-costs tbody tr').cells[2].textContent"),expected);
      }
      await shot('decimal-units-accepted');
      await fill('syn-cash-credit','1.0001K');
      assert.ok(await run("document.querySelector('.syn-error').textContent.includes('信用点现有数量')"));
      assert.equal(await run("!!document.querySelector('#syn-joint')"),false);
      await fill('syn-cash-credit','0');
      result.decimalUnitsAndFractionalRejection = true;
      const profileBefore = await run("JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.includes('/profiles/'))))");
      await fill('syn-current',399); await fill('syn-target',401);
      await run("document.querySelector('#syn-custom').click()");
      for (const name of ['信用点','战斗数据辑','芯尘']) {
        await run(`(()=>{const el=document.querySelector('input[aria-label="${name}每小时产出"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'100');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await delay(25);
      }
      await fill('syn-cash-credit',10715063); await fill('syn-cash-battle',118160775); await fill('syn-cash-core',22000); await fill('syn-monthly',1);
      assert.equal(await run("document.querySelector('#syn-joint').textContent"),'400级');
      assert.equal(await run("document.querySelector('#syn-special-level').textContent"),'401 级');
      assert.ok(await run("document.querySelector('.syn-plan').textContent.includes('仍缺 1,000')"));
      await fill('syn-box-core-1',10);
      assert.ok(await run("document.querySelector('.syn-plan').textContent.includes('仍缺 100')"));
      await run("document.querySelector('#syn-reserve').click()"); await delay(40);
      assert.equal(await run("document.querySelectorAll('.syn-shortfall').length"),0);
      result.targetAndSpecialAndReserve = true;
      await fill('syn-box-core-1',-1);
      assert.equal(await run("document.querySelector('#syn-joint')"),null);
      assert.ok(await run("document.querySelector('.syn-error').textContent.includes('芯尘 1 小时箱')"));
      await fill('syn-box-core-1',0);
      await run("location.hash='/my'"); await delay(150);
      await run("location.hash='/tools'"); await until("!!document.querySelector('#syn-current')");
      assert.equal(await run("document.querySelector('#syn-current').value"),'399');
      result.validationAndRouteRestore = true;
      await fill('syn-current',386); await fill('syn-base',483);
      await run("document.querySelector('#syn-custom').click();document.querySelector('#syn-reserve').click()"); await delay(40);
      await fill('syn-cash-credit','7M'); await fill('syn-cash-battle','1M'); await fill('syn-cash-core','1');
      const rows = { credit:[21,31,86,2,11111,0], battle:[15,29,11,2,292,569], core:[0,111,1,0,117,0] };
      for (const [resource,counts] of Object.entries(rows)) for (let i=0;i<6;i++) await fill(`syn-box-${resource}-${[24,12,8,4,2,1][i]}`,counts[i]);
      await fill('syn-monthly',20); await fill('syn-choice',50);
      assert.equal(await run("document.querySelector('#syn-joint').textContent"),'398级');
      await shot('wide');
      await run("document.querySelector('#panel-synchro-planner').scrollTop=800"); await shot('plans');
      await run("document.querySelector('#panel-synchro-planner').scrollTop=1400"); await shot('opening-plans');
      win.setContentSize(390,844); await delay(150);
      await run("document.documentElement.dataset.theme='dark';document.querySelector('#panel-synchro-planner').scrollTop=0");
      assert.ok(await run("document.documentElement.scrollWidth<=innerWidth && document.querySelector('#panel-synchro-planner').scrollWidth<=document.querySelector('#panel-synchro-planner').clientWidth+1"));
      await shot('narrow-dark');
      await run("document.querySelector('.syn-plan-grid').scrollIntoView({block:'start'})"); await shot('narrow-plans');
      const saved = await run(`localStorage.getItem(${JSON.stringify(key)})`);
      web.reload(); await until("!!document.querySelector('#syn-current')");
      assert.equal(await run(`localStorage.getItem(${JSON.stringify(key)})`),saved);
      assert.equal(await run("document.querySelector('#syn-box-credit-2').value"),'11111');
      const profileAfter = await run("JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.includes('/profiles/'))))");
      assert.equal(profileAfter,profileBefore);
      result.offlineReloadAndProfileUnchanged = true;
      await run(`localStorage.setItem(${JSON.stringify(key)},'{bad');location.hash='/my'`); await delay(100);
      await run("location.hash='/tools'"); await until("!!document.querySelector('#syn-current')");
      assert.ok(await run("document.querySelector('.syn-error').textContent.includes('无法恢复')"));
      assert.equal(await run(`localStorage.getItem(${JSON.stringify(key)})`),'{bad');
      await run(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(saved)})`);
      result.corruptDraftPreserved = true;
      result.narrowNoOverflow = true;
    }
    assert.deepEqual(errors,[]);
    await web.session.flushStorageData();
    win.destroy();
    fs.writeFileSync(path.join(root,restore?'restart.json':'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
    app.exit(0);
  } catch (error) {
    result.error=error.stack;
    await shot('failed');
    fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify(result,null,2));
    console.error(JSON.stringify(result,null,2));
    win.destroy(); app.exit(1);
  }
}).catch(error=>{console.error(error);app.exit(1)});
setTimeout(()=>app.exit(2),90000).unref();
