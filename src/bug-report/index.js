'use strict';
/**
 * «Сообщить об ошибке» — общий модуль для программ на Electron (KeyShow, WatchTwitch, Enterload).
 *
 * Что делает:
 *  - ведёт короткий журнал: последние действия человека (нажатия в окнах программы и события,
 *    которые программа отмечает сама через crumb()) и последние ошибки (console.error главного
 *    процесса, ошибки страниц, падения окон);
 *  - показывает окно отчёта: описание, необязательный контакт и раскрывающийся список
 *    «Что ещё отправится» — ровно то, что уйдёт на сервер, без скрытых полей;
 *  - после необработанной ошибки или падения окна сам предлагает отправить отчёт
 *    (можно отключить галочкой «Больше не предлагать»);
 *  - отправляет отчёт на https://mytoolkit.ru/api/prog-report.php.
 *
 * Секретов в модуле нет и не нужно: сервер только принимает отчёты, ничего не отдаёт
 * и сам ограничивает частоту. Пути к папкам пользователя, имя пользователя, почты,
 * ключи, адреса страниц (кроме домена) и пути к файлам человека вырезаются ещё здесь, до показа человеку.
 *
 * Подключение (главный процесс):
 *   const bugReport = require('./bug-report');
 *   bugReport.init({ app: 'keyshow', name: 'KeyShow', lang: () => 'ru', parent: () => win });
 *   bugReport.attach(win.webContents, 'Главное окно');   // журнал нажатий и ошибок этого окна
 *   bugReport.crumb('Запущен фарминг');                     // своё событие в журнал
 *   bugReport.open();                                        // окно «Сообщить об ошибке»
 * В preload окна программы (без require — подходит и для sandbox):
 *   reportBug: () => ipcRenderer.send('bug-report:open')
 */
