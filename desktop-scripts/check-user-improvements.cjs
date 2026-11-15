const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { PNG } = require('pngjs');
const project = path.resolve(__dirname, '..');
const root = path.join('E:/博哥/codex temp/nikke-desktop/user-improvements', String(Date.now()));
const defectsOnly = process.argv.includes('--defects-only');
fs.mkdirSync(root, { recursive: true });
app.setPath('userData', path.join(root, 'data'));
app.setPath('sessionData', path.join(root, 'session'));
protocol.registerSchemesAsPrivileged([{ scheme: 'nikke', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];

app.whenReady().then(async () => {
  protocol.handle('nikke', request => {
    const url = new URL(request.url);
    const base = path.join(project, url.host === 'app' ? 'dist' : 'dist/tools');
    const file = path.resolve(base, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
  const { createResourceIncomeStore } = await import('../electron/resource-income-store.mjs');
  const income = createResourceIncomeStore(path.join(root, 'data'));
  for (const [name, action] of Object.entries({ read: () => income.read(), restore: file => income.restore(file) })) {
    ipcMain.handle('resource-income:' + name, (_event, value) => action(value));
  }
  const { createStoryReader, registerStoryReader } = require('../electron/story-reader.cjs');
  const story = createStoryReader({ dataRoot: path.join(root, 'data') });
  registerStoryReader({ ipcMain, requireSender: () => {}, service: story });
  const win = new BrowserWindow({ width: 1280, height: 960, show: false,
    webPreferences: { preload: path.join(project, 'electron/preload.cjs'), sandbox: true, contextIsolation: true, backgroundThrottling: false, offscreen: true } });
  const web = win.webContents;
  const run = source => web.executeJavaScript(source);
  web.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_request, callback) => callback({ cancel: true }));
  async function until(source, execute = run) {
    for (let attempt = 0; attempt < 300; attempt++) {
      if (await execute(source)) return;
      await delay(60);
    }
    throw Error('Timeout ' + source);
  }
  const route = async hash => { await run(`location.hash=${JSON.stringify(hash)}`); await delay(200); };
  async function click(text, scope = 'document') {
    await run(`(() => { const button=[...${scope}.querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(text)}); if(!button)throw Error('Missing button '+${JSON.stringify(text)}); button.click(); })()`);
    await delay(120);
  }
  async function shot(name) {
    fs.writeFileSync(path.join(root, name + '.png'), (await web.capturePage()).toPNG());
  }
  async function check(name, action) {
    try { await action(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.stack }); await shot(name + '-failed'); }
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({ root, defectsOnly, results }, null, 2));
  }
  const input = label => `[...document.querySelectorAll('.form-row')].find(row=>row.querySelector('.form-label')?.textContent===${JSON.stringify(label)}).querySelector('input')`;
  async function fill(label, value) {
    await run(`(() => { const input=${input(label)}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await delay(150);
  }
  await win.loadURL('nikke://app/');
  await until("!!document.querySelector('.topbar')");
  await run("document.querySelector('.dlg[aria-label=版本更新] .dlg-x')?.click()");
  const codes = require('../src/data/roster.json').characters.slice(0, 2).map(item => String(item.nameCode));
  const dataKey = 'nikke-photos/profiles/v1/data/default';
  const indexKey = 'nikke-photos/profiles/v1/index';
  const seed = { version: 2, characters: Object.fromEntries(codes.map(code => [code, { combat: 12345, skills: {} }])) };
  await run(`localStorage.setItem(${JSON.stringify(dataKey)},${JSON.stringify(JSON.stringify(seed))})`);
  await check('invalid-draft-resets-between-characters', async () => {
    await route('/data?code=' + codes[0]);
    await until("!!document.querySelector('.form')");
    await fill('技能 1', '99');
    assert.equal(await run(`${input('技能 1')}.value`), '99');
    await route('/data?code=' + codes[1]);
    assert.equal(await run(`${input('技能 1')}.value`), '');
    assert.equal(await run(`${input('技能 1')}.getAttribute('aria-invalid')`), null);
    await fill('技能 1', '99');
    assert.ok(await run("document.querySelector('.data-editor-head').textContent.includes('存在无效输入')"));
    await fill('技能 1', '10');
    assert.equal(await run(`JSON.parse(localStorage.getItem(${JSON.stringify(dataKey)})).characters[${JSON.stringify(codes[1])}].skills.skill1`), 10);
    await fill('技能 1', '99');
    await click('清空该角色数据');
    assert.notEqual(await run(`${input('技能 1')}.value`), '99');
  });
  await check('reroll-invalidates-result-and-details', async () => {
    await route('/tools');
    await run("document.querySelector('#tab-equipment-reroll').click()");
    await until("!!document.querySelector('iframe[title=洗词条计算器]')");
    let frame;
    for (let i = 0; i < 100; i++) {
      frame = web.mainFrame.frames.find(item => item.url.includes('/equipment-reroll/index.html'));
      if (frame) break;
      await delay(50);
    }
    const frameRun = source => frame.executeJavaScript(source);
    await until("!!document.querySelector('#target-rows .stat-select')", frameRun);
    await frameRun("(()=>{const input=document.querySelector('#target-rows .stat-select'); input.value='攻击力增加';input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#calculate').click()})()");
    await until("document.querySelector('#result').textContent.includes('12.8')", frameRun);
    await frameRun("(()=>{const input=document.querySelector('#target-rows .tier-select');input.value='15';input.dispatchEvent(new Event('change',{bubbles:true}))})()");
    assert.ok(await frameRun("document.querySelector('#result').textContent.includes('重新计算')"));
    assert.ok(!await frameRun("document.querySelector('#result').textContent.includes('12.8')"));
    assert.ok(!await frameRun("document.querySelector('#details').textContent.includes('12.8')"));
    await frameRun("document.querySelector('#calculate').click()");
    await until("document.querySelector('#result').textContent.includes('104.5')", frameRun);
  });
  if (!defectsOnly) {
    await check('navigation-and-statistics-guidance', async () => {
      await route('/my');
      assert.ok(await run("document.body.textContent.includes('录入模板') && document.body.textContent.includes('备份与恢复')"));
      await route('/tools');
      assert.equal(await run("document.querySelector('#tab-equipment-reroll').getAttribute('aria-selected')"), 'true');
      await web.reload();
      await until("document.querySelector('#tab-equipment-reroll')?.getAttribute('aria-selected')==='true'");
      await run("document.querySelector('.dlg[aria-label=版本更新] .dlg-x')?.click()");
      await route('/stats');
      assert.ok(await run("document.body.textContent.includes('当前没有四件装备完整的角色')"));
      await click('编辑表格角色');
      assert.ok(await run("document.querySelector('.et-body').textContent.includes('待补齐装备') && document.querySelector('.et-body').textContent.includes('头部、身躯、臂部、腿部')"));
      assert.ok(await run("!!document.querySelector('.et-body a[href^=\"#/data?code=\"]')"));
      await click('完成');
    });
    await route('/backups');
    await until("document.querySelectorAll('[data-backup]').length===5");
    // Supply files through the normal change handler while suppressing the native file dialog in this hidden test.
    await run("document.addEventListener('click',event=>{if(event.target.matches('input[type=file]'))event.preventDefault()},true)");
    async function upload(category, data) {
      await click('选择备份恢复', `document.querySelector('[data-backup=${category}]')`);
      await run(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(JSON.stringify(data))}],'test.json',{type:'application/json'}));const input=document.querySelector('.backup-page input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
      await delay(200);
    }
    async function restore(category, data) {
      await upload(category, data);
      await until("!!document.querySelector('[aria-label=确认恢复备份]')");
      await click('确认恢复');
      await until("!document.querySelector('[aria-label=确认恢复备份]')");
    }
    async function download(category) {
      const file = path.join(root, category + '-backup.json');
      const done = new Promise((resolve, reject) => {
        web.session.once('will-download', (_event, item) => {
          item.setSavePath(file);
          item.once('done', (_event, state) => state === 'completed' ? resolve() : reject(Error(state)));
        });
      });
      await click('导出备份', `document.querySelector('[data-backup=${category}]')`);
      await done;
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    const png = new PNG({ width: 2, height: 2 });
    png.data.fill(255);
    const image = { data: 'data:image/png;base64,' + PNG.sync.write(png).toString('base64'), name: '测试.png' };
    const now = new Date().toISOString();
    const customId = 'custom-00000000-0000-4000-8000-000000000001';
    const custom = { format: 'nikke-photos-custom-backup', version: 1, items: [{ schemaVersion: 1, id: customId, nameCn: '备份验收角色',
      element: 'Fire', corporation: 'ELYSION', class: 'Attacker', use_burst_skill: 'Step3', original_rare: 'SSR', weapon_type: '',
      createdAt: now, updatedAt: now, deletedAt: null, avatarImage: image, artworkImage: image }] };
    await check('custom-images-restore-and-name-conflict-atomic', async () => {
      await restore('custom', custom);
      const exported = await download('custom');
      assert.equal(exported.items[0].avatarImage.data, image.data);
      assert.equal(exported.items[0].artworkImage.width, 2);
      const conflict = structuredClone(custom);
      conflict.items[0].id = 'custom-00000000-0000-4000-8000-000000000002';
      await upload('custom', conflict);
      await click('确认恢复');
      await until("document.querySelector('[aria-label=确认恢复备份]')?.textContent.includes('角色名称冲突')");
      await click('取消');
      assert.equal((await download('custom')).items.length, 1);
    });
    await check('profiles-round-trip-cancel-and-write-failure', async () => {
      const original = await download('profiles');
      original.profiles[0].characters[customId] = { combat: 54321 };
      original.profiles[0].schemes = [{ id: 'audit-template', name: '备份录入模板', skills: { skill1: 8 }, forceReplace: true }];
      const before = await run(`JSON.parse(localStorage.getItem(${JSON.stringify(indexKey)})).profiles.length`);
      await upload('profiles', original);
      await click('取消');
      assert.equal(await run(`JSON.parse(localStorage.getItem(${JSON.stringify(indexKey)})).profiles.length`), before);
      await restore('profiles', original);
      let exported = await download('profiles');
      assert.equal(exported.profiles.length, before + original.profiles.length);
      assert.equal(exported.profiles.at(-1).characters[customId].combat, 54321);
      assert.equal(exported.profiles.at(-1).schemes[0].skills.skill1, 8);
      assert.equal(exported.profiles.at(-1).schemes[0].forceReplace, true);
      const saved = await run('JSON.stringify({...localStorage})');
      await upload('profiles', original);
      await run(`window.auditOriginalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===${JSON.stringify(indexKey)})throw Error('injected disk full');return window.auditOriginalSet.call(this,key,value)};true`);
      await click('确认恢复');
      await until("document.querySelector('[aria-label=确认恢复备份]')?.textContent.includes('injected disk full')");
      await run('Storage.prototype.setItem=window.auditOriginalSet;delete window.auditOriginalSet');
      assert.equal(await run('JSON.stringify({...localStorage})'), saved);
      await click('取消');
      const invalid = structuredClone(original);
      invalid.profiles[0].characters[codes[0]] = { equipments: [[{ functionType: 'StatAtk', level: 1, value: 4.77 }, { functionType: 'StatAtk', level: 1, value: 4.77 }]] };
      await upload('profiles', invalid);
      assert.ok(await run("document.querySelector('[role=alert]').textContent.includes('重复')"));
      assert.equal(await run('JSON.stringify({...localStorage})'), saved);
    });
    await check('income-and-story-restoration', async () => {
      income.upsert({ date: '2026-11-01', stones: 2, keys: 0 });
      const incomeBackup = await download('income');
      income.upsert({ date: '2026-11-02', stones: 7 });
      await restore('income', incomeBackup);
      assert.equal(income.read().records.length, 1);
      assert.equal(JSON.parse(fs.readFileSync(income.file + '.bak')).records.length, 2);
      const reading = require('../electron/story-model.cjs').defaultReading();
      reading.preferences.fontSize = 24;
      reading.bookmarks = [{ sceneId: 'd_main_01_01_s', index: 0, recordId: '1' }];
      reading.positions = { d_main_01_01_s: { index: 0, recordId: '1' } };
      reading.lastSceneId = 'd_main_01_01_s';
      reading.read = ['d_main_01_01_s'];
      const storyFile = { format: 'nikke-photos-story-reading', version: 1, reading };
      await restore('story', storyFile);
      assert.deepEqual((await download('story')).reading, reading);
      const reopened = createStoryReader({ dataRoot: path.join(root, 'data') });
      assert.deepEqual(reopened.backup().reading, reading);
      const invalid = structuredClone(storyFile);
      invalid.reading.preferences.fontSize = 999;
      await upload('story', invalid);
      assert.ok(await run("document.querySelector('[role=alert]').textContent.includes('阅读设置无效')"));
      assert.deepEqual(story.backup().reading, reading);
    });
    await check('damage-library-backup-round-trip', async () => {
      const { DAMAGE_CATALOG, presetMember, defaultBattle } = await import('../src/lib/damageSimulator.js');
      const { LIBRARY_FORMAT } = await import('../src/lib/damageLibraryModel.js');
      const code = DAMAGE_CATALOG.characters.find(item => item.supported).code;
      const file = { format: LIBRARY_FORMAT, version: 1, engine: DAMAGE_CATALOG.commit, folders: [{ id: 'folder', name: '验收分组' }],
        items: [{ id: 'single', folderId: 'folder', kind: 'single', version: 1, engine: DAMAGE_CATALOG.commit, title: '备份验收编队', note: '备注', revision: 1,
          createdAt: now, updatedAt: now, payload: { name: '备份验收编队', members: [presetMember(code)], battle: defaultBattle() } }] };
      await restore('damage', file);
      const exported = await download('damage');
      assert.equal(exported.items[0].title, '备份验收编队');
      assert.equal(exported.items[0].note, '备注');
      assert.equal(exported.folders[0].name, '验收分组');
      await restore('damage', exported);
      assert.equal((await download('damage')).items.length, 2);
    });
    await check('backup-narrow-dark-and-reload', async () => {
      await shot('backup-wide');
      win.setSize(390, 844);
      await run("document.documentElement.dataset.theme='dark'");
      await delay(200);
      assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));
      await shot('backup-narrow-dark');
      await web.reload();
      await until("document.querySelectorAll('[data-backup]').length===5");
      await run("document.querySelector('.dlg[aria-label=版本更新] .dlg-x')?.click()");
      assert.equal((await download('custom')).items.length, 1);
      assert.equal((await download('damage')).items.length, 2);
      assert.equal((await download('story')).reading.preferences.fontSize, 24);
    });
  }
  console.log(JSON.stringify({ root, results }, null, 2));
  win.destroy();
  app.exit(results.every(result => result.passed) ? 0 : 1);
}).catch(error => { console.error(error); app.exit(1); });
setTimeout(() => { console.error('Verification timed out', root); app.exit(2); }, 180000).unref();
