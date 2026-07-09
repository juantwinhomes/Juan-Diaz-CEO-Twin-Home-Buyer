const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('thb', {
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  saveConfig: (patch) => ipcRenderer.invoke('cfg:save', patch),
  startBridge: () => ipcRenderer.invoke('bridge:start'),
  stopBridge: () => ipcRenderer.invoke('bridge:stop'),
  bridgeStatus: () => ipcRenderer.invoke('bridge:status'),
  dashboardPath: () => ipcRenderer.invoke('dashboard:path'),
  refresh: () => ipcRenderer.invoke('data:refresh'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onBridgeLog: (cb) => ipcRenderer.on('bridge-log', (_e, line) => cb(line)),
});