const { app, BrowserWindow, ipcMain, net, nativeTheme, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const ENDPOINT = 'https://mytoolkit.ru/api/prog-report.php';
const MAX_CRUMBS = 50;
const MAX_ERRORS = 20;
const T = {
  ru: {
    title: 'Сообщить об ошибке',
    crashTitle: 'В программе произошла ошибка',
    lead: 'Опишите, что пошло не так. Отчёт уйдёт разработчику {name}.',
    crashLead: 'Можно отправить отчёт разработчику — так ошибку исправят быстрее. Программа продолжит работать.',
    message: 'Что случилось',
    messagePh: 'Например: нажимаю «Сохранить», а настройки сбрасываются',
    crashMessage: 'Что вы делали в этот момент (необязательно)',
    contact: 'Как с вами связаться (необязательно)',
    contactPh: 'Почта или Telegram — если нужен ответ',
    details: 'Что ещё отправится',
    detailsNote: 'Имя пользователя, почты, ключи, пути к вашим файлам и адреса страниц (кроме названия сайта) уже вырезаны.',
    program: 'Программа', system: 'Система', screen: 'Раздел', uptime: 'Работает', lang: 'Язык',
    crumbs: 'Последние действия', errors: 'Последние ошибки', none: 'нет',
    ago: 'назад', sec: 'с', min: 'мин', h: 'ч',
    send: 'Отправить', crashSend: 'Отправить отчёт', cancel: 'Отмена', crashCancel: 'Не отправлять',
    noMore: 'Больше не предлагать после ошибок',
    sending: 'Отправляю…',
    sent: 'Отчёт № {id} отправлен. Спасибо — это правда помогает!',
    close: 'Закрыть',
    short: 'Опишите проблему хотя бы парой слов.',
    rate: 'Слишком много отчётов подряд. Попробуйте через несколько минут.',
    net: 'Не получилось отправить. Проверьте интернет и попробуйте ещё раз — или скопируйте отчёт и пришлите его автору.',
    fail: 'Сервер не принял отчёт. Можно скопировать его и прислать автору.',
    copy: 'Скопировать отчёт', copied: 'Скопировано',
    where: 'Отчёт уходит на mytoolkit.ru — сайт автора программы.',
    started: 'запуск программы', windowGone: 'окно программы упало', notResponding: 'окно не отвечает',
  },
  en: {
    title: 'Report a problem',
    crashTitle: 'Something went wrong',
    lead: 'Describe what went wrong. The report goes to the developer of {name}.',
    crashLead: 'You can send a report to the developer so the problem gets fixed sooner. The app keeps running.',
    message: 'What happened',
    messagePh: 'For example: I press Save and the settings reset',
    crashMessage: 'What were you doing at that moment (optional)',
    contact: 'How to reach you (optional)',
    contactPh: 'Email or Telegram, if you want a reply',
    details: 'What else will be sent',
    detailsNote: 'User name, emails, keys, paths to your files and page addresses (except the site name) are already removed.',
    program: 'App', system: 'System', screen: 'Section', uptime: 'Running for', lang: 'Language',
    crumbs: 'Recent actions', errors: 'Recent errors', none: 'none',
    ago: 'ago', sec: 's', min: 'min', h: 'h',
    send: 'Send', crashSend: 'Send report', cancel: 'Cancel', crashCancel: "Don't send",
    noMore: "Don't offer after errors again",
    sending: 'Sending…',
    sent: 'Report #{id} sent. Thank you — it really helps!',
    close: 'Close',
    short: 'Please describe the problem in a few words.',
    rate: 'Too many reports in a row. Please try again in a few minutes.',
    net: 'Could not send. Check your connection and try again — or copy the report and send it to the author.',
    fail: 'The server did not accept the report. You can copy it and send it to the author.',
    copy: 'Copy report', copied: 'Copied',
    where: 'The report is sent to mytoolkit.ru, the author\'s website.',
    started: 'app started', windowGone: 'app window crashed', notResponding: 'window is not responding',
  },
};
/* для этих языков окно по-русски, для остальных — по-английски */
const RU_LIKE = ['ru', 'be', 'uk', 'kk', 'ky', 'tg', 'tt', 'uz', 'tk', 'hy', 'az', 'ba', 'cv', 'os', 'sah', 'mn'];

const S = {
  opt: null, crumbs: [], errors: [], started: Date.now(), win: null, settings: null, offered: new Set(), offers: 0, attached: new Set(),
};

/* ── очистка личного ── */
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
let cleaners = null;
/* Пути к файлам. Технические (папка программы, AppData\Roaming и Local, node_modules, Program Files) оставляем —
   по ним ищут ошибку. Остальные (Видео, Загрузки, Рабочий стол, другие диски, сетевые папки) — файлы человека,
   в их именах бывают названия роликов и документов: вырезаем, оставляя только имя служебного файла (.js, .json, .log…). */
const PATH_RE = /(?:(?<![\w.])[A-Za-z]:|\\\\[^\\\/\s'"]+|(?<![\w.\/])~)(?:\\\\|\\|\/)[^\n'"`|*?]*/g;
const TECH_PATH = /app\.asar|node_modules|Program Files|ProgramData|[\\\/]Windows[\\\/]|AppData(?:\\\\|\\|\/)+(?:Roaming|Local(?!(?:\\\\|\\|\/)+Temp))(?:\\\\|\\|\/)/i;
const TECH_FILE = /^([^\s\\\/:)]+\.(?:js|cjs|mjs|jsx|ts|tsx|json|node|exe|dll|asar|log|db|sqlite|ini|ya?ml|html|css|map))((?::\d+)*\)?)/i;
function paths(s) {
  return s.replace(PATH_RE, m => {
    if (TECH_PATH.test(m)) return m;
    const parts = m.split(/\\\\|\\|\//);
    for (let i = parts.length - 1; i > 0; i--) { const f = parts[i].match(TECH_FILE); if (f) return '<путь>\\' + f[1] + f[2]; }
    return '<путь>';
  });
}
function buildCleaners() {
  const list = [];
  const home = os.homedir();
  const user = (() => { try { return os.userInfo().username || ''; } catch (e) { return ''; } })();
  const homes = new Set([home, home.replace(/\\/g, '/'), home.replace(/\\/g, '\\\\'), home.replace(/\\/g, '\\\\\\\\')]);
  for (const h of homes) if (h && h.length > 3) list.push([new RegExp(esc(h), 'gi'), '~']);
  if (user.length >= 3 && !/^(user|admin|администратор|пользователь|root)$/i.test(user)) list.push([new RegExp('(^|[^\\p{L}\\p{N}_])' + esc(user) + '(?=$|[^\\p{L}\\p{N}_])', 'giu'), '$1<user>']);
  cleaners = list;
}
function clean(v, max) {
  let s = v == null ? '' : String(v);
  if (!cleaners) buildCleaners();
  for (const [re, to] of cleaners) s = s.replace(re, to);
  s = paths(s)
    /* чужие профили и другие написания: C:\Users\Имя\…, /Users/имя/…, /home/имя/… */
    .replace(/([A-Za-z]:(?:\\\\|\\|\/)+(?:Users|Documents and Settings|Пользователи)(?:\\\\|\\|\/)+)(?!Public\b|Default\b|All Users\b)[^\\\/:*?"<>|\r\n]+/gi, '$1<user>')
    .replace(/(^|[\s"'(=:])(\/(?:Users|home)\/)(?!Shared\b)[^\/\s"'<>]+/g, '$1$2<user>')
    /* адреса страниц — только домен: путь и параметры могут содержать личное и ключи */
    .replace(/\b(https?|wss?|ftp):\/\/(?:[^\s/@"'<>]+@)?([^\s/?#"'<>:]+)(:\d+)?([^\s"'<>]*)/gi, (m, sch, host, port, rest) => sch.toLowerCase() + '://' + host + (rest && rest !== '/' ? '/…' : ''))
    .replace(/\b(bearer|oauth|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 ***')
    .replace(/((?:access|refresh|auth|api|client|private|session)?[_-]?(?:token|secret|password|passwd|pwd|apikey|api[_-]?key|sid|cookie|authorization|signature))(["']?\s*[:=]\s*["']?)[^\s"'&,;}]{3,}/gi, '$1$2***')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/\b(?=[A-Za-z0-9_-]{24,}\b)(?=[A-Za-z_-]*[0-9])(?=[0-9_-]*[A-Za-z])[A-Za-z0-9_-]+/g, '***');
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (max && s.length > max) s = s.slice(0, max - 1) + '…';
  return s;
}

/* ── журнал ── */
function push(list, max, text) {
  const s = clean(text, list === S.errors ? 3000 : 300);
  if (!s) return;
  const now = Date.now(), last = list[list.length - 1];
  if (last && last.s === s && now - last.t < 60000) { last.n = (last.n || 1) + 1; last.t = now; return; }
  list.push({ t: now, s });
  if (list.length > max) list.shift();
}
function crumb(text) { push(S.crumbs, MAX_CRUMBS, text); }
function errText(e) {
  if (e instanceof Error) return (e.stack && e.stack.includes(e.message) ? e.stack : (e.name || 'Error') + ': ' + e.message + (e.stack ? '\n' + e.stack : '')).split('\n').slice(0, 12).join('\n');
  if (e && typeof e === 'object') { try { return JSON.stringify(e).slice(0, 1000); } catch (x) { return String(e); } }
  return String(e);
}
function error(e) { push(S.errors, MAX_ERRORS, errText(e)); }

/* ── хранилище: номер установки и «больше не предлагать» ── */
function settingsFile() { return path.join(app.getPath('userData'), 'bug-report.json'); }
function settings() {
  if (S.settings) return S.settings;
  let d = {};
  try { d = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {}; } catch (e) {}
  if (!/^[a-f0-9]{32}$/.test(d.install || '')) d.install = crypto.randomBytes(16).toString('hex');
  S.settings = d; saveSettings();
  return d;
}
function saveSettings() { try { fs.writeFileSync(settingsFile(), JSON.stringify(S.settings)); } catch (e) {} }

function lang() {
  let l = '';
  try { l = String((S.opt.lang && S.opt.lang()) || app.getLocale() || 'en'); } catch (e) { l = 'en'; }
  return l.toLowerCase().split(/[-_]/)[0];
}
function strings() { return RU_LIKE.includes(lang()) ? T.ru : T.en; }
function osName() {
  const rel = os.release(), arch = process.arch;
  if (process.platform === 'win32') { const b = +(rel.split('.')[2] || 0); return 'Windows ' + (b >= 22000 ? '11' : rel.startsWith('10.') ? '10' : rel) + ' (' + rel + ') ' + arch; }
  if (process.platform === 'darwin') return 'macOS ' + (process.getSystemVersion ? process.getSystemVersion() : rel) + ' ' + arch;
  return os.type() + ' ' + rel + ' ' + arch;
}

/* нажатия в окнах программы: журнал живёт в самом окне, забираем его при открытии отчёта */
const PAGE_SCRIPT = `(() => {
  if (window.__brOn) return; window.__brOn = 1;
  const L = window.__brCrumbs = window.__brCrumbs || [];
  const add = s => { s = String(s).replace(/\\s+/g, ' ').trim().slice(0, 120); if (!s) return; const t = Date.now(), l = L[L.length - 1];
    if (l && l[1] === s && t - l[0] < 1500) return; L.push([t, s]); if (L.length > 40) L.shift(); };
  const name = el => {
    /* data-br-name — своё имя для журнала; data-br-private / data-no-tr — внутри личное (логины, названия): текст не пишем */
    const own = el.closest('[data-br-name]'); if (own) return own.getAttribute('data-br-name').slice(0, 60);
    if (el.closest('[data-br-private],[data-no-tr]') || el.querySelector('[data-br-private],[data-no-tr]')) return el.getAttribute('aria-label') || 'скрытый элемент';
    const lb = el.labels && el.labels[0] ? (el.labels[0].innerText || '').trim() : '';
    const v = el.getAttribute('aria-label') || lb || (el.innerText || el.textContent || '').trim() || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || '';
    return String(v).split('\\n')[0].slice(0, 60); };
  document.addEventListener('click', e => {
    const el = e.target && e.target.closest && e.target.closest('button,a,[role=button],[role=tab],[role=menuitem],[role=switch],[role=option],input[type=checkbox],input[type=radio],summary,select,[data-page],[data-tab],[data-action],[onclick]');
    if (!el) return;
    let s = name(el); if (!s && el.querySelector('svg')) s = (el.className && String(el.className).slice(0, 40)) || 'значок';
    if (!s) return;
    if (el.matches('input[type=checkbox],[role=switch]')) s += el.checked || el.getAttribute('aria-checked') === 'true' ? ' (вкл)' : ' (выкл)';
    add('нажал: ' + s);
  }, true);
  document.addEventListener('change', e => { const el = e.target; if (el && el.tagName === 'SELECT') add('выбрал: ' + name(el) + ' = ' + ((el.selectedOptions[0] || {}).text || '').slice(0, 40)); }, true);
  addEventListener('hashchange', () => add('переход: ' + location.hash.slice(0, 40)));
})();`;

function attach(wc, label) {
  if (!wc || S.attached.has(wc)) return;
  S.attached.add(wc);
  const inject = () => { if (!wc.isDestroyed()) wc.executeJavaScript(PAGE_SCRIPT, true).catch(() => {}); };
  wc.on('dom-ready', inject);
  if (!wc.isLoading()) inject();
  wc.on('console-message', (...a) => {
    const ev = a[0] || {};
    const level = typeof ev.level === 'string' ? ev.level : a[1];
    const message = typeof ev.message === 'string' ? ev.message : a[2];
    const src = typeof ev.sourceId === 'string' ? ev.sourceId : a[4], line = typeof ev.lineNumber === 'number' ? ev.lineNumber : a[3];
    if (level === 'error' || level === 3) error((label ? '[' + label + '] ' : '') + message + (src ? '\n    at ' + src + ':' + line : ''));
  });
  wc.on('render-process-gone', (_e, d) => {
    const reason = d && d.reason;
    if (reason === 'clean-exit') return;
    const s = strings().windowGone + (label ? ' (' + label + ')' : '') + ': ' + reason + (d.exitCode ? ', код ' + d.exitCode : '');
    error(s); crumb(s);
    if (['crashed', 'oom', 'abnormal-exit', 'launch-failed'].includes(reason)) offer(s);
  });
  wc.on('unresponsive', () => crumb(strings().notResponding + (label ? ' (' + label + ')' : '')));
  wc.on('did-fail-load', (_e, code, desc, url, main) => { if (main && code !== -3) error('не загрузилось' + (label ? ' [' + label + ']' : '') + ': ' + desc + ' (' + code + ') ' + url); });
  wc.once('destroyed', () => S.attached.delete(wc));
}
async function pageCrumbs() {
  const out = [];
  await Promise.all([...S.attached].map(wc => wc.isDestroyed() || wc.isCrashed() ? null :
    Promise.race([wc.executeJavaScript('JSON.stringify(window.__brCrumbs || [])', true), new Promise(r => setTimeout(() => r('[]'), 700))])
      .then(j => { try { JSON.parse(j).forEach(x => out.push({ t: +x[0], s: clean(x[1], 300) })); } catch (e) {} }).catch(() => {})));
  return out;
}

/* ── отчёт ── */
async function snapshot(kind, extraError) {
  const o = S.opt, now = Date.now();
  if (extraError) error(extraError);
  const crumbs = S.crumbs.map(x => ({ t: x.t, s: x.s + (x.n > 1 ? ' ×' + x.n : '') })).concat(await pageCrumbs())
    .sort((a, b) => a.t - b.t).slice(-60);
  let screen = '', extra = {};
  try { screen = clean(o.screen ? await o.screen() : '', 120); } catch (e) {}
  try { const x = o.extra ? await o.extra() : null; if (x && typeof x === 'object') for (const [k, v] of Object.entries(x).slice(0, 20)) if (v !== undefined && v !== null && v !== '') extra[String(k).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 40)] = clean(v, 300); } catch (e) {}
  return {
    v: 1, app: o.app, version: o.version || app.getVersion(), kind,
    screen, os: osName(), runtime: 'Electron ' + process.versions.electron, lang: lang(),
    uptime: Math.round((now - S.started) / 1000),
    crumbs: crumbs.map(x => [Math.min(0, Math.round((x.t - now) / 100) / 10), x.s]),
    errors: S.errors.slice(-MAX_ERRORS).map(x => [Math.min(0, Math.round((x.t - now) / 100) / 10), x.s + (x.n > 1 ? '\n(повторилось ' + x.n + ' раз)' : '')]),
    extra, install: settings().install,
  };
}
function asText(p, message, contact) {
  const L = [S.opt.name + ' ' + p.version + ' · ' + p.os + ' · ' + p.runtime];
  if (p.screen) L.push('Раздел: ' + p.screen);
  for (const [k, v] of Object.entries(p.extra)) L.push(k + ': ' + v);
  L.push('', message || '(без описания)');
  if (contact) L.push('Контакт: ' + contact);
  if (p.crumbs.length) { L.push('', 'Действия (секунд назад):'); p.crumbs.forEach(c => L.push('  ' + c[0] + '  ' + c[1])); }
  if (p.errors.length) { L.push('', 'Ошибки:'); p.errors.forEach(c => L.push('  ' + c[0] + '  ' + c[1])); }
  return L.join('\n');
}
async function send(p) {
  let url = ENDPOINT;
  if (!app.isPackaged && process.env.BUG_REPORT_ENDPOINT) url = process.env.BUG_REPORT_ENDPOINT;   // только для проверки из исходников
  const body = JSON.stringify(Object.assign({}, p, { rid: crypto.randomBytes(16).toString('hex') }));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await net.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(20000) });
      let d = null; try { d = await r.json(); } catch (e) {}
      if (r.ok && d && d.ok) return { ok: true, id: d.id };
      if (r.status === 429) return { ok: false, error: 'rate' };
      if (d && d.error === 'bad_message') return { ok: false, error: 'short' };
      if (r.status >= 500 && attempt === 0) continue;
      return { ok: false, error: 'fail' };
    } catch (e) {
      if (attempt === 0) { await new Promise(r => setTimeout(r, 1500)); continue; }
      return { ok: false, error: 'net' };
    }
  }
  return { ok: false, error: 'net' };
}

/* ── окно отчёта ── */
async function open(o) {
  o = o || {};
  const kind = o.kind === 'crash' ? 'crash' : 'manual';
  if (S.win && !S.win.isDestroyed()) { S.win.show(); S.win.focus(); return; }
  if (kind === 'manual') crumb(strings() === T.ru ? 'открыл «Сообщить об ошибке»' : 'opened “Report a problem”');
  const payload = await snapshot(kind, o.error);
  let dark = nativeTheme.shouldUseDarkColors;
  try { if (S.opt.theme) dark = S.opt.theme() === 'dark'; } catch (e) {}
  let parent = null;
  try { parent = S.opt.parent ? S.opt.parent() : null; } catch (e) {}
  if (parent && (parent.isDestroyed() || !parent.isVisible() || parent.isMinimized())) parent = null;
  const win = new BrowserWindow({
    width: 560, height: 680, minWidth: 420, minHeight: 480, show: false, parent: parent || undefined, modal: !!parent,
    title: (kind === 'crash' ? strings().crashTitle : strings().title) + ' — ' + S.opt.name,
    backgroundColor: dark ? '#17181c' : '#ffffff', autoHideMenuBar: true, minimizable: false, maximizable: false, fullscreenable: false,
    icon: S.opt.icon || undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  S.win = win;
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('closed', () => { if (S.win === win) S.win = null; });
  let accent = S.opt.accent;
  try { if (typeof accent === 'function') accent = accent(); } catch (e) { accent = ''; }
  win.__br = { kind, payload, dark, accent: accent || '#4f46e5' };
  win.loadFile(path.join(__dirname, 'report.html'));
}
function offer(err) {
  try {
    if (!S.opt || S.opt.offerOnCrash === false || settings().noCrashOffer) return;
    const key = String(err).split('\n')[0].slice(0, 200);
    if (S.offered.has(key) || S.offers >= 3) return;
    S.offered.add(key); S.offers++;
    if (app.isReady()) open({ kind: 'crash' }).catch(() => {});
    else app.once('ready', () => open({ kind: 'crash' }).catch(() => {}));
  } catch (e) {}
}

function init(opt) {
  if (S.opt) return module.exports;
  S.opt = Object.assign({ offerOnCrash: true, catchErrors: true }, opt);
  crumb(strings().started + ' ' + (S.opt.version || app.getVersion()));
  /* ошибки главного процесса: console.error и необработанные исключения */
  const orig = console.error.bind(console);
  console.error = (...a) => { try { error(a.map(x => x instanceof Error ? errText(x) : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch (e) { return String(x); } })()).join(' ')); } catch (e) {} orig(...a); };
  if (S.opt.catchErrors) {
    process.on('uncaughtException', e => { error(e); offer(errText(e)); });
    process.on('unhandledRejection', e => { error(e); });
  }
  app.on('child-process-gone', (_e, d) => { if (d && d.reason !== 'clean-exit' && d.reason !== 'killed') error('процесс ' + d.type + ' упал: ' + d.reason); });

  ipcMain.on('bug-report:open', () => { open().catch(e => orig(e)); });
  ipcMain.on('bug-report:crumb', (_e, s) => crumb(String(s || '').slice(0, 300)));
  ipcMain.on('bug-report:error', (_e, s) => error(String(s || '').slice(0, 3000)));
  const own = e => S.win && !S.win.isDestroyed() && e.sender === S.win.webContents;
  ipcMain.handle('bug-report:data', e => {
    if (!own(e)) return null;
    const b = S.win.__br;
    return { kind: b.kind, payload: b.payload, dark: b.dark, accent: b.accent, name: S.opt.name, t: strings(), noMore: !!settings().noCrashOffer };
  });
  ipcMain.handle('bug-report:send', async (e, form) => {
    if (!own(e)) return { ok: false, error: 'fail' };
    const b = S.win.__br, f = form || {};
    const message = String(f.message || '').slice(0, 4000), contact = String(f.contact || '').slice(0, 200);
    if (b.kind === 'manual' && message.trim().length < 3) return { ok: false, error: 'short' };
    if (b.kind === 'crash' && f.noMore) { settings().noCrashOffer = true; saveSettings(); }
    const r = await send(Object.assign({}, b.payload, { message, contact }));
    crumb(r.ok ? 'отправил отчёт № ' + r.id : 'отчёт не отправился: ' + r.error);
    return r;
  });
  ipcMain.handle('bug-report:copy', (e, form) => {
    if (!own(e)) return false;
    const f = form || {};
    clipboard.writeText(asText(S.win.__br.payload, String(f.message || ''), String(f.contact || '')));
    return true;
  });
  ipcMain.on('bug-report:close', (e, form) => {
    if (!own(e)) return;
    if (form && form.noMore && S.win.__br.kind === 'crash') { settings().noCrashOffer = true; saveSettings(); }
    S.win.close();
  });
  ipcMain.on('bug-report:site', e => { if (own(e)) shell.openExternal('https://mytoolkit.ru/programmy'); });
  return module.exports;
}

module.exports = { init, attach, crumb, error, open, offer, clean };
