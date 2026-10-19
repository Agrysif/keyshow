'use strict';

(function () {
  const api = window.keyshow;
  const I18N = window.KeyShowI18n;
  const CHANGELOG = window.KeyShowChangelog || [];
  const $ = (sel, root = document) => root.querySelector(sel);

  let state = {};
  let defaults = {};
  let displays = [];
  let status = {};
  let version = '';
  let upd = { status: 'dev' };
  let lang = 'ru';
  let t = I18N.translator(lang);
  let current = 'look';
  let updaters = [];

  // ---------------------------------------------------------------- helpers
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const storage = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* недоступно */ } },
  };

  const num = (v, digits = 1) => v.toFixed(digits).replace('.', t('decimal'));
  const fmt = {
    sec: (v) => num(v / 1000) + ' ' + t('unit.sec'),
    pct: (v) => Math.round(v * 100) + '%',
    px: (v) => Math.round(v) + ' px',
    x: (v) => '×' + num(v),
    xShort: (v) => '×' + String(v).replace('.', t('decimal')),
  };

  function compareVersions(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return Math.sign(d);
    }
    return 0;
  }

  const ICONS = {
    look: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h2A5.1 5.1 0 0 0 21 10.1C21 6.2 17 3 12 3Z"/><circle cx="7.6" cy="11.2" r="1.1" fill="currentColor" stroke="none"/><circle cx="10.6" cy="7.3" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.2" cy="7.8" r="1.1" fill="currentColor" stroke="none"/></svg>',
    behavior: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.6"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8"/></svg>',
    mouse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v3"/></svg>',
    motion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3.5l1.9 4.6 4.6 1.9-4.6 1.9L11 16.5l-1.9-4.6L4.5 10l4.6-1.9z"/><path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg>',
    place: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2.2"/><path d="M8.5 21h7M12 17v4"/><rect x="8.5" y="11.2" width="7" height="2.6" rx="1.2" fill="currentColor" stroke="none"/></svg>',
    general: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>',
    updates: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v8M8.5 12.5 12 16l3.5-3.5"/></svg>',
  };
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg>';
  const CHEVRONS = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 4.5 6 2l2.5 2.5M3.5 7.5 6 10l2.5-2.5"/></svg>';
  const CHECK = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5 5.5 10.5 11.5 3.5"/></svg>';

  const PRESETS = [
    ['#0A84FF', 'blue'], ['#5E5CE6', 'indigo'], ['#BF5AF2', 'purple'], ['#FF375F', 'pink'],
    ['#FF9F0A', 'orange'], ['#FFD60A', 'yellow'], ['#30D158', 'green'], ['#48484A', 'graphite'],
    ['#F5F5F7', 'white'],
  ];

  const POSITIONS = [
    'top-left', 'top-center', 'top-right',
    'middle-left', 'middle-center', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ];

  // Опции сегментов: [значение, ключ перевода]
  const opts = (pairs) => pairs.map(([v, key]) => [v, t(key)]);

  // ---------------------------------------------------------------- state
  function set(key, value) {
    if (state[key] === value) return;
    state = { ...state, [key]: value };
    engine.setSettings(state);
    api.set({ [key]: value });
    sync();
  }

  function sync() {
    for (const fn of updaters) fn();
    syncMaster();
    const navUpd = document.querySelector('.nav-item[data-id="updates"]');
    if (navUpd) navUpd.classList.toggle('badge', upd.status === 'available' || upd.status === 'ready');
  }

  function syncMaster() {
    $('#masterToggle').checked = !!state.enabled;
    $('#masterSub').textContent = state.hotkey
      ? t('master.sub', { hotkey: prettyHotkey(state.hotkey) })
      : t('master.noHotkey');
  }

  function prettyHotkey(acc) {
    return acc.split('+').map((p) => (p === 'Super' ? 'Win' : p)).join(' + ');
  }

  // ---------------------------------------------------------------- язык
  function applyLang(next) {
    lang = next;
    t = I18N.translator(lang);
    document.documentElement.lang = lang;
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    if (previewSeg) previewSeg.setTitles({ light: t('preview.bgLight'), dark: t('preview.bgDark') });
    $('#sideFoot').textContent = version ? `KeyShow ${version}` : '';
    buildNav();
    renderBanner();
  }

  // ---------------------------------------------------------------- controls
  function segment(options, get, put, o = {}) {
    const thumb = h('div', { class: 'seg-thumb' });
    const btns = options.map(([v, label]) => h('button', {
      type: 'button',
      title: o.titles ? o.titles[v] : null,
      html: o.html ? label : null,
      onclick: () => put(v),
    }, o.html ? null : label));
    thumb.style.width = `calc((100% - 4px) / ${options.length})`;
    const el = h('div', { class: 'seg' + (o.small ? ' seg-sm' : '') }, thumb, ...btns);
    const update = () => {
      const i = Math.max(0, options.findIndex((x) => x[0] === get()));
      btns.forEach((b, j) => b.classList.toggle('on', i === j));
      thumb.style.transform = `translateX(${i * 100}%)`;
    };
    const setTitles = (titles) => btns.forEach((b, j) => { b.title = titles[options[j][0]] || ''; });
    update();
    return { el, update, setTitles };
  }

  function segCtl(key, options) {
    const s = segment(options, () => state[key], (v) => set(key, v));
    updaters.push(s.update);
    return s.el;
  }

  function toggleCtl(key) {
    const input = h('input', { type: 'checkbox' });
    input.addEventListener('change', () => set(key, input.checked));
    updaters.push(() => { input.checked = !!state[key]; });
    return h('label', { class: 'switch' }, input, h('span'));
  }

  function sliderCtl(key, { min, max, step, format }) {
    const val = h('span', { class: 'row-value' });
    const input = h('input', { type: 'range', class: 'slider', min, max, step, title: t('slider.reset') });
    const paint = () => {
      const p = ((+input.value - min) / (max - min)) * 100;
      input.style.setProperty('--p', p + '%');
      val.textContent = format(+input.value);
    };
    input.addEventListener('input', () => { paint(); set(key, +input.value); });
    input.addEventListener('dblclick', () => { input.value = defaults[key]; paint(); set(key, defaults[key]); });
    updaters.push(() => {
      if (document.activeElement !== input) input.value = state[key];
      paint();
    });
    return [input, val];
  }

  function stepperCtl(key, min, max) {
    const val = h('span', { class: 'row-value' });
    const minus = h('button', { type: 'button', onclick: () => set(key, Math.max(min, state[key] - 1)) }, '−');
    const plus = h('button', { type: 'button', onclick: () => set(key, Math.min(max, state[key] + 1)) }, '+');
    updaters.push(() => {
      val.textContent = state[key];
      minus.disabled = state[key] <= min;
      plus.disabled = state[key] >= max;
    });
    return [val, h('div', { class: 'stepper' }, minus, h('i'), plus)];
  }

  // ---------------------------------------------------------------- rows
  function row(label, controls, o = {}) {
    return h('div', { class: 'row' + (o.cls ? ' ' + o.cls : '') },
      h('div', { class: 'row-label' + (o.fixed ? ' fixed' : '') }, label, o.sub ? h('div', { class: 'row-sub' }, o.sub) : null),
      controls);
  }
  const toggleRow = (key, label, sub) => row(t(label), toggleCtl(key), { sub: sub && t(sub) });
  const segRow = (key, label, options, sub) => row(t(label), segCtl(key, opts(options)), { sub: sub && t(sub) });
  const sliderRow = (key, label, cfg) => row(t(label), sliderCtl(key, cfg), { fixed: true });

  // Строка приглушается, когда настройка не имеет смысла (например, задержка при выключенной подсветке).
  function dependsOn(rowEl, isActive) {
    updaters.push(() => rowEl.classList.toggle('inactive', !isActive()));
    return rowEl;
  }

  function colorsRow() {
    const sws = PRESETS.map(([c, name]) => h('button', {
      type: 'button',
      class: 'sw' + (c === '#F5F5F7' ? ' light' : ''),
      style: `--c:${c}`,
      title: t('color.' + name),
      onclick: () => set('keyColor', c),
    }));
    const custom = h('button', { type: 'button', class: 'sw custom', title: t('color.custom') });
    custom.addEventListener('click', () => openColorPicker(custom));
    const hex = h('span', { class: 'hex' });
    updaters.push(() => {
      const cur = String(state.keyColor).toUpperCase();
      let found = false;
      sws.forEach((b, i) => {
        const on = PRESETS[i][0] === cur;
        b.classList.toggle('on', on);
        found = found || on;
      });
      custom.classList.toggle('on', !found);
      custom.style.setProperty('--c', state.keyColor);
      hex.textContent = cur;
    });
    return h('div', { class: 'row swatches' }, h('div', { class: 'sw-list' }, ...sws, custom), hex);
  }

  function positionRow() {
    const pill = h('div', { class: 'pos-pill' }, h('i'), h('i'), h('i'));
    const cells = POSITIONS.map((v) => h('button', {
      type: 'button', class: 'pos-cell', title: t('pos.' + v), onclick: () => set('position', v),
    }, h('span')));
    const title = h('div', { class: 't' });
    const sub = h('div', { class: 's' }, t('pos.sub'));
    updaters.push(() => {
      const i = Math.max(0, POSITIONS.indexOf(state.position));
      cells.forEach((c, j) => c.classList.toggle('on', i === j));
      pill.style.left = ['18%', '50%', '82%'][i % 3];
      pill.style.top = ['19%', '50%', '81%'][Math.floor(i / 3)];
      pill.style.setProperty('--c', state.keyColor);
      title.textContent = t('pos.' + POSITIONS[i]);
    });
    return h('div', { class: 'row pos-row' },
      h('div', { class: 'screen' }, ...cells, pill),
      h('div', { class: 'pos-info' }, title, sub));
  }

  function displayRow() {
    const label = h('span');
    const btn = h('button', { type: 'button', class: 'select' }, label, h('span', { html: CHEVRONS, style: 'display:flex' }));
    const options = () => [
      { value: 'primary', label: t('display.primary') },
      ...displays.map((d) => ({ value: d.id, label: d.name, sub: d.size + (d.primary ? ' · ' + t('display.primaryTag') : '') })),
    ];
    btn.addEventListener('click', () => menuPop(btn, options(), state.display, (v) => set('display', v)));
    updaters.push(() => {
      const o = options().find((x) => x.value === String(state.display));
      label.textContent = o ? o.label : t('display.primary');
    });
    return row(t('display.label'), btn, { sub: displays.length > 1 ? t('display.count', { n: displays.length }) : null });
  }

  function hotkeyRow() {
    const btn = h('button', { type: 'button', class: 'hk' });
    const err = h('div', { class: 'row-sub danger' });
    let recording = false;

    const show = (acc) => {
      btn.replaceChildren(...(acc
        ? acc.split('+').map((p) => h('kbd', null, p === 'Super' ? 'Win' : p))
        : [h('span', { class: 'muted' }, t('hk.none'))]));
    };
    const stop = () => {
      recording = false;
      btn.classList.remove('rec');
      window.removeEventListener('keydown', onKey, true);
      api.suspendHotkey(false);
      show(state.hotkey);
    };
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const bare = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
      if (e.key === 'Escape' && bare) { stop(); return; }
      if ((e.key === 'Backspace' || e.key === 'Delete') && bare) { set('hotkey', ''); stop(); return; }
      const mods = [];
      if (e.ctrlKey) mods.push('Ctrl');
      if (e.altKey) mods.push('Alt');
      if (e.shiftKey) mods.push('Shift');
      if (e.metaKey) mods.push('Super');
      const key = codeToAccel(e.code);
      if (!key) {
        btn.replaceChildren(...mods.map((m) => h('kbd', null, m === 'Super' ? 'Win' : m)), h('span', { class: 'muted' }, '…'));
        return;
      }
      if (!mods.length && !/^F\d+$/.test(key)) {
        err.textContent = t('hk.needMod');
        return;
      }
      set('hotkey', [...mods, key].join('+'));
      stop();
    };
    btn.addEventListener('click', () => {
      if (recording) { stop(); return; }
      recording = true;
      err.textContent = '';
      btn.classList.add('rec');
      btn.replaceChildren(h('span', { class: 'muted' }, t('hk.press')));
      api.suspendHotkey(true);
      window.addEventListener('keydown', onKey, true);
    });
    updaters.push(() => {
      if (recording) return;
      show(state.hotkey);
      err.textContent = status.hotkeyOk === false && state.hotkey ? t('hk.busy') : '';
    });
    return h('div', { class: 'row' },
      h('div', { class: 'row-label' }, t('hk.label'), h('div', { class: 'row-sub' }, t('hk.sub')), err),
      btn);
  }

  function codeToAccel(code) {
    let m;
    if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
    if ((m = /^Digit(\d)$/.exec(code))) return m[1];
    if ((m = /^F(\d{1,2})$/.exec(code))) return 'F' + m[1];
    if ((m = /^Numpad(\d)$/.exec(code))) return 'num' + m[1];
    const map = {
      Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
      Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
      Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
      Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`', Escape: 'Escape',
    };
    return map[code] || null;
  }

  function buttonRow(label, onClick, cls) {
    return h('div', { class: 'row btn' + (cls ? ' ' + cls : ''), role: 'button', onclick: onClick }, label);
  }

  function resetRow() {
    const r = buttonRow(t('reset'), () => {
      if (!r.dataset.armed) {
        r.dataset.armed = '1';
        r.textContent = t('reset.confirm');
        setTimeout(() => { delete r.dataset.armed; r.textContent = t('reset'); }, 3500);
        return;
      }
      delete r.dataset.armed;
      r.textContent = t('reset');
      api.reset();
      engine.clear();
    }, 'danger');
    return r;
  }

  // ---------- обновления
  function updateText() {
    const v = upd.version;
    switch (upd.status) {
      case 'dev': return t('upd.s.dev');
      case 'checking': return t('upd.s.checking');
      case 'latest': return t('upd.s.latest');
      case 'available': return t('upd.s.available', { v });
      case 'downloading': return t('upd.s.downloading', { v, p: upd.percent || 0 });
      case 'ready': return t(state.autoUpdate ? 'upd.s.readyAuto' : 'upd.s.ready', { v });
      case 'error': return t('upd.s.error', { e: upd.error || t('upd.s.offline') });
      default: return t('upd.s.idle');
    }
  }

  function updateStatusRow() {
    const title = h('div', { class: 'upd-title' });
    const sub = h('div', { class: 'upd-sub' });
    const fill = h('i');
    const bar = h('div', { class: 'upd-bar' }, fill);
    updaters.push(() => {
      title.textContent = 'KeyShow ' + version;
      sub.textContent = updateText();
      sub.classList.toggle('danger', upd.status === 'error');
      bar.hidden = upd.status !== 'downloading';
      fill.style.width = (upd.percent || 0) + '%';
    });
    return h('div', { class: 'row upd-row' },
      h('img', { src: '../assets/icon.png', class: 'upd-icon', alt: '' }),
      h('div', { class: 'upd-info' }, title, sub, bar));
  }

  function updateActionRow() {
    const r = buttonRow('', () => {
      if (upd.status === 'ready') api.installUpdate();
      else if (upd.status === 'available') api.downloadUpdate();
      else api.checkUpdate();
    });
    updaters.push(() => {
      r.textContent = t(upd.status === 'ready' ? 'upd.btn.install' : upd.status === 'available' ? 'upd.btn.download' : 'upd.btn.check');
      r.classList.toggle('inactive', ['dev', 'checking', 'downloading'].includes(upd.status));
    });
    return r;
  }

  // ---------------------------------------------------------------- popovers
  let pop = null;

  function onOutside(e) {
    if (pop && !pop.contains(e.target)) closePop();
  }

  function showPop(el, anchor) {
    closePop();
    pop = el;
    document.body.append(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const ht = el.offsetHeight;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
    let top = r.bottom + 10;
    if (top + ht > window.innerHeight - 12) {
      top = r.top - ht - 10;
      el.style.transformOrigin = '50% 100%';
    }
    el.style.left = left + 'px';
    el.style.top = Math.max(12, top) + 'px';
    const sp = KeyShowEngine.spring(0.35, 0.78);
    el.animate([{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'scale(1)' }], { duration: sp.ms, easing: sp.easing });
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true));
  }

  function closePop() {
    if (!pop) return;
    const p = pop;
    pop = null;
    document.removeEventListener('pointerdown', onOutside, true);
    p.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 140, easing: 'ease-in' })
      .onfinish = () => p.remove();
  }

  function menuPop(anchor, items, currentValue, onPick) {
    const el = h('div', { class: 'pop menu' }, ...items.map((it) => h('button', {
      type: 'button',
      class: 'menu-item',
      onclick: () => { onPick(it.value); closePop(); },
    }, h('span', { class: 'menu-check', html: String(currentValue) === it.value ? CHECK : '' }),
    h('span', null, it.label, it.sub ? h('small', null, it.sub) : null))));
    showPop(el, anchor);
  }

  // ---------- цвет: HSV-пикер
  function hexToHsv(hex) {
    const n = parseInt(hex.replace('#', ''), 16) || 0;
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    let hue = 0;
    if (d) {
      if (mx === r) hue = ((g - b) / d) % 6;
      else if (mx === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    return [hue, mx ? d / mx : 0, mx];
  }
  function hsvToHex(hue, s, v) {
    const f = (n) => {
      const k = (n + hue / 60) % 6;
      return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function openColorPicker(anchor) {
    let [hue, sat, val] = hexToHsv(state.keyColor);
    const knob = h('div', { class: 'cp-knob' });
    const sv = h('div', { class: 'cp-sv' }, knob);
    const hueIn = h('input', { type: 'range', class: 'cp-hue', min: 0, max: 360, step: 1 });
    const prev = h('div', { class: 'cp-prev' });
    const hexIn = h('input', { class: 'cp-hex', maxlength: 7, spellcheck: 'false' });
    const el = h('div', { class: 'pop cp' }, sv, hueIn, h('div', { class: 'cp-row' }, prev, hexIn));

    const render = (fromHex) => {
      const hex = hsvToHex(hue, sat, val);
      sv.style.setProperty('--hue', `hsl(${hue} 100% 50%)`);
      knob.style.left = sat * 100 + '%';
      knob.style.top = (1 - val) * 100 + '%';
      knob.style.background = hex;
      prev.style.background = hex;
      hueIn.value = hue;
      if (!fromHex) hexIn.value = hex;
      return hex;
    };
    const commit = (fromHex) => set('keyColor', render(fromHex));

    const pick = (e) => {
      const r = sv.getBoundingClientRect();
      sat = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      val = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      commit();
    };
    sv.addEventListener('pointerdown', (e) => {
      sv.setPointerCapture(e.pointerId);
      pick(e);
      const move = (ev) => pick(ev);
      const up = () => {
        sv.removeEventListener('pointermove', move);
        sv.removeEventListener('pointerup', up);
      };
      sv.addEventListener('pointermove', move);
      sv.addEventListener('pointerup', up);
    });
    hueIn.addEventListener('input', () => { hue = +hueIn.value; commit(); });
    hexIn.addEventListener('input', () => {
      const v = hexIn.value.trim();
      const m = /^#?([0-9a-f]{6})$/i.exec(v);
      if (!m) return;
      [hue, sat, val] = hexToHsv('#' + m[1]);
      commit(true);
    });
    render();
    showPop(el, anchor);
  }

  // ---------------------------------------------------------------- «Что нового»
  // Шторка в стиле iOS с историей изменений и своим переключателем Русский / English.
  function openWhatsNew() {
    closePop();
    let notesLang = storage.get('ks.notesLang', lang);
    const entries = CHANGELOG.filter((e) => compareVersions(e.version, version || '0') <= 0);
    const title = h('div', { class: 'sheet-title' });
    const body = h('div', { class: 'sheet-body' });
    const done = h('button', { type: 'button', class: 'btn-primary' });
    const langSeg = segment([['ru', 'Русский'], ['en', 'English']], () => notesLang, (v) => {
      notesLang = v;
      storage.set('ks.notesLang', v);
      langSeg.update();
      render();
    }, { small: true });

    const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString(notesLang === 'ru' ? 'ru-RU' : 'en-US',
      { day: 'numeric', month: 'long', year: 'numeric' });
    const render = () => {
      const T = I18N.translator(notesLang);
      title.textContent = T('wn.title');
      done.textContent = T('wn.done');
      body.replaceChildren(...entries.map((e, i) => h('section', { class: 'note' + (i === 0 ? ' latest' : '') },
        h('div', { class: 'note-head' },
          h('span', { class: 'note-ver' }, 'KeyShow ' + e.version),
          e.version === version ? h('span', { class: 'note-badge' }, T('wn.current')) : null,
          h('span', { class: 'note-date' }, fmtDate(e.date))),
        h('ul', null, ...(e[notesLang] || e.en).map((line) => h('li', null, line))))));
    };

    const card = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'sheet-head' }, title, langSeg.el),
      body,
      h('div', { class: 'sheet-foot' }, done));
    const backdrop = h('div', { class: 'sheet-backdrop' }, card);

    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => {
      document.removeEventListener('keydown', onKey);
      backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
      card.animate([{ transform: 'none' }, { transform: 'translateY(24px) scale(.97)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' })
        .onfinish = () => backdrop.remove();
    };
    done.addEventListener('click', close);
    backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKey);

    render();
    document.body.append(backdrop);
    const sp = KeyShowEngine.spring(0.45, 0.8);
    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    card.animate([{ transform: 'translateY(40px) scale(.96)' }, { transform: 'none' }], { duration: sp.ms, easing: sp.easing });
    api.whatsNewSeen();
  }

  // ---------------------------------------------------------------- sections
  function sections() {
    return [
      {
        id: 'look',
        groups: [
          {
            title: 'look.colorGroup',
            rows: () => [
              colorsRow(),
              segRow('textColor', 'look.textColor', [['auto', 'opt.auto'], ['#FFFFFF', 'opt.white'], ['#1C1C1E', 'opt.black']], 'look.textColorSub'),
            ],
          },
          {
            title: 'look.keysGroup',
            rows: () => [
              segRow('keyStyle', 'look.style', [['solid', 'style.solid'], ['glass', 'style.glass'], ['light', 'style.light'], ['dark', 'style.dark']]),
              sliderRow('size', 'look.size', { min: 0.6, max: 2, step: 0.05, format: fmt.pct }),
              sliderRow('radius', 'look.radius', { min: 0, max: 24, step: 1, format: fmt.px }),
              sliderRow('opacity', 'look.opacity', { min: 0.3, max: 1, step: 0.01, format: fmt.pct }),
              toggleRow('shadow', 'look.shadow'),
            ],
          },
          {
            title: 'look.labelsGroup',
            rows: () => [
              segRow('labelMode', 'look.labelMode', [['text', 'label.text'], ['both', 'label.both'], ['icon', 'label.icon']]),
              toggleRow('showPlus', 'look.showPlus'),
              toggleRow('backdrop', 'look.backdrop', 'look.backdropSub'),
            ],
          },
        ],
      },
      {
        id: 'behavior',
        groups: [
          {
            title: 'beh.timeGroup',
            rows: () => [
              sliderRow('lingerMs', 'beh.linger', { min: 300, max: 5000, step: 100, format: fmt.sec }),
              sliderRow('fadeMs', 'beh.fade', { min: 100, max: 1500, step: 50, format: fmt.sec }),
              row(t('beh.max'), stepperCtl('maxEntries', 1, 6)),
            ],
            footer: 'beh.timeFooter',
          },
          {
            title: 'beh.showGroup',
            rows: () => [
              segRow('filter', 'beh.filter', [['all', 'filter.all'], ['noTyping', 'filter.noTyping'], ['combos', 'filter.combos']]),
              toggleRow('loneModifiers', 'beh.lone'),
              toggleRow('repeatCounter', 'beh.repeat', 'beh.repeatSub'),
              toggleRow('sortModifiers', 'beh.sort', 'beh.sortSub'),
            ],
            footer: 'beh.showFooter',
          },
          {
            title: 'beh.holdGroup',
            rows: () => [
              toggleRow('holdPulse', 'beh.pulse'),
              toggleRow('fadeOlder', 'beh.fadeOlder'),
            ],
          },
        ],
      },
      {
        id: 'mouse',
        groups: [
          {
            title: 'mouse.buttonsGroup',
            rows: () => [
              segRow('mouseClicks', 'mouse.clicks', [['all', 'clicks.all'], ['withMods', 'clicks.withMods'], ['off', 'clicks.off']]),
              segRow('mouseLabels', 'mouse.labels', [['short', 'mlabel.short'], ['full', 'mlabel.full']]),
              toggleRow('showDrag', 'mouse.drag'),
              toggleRow('wheel', 'mouse.wheel'),
            ],
            footer: 'mouse.footer',
          },
          {
            title: 'mouse.cursorGroup',
            rows: () => [
              toggleRow('clickRipple', 'mouse.ripple', 'mouse.rippleSub'),
              segRow('cursorHalo', 'mouse.halo', [['off', 'halo.off'], ['shake', 'halo.shake'], ['always', 'halo.always']], 'mouse.haloSub'),
              dependsOn(
                sliderRow('haloLinger', 'mouse.haloLinger', { min: 300, max: 4000, step: 100, format: fmt.sec }),
                () => state.cursorHalo === 'shake',
              ),
            ],
          },
          {
            title: 'mouse.findGroup',
            rows: () => [
              toggleRow('cursorGrow', 'mouse.grow', 'mouse.growSub'),
              dependsOn(
                sliderRow('cursorGrowMax', 'mouse.growMax', { min: 2, max: 6, step: 0.5, format: fmt.xShort }),
                () => state.cursorGrow,
              ),
            ],
            footer: 'mouse.findFooter',
          },
        ],
      },
      {
        id: 'motion',
        groups: [
          {
            title: 'motion.group',
            rows: () => [
              segRow('animStyle', 'motion.effect', [['spring', 'anim.spring'], ['smooth', 'anim.smooth'], ['pop', 'anim.pop'], ['none', 'anim.none']]),
              sliderRow('animSpeed', 'motion.speed', { min: 0.5, max: 2, step: 0.1, format: fmt.x }),
            ],
            footer: 'motion.footer',
          },
        ],
      },
      {
        id: 'place',
        groups: [
          { title: 'place.whereGroup', rows: () => [positionRow(), displayRow()] },
          {
            title: 'place.marginGroup',
            rows: () => [
              sliderRow('marginX', 'place.mx', { min: 0, max: 600, step: 2, format: fmt.px }),
              sliderRow('marginY', 'place.my', { min: 0, max: 600, step: 2, format: fmt.px }),
            ],
          },
        ],
      },
      {
        id: 'general',
        groups: [
          {
            title: 'gen.controlGroup',
            rows: () => [
              toggleRow('enabled', 'gen.enabled'),
              hotkeyRow(),
              toggleRow('launchAtLogin', 'gen.login', 'gen.loginSub'),
            ],
          },
          {
            title: 'gen.langGroup',
            rows: () => [segRow('language', 'gen.lang', [['auto', 'lang.auto'], ['ru', 'lang.ru'], ['en', 'lang.en']], 'gen.langSub')],
          },
          {
            title: 'gen.windowGroup',
            rows: () => [segRow('theme', 'gen.theme', [['system', 'theme.system'], ['light', 'theme.light'], ['dark', 'theme.dark']])],
          },
          {
            title: '',
            rows: () => [buttonRow(t('gen.demo'), () => api.demo()), resetRow()],
            footer: 'gen.footer',
          },
        ],
      },
      {
        id: 'updates',
        groups: [
          { title: '', rows: () => [updateStatusRow(), updateActionRow()] },
          { title: '', rows: () => [toggleRow('autoUpdate', 'upd.auto', 'upd.autoSub')], footer: 'upd.footer' },
          {
            title: '',
            rows: () => [buttonRow(t('upd.whatsNew'), openWhatsNew), buttonRow(t('upd.github'), () => api.openReleases())],
          },
        ],
      },
    ];
  }

  function buildNav() {
    const nav = $('#nav');
    nav.replaceChildren(...sections().map((s) => h('button', {
      type: 'button',
      class: 'nav-item' + (s.id === current ? ' on' : ''),
      'data-id': s.id,
      onclick: () => renderSection(s.id, true),
    }, h('span', { class: 'nav-ic', html: ICONS[s.id] }), h('span', { class: 'nav-label' }, t('sec.' + s.id)))));
  }

  function renderSection(id, animate) {
    const all = sections();
    const sec = all.find((s) => s.id === id) || all[0];
    current = sec.id;
    storage.set('ks.section', current);
    closePop();
    updaters = [];
    $('#title').textContent = t('sec.' + sec.id);
    for (const b of $('#nav').children) b.classList.toggle('on', b.dataset.id === current);
    const groups = sec.groups.map((g) => h('section', { class: 'group' },
      g.title ? h('div', { class: 'group-title' }, t(g.title)) : null,
      h('div', { class: 'card' }, ...g.rows()),
      g.footer ? h('div', { class: 'group-footer' }, t(g.footer)) : null));
    const root = $('#groups');
    const keepScroll = !animate ? $('#content').scrollTop : 0;
    root.replaceChildren(...groups);
    sync();
    $('#content').scrollTop = keepScroll;
    if (animate) {
      root.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }

  function renderBanner() {
    const b = $('#banner');
    if (status.hookOk === false) {
      b.hidden = false;
      b.textContent = t('banner.hook', { error: status.hookError || t('banner.unknown') });
    } else {
      b.hidden = true;
    }
  }

  // ---------------------------------------------------------------- preview
  const engine = new KeyShowEngine($('#pvStage'), {
    root: $('#pvRoot'),
    preview: true,
    onChange: (n) => $('#pvHint').classList.toggle('hidden', n > 0),
  });
  let previewSeg = null;

  function setupPreview() {
    const preview = $('#preview');
    preview.dataset.bg = storage.get('ks.pvbg', 'dark');
    previewSeg = segment(
      [['light', SUN], ['dark', MOON]],
      () => preview.dataset.bg,
      (v) => { preview.dataset.bg = v; storage.set('ks.pvbg', v); previewSeg.update(); },
      { small: true, html: true },
    );
    $('#pvBg').replaceWith(previewSeg.el);
    $('#demoBtn').addEventListener('click', () => api.demo());
  }

  // ---------------------------------------------------------------- init
  document.documentElement.style.setProperty('--spring', KeyShowEngine.spring(0.45, 0.72).easing);
  $('#masterToggle').addEventListener('change', (e) => set('enabled', e.target.checked));
  setupPreview();

  api.on('settings', (s) => {
    const langChanged = s.lang !== lang;
    state = s;
    engine.setSettings(state);
    if (langChanged) {
      applyLang(s.lang);
      renderSection(current, false);
    } else {
      sync();
    }
  });
  api.on('input', (ev) => engine.input(ev));
  api.on('status', (st) => {
    status = st;
    renderBanner();
    sync();
  });
  api.on('displays', (d) => {
    displays = d;
    if (current === 'place') renderSection('place', false);
  });
  api.on('update', (u) => {
    upd = u;
    sync();
  });

  api.init().then((d) => {
    state = d.settings;
    defaults = d.defaults;
    displays = d.displays;
    status = d.status;
    version = d.version;
    upd = d.update || upd;
    engine.setSettings(state);
    current = storage.get('ks.section', 'look');
    applyLang(state.lang || 'ru');
    renderSection(current, false);
    if (d.whatsNew) setTimeout(openWhatsNew, 450);
  });
})();
