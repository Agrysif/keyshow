// Только для разработки: запускает приложение, проигрывает сценарии и сохраняет снимки окон.
// Запуск:  npx electron scripts/snap.js <папка-для-снимков> [--dot | --shake] [--real-hook]
//   --dot        только проверка метки у курсора
//   --shake      только проверка подсветки и увеличения курсора при встряхивании
//   --i18n       окно настроек на двух языках, «Обновления» и «Что нового»
//   --screens    скриншоты для README в docs/screenshots (сцены из scripts/showcase.html)
//   --real-hook  дополнительно отправить в систему безопасное Shift + F15 (проверка настоящего хука)
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const outDir = process.argv.find((a, i) => i > 1 && !a.startsWith('-') && !a.endsWith('.js')) || path.join(__dirname, '..', 'snaps');
fs.mkdirSync(outDir, { recursive: true });

// В снимках показываем версию приложения, а не версию Electron.
const pkg = require('../package.json');
app.getVersion = () => pkg.version;

require('../src/main.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (ch, ...args) => ipcMain.emit(ch, { sender: null }, ...args);

function windows() {
  const all = BrowserWindow.getAllWindows();
  return {
    overlay: all.find((w) => w.getTitle().includes('Overlay')),
    settings: all.find((w) => w.getTitle() === 'KeyShow'),
  };
}

// Отправить события напрямую в оба окна (как будто их прислал хук).
function feed(ev) {
  const { overlay, settings } = windows();
  overlay.webContents.send('input', ev);
  if (settings) settings.webContents.send('input', ev);
}
const key = (t, name) => feed({ t, kind: 'key', name });
const mouse = (t, name, x = null, y = null) => feed({ t, kind: 'mouse', name, x, y });

async function capture(win, name, rect) {
  const img = await win.webContents.capturePage(rect);
  fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG());
}

async function snapOverlay(name, region = 'bottom') {
  const { overlay } = windows();
  const b = overlay.getBounds();
  const w = 1000;
  const ht = 380;
  const x = Math.round(b.width / 2 - w / 2);
  const rect = region === 'top'
    ? { x, y: 0, width: w, height: ht }
    : { x, y: b.height - ht, width: w, height: ht };
  await capture(overlay, name, rect);
}

async function snapSettings(name) {
  await capture(windows().settings, name);
}

async function clickNav(id) {
  const { settings } = windows();
  await settings.webContents.executeJavaScript(`document.querySelector('.nav-item[data-id="${id}"]').click()`);
  await sleep(450);
}

// Метка у курсора должна вырастать из точки клика, а не прилетать из угла экрана.
async function dotScenario() {
  const { overlay } = windows();
  const near = { x: 560, y: 320, width: 160, height: 160 };
  const corner = { x: 0, y: 0, width: 560, height: 320 };
  mouse('down', 1, 640, 400);
  await sleep(25);
  await capture(overlay, 'd1-25ms-near', near);
  await capture(overlay, 'd1-25ms-corner', corner);
  await sleep(60);
  await capture(overlay, 'd2-90ms-near', near);
  await sleep(300);
  await capture(overlay, 'd3-held-near', near);
  mouse('up', 1, 640, 400);
  await sleep(90);
  await capture(overlay, 'd4-release-near', near);
  await capture(overlay, 'd4-release-corner', corner);
}

// Встряхивание: подсветка плавно разгорается, стрелка растёт; после остановки всё медленно гаснет.
async function shakeScenario() {
  const { overlay, settings } = windows();
  const area = { x: 440, y: 270, width: 520, height: 280 };
  const moveTo = (x, y) => overlay.webContents.send('input', { t: 'move', x, y });

  // Обычный быстрый проход через экран — эффект включаться не должен.
  for (let x = 100; x <= 1100; x += 60) { moveTo(x, 400); await sleep(16); }
  await sleep(200);
  await capture(overlay, 'k0-fast-sweep-nothing', { x: 0, y: 250, width: 1200, height: 300 });

  // Встряхивание влево-вправо ~3 px/мс
  let t = 0;
  const shake = async (ms) => {
    const end = t + ms;
    for (; t < end; t += 16) {
      moveTo(640 + Math.round(150 * Math.sin(t / 50)), 400 + Math.round(12 * Math.sin(t / 90)));
      await sleep(16);
    }
  };
  await shake(420);
  await capture(overlay, 'k1-shake-start', area);
  await shake(700);
  await capture(overlay, 'k2-shake-full', area);
  moveTo(640, 400);
  await sleep(600);
  await capture(overlay, 'k3-stopped-600ms', area);
  await sleep(1100);
  await capture(overlay, 'k4-stopped-1700ms', area);
  await sleep(1500);
  await capture(overlay, 'k5-stopped-3200ms', area);

  // Раздел «Мышь» в настройках
  await clickNav('mouse');
  await settings.webContents.executeJavaScript("document.getElementById('content').scrollTop = 400");
  await sleep(300);
  await snapSettings('k6-settings-mouse');
}

