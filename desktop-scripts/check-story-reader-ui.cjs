'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const cache = 'E:/博哥/codex temp/nikke-desktop/story-reader';

if (!process.versions.electron) {
  const {spawn} = require('node:child_process');
  fs.mkdirSync(cache, {recursive:true});
  const directory = fs.mkdtempSync(path.join(cache, 'ui-check-'));
  const env = {...process.env, STORY_UI_DIRECTORY:directory};
  delete env.ELECTRON_RUN_AS_NODE;
  const output = fs.openSync(path.join(directory, 'runtime.log'), 'a');
  function launch(reopen) {
    return new Promise(resolve => {
      const child = spawn(require('electron'), [__filename], {
        cwd:root, windowsHide:true, env:{...env, STORY_UI_REOPEN:reopen ? '1' : '0'}, stdio:['ignore', output, output],
      });
      child.on('error', error => {console.error(error); resolve(1);});
      child.on('close', code => resolve(code));
    });
  }
  (async () => {
    let code = await launch(false);
    if (code === 0) code = await launch(true);
    fs.closeSync(output);
    console.log(directory);
    console.log(fs.readFileSync(path.join(directory, 'runtime.log'), 'utf8'));
    process.exitCode = code || 0;
  })();
} else {
  const {app, BrowserWindow, protocol, net, ipcMain, session} = require('electron');
  const {pathToFileURL} = require('node:url');
  const {createStoryReader, registerStoryReader} = require('../electron/story-reader.cjs');
  const {resourceUrl, CATALOG_PATH} = require('../electron/story-model.cjs');
  const directory = process.env.STORY_UI_DIRECTORY;
  const reopen = process.env.STORY_UI_REOPEN === '1';
  const dataRoot = path.join(directory, 'data');
  app.setPath('userData', path.join(directory, 'userdata'));
  app.setPath('sessionData', path.join(directory, 'userdata'));
  protocol.registerSchemesAsPrivileged([{scheme:'nikke', privileges:{standard:true, secure:true, supportFetchAPI:true, corsEnabled:true}}]);
  const catalog = [0,1].map(chapter => ({
    sub_category_id:{value:chapter, scenes:{value:(chapter === 0 ? ['story_a','story_b','story_c'] : ['story_d']).map((id,index) => ({
      value:{scenario_group_id:id}, scenario_name_localkey:{scenario_name:chapter === 0 ? ['開始','選擇','黎明'][index] : '旅途'},
    }))}}, sub_category_name_localkey:{chapter_name:chapter === 0 ? '墜落' : '啟程'},
  }));
  function rawScene(id) {
    return {scenario_group_id:{value:id, records:{value:Array.from({length:45}, (_, index) => ({
      value:{id:index + 1, speaker:index % 3 === 0 ? 'self' : 'npc', speech_window:index === 3 ? 'Choice' : index % 3 === 0 ? 'Self' : 'Speech', ...(index === 3 ? {jump_target:8} : {})},
      quest_name:index === 5 ? '&lt;img src="https://invalid.example/image" onerror="window.storyUnsafe=1"&gt;'
        : '第 ' + (index + 1) + ' 條記錄。@UserName，這裡是離線閱讀測試。請確認書籤與閱讀位置能夠保存。',
      speaker:{name_localkey:{character_name:'拉毗'}},
    }))}}};
  }
  let window, service;
  let mode = reopen ? 'offline' : 'normal';
  let calls = 0;
  let external = 0;
  const errors = [];
  const watchdog = setTimeout(() => {console.error('Story UI timed out'); service?.cancel(); app.exit(1);}, 150000);

  app.whenReady().then(async () => {
    protocol.handle('nikke', request => {
      const url = new URL(request.url);
      const base = url.host === 'app' ? path.join(cache, 'ui-dist') : path.join(root, 'public/tools');
      const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = path.resolve(base, '.' + name);
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('Not found', {status:404});
      return net.fetch(pathToFileURL(file).href);
    });
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const blocked = /^https?:/.test(details.url);
      if (blocked) external++;
      callback({cancel:blocked});
    });
    const fakeFetch = async (url, options) => {
      calls++;
      if (mode === 'offline') throw Object.assign(Error('offline'), {retryable:false});
      if (url === resourceUrl(CATALOG_PATH)) return new Response(JSON.stringify(catalog));
      const id = ['story_a','story_b','story_c','story_d'].find(id => resourceUrl('scene/zh-TW/scene_detail_' + id + '_zh-TW.json') === url);
      if (!id) throw Error('Unexpected URL');
      if (mode === 'partial' && id === 'story_b') return new Response('Forbidden', {status:403});
      if (mode === 'slow') await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 10000);
        options.signal.addEventListener('abort', () => {clearTimeout(timer); reject(Error('aborted'));}, {once:true});
      });
      return new Response(JSON.stringify(mode === 'bad' ? rawScene('wrong_identity') : rawScene(id)));
    };
    window = new BrowserWindow({width:1440, height:1050, show:false,
      webPreferences:{preload:path.join(root,'electron/preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true, backgroundThrottling:false}});
    const requireSender = event => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith('nikke://app/')) throw Error('Invalid sender');
    };
    service = createStoryReader({dataRoot, fetchImpl:fakeFetch, interval:5, onProgress:state => window.webContents.send('story-reader:progress',state)});
    registerStoryReader({ipcMain, requireSender, service});
    ipcMain.handle('desktop:info', () => ({capabilities:{}}));
    window.webContents.on('console-message', event => {if(event.level === 'error') errors.push(event.message);});
    const js = code => window.webContents.executeJavaScript(code, true);
    const wait = async (condition, timeout = 15000) => {
      const limit = Date.now() + timeout;
      while (Date.now() < limit) {
        if (await js(condition)) return;
        await new Promise(resolve => setTimeout(resolve, 60));
      }
      throw Error('Wait failed: ' + condition);
    };
    const click = text => js('(' + ((text) => {
      const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text && !button.disabled && button.getClientRects().length);
      if (!button) throw Error('Missing visible button ' + text);
      button.click();
    }).toString() + ')(' + JSON.stringify(text) + ')');
    const field = (label, value) => js('(' + ((label,value) => {
      const item = [...document.querySelectorAll('.story-page label')].find(item => item.firstChild?.textContent === label);
      if (!item) throw Error('Missing field '+label);
      const control = item.querySelector('input,select');
      Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype,'value').set.call(control,String(value));
      control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input',{bubbles:true}));
    }).toString() + ')(' + JSON.stringify(label) + ',' + JSON.stringify(value) + ')');
    const shot = async name => {
      window.showInactive();
      window.webContents.invalidate();
      await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      await new Promise(resolve => setTimeout(resolve, 300));
      fs.writeFileSync(path.join(directory,name+'.png'), (await window.webContents.capturePage()).toPNG());
      window.hide();
    };
    await window.loadURL('nikke://app/#/tools');
    await wait("!!document.querySelector('.tools-switcher')");
    await js("document.querySelectorAll('[role=dialog] button').forEach(b=>{if(/知道|关闭|开始使用/.test(b.textContent))b.click()})");
    await click('主线剧情');
    await wait("document.querySelector('.story-header')?.textContent.includes('阅读记录自动保存')");
    if (reopen) {
      await wait("document.querySelectorAll('.story-row').length===45");
      await wait("document.querySelector('.story-bookmarks summary')?.textContent.includes('1')");
      assert.equal(calls,0,'cold startup must use cached catalog and scene');
      assert.equal(service.snapshot().reading.preferences.fontSize,22);
      assert.equal(service.snapshot().reading.preferences.player,'测试指挥官');
      await wait("document.querySelector('.story-reader-scroll')?.scrollTop>200&&!document.querySelector('.story-reader').textContent.includes('正在打开剧情')");
      await shot('cold-offline-restored');
      const report = JSON.parse(fs.readFileSync(path.join(directory,'result.json'),'utf8'));
      report.coldProcessOfflineRestore = true;
      fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify(report));
      clearTimeout(watchdog);
      app.exit(0);
      return;
    }

    await click('获取主线目录');
    await wait("document.querySelectorAll('.story-scenes button').length===3");
    assert.ok(await js("document.querySelector('.story-scenes').textContent.includes('未读小节')"));
    await js("document.querySelector('.story-scenes button').click()");
    await wait("document.querySelectorAll('.story-row').length===45");
    await wait("!document.querySelector('.story-reader').textContent.includes('正在打开剧情')");
    assert.ok(await js("document.querySelector('.story-scene-header h2').textContent==='开始'"));
    assert.equal(await js("document.querySelectorAll('.story-prose img').length"),0);
    assert.equal(await js("window.storyUnsafe===undefined"),true);
    assert.equal(await js("document.querySelector('.story-row-choice strong').textContent"),'选项');
    await shot('reader-light');

    await click('阅读设置');
    await field('字号',22);
    await wait("getComputedStyle(document.querySelector('.story-prose')).fontSize==='22px'");
    await field('指挥官名字','测试指挥官');
    await click('保存名字');
    await wait("document.querySelector('.story-prose').textContent.includes('测试指挥官')");
    await js("document.querySelector('[aria-label=\"添加书签 19\"]').click()");
    await wait("document.querySelector('.story-bookmarks summary').textContent.includes('1')");
    await js("(()=>{const root=document.querySelector('.story-reader-scroll'),row=document.querySelector('[data-story-row=\"18\"]');root.scrollTop+=row.getBoundingClientRect().top-root.getBoundingClientRect().top-24})()");
    await new Promise(resolve => setTimeout(resolve,700));
    assert.ok(service.snapshot().reading.positions.story_a.index >= 17);
    await shot('reader-settings');

    const oldScene = fs.readFileSync(path.join(dataRoot,'tools/story-reader/scenes/story_a.json'),'utf8');
    mode = 'bad';
    await click('重新下载本节');
    await wait("document.querySelector('.story-error')?.textContent.includes('编号不一致')");
    assert.equal(fs.readFileSync(path.join(dataRoot,'tools/story-reader/scenes/story_a.json'),'utf8'),oldScene);
    assert.equal(await js("document.querySelectorAll('.story-row').length"),45);
    mode = 'partial';
    await click('下载本章');
    await wait("document.querySelector('.story-download')?.textContent.includes('部分下载失败')");
    assert.equal(service.snapshot().downloaded.length,2);
    mode = 'normal';
    await click('下载本章');
    await wait("document.querySelector('.story-download')?.textContent.includes('下载完成 · 3/3')");
    assert.equal(service.snapshot().downloaded.length,3);
    await click('标为已读');
    await wait("document.querySelector('.story-scene-header').textContent.includes('标为未读')");
    await js("document.querySelector('.story-search summary').click()");
    await field('搜索内容','离线');
    await click('搜索');
    await wait("document.querySelector('.story-search [role=status]')?.textContent.includes('100')");
    assert.equal(await js("document.querySelectorAll('.story-search>div>button').length"),100);

    await field('选择章节','1');
    mode = 'slow';
    await click('下载本章');
    await wait("document.querySelector('.story-download').textContent.includes('正在下载')");
    await click('取消下载');
    await wait("document.querySelector('.story-download').textContent.includes('已取消')");
    assert.equal(service.snapshot().downloaded.length,3);
    mode = 'offline';
    await field('选择章节','0');
    await js("document.querySelectorAll('.story-scenes button')[1].click()");
    await wait("document.querySelector('.story-scene-header h2').textContent==='选择'");
    await click('下一节');
    await wait("document.querySelector('.story-scene-header h2').textContent==='黎明'");
    await js("document.querySelector('.story-bookmarks summary').click()");
    await js("document.querySelector('.story-bookmarks>div>button').click()");
    await wait("document.querySelector('.story-scene-header h2').textContent==='开始'");
    await wait("document.querySelector('.story-reader-scroll').scrollTop>200");
    await new Promise(resolve => setTimeout(resolve,500));
    assert.equal(service.snapshot().reading.positions.story_a.index,18);
    if (await js("!!document.querySelector('.story-error')")) await click('收起提示');
    await click('阅读设置');
    await js("document.querySelector('.story-search summary').click();document.querySelector('.story-bookmarks summary').click()");
    await js("document.documentElement.dataset.theme='dark';document.querySelector('.story-page').scrollIntoView()");
    await shot('reader-dark');
    window.setSize(390,920);
    await js("document.querySelector('.story-reader').scrollIntoView()");
    await shot('reader-390');
    assert.ok(await js("document.querySelector('.nikke-tool-panel:not([hidden])').scrollWidth<=document.querySelector('.nikke-tool-panel:not([hidden])').clientWidth+1"));
    assert.equal(external,0,'story markup must not trigger external requests');
    assert.deepEqual(errors,[]);
    const report = {passed:true,normalToolEntry:true,simplifiedText:true,richTextSafe:true,branchMarkers:true,
      preferenceAndPlayer:true,bookmarksAndPosition:true,failedRefreshPreservesOld:true,chapterPartialRetry:true,
      cancellation:true,offlineNavigation:true,localSearch:true,spoilerTitles:true,narrow390:true,dark:true};
    fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
    clearTimeout(watchdog);
    service.cancel();
    app.exit(0);
  }).catch(async error => {
    console.error(error.stack || error);
    console.error(JSON.stringify(errors));
    clearTimeout(watchdog);
    service?.cancel();
    try {
      if (window) {
        window.showInactive();
        fs.writeFileSync(path.join(directory,'failed.png'),(await window.webContents.capturePage()).toPNG());
      }
    } catch {}
    app.exit(1);
  });
}
