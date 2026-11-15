'use strict';

const {randomUUID} = require('node:crypto');
const {WEB_URL, API_ORIGIN, ENDPOINTS, checkAbort, readIdentity, collectAccountData} = require('./blablalink-data.cjs');
const SESSION_PARTITION = 'nikke-blablalink-account';
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

function allowedNavigation(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function requestJson(loginSession, endpoint, body, signal) {
  if (!Object.hasOwn(ENDPOINTS, endpoint)) throw new Error('不支持的账号读取接口');
  checkAbort(signal);
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, {once:true});
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
  try {
    // Match the userscript's readable page cookies while retaining API HttpOnly cookies.
    const [apiCookies, pageCookies] = await Promise.all([
      loginSession.cookies.get({url:API_ORIGIN + '/'}),
      loginSession.cookies.get({url:WEB_URL}),
    ]);
    checkAbort(signal);
    const cookies = new Map(apiCookies.map(cookie => [cookie.name, cookie.value]));
    for (const cookie of pageCookies) if (!cookie.httpOnly) cookies.set(cookie.name, cookie.value);
    const headers = {'Content-Type':'application/json', Accept:'application/json', Origin:new URL(WEB_URL).origin, Referer:WEB_URL};
    if (cookies.size) headers.Cookie = [...cookies].map(([name, value]) => name + '=' + value).join('; ');
    const response = await loginSession.fetch(API_ORIGIN + ENDPOINTS[endpoint], {
      method:'POST', headers, body:JSON.stringify(body), credentials:'include',
      redirect:'error', signal:controller.signal,
    });
    if (response.status === 429) throw new Error('官方接口限流（429），请稍后手动重试。');
    if (response.status === 401 || response.status === 403) throw new Error('登录已失效或请求被拒绝，请打开官方窗口重新登录后重试。');
    if (!response.ok) throw new Error('官方接口暂不可用（HTTP ' + response.status + '），请稍后重试。');
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) throw new Error('官方响应超过读取上限，请稍后重试。');
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    checkAbort(signal);
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error('官方接口返回格式异常，请在登录窗口确认登录状态后重试。'); }
  } catch (error) {
    if (signal?.aborted) throw new Error('读取已取消');
    if (timedOut) throw new Error('读取超时，请检查网络后重试。');
    // Fetch errors can include URLs. Only our fixed, human-readable messages reach the UI.
    if (error.message?.startsWith('官方') || error.message?.startsWith('登录')) throw error;
    throw new Error('连接 BlaBlaLink 失败，请检查网络后重试。');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

function createBlablaService({BrowserWindow, session, Menu, parent, onProgress = () => {}, show = true}) {
  const loginSession = session.fromPartition(SESSION_PARTITION, {cache:false});
  const windows = new Set();
  let loginWindow = null;
  let active = null;
  let selection = null;
  let resetting = false;
  let disposed = false;
  let closingWindows = false;
  loginSession.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
  loginSession.setPermissionCheckHandler(() => false);
  const preventDownload = event => event.preventDefault();
  loginSession.on('will-download', preventDownload);

  const request = (endpoint, body, signal) => requestJson(loginSession, endpoint, body, signal);
  const readOpenId = async () => {
    const cookies = await loginSession.cookies.get({url:WEB_URL, name:'game_openid'});
    const cookie = cookies.find(item => !item.httpOnly);
    if (!cookie) return '';
    try { return decodeURIComponent(cookie.value); } catch { return cookie.value; }
  };
  const emit = phase => { if (!disposed) onProgress({busy:Boolean(active), phase}); };
  const returnToImport = () => {
    if (!show || disposed) return;
    for (const window of windows) if (!window.isDestroyed()) window.hide();
    const owner = parent();
    if (owner && !owner.isDestroyed()) {
      if (owner.isMinimized()) owner.restore();
      owner.show();
      owner.focus();
    }
  };
  const closeWindows = () => {
    closingWindows = true;
    for (const window of windows) if (!window.isDestroyed()) window.destroy();
    windows.clear();
    loginWindow = null;
    closingWindows = false;
  };
  const cancel = () => {
    active?.abort();
    selection = null;
  };
  const secureWindow = window => {
    windows.add(window);
    window.setMenu(Menu.buildFromTemplate([{label:'账号导入', submenu:[
      {label:'返回账号导入', accelerator:'Alt+Left', click:returnToImport},
      {label:'刷新官方页面', click:() => window.reload()},
    ]}]));
    window.setAutoHideMenuBar(false);
    window.setMenuBarVisibility(true);
    window.setTitle('BlaBlaLink 登录 · 关闭窗口返回账号导入');
    window.on('page-title-updated', event => event.preventDefault());
    const navigation = (event, url) => {
      if (!allowedNavigation(url)) {
        event.preventDefault();
        emit('该登录跳转使用了不支持的地址，请使用网页登录方式。');
      }
    };
    window.webContents.on('will-navigate', navigation);
    window.webContents.on('will-redirect', navigation);
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.setWindowOpenHandler(({url}) => {
      if (!allowedNavigation(url)) return {action:'deny'};
      return {
        action:'allow',
        overrideBrowserWindowOptions:{
          parent:window, width:1000, height:760, show, autoHideMenuBar:true,
          webPreferences:{session:loginSession, nodeIntegration:false, nodeIntegrationInSubFrames:false, contextIsolation:true, sandbox:true, webviewTag:false},
        },
      };
    });
    window.webContents.on('did-create-window', child => secureWindow(child));
    window.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) emit('官方登录页面加载失败，可点击“打开登录窗口”重新尝试。');
    });
    window.on('closed', () => {
      windows.delete(window);
      if (loginWindow === window) loginWindow = null;
      if (!closingWindows) returnToImport();
    });
  };

  async function operation(action) {
    if (disposed) throw new Error('账号导入窗口已关闭');
    if (active || resetting) throw new Error('账号读取正在进行，请等待完成或取消。');
    const controller = new AbortController();
    active = controller;
    try {
      const value = await action(controller.signal);
      checkAbort(controller.signal);
      return value;
    } finally {
      if (active === controller) active = null;
      emit('');
    }
  }

  return {
    openLogin() {
      if (disposed || resetting || active) throw new Error('请等待当前操作结束后打开登录窗口。');
      selection = null;
      if (loginWindow && !loginWindow.isDestroyed()) {
        if (show) { loginWindow.show(); loginWindow.focus(); }
        if (!loginWindow.webContents.getURL() || loginWindow.webContents.getURL() === WEB_URL) {
          loginWindow.loadURL(WEB_URL).catch(() => emit('官方登录页面加载失败，请检查网络并重新打开。'));
        }
        return;
      }
      loginWindow = new BrowserWindow({
        parent:parent(), width:1100, height:800, minWidth:700, minHeight:500, show,
        title:'BlaBlaLink · 登录国际服账号', autoHideMenuBar:true,
        webPreferences:{session:loginSession, nodeIntegration:false, contextIsolation:true, sandbox:true, webviewTag:false},
      });
      secureWindow(loginWindow);
      loginWindow.loadURL(WEB_URL).catch(() => emit('官方登录页面加载失败，请检查网络并重新打开。'));
    },
    inspect() {
      selection = null;
      return operation(async signal => {
        emit('读取当前登录账号…');
        const identity = await readIdentity(request, readOpenId, signal);
        selection = {...identity, id:randomUUID()};
        return {id:selection.id, areaId:identity.areaId, profileName:identity.roleName || '未返回昵称'};
      });
    },
    collect(id) {
      return operation(async signal => {
        if (!selection || selection.id !== id) throw new Error('请先读取并确认账号与区服。');
        const identity = {...selection};
        const result = await collectAccountData({request, readOpenId, identity, signal, onProgress:emit});
        checkAbort(signal);
        for (const window of windows) if (!window.isDestroyed()) window.hide();
        return result;
      });
    },
    cancel() {
      cancel();
      closeWindows();
    },
    async logout() {
      if (resetting) throw new Error('正在清除登录状态，请稍候。');
      resetting = true;
      cancel();
      closeWindows();
      try {
        // Wait for an outstanding response to abort before clearing any late Set-Cookie.
        while (active) await new Promise(resolve => setTimeout(resolve, 20));
        await loginSession.closeAllConnections();
        await loginSession.clearStorageData();
        await loginSession.clearCache();
        await loginSession.clearAuthCache();
      } finally { resetting = false; }
    },
    dispose() {
      disposed = true;
      cancel();
      closeWindows();
      loginSession.removeListener('will-download', preventDownload);
    },
  };
}

function registerBlabla({ipcMain, requireSender, service}) {
  const handlers = {
    open:() => service.openLogin(),
    inspect:() => service.inspect(),
    collect:id => service.collect(id),
    cancel:() => service.cancel(),
    logout:() => service.logout(),
  };
  for (const [name, action] of Object.entries(handlers)) {
    ipcMain.handle('blablalink:' + name, async (event, value) => {
      requireSender(event);
      try {
        return {ok:true, value:await action(value)};
      } catch (error) {
        return {ok:false, error:error.message || '账号读取失败，请重试。'};
      }
    });
  }
}
module.exports = {createBlablaService, registerBlabla, requestJson, allowedNavigation, SESSION_PARTITION};
