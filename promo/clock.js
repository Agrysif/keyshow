/* Виртуальные часы для покадрового рендера.
   Подменяют performance.now / Date.now / setTimeout / setInterval / requestAnimationFrame
   и ставят на паузу все Web/CSS-анимации, продвигая их вручную. Так каждый кадр
   получается ровно в свой момент времени, независимо от скорости компьютера.
   Подключать первым скриптом на странице. */
(function () {
  'use strict';

  const realRAF = window.requestAnimationFrame.bind(window);
  const startDate = Date.now();
  let now = 0;

  const timers = new Map();
  let nextTimer = 1;
  const rafs = new Map();
  let nextRaf = 1;

  performance.now = () => now;
  Date.now = () => startDate + now;

  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextTimer++;
    timers.set(id, { t: now + Math.max(0, +ms || 0), fn, args, every: null });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = nextTimer++;
    const every = Math.max(1, +ms || 1);
    timers.set(id, { t: now + every, fn, args, every });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = nextRaf++; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { rafs.delete(id); };

  // Анимации: запоминаем момент создания и ставим на паузу.
  const born = new WeakMap();
  function register() {
    for (const a of document.getAnimations()) {
      if (born.has(a)) continue;
      born.set(a, now);
      try { a.pause(); a.currentTime = 0; } catch { /* уже завершена */ }
    }
  }
  function advance() {
    for (const a of document.getAnimations()) {
      if (!born.has(a)) { born.set(a, now); try { a.pause(); } catch {} }
      const elapsed = (now - born.get(a)) * (a.playbackRate || 1);
      const end = a.effect ? a.effect.getComputedTiming().endTime : 0;
      if (Number.isFinite(end) && elapsed >= end) {
        if (a.playState !== 'finished') { try { a.finish(); } catch {} }
      } else {
        try { a.currentTime = elapsed; } catch {}
      }
    }
  }

  function runTimersUntil(target) {
    for (;;) {
      let best = null;
      for (const [id, tm] of timers) {
        if (tm.t <= target && (!best || tm.t < best.tm.t || (tm.t === best.tm.t && id < best.id))) best = { id, tm };
      }
      if (!best) return;
      now = best.tm.t;
      if (best.tm.every != null) best.tm.t += best.tm.every;
      else timers.delete(best.id);
      try { best.tm.fn(...best.tm.args); } catch (e) { console.error(e); }
      register();
    }
  }

  const twoFrames = () => new Promise((r) => realRAF(() => realRAF(r)));

  // Метка кадра: квадрат 4×4 в правом нижнем углу, цвет кодирует номер кадра.
  // Рендерер ждёт снимок с нужной меткой (кадры приходят с запаздыванием) и затем закрашивает её.
  let marker = null;
  function setMarker(frame) {
    if (!marker) {
      marker = document.createElement('div');
      marker.style.cssText = 'position:fixed;right:0;bottom:0;width:4px;height:4px;z-index:2147483647;pointer-events:none';
      document.body.append(marker);
    }
    const r = (frame % 64) * 4 + 2;
    const g = (Math.floor(frame / 64) % 64) * 4 + 2; // метка по модулю 4096 — запаздывание всего на пару кадров
    marker.style.background = `rgb(${r},${g},170)`;
  }

  // «Толчок»: окно без экрана отдаёт кадр только когда рисуется следующий, поэтому рендерер
  // при необходимости меняет пиксель в левом нижнем углу (потом он закрашивается).
  let nudgeEl = null;
  let nudgeOn = false;
  window.__nudge = async () => {
    if (!nudgeEl) {
      nudgeEl = document.createElement('div');
      nudgeEl.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;z-index:2147483647;pointer-events:none';
      document.body.append(nudgeEl);
    }
    nudgeOn = !nudgeOn;
    nudgeEl.style.background = nudgeOn ? 'rgb(1,1,1)' : 'rgb(0,0,0)';
    await twoFrames();
  };

  // Продвинуть время до targetMs. draw=false — только логика, без ожидания отрисовки (для быстрых проб).
  window.__step = async (targetMs, draw = true, frame = 0) => {
    if (draw) setMarker(frame);
    runTimersUntil(targetMs);
    now = targetMs;
    const cbs = [...rafs.values()];
    rafs.clear();
    for (const cb of cbs) { try { cb(now); } catch (e) { console.error(e); } }
    register();
    advance();
    if (window.__frame) window.__frame(now / 1000, draw);
    register();
    advance();
    await Promise.resolve(); // дать отработать обработчикам finish
    if (draw) await twoFrames();
    return now;
  };
  window.__now = () => now;
})();
