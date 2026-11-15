'use strict';

const { WebContentsView, session } = require('electron');
const OFFICIAL_CDK_URL = 'https://nikke.qq.com/act/a20251103cdk/index.html?darkmode=0';

function isWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

function createOfficialCdk({ window, onState = () => {} }) {
  const webSession = session.fromPartition('persist:nikke-official-cdk');
  webSession.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
  webSession.setPermissionCheckHandler(() => false);
  const preferences = { session: webSession, nodeIntegration: false, nodeIntegrationInSubFrames: false,
    contextIsolation: true, sandbox: true, webviewTag: false };
  const popups = new Set();
  let view;
  let rectangle;
  let state = { loading: false, error: '', origin: 'https://nikke.qq.com' };

  function publish(patch) {
    state = { ...state, ...patch };
    onState({ ...state });
  }

  function secure(web) {
    const navigation = (event, url) => {
      if (!isWebUrl(url)) {
        event.preventDefault();
        publish({ error: '此跳转需要外部应用，请使用官方页面的网页登录。' });
      }
    };
    web.on('will-navigate', navigation);
    web.on('will-redirect', navigation);
    web.on('will-attach-webview', event => event.preventDefault());
    web.setWindowOpenHandler(({ url }) => {
      if (!isWebUrl(url) && url !== 'about:blank') return { action: 'deny' };
      return { action: 'allow', overrideBrowserWindowOptions: {
        parent: window, width: 1000, height: 760, show: window.isVisible(), autoHideMenuBar: true, webPreferences: preferences,
      } };
    });
    web.on('did-create-window', child => {
      popups.add(child);
      secure(child.webContents);
      child.setMenu(null);
      child.on('closed', () => { popups.delete(child); if (!window.isDestroyed()) window.focus(); });
    });
  }

  function ensureView() {
    if (view) return;
    view = new WebContentsView({ webPreferences: preferences });
    view.setVisible(false);
    window.contentView.addChildView(view);
    const web = view.webContents;
    secure(web);
    web.on('did-start-loading', () => publish({ loading: true, error: '' }));
    web.on('did-stop-loading', () => publish({ loading: false }));
    web.on('did-navigate', (_event, url) => { if (isWebUrl(url)) publish({ origin: new URL(url).origin }); });
    web.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3) publish({ loading: false, error: '官方兑换页面加载失败，请检查网络后刷新。' });
    });
    web.on('render-process-gone', () => publish({ loading: false, error: '网页已停止运行，请点击返回兑换首页重新打开。' }));
    loadHome();
  }

  function loadHome() {
    view.webContents.loadURL(OFFICIAL_CDK_URL).catch(error => {
      if (error.code !== 'ERR_ABORTED') publish({ loading: false, error: '官方兑换页面加载失败，请检查网络后刷新。' });
    });
  }

  function applyBounds() {
    if (!view || !rectangle || window.isDestroyed()) return;
    const zoom = window.webContents.getZoomFactor();
    const [width, height] = window.getContentSize();
    const x = Math.max(0, Math.min(width, Math.round(rectangle.x * zoom)));
    const y = Math.max(0, Math.min(height, Math.round(rectangle.y * zoom)));
    const bounds = { x, y, width: Math.max(0, Math.min(width - x, Math.round(rectangle.width * zoom))),
      height: Math.max(0, Math.min(height - y, Math.round(rectangle.height * zoom))) };
    view.setBounds(bounds);
    view.setVisible(bounds.width > 0 && bounds.height > 0);
  }

  function hide() {
    rectangle = null;
    view?.setVisible(false);
  }

  function dispose() {
    for (const popup of popups) popup.destroy();
    if (view) {
      if (!window.isDestroyed()) window.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
      view = undefined;
    }
    rectangle = null;
  }

  window.on('resize', applyBounds);
  window.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) hide();
  });
  window.webContents.on('did-navigate-in-page', (_event, url, mainFrame) => {
    if (mainFrame && new URL(url).hash.split('?')[0] !== '#/tools') hide();
  });
  window.webContents.on('render-process-gone', hide);
  window.on('closed', dispose);

  return {
    layout(bounds) {
      if (bounds === null) { hide(); return { ...state }; }
      if (!bounds || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key])) || bounds.width < 0 || bounds.height < 0) throw Error('网页显示区域无效');
      if (new URL(window.webContents.getURL()).hash.split('?')[0] !== '#/tools') { hide(); return { ...state }; }
      ensureView();
      rectangle = bounds;
      applyBounds();
      return { ...state };
    },
    reload() { if (view) view.webContents.reload(); },
    home() { if (view) loadHome(); },
  };
}

function registerOfficialCdk({ ipcMain, requireSender, service }) {
  for (const command of ['layout', 'reload', 'home']) {
    ipcMain.handle('official-cdk:' + command, (event, value) => {
      requireSender(event);
      return service[command](value);
    });
  }
}

module.exports = { OFFICIAL_CDK_URL, createOfficialCdk, registerOfficialCdk };
