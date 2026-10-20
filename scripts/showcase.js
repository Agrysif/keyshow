// Только для разработки: сцены для скриншотов README. Использует настоящий движок KeyShow.
'use strict';

(function () {
  const BASE = {
    keyColor: '#0A84FF', textColor: 'auto', keyStyle: 'solid', opacity: 1, size: 1.35, radius: 12,
    shadow: true, labelMode: 'both', showPlus: true, backdrop: false,
    lingerMs: 600000, fadeMs: 450, maxEntries: 3, filter: 'all', loneModifiers: true,
    repeatCounter: true, sortModifiers: true, holdPulse: false, fadeOlder: true,
    mouseClicks: 'all', mouseLabels: 'short', wheel: true, showDrag: true,
    clickRipple: true, cursorHalo: 'shake', haloLinger: 1200, cursorGrow: true, cursorGrowMax: 4,
    animStyle: 'spring', animSpeed: 1, position: 'bottom-center', marginX: 40, marginY: 56, lang: 'ru',
  };
  const CURSOR_SVG = '<svg viewBox="0 0 14 21"><path d="M1 1v15.6l4-3.9 2.9 6.4 2.5-1.1-2.8-6.3h5.6Z" fill="#fff" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/></svg>';

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (e, t, name) => e.input({ t, kind: 'key', name });

  function overlayEngine(extra) {
    const e = new KeyShowEngine($('stage'), { root: $('ovRoot'), fx: $('fx') });
    e.setSettings({ ...BASE, ...extra });
    return e;
  }

  // Точка в координатах слоя оверлея по центру элемента.
  function centerOf(el, dx = 0, dy = 0) {
    const r = el.getBoundingClientRect();
    const o = $('ovRoot').getBoundingClientRect();
    return { x: r.left - o.left + r.width / 2 + dx, y: r.top - o.top + r.height / 2 + dy };
  }

  function selectBox(el) {
    const ab = $('artboard');
    const box = document.createElement('div');
    box.className = 'sel-box';
    box.style.left = el.offsetLeft - 4 + 'px';
    box.style.top = el.offsetTop - 4 + 'px';
    box.style.width = el.offsetWidth + 8 + 'px';
    box.style.height = el.offsetHeight + 8 + 'px';
    ab.append(box);
  }

  function fakeCursor(p) {
    const c = document.createElement('div');
    c.className = 'fake-cursor';
    c.innerHTML = CURSOR_SVG;
    c.style.left = p.x + 'px';
    c.style.top = p.y + 'px';
    $('ovRoot').append(c);
  }

  async function tap(e, mods, k, times = 1) {
    for (const m of mods) key(e, 'down', m);
    for (let i = 0; i < times; i++) {
      key(e, 'down', k);
      await sleep(70);
      key(e, 'up', k);
      await sleep(90);
    }
    for (const m of [...mods].reverse()) key(e, 'up', m);
    await sleep(160);
  }

  // Главная: сочетания поверх «урока» в редакторе, новое зажато (с кольцом).
  async function hero(lang) {
    document.body.dataset.scene = 'hero';
    selectBox($('cta'));
    const e = overlayEngine({ lang });
    await tap(e, ['Ctrl'], 'C');
    await tap(e, ['Ctrl'], 'V', 3);
    for (const m of ['Ctrl', 'Alt', 'Shift', 'K']) { key(e, 'down', m); await sleep(60); }
    await sleep(1200);
  }

  // Мышь: Space + ЛКМ с перетаскиванием и меткой под курсором.
  async function mouse(lang) {
    document.body.dataset.scene = 'mouse';
    const e = overlayEngine({ lang, maxEntries: 2 });
    await tap(e, ['Ctrl'], 'D');
    const card = document.querySelector('.ab-cards div:nth-child(2)');
    const p = centerOf(card);
    key(e, 'down', 'Space');
    await sleep(120);
    e.input({ t: 'down', kind: 'mouse', name: 1, x: p.x, y: p.y });
    await sleep(150);
    e.input({ t: 'drag', kind: 'mouse', name: 1 });
    const end = { x: p.x + 70, y: p.y + 36 };
    e.input({ t: 'move', x: end.x, y: end.y });
    fakeCursor(end);
    await sleep(1200);
  }

  // «Найти курсор»: встряхивание — курсор растёт, подсветка разгорается. Трясём дольше, чем ждёт снимок.
  function shake(lang) {
    document.body.dataset.scene = 'shake';
    const e = overlayEngine({ lang });
    const c = centerOf($('artboard'), 0, -30);
    let t = 0;
    const timer = setInterval(() => {
      t += 16;
      e.input({ t: 'move', x: c.x + Math.round(150 * Math.sin(t / 50)), y: c.y + Math.round(10 * Math.sin(t / 90)) });
      if (t > 4000) clearInterval(timer);
    }, 16);
    return sleep(1500);
  }

  // Стили клавиш на разных фонах.
  async function styles(lang) {
    document.body.dataset.scene = 'styles';
    const engines = [...document.querySelectorAll('.tile')].map((tile) => {
      const root = document.createElement('div');
      root.className = 'ks-root';
      const stage = document.createElement('div');
      root.append(stage);
      tile.append(root);
      const e = new KeyShowEngine(stage, { root });
      e.setSettings({ ...BASE, lang, keyStyle: tile.dataset.style, size: 1.3, position: 'middle-center', maxEntries: 1 });
      return e;
    });
    for (const e of engines) for (const m of ['Ctrl', 'Shift', 'S']) key(e, 'down', m);
    await sleep(1200);
  }

  window.showcase = { hero, mouse, shake, styles };
})();
