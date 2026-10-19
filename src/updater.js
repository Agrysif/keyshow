'use strict';

// Автообновление через GitHub Releases (electron-updater).
// Новая версия скачивается в фоне и ставится, только когда пользователь какое-то время
// не трогает клавиатуру и мышь, — чтобы не прервать запись видео.

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const envNum = (name, fallback) => {
  const v = process.env[name];
  return v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : fallback;
};

const FIRST_CHECK_MS = envNum('KEYSHOW_UPDATE_FIRST_CHECK_MS', 15000);
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;
const IDLE_BEFORE_INSTALL_MS = envNum('KEYSHOW_UPDATE_IDLE_MS', 90000);
const BUSY = ['checking', 'downloading', 'ready'];

function createUpdater({ isAuto, idleFor, onState, beforeInstall }) {
  let state = { status: app.isPackaged ? 'idle' : 'dev', version: null, percent: 0, error: null };
  const set = (patch) => {
    state = { ...state, ...patch };
    onState(state);
  };

  const noop = () => {};
  if (!app.isPackaged) return { state: () => state, check: noop, download: noop, install: noop };

  const logFile = path.join(app.getPath('userData'), 'update.log');
  const log = (level) => (msg) => {
    try {
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${level}: ${msg}\n`);
    } catch { /* лог не критичен */ }
  };
  const shortError = (err) => String((err && err.message) || err).split('\n')[0].slice(0, 200);

  const { autoUpdater } = require('electron-updater');
  autoUpdater.logger = { info: log('info'), warn: log('warn'), error: log('error'), debug: () => {} };
  autoUpdater.autoDownload = isAuto();
  autoUpdater.autoInstallOnAppQuit = true; // если выйти из KeyShow — обновление поставится тихо

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (info) => set({
    status: autoUpdater.autoDownload ? 'downloading' : 'available',
    version: info.version,
    percent: 0,
  }));
  autoUpdater.on('update-not-available', () => set({ status: 'latest', version: null }));
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version, percent: 100 }));
  autoUpdater.on('error', (err) => set({ status: 'error', error: shortError(err) }));

  function check() {
    if (BUSY.includes(state.status)) return;
    autoUpdater.autoDownload = isAuto();
    autoUpdater.checkForUpdates().catch((err) => set({ status: 'error', error: shortError(err) }));
  }

  function download() {
    if (state.status !== 'available') return;
    set({ status: 'downloading', percent: 0 });
    autoUpdater.downloadUpdate().catch((err) => set({ status: 'error', error: shortError(err) }));
  }

  function install() {
    if (state.status !== 'ready') return;
    log('info')(`installing ${state.version}`);
    beforeInstall(state.version);
    // Тихая установка и автоматический перезапуск новой версии.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }

  setInterval(() => {
    if (state.status === 'ready' && isAuto() && idleFor() >= IDLE_BEFORE_INSTALL_MS) install();
  }, 5000);
  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, CHECK_EVERY_MS);

  return { state: () => state, check, download, install };
}

module.exports = { createUpdater };
