const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  const {spawn} = require('node:child_process');
  const dir = path.join(root, '.cache/blablalink', (process.argv.includes('--online') ? 'online-' : 'check-') + Date.now());
  fs.mkdirSync(dir, {recursive:true});
  const env = {...process.env, BLABLA_TEST_DIR:dir};
  delete env.ELECTRON_RUN_AS_NODE;
  const fd = fs.openSync(path.join(dir, 'runtime.log'), 'a');
  const child = spawn(require('electron'), [__filename, ...process.argv.slice(2)], {cwd:root, env, windowsHide:true, stdio:['ignore',fd,fd]});
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.on('close', code => {
    fs.closeSync(fd);
    console.log(dir);
    console.log(fs.readFileSync(path.join(dir, 'runtime.log'), 'utf8'));
    process.exitCode = code || 0;
  });
} else {
  const {app, BrowserWindow, protocol, net, session, ipcMain, Menu} = require('electron');
  const {pathToFileURL} = require('node:url');
  const {createBlablaService, registerBlabla, requestJson, allowedNavigation, SESSION_PARTITION} = require('../electron/blablalink.cjs');
  const {ENDPOINTS, WEB_URL, API_ORIGIN, collectAccountData} = require('../electron/blablalink-data.cjs');
  const dir = process.env.BLABLA_TEST_DIR;
  const online = process.argv.includes('--online');
  const interactive = process.argv.includes('--interactive');
  app.setPath('userData', path.join(dir,'userdata'));
  app.setPath('sessionData', path.join(dir,'userdata'));
  protocol.registerSchemesAsPrivileged([{scheme:'nikke',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
  const watchdog = process.argv.includes('--interactive') ? null : setTimeout(() => app.exit(1), 150000);
  let main, service;
  const errors = [];
  app.whenReady().then(async () => {
    const dist = path.join(root,'.cache/blablalink/ui-dist');
    protocol.handle('nikke', request => {
      const url = new URL(request.url);
      const file = path.resolve(dist, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) return new Response('Not found', {status:404});
      return net.fetch(pathToFileURL(file).href);
    });
    main = new BrowserWindow({width:1400,height:1000,show:interactive,title:'NIKKE Photos · 国际服导入隔离验证',webPreferences:{preload:path.join(root,'electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    main.webContents.on('console-message', event => { if (event.level === 'error' || event.level === 3) errors.push(event.message); });
    const requireSender = event => {
      if (event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame || !event.senderFrame.url.startsWith('nikke://app/')) throw new Error('Invalid sender');
    };
    ipcMain.handle('desktop:info', () => ({capabilities:{}}));
    service = createBlablaService({BrowserWindow,session,Menu,parent:() => main,show:interactive,onProgress:state => main.webContents.send('blablalink:progress',state)});
    registerBlabla({ipcMain,requireSender,service});
    const loginSession = session.fromPartition(SESSION_PARTITION);
    const js = code => main.webContents.executeJavaScript(code, true);
    const wait = async (code, timeout = 20000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (await js(code)) return;
        await new Promise(resolve => setTimeout(resolve,60));
      }
      throw new Error('Wait failed: ' + code);
    };
    const click = async label => {
      await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`);
      await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled).click()`);
    };
    const shot = async name => {
      main.showInactive();
      await new Promise(resolve => setTimeout(resolve,150));
      fs.writeFileSync(path.join(dir,name+'.png'), (await main.webContents.capturePage()).toPNG());
      main.hide();
    };
    if (interactive) {
      await main.loadURL('nikke://app/#/profiles');
      await wait("!!document.querySelector('h1')");
      await js("document.querySelectorAll('[role=dialog] button').forEach(b=>{if(/知道|关闭|开始使用/.test(b.textContent))b.click()})");
      await click('导入账号/档案数据');
      await click('登录 BlaBlaLink');
      fs.writeFileSync(path.join(root,'.cache/blablalink/live-check.json'),JSON.stringify({dir,status:'waiting-user'}));
      let checking = false, finished = false;
      const timer = setInterval(async () => {
        if (fs.existsSync(path.join(dir,'stop-check'))) {
          clearInterval(timer);service.dispose();clearTimeout(watchdog);app.exit(finished?0:2);return;
        }
        if (checking || finished || main.isDestroyed()) return;
        checking = true;
        try {
          if (await js("!!document.querySelector('.acc-stats')")) {
            finished = true;
            const report = {passed:true,authenticatedPreview:true};
            fs.writeFileSync(path.join(dir,'live-result.json'),JSON.stringify(report));
            fs.writeFileSync(path.join(root,'.cache/blablalink/live-check.json'),JSON.stringify({dir,status:'preview-ready'}));
            console.log(JSON.stringify(report));
            setTimeout(() => { service.dispose(); clearTimeout(watchdog); app.exit(0); },45000);
          }
        } catch { /* The user may close the window while a renderer probe is pending. */ }
        finally { checking = false; }
      },500);
      main.on('closed', () => {clearInterval(timer);service.dispose();clearTimeout(watchdog);app.exit(finished?0:2);});
      return;
    }
    if (online) {
      service.openLogin();
      const login = BrowserWindow.getAllWindows().find(window => window !== main);
      await new Promise(resolve => {
        const timeout = setTimeout(resolve,35000);
        login.webContents.once('did-finish-load', () => { clearTimeout(timeout); resolve(); });
      });
      await new Promise(resolve => setTimeout(resolve,7000));
      const state = await login.webContents.executeJavaScript(`({title:document.title,text:document.body.innerText.slice(0,7000),host:location.host,bridge:typeof window.nikkeDesktop,node:typeof require})`);
      login.showInactive();
      await new Promise(resolve=>setTimeout(resolve,250));
      fs.writeFileSync(path.join(dir,'official-page.png'),(await login.webContents.capturePage()).toPNG());
      login.hide();
      await login.webContents.executeJavaScript("document.elementFromPoint(212,50).dispatchEvent(new MouseEvent('click',{bubbles:true}))");
      await new Promise(resolve=>setTimeout(resolve,6000));
      state.loginText=await login.webContents.executeJavaScript('document.body.innerText.slice(-7000)');
      login.showInactive();
      await new Promise(resolve=>setTimeout(resolve,250));
      fs.writeFileSync(path.join(dir,'official-login.png'),(await login.webContents.capturePage()).toPNG());
      login.hide();
      fs.writeFileSync(path.join(dir,'public-page.json'),JSON.stringify(state,null,2));
      console.log(JSON.stringify(state));
      service.dispose();
      clearTimeout(watchdog);
      app.exit(state.host === 'www.blablalink.com' && state.bridge === 'undefined' ? 0 : 1);
      return;
    }

    let mode = 'normal', area = '84', requests = [], cookieSeen = false;
    const roster = JSON.parse(fs.readFileSync(path.join(root,'src/data/roster.json'),'utf8')).characters;
    const code = roster.find(character => !character.cnExclusive).nameCode;
    const detail = {name_code:code,lv:400,grade:3,core:2,combat:200000,attractive_lv:30,skill1_lv:8,skill2_lv:9,ulti_skill_lv:10,harmony_cube_tid:1000301,harmony_cube_lv:15,favorite_item_tid:10012,favorite_item_lv:15};
    for (const slot of ['head','torso','arm','leg']) for (let i=1;i<=3;i++) detail[slot+'_equip_option'+i+'_id'] = i===1 ? 101 : 0;
    const responseFor = (endpoint, body) => {
      if (endpoint === 'playerInfo') return {code:0,data:{area_id:area,role_name:'隔离国际服账号'}};
      if (endpoint === 'basicInfo') return {code:0,data:{basic_info:{nickname:'隔离国际服账号'}}};
      if (endpoint === 'outpostInfo') return {code:0,data:{outpost_info:{synchro_level:400,recycle_room_researches:[1101,1102,1103,1201,1202,1203,1204,1205].map(tid=>({tid,lv:100}))}}};
      if (endpoint === 'characters') return {code:0,data:{characters:[{name_code:code}]}};
      if (endpoint === 'characterDetails') return {code:0,data:{character_details:mode==='incomplete'?[]:[detail],state_effects:[{id:101,function_details:[{function_type:'StatAtk',level:10,function_value:-1018}]}]}};
      throw new Error('Unexpected endpoint');
    };
    loginSession.protocol.handle('https', async request => {
      const url = new URL(request.url);
      if (url.origin !== API_ORIGIN) return new Response('<!doctype html><title>隔离登录页面</title><h1>登录验证样例</h1>',{headers:{'Content-Type':'text/html'}});
      const endpoint = Object.keys(ENDPOINTS).find(key => ENDPOINTS[key] === url.pathname);
      if (!endpoint) return new Response('Not allowed',{status:404});
      const body = JSON.parse(await request.text());
      requests.push(endpoint);
      cookieSeen ||= request.headers.get('Cookie')?.includes('qa_login_secret') === true;
      if (mode === 'unauthorized') return new Response('denied',{status:403});
      if (mode === 'rate') return new Response('limited',{status:429});
      if (mode === 'html') return new Response('<html>login</html>');
      if (mode === 'delay' && endpoint === 'characterDetails') await new Promise(resolve => setTimeout(resolve,700));
      if (mode === 'outpost' && endpoint === 'outpostInfo') return new Response('{}',{status:500});
      return Response.json(responseFor(endpoint,body));
    });
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({cancel:/^https?:/.test(details.url)}));
    await loginSession.cookies.set({url:WEB_URL,name:'game_openid',value:'qa_login_secret',domain:'.blablalink.com',secure:true});
    assert.equal(loginSession.isPersistent(),false);
    assert.equal((await session.defaultSession.cookies.get({name:'game_openid'})).length,0);
    assert.equal(allowedNavigation('https://account.levelinfinite.com/'),true);
    assert.equal(allowedNavigation('file:///C:/test'),false);
    assert.equal(allowedNavigation('nikke://app/'),false);
    assert.equal(allowedNavigation('javascript:alert(1)'),false);

    await main.loadURL('nikke://app/#/profiles');
    await wait("!!document.querySelector('h1')");
    await js("document.querySelectorAll('[role=dialog] button').forEach(b=>{if(/知道|关闭|开始使用/.test(b.textContent))b.click()})");
    await click('导入账号/档案数据');
    await wait("!!document.querySelector('.blabla-import')");
    const profileSnapshot = () => js("JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('nikke-photos/profiles/')).sort().map(k=>[k,localStorage.getItem(k)])))");
    const original = await profileSnapshot();
    await click('登录 BlaBlaLink');
    await wait("document.querySelector('.blabla-import')?.textContent.includes('我已登录')");
    const login = BrowserWindow.getAllWindows().find(window => window !== main);
    await new Promise(resolve => setTimeout(resolve,150));
    assert.equal(await login.webContents.executeJavaScript("typeof window.nikkeDesktop"),'undefined');
    assert.equal(await login.webContents.executeJavaScript("typeof require"),'undefined');
    assert.equal(login.webContents.session,loginSession);
    assert.equal(login.webContents.getLastWebPreferences().sandbox,true);
    await click('我已登录，读取账号信息');
    await wait("document.querySelector('.blabla-identity')?.textContent.includes('84')");
    await shot('account-confirm');
    area = '85';
    await click('确认账号并读取角色数据');
    await wait("document.querySelector('.blabla-import [role=alert]')?.textContent.includes('区服已改变')");
    assert.equal(await profileSnapshot(),original);
    area = '84';
    await click('我已登录，读取账号信息');
    await wait("document.querySelector('.blabla-identity')?.textContent.includes('84')");
    mode = 'incomplete';
    await click('确认账号并读取角色数据');
    await wait("document.querySelector('.blabla-import [role=alert]')?.textContent.includes('详情不完整')");
    assert.equal(await profileSnapshot(),original);
    mode = 'rate';
    const beforeRate = requests.length;
    await click('我已登录，读取账号信息');
    await wait("document.querySelector('.blabla-import [role=alert]')?.textContent.includes('429')");
    assert.equal(requests.length-beforeRate,1);
    mode = 'unauthorized';
    await click('我已登录，读取账号信息');
    await wait("document.querySelector('.blabla-import [role=alert]')?.textContent.includes('登录已失效')");
    mode = 'html';
    await click('我已登录，读取账号信息');
    await wait("document.querySelector('.blabla-import [role=alert]')?.textContent.includes('格式异常')");
    mode = 'normal';
    await click('我已登录，读取账号信息');
    await wait("!!document.querySelector('.blabla-identity')");
    mode = 'delay';
    await click('确认账号并读取角色数据');
    await wait("document.querySelector('.blabla-import [role=status]')?.textContent.includes('详情')");
    await click('取消读取');
    await new Promise(resolve => setTimeout(resolve,900));
    assert.equal(await profileSnapshot(),original);
    assert.equal(await js("!!document.querySelector('.acc-stats')"),false);
    assert.equal(BrowserWindow.getAllWindows().length,1);

    mode = 'outpost';
    await click('登录 BlaBlaLink');
    await click('我已登录，读取账号信息');
    await wait("!!document.querySelector('.blabla-identity')");
    await click('确认账号并读取角色数据');
    await wait("!!document.querySelector('.acc-stats')");
    assert.equal(await profileSnapshot(),original);
    assert.equal(await js("document.querySelector('.acc-notices')?.textContent.includes('研究等级未返回')"),true);
    await shot('import-preview-missing');
    await click('重新读取或选择文件');
    mode = 'normal';
    await click('登录 BlaBlaLink');
    await click('我已登录，读取账号信息');
    await wait("!!document.querySelector('.blabla-identity')");
    await click('确认账号并读取角色数据');
    await wait("!!document.querySelector('.acc-stats')");
    assert.equal(await profileSnapshot(),original);
    await shot('import-preview');
    await js("[...document.querySelectorAll('[aria-label=\"导入账号/档案数据\"] button')].find(b=>b.textContent.trim()==='新建存档').click()");
    assert.equal(await profileSnapshot(),original);
    await click('新建并导入');
    await wait("document.querySelector('[aria-label=\"导入账号/档案数据\"]')?.textContent.includes('已创建')");
    const stored = await js("(()=>{const index=JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/index'));return {index,data:JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/data/'+index.currentId))}})()");
    assert.equal(stored.data.characters[code].skills.skill1,8);
    assert.equal(stored.data.characters[code].equipments[0][0].functionType,'StatAtk');
    assert.ok(!JSON.stringify(stored).includes('qa_login_secret'));
    assert.equal(stored.index.profiles.length,2);
    assert.equal(cookieSeen,true);
    await click('完成');
    await click('导入账号/档案数据');
    await click('登录 BlaBlaLink');
    await click('我已登录，读取账号信息');
    await wait("!!document.querySelector('.blabla-identity')");
    detail.skill1_lv = 7;
    await click('确认账号并读取角色数据');
    await wait("!!document.querySelector('.acc-stats')");
    const beforeOverwrite = await profileSnapshot();
    await click('覆盖「隔离国际服账号」存档');
    assert.equal(await profileSnapshot(),beforeOverwrite);
    await click('覆盖');
    await wait("document.querySelector('[aria-label=\"导入账号/档案数据\"]')?.textContent.includes('已更新')");
    assert.equal(await js("JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/data/'+JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/index')).currentId)).characters["+JSON.stringify(code)+"].skills.skill1"),7);
    await click('完成');
    await click('导入账号/档案数据');
    await click('清除登录状态');
    await wait("document.querySelector('.blabla-import [role=status]')?.textContent.includes('已清除')");
    assert.equal((await loginSession.cookies.get({})).length,0);
    main.setSize(390,900);
    await shot('direct-import-390');
    assert.equal(await js("document.documentElement.scrollWidth<=window.innerWidth+1"),true);
    await js("document.documentElement.dataset.theme='dark'");
    main.setSize(1400,1000);
    await shot('direct-import-dark');

    // Data transport checks for missing values, whitelisted output, and account changes at completion.
    const identity = {areaId:'84',roleName:'隔离国际服账号',openId:'qa_login_secret'};
    mode = 'normal';
    detail.core = null;
    const data = await collectAccountData({identity,readOpenId:async()=>identity.openId,request:async(endpoint,body)=>responseFor(endpoint,body),signal:new AbortController().signal});
    assert.equal(data.characters[0].core,null);
    assert.ok(!JSON.stringify(data).includes('qa_login_secret'));
    let identityReads = 0;
    await assert.rejects(() => collectAccountData({
      identity,readOpenId:async()=>identity.openId,signal:new AbortController().signal,
      request:async(endpoint,body) => {
        const payload = responseFor(endpoint,body);
        if (endpoint === 'playerInfo' && ++identityReads === 2) payload.data.area_id = '85';
        return payload;
      },
    }),/读取期间/);
    await assert.rejects(() => requestJson(loginSession, 'invalid', {}, new AbortController().signal),/不支持/);
    assert.deepEqual(errors,[]);
    const report = {passed:true,realSessionTransport:true,sessionIsolated:true,remoteHasNoDesktopBridge:true,identityConfirmed:true,accountChangeRejected:true,incompleteDetailsRejected:true,rateLimitNoRetry:true,expiredSessionVisible:true,invalidResponseVisible:true,cancelNoLateImport:true,missingWarningsVisible:true,previewDoesNotWrite:true,newProfileConfirmed:true,overwriteConfirmed:true,credentialsExcluded:true,logoutClearsSession:true,narrow390:true,dark:true,nullPreserved:true,identityRecheckedAtCompletion:true};
    fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));
    fs.writeFileSync(path.join(root,'.cache/blablalink/latest-check.json'),JSON.stringify({dir,report},null,2));
    console.log(JSON.stringify(report));
    service.dispose();
    clearTimeout(watchdog);
    app.exit(0);
  }).catch(async error => {
    console.error(error.stack);
    if (errors.length) console.error(JSON.stringify(errors));
    if (main && !main.isDestroyed()) {
      main.showInactive();
      fs.writeFileSync(path.join(dir,'failed.png'),(await main.webContents.capturePage()).toPNG());
    }
    service?.dispose();
    clearTimeout(watchdog);
    app.exit(1);
  });
}