// Языки: окно настроек на английском и русском, раздел «Обновления» и окно «Что нового».
async function i18nScenario() {
  const { settings } = windows();
  const clickText = (text) => settings.webContents.executeJavaScript(
    `[...document.querySelectorAll('.row.btn')].find((r) => r.textContent.includes(${JSON.stringify(text)})).click()`,
  );
  console.log('system lang:', await settings.webContents.executeJavaScript('document.documentElement.lang'));
  for (const lang of ['en', 'ru']) {
    emit('set', { language: lang });
    await sleep(500);
    for (const id of ['look', 'mouse', 'general', 'updates']) {
      await clickNav(id);
      await snapSettings(`i-${lang}-${id}`);
    }
    await clickText(lang === 'en' ? 'What’s New' : 'Что нового');
    await sleep(700);
    await snapSettings(`i-${lang}-whatsnew`);
    await settings.webContents.executeJavaScript("document.querySelector('.sheet .btn-primary').click()");
    await sleep(400);
  }
  // Подписи мыши на экране на английском
  emit('set', { language: 'en' });
  await sleep(300);
  key('down', 'Ctrl'); mouse('down', 1); await sleep(500);
  await snapOverlay('i-en-overlay-mouse');
  mouse('up', 1); key('up', 'Ctrl');
  emit('set', { language: 'auto' });
  await sleep(300);
}

// Скриншоты для README → docs/screenshots. Настоящий ввод отключён, чтобы в кадр не попало лишнее.
async function screensScenario() {
  const shots = path.join(__dirname, '..', 'docs', 'screenshots');
  fs.mkdirSync(shots, { recursive: true });
  require('uiohook-napi').uIOhook.stop();
  const { settings } = windows();
  const save = async (win, name, rect) => {
    const img = await win.webContents.capturePage(rect);
    fs.writeFileSync(path.join(shots, name + '.png'), img.toPNG());
  };
  const toSettings = (t, kind, name) => settings.webContents.send('input', { t, kind, name, x: null, y: null });
  const clickRow = (text) => settings.webContents.executeJavaScript(
    `[...document.querySelectorAll('.row.btn')].find((r) => r.textContent.includes(${JSON.stringify(text)})).click()`,
  );
  settings.webContents.send('status', { hookOk: true, hookError: null, hotkeyOk: true });

  // 1. Настройки: тёмная тема, русский, зажато Ctrl + Shift + S
  emit('set', { theme: 'dark', language: 'ru' });
  await sleep(700);
  await clickNav('look');
  for (const k of ['Ctrl', 'Shift', 'S']) { toSettings('down', 'key', k); await sleep(60); }
  await sleep(900);
  await save(settings, 'settings-ru');
  for (const k of ['S', 'Shift', 'Ctrl']) toSettings('up', 'key', k);
  await sleep(2600);

  // 2. Настройки: светлая тема, английский, раздел «Мышь», Ctrl + ЛКМ
  emit('set', { theme: 'light', language: 'en' });
  await sleep(700);
  await clickNav('mouse');
  toSettings('down', 'key', 'Ctrl'); await sleep(80); toSettings('down', 'mouse', 1);
  await sleep(900);
  await save(settings, 'settings-en');
  toSettings('up', 'mouse', 1); toSettings('up', 'key', 'Ctrl');
  await sleep(2600);

  // 3. «Что нового» и «Обновления»
  emit('set', { theme: 'dark', language: 'ru' });
  await sleep(700);
  await clickNav('updates');
  settings.webContents.send('update', { status: 'latest' });
  await sleep(300);
  await save(settings, 'updates-ru');
  await clickRow('Что нового');
  await sleep(800);
  await save(settings, 'whatsnew-ru');
  await settings.webContents.executeJavaScript("document.querySelector('.sheet .btn-primary').click()");
  await sleep(400);

  // 4. Сцены с настоящим движком поверх условного редактора (окно прозрачное для пользователя)
  const sc = new BrowserWindow({
    width: 1600, height: 900, useContentSize: true, show: false, frame: false,
    opacity: 0, focusable: false, skipTaskbar: true,
    webPreferences: { backgroundThrottling: false },
  });
  sc.showInactive();
  const scenes = [
    ['hero', 'ru', 'hero'],
    ['mouse', 'ru', 'mouse-ru'],
    ['mouse', 'en', 'mouse-en'],
    ['shake', 'ru', 'find-cursor', { x: 440, y: 214, width: 700, height: 440 }],
    ['styles', 'ru', 'styles', { x: 0, y: 0, width: 1600, height: 520 }],
  ];
  for (const [scene, lang, name, rect] of scenes) {
    await sc.loadFile(path.join(__dirname, 'showcase.html'));
    await sc.webContents.executeJavaScript(`showcase.${scene}(${JSON.stringify(lang)})`);
    await save(sc, name, rect);
  }
  sc.destroy();
  emit('set', { theme: 'system', language: 'auto' });
  console.log('screens saved to', shots);
}

