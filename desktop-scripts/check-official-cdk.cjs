const { app, BrowserWindow, WebContentsView, protocol, net, ipcMain, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { OFFICIAL_CDK_URL, createOfficialCdk, registerOfficialCdk } = require('../electron/official-cdk.cjs');
const live = process.argv.includes('--live');
const project = path.resolve(__dirname, '..');
const root = path.join('E:/博哥/codex temp/nikke-desktop/official-cdk', (live ? 'live-' : 'ui-') + Date.now());
fs.mkdirSync(root, { recursive: true });
app.setPath('userData', path.join(root, 'data'));
app.setPath('sessionData', path.join(root, 'session'));
protocol.registerSchemesAsPrivileged([{ scheme: 'nikke', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const result = { live, root };
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  protocol.handle('nikke', request => {
    const url = new URL(request.url);
    const base = path.join(project, url.host === 'app' ? 'dist' : 'dist/tools');
    const file = path.resolve(base, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
  let offline = false;
  if (!live) {
    session.fromPartition('persist:nikke-official-cdk').protocol.handle('https', () => {
      if (offline) return Response.error();
      return new Response('<!doctype html><meta charset="utf-8"><title>兑换网页隔离验收</title><h1>兑换网页测试内容</h1><button id="login" onclick="window.open(\'https://milo.qq.com/login-test\')">登录弹窗</button><a id="blocked" href="nikke://app/">测试本地协议隔离</a>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    });
  }
  const win = new BrowserWindow({ width: 1280, height: 960, show: false, webPreferences: {
    preload: path.join(project, 'electron/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false,
  } });
  const host = win.webContents;
  const service = createOfficialCdk({ window: win, onState: state => {
    if (!win.isDestroyed()) host.send('official-cdk:state', state);
  } });
  registerOfficialCdk({ ipcMain, service, requireSender: event => {
    assert.equal(event.sender, host);
    assert.equal(event.senderFrame, host.mainFrame);
  } });
  async function until(predicate) {
    for (let index = 0; index < 500; index++) {
      if (await predicate()) return;
      await delay(100);
    }
    throw Error('Timed out waiting for expected page state');
  }
  const run = source => host.executeJavaScript(source);
  const click = async source => { await run(source + ';true'); await delay(150); };
  try {
    await win.loadURL('nikke://app/#/tools');
    await until(() => run("!!document.querySelector('#tab-official-cdk')"));
    await click("document.querySelector('.dlg[aria-label=版本更新] .dlg-x')?.click()");
    await click("document.querySelector('#tab-official-cdk').click()");
    await until(() => win.contentView.children.some(child => child instanceof WebContentsView && child.webContents !== host));
    const view = win.contentView.children.find(child => child instanceof WebContentsView && child.webContents !== host);
    const remote = view.webContents;
    await until(() => !remote.isLoading() && remote.getURL().startsWith('https://nikke.qq.com/'));
    assert.equal(remote.getURL(), OFFICIAL_CDK_URL);
    const publicContent = await remote.executeJavaScript('({title:document.title,text:document.body.innerText})');
    result.title = publicContent.title;
    if (live) {
      assert.ok(publicContent.title.includes('官方网站'));
      assert.ok(publicContent.text.includes('兑换'));
      await until(() => remote.executeJavaScript("!!document.querySelector('.login')"));
      result.officialPageLoaded = true;
    } else {
      assert.ok(publicContent.text.includes('兑换网页测试内容'));
    }
    result.remoteIsolation = await remote.executeJavaScript("typeof window.nikkeDesktop==='undefined' && typeof require==='undefined'");
    assert.ok(result.remoteIsolation);
    assert.notEqual(remote.session, host.session);
    assert.equal(remote.getLastWebPreferences().sandbox, true);
    assert.equal(remote.getLastWebPreferences().nodeIntegration, false);
    async function checkBounds() {
      const rect = await run("(()=>{const r=document.querySelector('.official-cdk-content').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()");
      const zoom = host.getZoomFactor();
      const bounds = view.getBounds();
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(bounds[key] - Math.round(rect[key] * zoom)) <= 2, key + ' bounds mismatch: ' + JSON.stringify({rect, zoom, bounds}));
      assert.ok(view.getVisible());
    }
    await delay(300);
    await checkBounds();
    if (live) {
      win.showInactive();
      await delay(700);
      fs.writeFileSync(path.join(root, 'official-webpage.png'), (await remote.capturePage()).toPNG());
      fs.writeFileSync(path.join(root, 'host-window.png'), (await win.capturePage()).toPNG());
    }
    if (!live) {
      await remote.executeJavaScript("document.querySelector('#login').click();true", true);
      await until(() => BrowserWindow.getAllWindows().length === 2);
      const popup = BrowserWindow.getAllWindows().find(window => window !== win);
      await until(() => !popup.webContents.isLoading());
      assert.equal(popup.webContents.session, remote.session);
      assert.equal(await popup.webContents.executeJavaScript("typeof window.nikkeDesktop+' '+typeof require"), 'undefined undefined');
      popup.close();
      result.popupIsolation = true;
      await remote.executeJavaScript("document.querySelector('#blocked').click();true", true);
      await delay(150);
      assert.equal(remote.getURL(), OFFICIAL_CDK_URL);
      result.localNavigationBlocked = true;
      await click("document.querySelector('#tab-core-dust').click()");
      await until(() => !view.getVisible());
      await click("document.querySelector('#tab-official-cdk').click()");
      await until(() => view.getVisible());
      assert.equal(view.webContents.id, remote.id);
      await run("(()=>{const dialog=document.createElement('div');dialog.id='test-dialog';dialog.setAttribute('role','dialog');document.body.append(dialog)})()");
      await until(() => !view.getVisible());
      await run("document.querySelector('#test-dialog').remove()");
      await until(() => view.getVisible());
      await click("location.hash='/my'");
      await until(() => !view.getVisible());
      await click("location.hash='/tools'");
      await until(() => view.getVisible());
      result.switchingAndOverlay = true;
      win.showInactive();
      host.setZoomFactor(1.5);
      await delay(400);
      await checkBounds();
      win.setSize(1000, 700);
      await delay(400);
      await checkBounds();
      result.zoomAndResize = true;
      offline = true;
      service.reload();
      await until(() => run("document.querySelector('.official-cdk-page [role=alert]')?.textContent.includes('加载失败')"));
      offline = false;
      service.home();
      await until(() => !remote.isLoading() && remote.getURL() === OFFICIAL_CDK_URL);
      await until(() => run("!document.querySelector('.official-cdk-page [role=alert]')"));
      result.failedLoadRecovery = true;
      host.reload();
      await until(() => run("!!document.querySelector('#tab-official-cdk')"));
      await click("document.querySelector('.dlg[aria-label=版本更新] .dlg-x')?.click()");
      await until(() => view.getVisible());
      result.hostReload = true;
    }
    const remoteHandle = remote;
    win.destroy();
    await until(() => remoteHandle.isDestroyed());
    result.disposed = true;
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    app.exit(0);
  } catch (error) {
    result.error = error.stack;
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result, null, 2));
    console.error(JSON.stringify(result, null, 2));
    win.destroy();
    app.exit(1);
  }
}).catch(error => { console.error(error); app.exit(1); });
setTimeout(() => app.exit(2), 150000).unref();
