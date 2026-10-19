'use strict';

const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, nativeImage, nativeTheme, shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { createUpdater } = require('./updater');
const I18N = require('./i18n');

const RELEASES_URL = 'https://github.com/Agrysif/keyshow/releases';

let uIOhook = null;
let UiohookKey = {};
let hookError = null;
try {
  ({ uIOhook, UiohookKey } = require('uiohook-napi'));
} catch (err) {
  hookError = err;
}

const ASSETS = path.join(__dirname, '..', 'assets');
const PRELOAD = path.join(__dirname, 'preload.js');

// ---------------------------------------------------------------------------
// Настройки
// ---------------------------------------------------------------------------

const DEFAULTS = {
  enabled: true,
  // Внешний вид
  keyColor: '#0A84FF',
  textColor: 'auto',
  keyStyle: 'solid',
  opacity: 1,
  size: 1,
  radius: 12,
  shadow: true,
  labelMode: 'both',
  showPlus: true,
  backdrop: false,
  // Поведение
  lingerMs: 1500,
  fadeMs: 450,
  maxEntries: 3,
  filter: 'all',
  loneModifiers: true,
  repeatCounter: true,
  sortModifiers: true,
  holdPulse: true,
  fadeOlder: true,
  // Мышь
  mouseClicks: 'all',
  mouseLabels: 'short',
  wheel: true,
  showDrag: true,
  clickRipple: true,
  cursorHalo: 'shake', // 'off' | 'shake' | 'always'
  haloLinger: 1200,
  cursorGrow: true,
  cursorGrowMax: 4,
  // Анимация
  animStyle: 'spring',
  animSpeed: 1,
  // Положение
  position: 'bottom-center',
  display: 'primary',
  marginX: 40,
  marginY: 60,
  // Общие
  hotkey: 'Ctrl+Alt+K',
  launchAtLogin: false,
  theme: 'system',
  language: 'auto', // 'auto' (по языку Windows) | 'ru' | 'en'
  autoUpdate: true,
  // Служебные значения (не сбрасываются кнопкой «Сбросить»)
  trayHintShown: false,
  lastVersion: '',
  whatsNewPending: false,
  updateRelaunch: false,
};
const INTERNAL_KEYS = ['enabled', 'trayHintShown', 'lastVersion', 'whatsNewPending', 'updateRelaunch'];

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  const out = { ...DEFAULTS };
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    // Раньше подсветка курсора была просто вкл/выкл, а у подписей мыши был отдельный вариант 'en'.
    if (saved.cursorHalo === true) saved.cursorHalo = 'always';
    if (saved.mouseLabels === 'en') saved.mouseLabels = 'full';
    for (const k of Object.keys(DEFAULTS)) {
      if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) out[k] = saved[k];
    }
  } catch { /* первый запуск или битый файл — берём значения по умолчанию */ }
  return out;
}

let settings = { ...DEFAULTS };
let saveTimer = null;

function saveSettingsNow() {
  clearTimeout(saveTimer);
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('Не удалось сохранить настройки:', err);
  }
}

function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSettingsNow, 250);
}

// Язык интерфейса: выбранный вручную или по первому языку Windows.
function currentLang() {
  const system = (app.getPreferredSystemLanguages && app.getPreferredSystemLanguages()[0]) || app.getLocale();
  return I18N.resolve(settings.language, system);
}
const tr = (key, vars) => I18N.translator(currentLang())(key, vars);

