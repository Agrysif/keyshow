'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = ['input', 'settings', 'displays', 'status', 'clear', 'update'];

contextBridge.exposeInMainWorld('keyshow', {
  init: () => ipcRenderer.invoke('init'),
  set: (patch) => ipcRenderer.send('set', patch),
  reset: () => ipcRenderer.send('reset'),
  demo: () => ipcRenderer.send('demo'),
  suspendHotkey: (on) => ipcRenderer.send('hotkey-suspend', on),
  checkUpdate: () => ipcRenderer.send('update-check'),
  downloadUpdate: () => ipcRenderer.send('update-download'),
  installUpdate: () => ipcRenderer.send('update-install'),
  whatsNewSeen: () => ipcRenderer.send('whatsnew-seen'),
  openReleases: () => ipcRenderer.send('open-releases'),
  openDonate: () => ipcRenderer.send('open-donate'),
  on: (channel, fn) => {
    if (!CHANNELS.includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => fn(data));
  },
});
