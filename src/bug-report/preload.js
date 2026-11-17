'use strict';
/* Окно «Сообщить об ошибке»: только эти пять вызовов, больше ничего из главного процесса окну не доступно. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bugReport', {
  data: () => ipcRenderer.invoke('bug-report:data'),
  send: form => ipcRenderer.invoke('bug-report:send', form),
  copy: form => ipcRenderer.invoke('bug-report:copy', form),
  close: form => ipcRenderer.send('bug-report:close', form),
  site: () => ipcRenderer.send('bug-report:site'),
});