// Настройки для окон: плюс итоговый язык.
function publicSettings() {
  return { ...settings, lang: currentLang() };
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Коды клавиш → имена
// ---------------------------------------------------------------------------

const KEY_NAMES = {};
for (const [name, code] of Object.entries(UiohookKey)) {
  if (!(code in KEY_NAMES)) KEY_NAMES[code] = name;
}
const EXTRA_KEYS = {
  0x0E5D: 'ContextMenu',
  0xE020: 'VolumeMute', 0xE02E: 'VolumeDown', 0xE030: 'VolumeUp',
  0xE022: 'MediaPlay', 0xE024: 'MediaStop', 0xE010: 'MediaPrev', 0xE019: 'MediaNext',
};
for (const [code, name] of Object.entries(EXTRA_KEYS)) {
  if (!(code in KEY_NAMES)) KEY_NAMES[code] = name;
}
const keyName = (code) => KEY_NAMES[code] || `Key${code}`;

// ---------------------------------------------------------------------------
// Окна
// ---------------------------------------------------------------------------

let overlay = null;
let overlayBounds = null;
let settingsWin = null;
let tray = null;
let updater = null;
let quitting = false;
let hotkeyOk = true;
let hotkeySuspended = false;

function targetDisplay() {
  const all = screen.getAllDisplays();
  return all.find((d) => String(d.id) === String(settings.display)) || screen.getPrimaryDisplay();
}

function listDisplays() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: String(d.id),
    name: d.label || tr('display.name', { n: i + 1 }),
    size: `${Math.round(d.size.width * d.scaleFactor)}×${Math.round(d.size.height * d.scaleFactor)}`,
    primary: d.id === primary,
  }));
}

function createOverlay() {
  const b = targetDisplay().workArea;
  overlayBounds = b;
  overlay = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    title: 'KeyShow Overlay',
    webPreferences: {
      preload: PRELOAD,
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlay.setIgnoreMouseEvents(true);
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true);
  overlay.loadFile(path.join(__dirname, 'overlay.html'));
  overlay.once('ready-to-show', () => {
    placeOverlay();
    if (settings.enabled) overlay.showInactive();
  });
  overlay.on('closed', () => { overlay = null; });
}

function placeOverlay() {
  if (!overlay) return;
  const b = targetDisplay().workArea;
  overlayBounds = b;
  overlay.setBounds(b);
}

function titleBarColors() {
  const dark = nativeTheme.shouldUseDarkColors;
  return dark
    ? { color: '#000000', symbolColor: '#FFFFFF', height: 40 }
    : { color: '#F2F2F7', symbolColor: '#1C1C1E', height: 40 };
}

function openSettings() {
  if (settingsWin) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 860,
    minHeight: 580,
    show: false,
    title: 'KeyShow',
    icon: path.join(ASSETS, 'icon.png'),
    backgroundColor: titleBarColors().color,
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarColors(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('close', () => {
    if (!quitting && !settings.trayHintShown && tray) {
      tray.displayBalloon({
        iconType: 'info',
        title: tr('balloon.bg.title'),
        content: tr('balloon.bg.body', { hotkey: prettyHotkey(settings.hotkey) }),
      });
      settings.trayHintShown = true;
      saveSettings();
    }
  });
  settingsWin.on('closed', () => {
    settingsWin = null;
    if (hotkeySuspended) { hotkeySuspended = false; registerHotkey(); }
  });
}

function send(win, channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function broadcast(channel, payload) {
  send(overlay, channel, payload);
  send(settingsWin, channel, payload);
}

// ---------------------------------------------------------------------------
// Применение настроек
// ---------------------------------------------------------------------------

function prettyHotkey(acc) {
  return (acc || '—').replace(/Super/g, 'Win').replace(/\+/g, ' + ');
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  hotkeyOk = true;
  if (!settings.hotkey || hotkeySuspended) return;
  try {
    hotkeyOk = globalShortcut.register(settings.hotkey, () => setEnabled(!settings.enabled));
  } catch {
    hotkeyOk = false;
  }
}

function applyLoginItem() {
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const args = app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'];
  try {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, path: exe, args });
  } catch (err) {
    console.error('Автозапуск:', err);
  }
}

function setEnabled(on) {
  applyPatch({ enabled: on });
}

function applyEnabled() {
  if (!overlay) return;
  overlay.webContents.send('clear');
  if (settings.enabled) {
    overlay.showInactive();
    overlay.setAlwaysOnTop(true, 'screen-saver');
  } else {
    overlay.hide();
  }
  updateTray();
}

