const {contextBridge, ipcRenderer} = require('electron');
const blablaCall = async (command, value) => {
  const reply = await ipcRenderer.invoke('blablalink:' + command, value);
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
};
const storyCall = async (command, value) => {
  const reply = await ipcRenderer.invoke('story-reader:' + command, value);
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
};
contextBridge.exposeInMainWorld('nikkeDesktop', Object.freeze({
  officialCdk: Object.freeze({
    layout: bounds => ipcRenderer.invoke('official-cdk:layout', bounds),
    reload: () => ipcRenderer.invoke('official-cdk:reload'),
    home: () => ipcRenderer.invoke('official-cdk:home'),
    subscribe: callback => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('official-cdk:state', listener);
      return () => ipcRenderer.removeListener('official-cdk:state', listener);
    },
  }),
  storyReader: Object.freeze({
    snapshot: () => storyCall('snapshot'),
    catalog: () => storyCall('catalog'),
    open: value => storyCall('open', value),
    chapter: id => storyCall('chapter', id),
    reading: value => storyCall('reading', value),
    backup: () => storyCall('backup'),
    preview: value => storyCall('preview', value),
    restore: value => storyCall('restore', value),
    search: ids => storyCall('search', ids),
    cancel: () => storyCall('cancel'),
    subscribe: callback => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('story-reader:progress', listener);
      return () => ipcRenderer.removeListener('story-reader:progress', listener);
    },
  }),
  blablalink: Object.freeze({
    open: () => blablaCall('open'),
    inspect: () => blablaCall('inspect'),
    collect: id => blablaCall('collect', id),
    cancel: () => blablaCall('cancel'),
    logout: () => blablaCall('logout'),
    subscribe: callback => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('blablalink:progress', listener);
      return () => ipcRenderer.removeListener('blablalink:progress', listener);
    },
  }),
  damageSimulator: Object.freeze({
    status: () => ipcRenderer.invoke('damage-simulator:status'),
    simulate: draft => ipcRenderer.invoke('damage-simulator:simulate',draft),
    cancel: () => ipcRenderer.invoke('damage-simulator:cancel'),
  }),
  maanikke: Object.freeze({
    request: (command,args) => ipcRenderer.invoke('maanikke:request',command,args),
    logs: () => ipcRenderer.invoke('maanikke:logs'),
    stop: () => ipcRenderer.invoke('maanikke:stop'),
    screenshots: (command,args) => ipcRenderer.invoke('maanikke:screenshots',command,args),
  }),
  getInfo: () => ipcRenderer.invoke('desktop:info'),
  setCaptureManual: manual => ipcRenderer.invoke('desktop:capture-mode',manual),
  captureFrame: options => ipcRenderer.invoke('desktop:capture-frame',{manual:options?.manual===true}),
  sourcePicker: Object.freeze({
    subscribe: callback => {
      const listener=(_event,request)=>callback(request);
      ipcRenderer.on('source-picker:open',listener);
      return ()=>ipcRenderer.removeListener('source-picker:open',listener);
    },
    refresh: id => ipcRenderer.invoke('source-picker:refresh',id),
    finish: (id,key) => ipcRenderer.invoke('source-picker:finish',id,key),
  }),
  resourceIncome: Object.freeze({
    read: () => ipcRenderer.invoke('resource-income:read'),
    save: record => ipcRenderer.invoke('resource-income:save',record),
    remove: date => ipcRenderer.invoke('resource-income:remove',date),
    exportBackup: () => ipcRenderer.invoke('resource-income:export'),
    restore: value => ipcRenderer.invoke('resource-income:restore',value),
  }),
}));