async function fullScenario() {
  // 1. Ctrl + Shift + S — зажато
  key('down', 'Ctrl'); await sleep(120); key('down', 'Shift'); await sleep(120); key('down', 'S');
  await sleep(700);
  await snapOverlay('a1-held');
  key('up', 'S'); key('up', 'Shift'); key('up', 'Ctrl');
  await sleep(500);
  await snapOverlay('a2-released');

  // 2. Ctrl зажат, Z-Z-Z → ×3
  key('down', 'Ctrl');
  for (let i = 0; i < 3; i++) { await sleep(150); key('down', 'Z'); await sleep(110); key('up', 'Z'); }
  await sleep(700);
  await snapOverlay('a3-ctrl-z-x3');
  key('up', 'Ctrl');
  await sleep(2600);

  // 3. Space + ЛКМ с перетаскиванием и кругом у курсора
  key('down', 'Space'); await sleep(200);
  mouse('down', 1, 640, 300); await sleep(150);
  feed({ t: 'drag', kind: 'mouse', name: 1 }); await sleep(600);
  await snapOverlay('a4-space-drag');
  await snapSettings('s0-preview');
  mouse('up', 1, 700, 330); key('up', 'Space');
  await sleep(2600);

  // 4. Разные клавиши: Win + Shift + S, Ctrl + колесо, Alt + Tab, Enter, Backspace, стрелка
  key('down', 'Meta'); key('down', 'Shift'); key('down', 'S'); await sleep(80);
  key('up', 'S'); key('up', 'Shift'); key('up', 'Meta'); await sleep(120);
  key('down', 'Ctrl'); feed({ t: 'wheel', dir: 'up' }); await sleep(80); feed({ t: 'wheel', dir: 'up' }); await sleep(80); key('up', 'Ctrl');
  await sleep(120);
  key('down', 'Alt'); key('down', 'Tab'); await sleep(60); key('up', 'Tab'); key('up', 'Alt');
  await sleep(700);
  await snapOverlay('a5-mix');
  await sleep(2600);
  key('down', 'Enter'); key('up', 'Enter'); await sleep(100);
  key('down', 'Backspace'); key('up', 'Backspace'); await sleep(100);
  key('down', 'ArrowLeft'); await sleep(500);
  await snapOverlay('a6-specials');
  key('up', 'ArrowLeft');
  await sleep(2600);

  // 5. Разделы настроек
  for (const id of ['look', 'behavior', 'mouse', 'motion', 'place', 'general']) {
    await clickNav(id);
    await snapSettings('s-' + id);
  }

  // 6. Настоящий хук (только по флагу): безопасная комбинация Shift + F15 через системный ввод
  if (process.argv.includes('--real-hook')) {
    const { uIOhook, UiohookKey } = require('uiohook-napi');
    uIOhook.keyToggle(UiohookKey.Shift, 'down');
    await sleep(200);
    uIOhook.keyToggle(UiohookKey.F15, 'down');
    await sleep(300);
    await snapOverlay('b1-real-hook-held');
    uIOhook.keyToggle(UiohookKey.F15, 'up');
    uIOhook.keyToggle(UiohookKey.Shift, 'up');
    await sleep(2600);
  }

  // 7. Светлая тема настроек, стиль «Светлый», сверху
  emit('set', { keyStyle: 'light', position: 'top-center', theme: 'light', labelMode: 'icon' });
  await clickNav('look');
  await sleep(500);
  key('down', 'Ctrl'); key('down', 'Shift'); key('down', 'Z'); await sleep(600);
  await snapOverlay('c1-light-top', 'top');
  await snapSettings('s-light');
  key('up', 'Z'); key('up', 'Shift'); key('up', 'Ctrl');
  await sleep(300);
}

app.whenReady().then(async () => {
  try {
    await sleep(2500);
    emit('reset');
    emit('set', { theme: 'dark' });
    windows().settings.setSize(1040, 760);
    await sleep(500);
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.on('console-message', (_e, level, message) => {
        if (level >= 2) console.log(`CONSOLE[${w.getTitle()}]`, message);
      });
    }
    if (process.argv.includes('--dot')) await dotScenario();
    else if (process.argv.includes('--shake')) await shakeScenario();
    else if (process.argv.includes('--i18n')) await i18nScenario();
    else if (process.argv.includes('--screens')) await screensScenario();
    else await fullScenario();
  } catch (err) {
    console.error('SNAP ERROR', err);
  }
  console.log('SNAP DONE', outDir);
  app.exit(0);
});