function applyPatch(patch) {
  const prev = { ...settings };
  for (const [k, v] of Object.entries(patch || {})) {
    if (k in DEFAULTS && typeof v === typeof DEFAULTS[k]) settings[k] = v;
  }
  saveSettings();
  if (prev.display !== settings.display) placeOverlay();
  if (prev.hotkey !== settings.hotkey) registerHotkey();
  if (prev.launchAtLogin !== settings.launchAtLogin) applyLoginItem();
  if (prev.theme !== settings.theme) nativeTheme.themeSource = settings.theme;
  if (prev.enabled !== settings.enabled) applyEnabled();
  if (!prev.autoUpdate && settings.autoUpdate && updater && updater.state().status === 'available') updater.download();
  if (prev.language !== settings.language) send(settingsWin, 'displays', listDisplays());
  broadcast('settings', publicSettings());
  send(settingsWin, 'status', status());
  updateTray();
}

function status() {
  return {
    hookOk: !!uIOhook && !hookError,
    hookError: hookError ? String(hookError.message || hookError) : null,
    hotkeyOk,
  };
}

// ---------------------------------------------------------------------------
// Трей
// ---------------------------------------------------------------------------

function trayIcon(on) {
  return nativeImage.createFromPath(path.join(ASSETS, on ? 'tray.png' : 'tray-off.png'));
}

function updateTray() {
  if (!tray) return;
  tray.setImage(trayIcon(settings.enabled));
  tray.setToolTip(tr(settings.enabled ? 'tray.on' : 'tray.off'));
  const upd = updater ? updater.state() : null;
  const updateItems = upd && upd.status === 'ready'
    ? [{ label: tr('tray.update', { v: upd.version }), click: () => updater.install() }, { type: 'separator' }]
    : [];
  tray.setContextMenu(Menu.buildFromTemplate([
    ...updateItems,
    {
      label: tr('tray.show'),
      type: 'checkbox',
      checked: settings.enabled,
      accelerator: settings.hotkey || undefined,
      click: () => setEnabled(!settings.enabled),
    },
    { label: tr('tray.demo'), click: runDemo },
    { label: tr('tray.settings'), click: openSettings },
    { type: 'separator' },
    { label: tr('tray.quit'), click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(trayIcon(settings.enabled));
  tray.on('click', openSettings);
  tray.on('balloon-click', openSettings);
  updateTray();
}

// ---------------------------------------------------------------------------
// Глобальные хуки клавиатуры и мыши
// ---------------------------------------------------------------------------

const heldKeys = new Set();
const heldButtons = new Map(); // button -> { x, y, dragged }
let lastWheelAt = 0;
let lastInputAt = Date.now();
let pendingMove = null;
let moveTimer = null;

function toLocal(x, y) {
  if (!overlayBounds || typeof x !== 'number') return { x: null, y: null };
  const p = process.platform === 'win32' ? screen.screenToDipPoint({ x, y }) : { x, y };
  const b = overlayBounds;
  if (p.x < b.x || p.y < b.y || p.x > b.x + b.width || p.y > b.y + b.height) return { x: null, y: null };
  return { x: p.x - b.x, y: p.y - b.y };
}

function emitInput(ev) {
  if (settings.enabled) send(overlay, 'input', ev);
  if (settingsWin && settingsWin.isVisible() && !settingsWin.isMinimized()) send(settingsWin, 'input', ev);
}

function flushMove() {
  moveTimer = null;
  if (!pendingMove || !settings.enabled) return;
  const p = pendingMove;
  pendingMove = null;
  send(overlay, 'input', { t: 'move', ...toLocal(p.x, p.y) });
}

// Сколько пользователь ничего не нажимал и не двигал мышью (для тихой установки обновлений).
function idleFor() {
  if (heldKeys.size || heldButtons.size) return 0;
  return Date.now() - lastInputAt;
}

function onPointerMove(e) {
  for (const [button, st] of heldButtons) {
    if (!st.dragged && Math.hypot(e.x - st.x, e.y - st.y) > 8) {
      st.dragged = true;
      emitInput({ t: 'drag', kind: 'mouse', name: button });
    }
  }
  const cursorFx = settings.cursorHalo !== 'off' || settings.cursorGrow;
  if (!cursorFx && !(settings.clickRipple && heldButtons.size)) return;
  pendingMove = e;
  if (!moveTimer) moveTimer = setTimeout(flushMove, 16);
}

function startHook() {
  if (!uIOhook) {
    console.error('KeyShow: не удалось загрузить uiohook-napi:', hookError);
    return;
  }
  uIOhook.on('keydown', (e) => {
    if (heldKeys.has(e.keycode)) return; // автоповтор
    heldKeys.add(e.keycode);
    emitInput({ t: 'down', kind: 'key', name: keyName(e.keycode) });
  });
  uIOhook.on('keyup', (e) => {
    heldKeys.delete(e.keycode);
    emitInput({ t: 'up', kind: 'key', name: keyName(e.keycode) });
  });
  uIOhook.on('mousedown', (e) => {
    const button = Number(e.button);
    if (heldButtons.has(button)) return;
    heldButtons.set(button, { x: e.x, y: e.y, dragged: false });
    emitInput({ t: 'down', kind: 'mouse', name: button, ...toLocal(e.x, e.y) });
  });
  uIOhook.on('mouseup', (e) => {
    const button = Number(e.button);
    heldButtons.delete(button);
    emitInput({ t: 'up', kind: 'mouse', name: button, ...toLocal(e.x, e.y) });
  });
  uIOhook.on('wheel', (e) => {
    if (!e.rotation) return;
    const now = Date.now();
    if (now - lastWheelAt < 35) return;
    lastWheelAt = now;
    const horizontal = e.direction === 4;
    const dir = horizontal ? (e.rotation > 0 ? 'right' : 'left') : (e.rotation > 0 ? 'down' : 'up');
    emitInput({ t: 'wheel', dir });
  });
  uIOhook.on('input', (e) => {
    lastInputAt = Date.now();
    if (e.type === 9 || e.type === 10) onPointerMove(e); // moved / dragged
  });
  try {
    uIOhook.start();
  } catch (err) {
    hookError = err;
  }
  if (hookError) console.error('KeyShow: хук ввода недоступен:', hookError);
  else console.log('KeyShow: хук ввода запущен');
}

// ---------------------------------------------------------------------------
// Демо
// ---------------------------------------------------------------------------

let demoTimers = [];

function runDemo() {
  demoTimers.forEach(clearTimeout);
  demoTimers = [];
  const k = (t, name) => ({ t, kind: 'key', name });
  const m = (t, name) => ({ t, kind: 'mouse', name, x: null, y: null });
  const script = [
    [0, k('down', 'Ctrl')], [140, k('down', 'Shift')], [120, k('down', 'S')],
    [380, k('up', 'S')], [60, k('up', 'Shift')], [40, k('up', 'Ctrl')],
    [900, k('down', 'Ctrl')], [120, k('down', 'Z')], [120, k('up', 'Z')],
    [220, k('down', 'Z')], [110, k('up', 'Z')], [220, k('down', 'Z')], [110, k('up', 'Z')], [120, k('up', 'Ctrl')],
    [900, k('down', 'Space')], [260, m('down', 1)], [420, { t: 'drag', kind: 'mouse', name: 1 }],
    [1100, m('up', 1)], [120, k('up', 'Space')],
    [900, k('down', 'Ctrl')], [160, { t: 'wheel', dir: 'up' }], [90, { t: 'wheel', dir: 'up' }],
    [90, { t: 'wheel', dir: 'up' }], [300, k('up', 'Ctrl')],
    [900, k('down', 'Ctrl')], [90, k('down', 'Alt')], [90, k('down', 'Shift')], [140, k('down', 'K')],
    [500, k('up', 'K')], [60, k('up', 'Shift')], [40, k('up', 'Alt')], [40, k('up', 'Ctrl')],
    [900, k('down', 'V')], [140, k('up', 'V')],
    [700, m('down', 2)], [160, m('up', 2)],
  ];
  let t = 0;
  for (const [delay, ev] of script) {
    t += delay;
    demoTimers.push(setTimeout(() => {
      send(overlay, 'input', ev);
      send(settingsWin, 'input', ev);
    }, t));
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

ipcMain.handle('init', () => ({
  settings: publicSettings(),
  defaults: DEFAULTS,
  displays: listDisplays(),
  version: app.getVersion(),
  status: status(),
  update: updater ? updater.state() : { status: 'dev' },
  whatsNew: settings.whatsNewPending,
}));
ipcMain.on('set', (_e, patch) => applyPatch(patch));
ipcMain.on('reset', () => {
  const keep = Object.fromEntries(INTERNAL_KEYS.map((k) => [k, settings[k]]));
  applyPatch({ ...DEFAULTS, ...keep });
  send(overlay, 'clear');
});
ipcMain.on('update-check', () => updater && updater.check());
ipcMain.on('update-download', () => updater && updater.download());
ipcMain.on('update-install', () => updater && updater.install());
ipcMain.on('whatsnew-seen', () => {
  settings.whatsNewPending = false;
  saveSettings();
});
ipcMain.on('open-releases', () => shell.openExternal(RELEASES_URL));
ipcMain.on('demo', () => runDemo());
ipcMain.on('hotkey-suspend', (_e, on) => {
  hotkeySuspended = !!on;
  registerHotkey();
  send(settingsWin, 'status', status());
});

// ---------------------------------------------------------------------------
// Жизненный цикл
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());

  app.whenReady().then(() => {
    app.setAppUserModelId('com.keyshow.app');
    settings = loadSettings();
    nativeTheme.themeSource = settings.theme;

    // Версия поменялась с прошлого запуска → покажем «Что нового».
    const version = app.getVersion();
    const updatedNow = !!settings.lastVersion && compareVersions(version, settings.lastVersion) > 0;
    const relaunchedByUpdate = settings.updateRelaunch;
    if (updatedNow) settings.whatsNewPending = true;
    settings.lastVersion = version;
    settings.updateRelaunch = false;
    saveSettingsNow();

    createOverlay();
    createTray();
    registerHotkey();
    startHook();

    updater = createUpdater({
      isAuto: () => settings.autoUpdate,
      idleFor,
      onState: (st) => {
        send(settingsWin, 'update', st);
        updateTray();
      },
      beforeInstall: () => {
        quitting = true;
        settings.updateRelaunch = true;
        saveSettingsNow();
      },
    });

    if (updatedNow) {
      setTimeout(() => tray && tray.displayBalloon({
        iconType: 'info',
        title: tr('balloon.updated.title', { v: version }),
        content: tr('balloon.updated.body'),
      }), 1500);
    }

    const onDisplays = () => {
      placeOverlay();
      send(settingsWin, 'displays', listDisplays());
    };
    screen.on('display-added', onDisplays);
    screen.on('display-removed', onDisplays);
    screen.on('display-metrics-changed', onDisplays);

    nativeTheme.on('updated', () => {
      if (settingsWin) {
        settingsWin.setTitleBarOverlay(titleBarColors());
        settingsWin.setBackgroundColor(titleBarColors().color);
      }
    });

    // Некоторые полноэкранные приложения перекрывают «поверх всех» — периодически поднимаем оверлей.
    setInterval(() => {
      if (overlay && settings.enabled && overlay.isVisible()) overlay.moveTop();
    }, 2500);

    // После тихого автообновления окно не открываем — только уведомление.
    if (!process.argv.includes('--hidden') && !relaunchedByUpdate) openSettings();
  });

  app.on('window-all-closed', () => { /* живём в трее */ });

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    try { if (uIOhook) uIOhook.stop(); } catch { /* уже остановлен */ }
  });
}
