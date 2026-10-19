/* Движок отображения нажатий: сочетания, удержание, повторы, раскладка и анимации.
   Используется и в оверлее, и в превью окна настроек. */
(function (root) {
  'use strict';

  const K = root.KeyShowKeys;
  const PLUS_SVG = '<svg viewBox="0 0 10 10"><path d="M5 1.6v6.8M1.6 5h6.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const STUCK_MS = 45000;

  // --- Пружинные кривые (как в iOS) через CSS linear() -----------------------
  const springCache = {};
  function spring(response, damping) {
    const id = response.toFixed(3) + '|' + damping;
    if (springCache[id]) return springCache[id];
    const w0 = (2 * Math.PI) / response;
    const z = damping;
    let f;
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      f = (t) => 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
    } else {
      f = (t) => 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    }
    const dur = Math.min(2.2, Math.max(0.2, -Math.log(0.002) / (Math.min(z, 1) * w0)));
    const N = 50;
    const pts = [];
    for (let i = 0; i <= N; i++) pts.push(+f((dur * i) / N).toFixed(4));
    pts[N] = 1;
    return (springCache[id] = { easing: `linear(${pts.join(', ')})`, ms: Math.round(dur * 1000) });
  }

  // --- Цвета ----------------------------------------------------------------
  function hexToRgb(hex) {
    let h = String(hex || '#0A84FF').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function luminance([r, g, b]) {
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function autoFg(hex) {
    return luminance(hexToRgb(hex)) > 0.42 ? '#1C1C1E' : '#FFFFFF';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function ids(ev) {
    if (ev.kind === 'mouse') {
      const b = Number(ev.name);
      return { pid: 'm' + b, cid: 'mouse:' + b, mod: null, name: b, kind: 'mouse' };
    }
    const mod = K.modOf(ev.name);
    return { pid: 'k' + ev.name, cid: mod ? 'mod:' + mod : 'key:' + ev.name, mod, name: ev.name, kind: 'key' };
  }

  // --- Курсор: подсветка и «встряхните, чтобы найти» (как на Mac) ------------
  // Настоящий курсор Windows плавно увеличить нельзя, поэтому рисуем крупную стрелку в оверлее —
  // её кончик совпадает с кончиком системного курсора.
  const BIG_CURSOR_SVG = '<svg viewBox="0 0 14 21"><path d="M1 1v15.6l4-3.9 2.9 6.4 2.5-1.1-2.8-6.3h5.6Z" fill="#fff" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/></svg>';
  const SHAKE_WINDOW_MS = 900; // в этом окне ищем смены направления
  const SHAKE_REVERSALS = 3;   // сколько резких разворотов считать встряхиванием
  const GROW_HOLD_MS = 320;    // курсор начинает уменьшаться почти сразу после остановки

  // Экспоненциальное приближение к цели: плавно, без рывков, при любом FPS.
  const approach = (v, target, dt, tau) => target + (v - target) * Math.exp(-dt / tau);

  class CursorFx {
    constructor(layer) {
      this.layer = layer;
      this.s = null;
      this.x = null;
      this.y = null;
      this.halo = null;
      this.big = null;
      this.haloLevel = 0;
      this.haloTarget = 0;
      this.growLevel = 0;
      this.growTarget = 0;
      this.last = null;
      this.axes = { x: { dir: 0, len: 0, start: 0 }, y: { dir: 0, len: 0, start: 0 } };
      this.reversals = [];
      this.lastShakeAt = -Infinity;
      this.raf = 0;
      this.prevFrame = 0;
      this.frame = this.frame.bind(this);
    }

    setSettings(s) {
      this.s = s;
      if (s.cursorHalo === 'off' && this.halo) { this.halo.remove(); this.halo = null; }
      if (!s.cursorGrow && this.big) { this.big.remove(); this.big = null; this.growLevel = this.growTarget = 0; }
      if (this.halo) this.styleHalo();
      if (s.cursorHalo === 'always' && this.x != null) this.ensureHalo().style.opacity = '1';
      this.render();
    }

    move(x, y) {
      const s = this.s;
      if (x == null) {
        this.x = this.y = null;
        this.last = null;
        this.haloTarget = this.growTarget = 0;
        if (s.cursorHalo === 'always' && this.halo) this.halo.style.opacity = '0';
        this.kick();
        return;
      }
      this.x = x;
      this.y = y;
      if (s.cursorHalo !== 'off') this.place(this.ensureHalo());
      if (this.big) this.place(this.big);
      if (s.cursorHalo === 'always') this.halo.style.opacity = '1';
      if (s.cursorHalo === 'shake' || s.cursorGrow) this.track(x, y, performance.now());
    }

    // Встряхивание = несколько быстрых разворотов (по X или Y) подряд.
    track(x, y, t) {
      const p = this.last;
      this.last = { x, y, t };
      if (!p) return;
      if (t - p.t > 150) { // была пауза — считаем заново
        this.axes.x.dir = this.axes.y.dir = 0;
        return;
      }
      this.axis(this.axes.x, x - p.x, t);
      this.axis(this.axes.y, y - p.y, t);
      this.reversals = this.reversals.filter((r) => t - r < SHAKE_WINDOW_MS);
      if (this.reversals.length < SHAKE_REVERSALS) return;
      this.lastShakeAt = t;
      if (this.s.cursorHalo === 'shake') this.haloTarget = 1;
      if (this.s.cursorGrow) {
        // Чем дольше трясём, тем крупнее — как в macOS.
        const k = Math.min(1, (this.reversals.length - SHAKE_REVERSALS + 1) / 4);
        this.growTarget = Math.max(this.growTarget, 0.45 + 0.55 * k);
      }
      this.kick();
    }

    axis(a, d, t) {
      const dir = Math.sign(d);
      if (!dir) return;
      if (dir === a.dir) {
        a.len += Math.abs(d);
        return;
      }
      const fast = a.len / Math.max(1, t - a.start) > 0.5; // > 0,5 px/мс
      if (a.dir && a.len >= 40 && fast) this.reversals.push(t);
      a.dir = dir;
      a.len = Math.abs(d);
      a.start = t;
    }

    kick() {
      if (this.raf) return;
      this.prevFrame = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }

    frame(now) {
      const dt = Math.min(64, Math.max(0, now - this.prevFrame));
      this.prevFrame = now;
      const since = now - this.lastShakeAt;
      if (since > this.s.haloLinger) this.haloTarget = 0;
      if (since > GROW_HOLD_MS) this.growTarget = 0;
      // Разгорается за ~0,5 с, гаснет медленно (~2 с); курсор растёт и сжимается быстрее.
      this.haloLevel = approach(this.haloLevel, this.haloTarget, dt, this.haloTarget > this.haloLevel ? 160 : 650);
      this.growLevel = approach(this.growLevel, this.growTarget, dt, this.growTarget > this.growLevel ? 110 : 220);
      const busy = this.haloTarget > 0 || this.growTarget > 0 || this.haloLevel > 0.004 || this.growLevel > 0.004;
      if (!busy) this.haloLevel = this.growLevel = 0;
      this.render();
      this.raf = busy ? requestAnimationFrame(this.frame) : 0;
    }

    render() {
      const s = this.s;
      if (!s) return;
      if (s.cursorHalo === 'shake' && (this.halo || (this.haloLevel > 0 && this.x != null))) {
        const h = this.haloLevel;
        const el = this.ensureHalo();
        el.style.opacity = h.toFixed(3);
        el.style.scale = (0.55 + 0.45 * h).toFixed(3);
      }
      if (s.cursorGrow) {
        const g = this.growLevel;
        if (g > 0 && this.x != null) {
          const el = this.ensureBig();
          // Сразу непрозрачный и исчезает, не доходя до размера ×1, — чтобы не двоился с настоящим курсором.
          el.style.opacity = Math.min(1, g * 6).toFixed(3);
          el.style.scale = (1 + (s.cursorGrowMax - 1) * g).toFixed(3);
        } else if (this.big) {
          this.big.style.opacity = '0';
        }
      }
    }

    ensureHalo() {
      if (!this.halo) {
        this.halo = el('div', 'ks-halo');
        this.halo.style.opacity = '0';
        this.layer.prepend(this.halo);
        this.styleHalo();
        this.place(this.halo);
      }
      return this.halo;
    }

    styleHalo() {
      const shake = this.s.cursorHalo === 'shake';
      this.halo.classList.toggle('shake', shake);
      this.halo.style.transition = shake ? 'none' : 'opacity .35s ease';
      if (!shake) this.halo.style.scale = '1';
    }

    ensureBig() {
      if (!this.big) {
        this.big = el('div', 'ks-bigcursor');
        this.big.innerHTML = BIG_CURSOR_SVG;
        this.layer.append(this.big);
        this.place(this.big);
      }
      return this.big;
    }

    place(node) {
      if (this.x == null) return;
      node.style.left = this.x + 'px';
      node.style.top = this.y + 'px';
    }

    clear() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.halo) { this.halo.remove(); this.halo = null; }
      if (this.big) { this.big.remove(); this.big = null; }
      this.haloLevel = this.haloTarget = this.growLevel = this.growTarget = 0;
      this.last = null;
      this.reversals = [];
      this.lastShakeAt = -Infinity;
    }
  }

  class KeyShowEngine {
    constructor(stage, opts = {}) {
      this.stage = stage;
      this.root = opts.root || stage;
      this.fx = opts.fx || null;
      this.preview = !!opts.preview;
      this.onChange = opts.onChange || null;
      this.s = null;
      this.held = new Map();
      this.ignored = new Set();
      this.entries = [];
      this.active = null;
      this.dots = new Map();
      this.cursor = this.fx ? new CursorFx(this.fx) : null;
      this.stage.classList.add('ks-stage');
      setInterval(() => this.watchdog(), 2000);
    }

    // ---------------------------------------------------------------- настройки
    setSettings(s) {
      this.s = { ...s };
      const R = this.root.style;
      const key = s.keyColor;
      const rgb = hexToRgb(key);
      const fg = s.textColor === 'auto' ? autoFg(key) : s.textColor;
      let bg = key;
      let capFg = fg;
      let icon = fg;
      let border = 'transparent';
      let sub = 'rgba(255,255,255,.22)';
      if (s.keyStyle === 'glass') {
        bg = `rgba(${rgb.join(',')}, .5)`; capFg = '#FFFFFF'; icon = '#FFFFFF'; border = 'rgba(255,255,255,.38)';
      } else if (s.keyStyle === 'light') {
        bg = 'rgba(255,255,255,.97)'; capFg = '#1C1C1E'; icon = luminance(rgb) > 0.8 ? '#1C1C1E' : key;
        border = 'rgba(0,0,0,.08)'; sub = 'rgba(0,0,0,.06)';
      } else if (s.keyStyle === 'dark') {
        bg = 'rgba(28,28,30,.94)'; capFg = '#FFFFFF'; icon = luminance(rgb) < 0.03 ? '#FFFFFF' : key;
        border = 'rgba(255,255,255,.1)'; sub = 'rgba(255,255,255,.12)';
      } else if (fg !== '#FFFFFF') {
        sub = 'rgba(0,0,0,.1)';
      }
      const sp = spring(0.42, 0.62);
      R.setProperty('--ks-key', key);
      R.setProperty('--ks-key-rgb', rgb.join(' '));
      R.setProperty('--ks-bg', bg);
      R.setProperty('--ks-fg', capFg);
      R.setProperty('--ks-icon', icon);
      R.setProperty('--ks-border', border);
      R.setProperty('--ks-sub', sub);
      R.setProperty('--ks-count-fg', fg);
      R.setProperty('--ks-s', String(s.size));
      R.setProperty('--ks-r', String(s.radius));
      R.setProperty('--ks-op', String(s.opacity));
      R.setProperty('--ks-spring', sp.easing);
      R.setProperty('--ks-spring-ms', sp.ms + 'ms');

      const st = this.stage.classList;
      for (const c of [...st]) if (c.startsWith('ks-style-') || c.startsWith('ks-v-') || c.startsWith('ks-h-')) st.remove(c);
      st.add('ks-style-' + s.keyStyle, 'ks-v-' + this.vAlign(), 'ks-h-' + this.hAlign());
      st.toggle('ks-shadow', !!s.shadow);
      st.toggle('ks-backdrop', !!s.backdrop);
      st.toggle('ks-pulse', !!s.holdPulse);
      this.placeStage();

      if (this.cursor) this.cursor.setSettings(this.s);
      for (const e of this.entries) if (e.box) this.paint(e, false);
      this.trim();
      this.layout();
    }

    vAlign() {
      if (this.preview) return 'bottom';
      return (this.s.position || 'bottom-center').split('-')[0];
    }
    hAlign() {
      return (this.s.position || 'bottom-center').split('-')[1] || 'center';
    }

    placeStage() {
      const st = this.stage.style;
      const v = this.vAlign();
      const h = this.hAlign();
      const mx = this.preview ? 24 : this.s.marginX;
      const my = this.preview ? 26 : this.s.marginY;
      st.left = st.right = st.top = st.bottom = '';
      if (h === 'left') st.left = mx + 'px';
      else if (h === 'right') st.right = mx + 'px';
      else st.left = '50%';
      if (v === 'top') st.top = my + 'px';
      else if (v === 'middle') st.top = '50%';
      else st.bottom = my + 'px';
    }

    // ---------------------------------------------------------------- ввод
    input(ev) {
      if (!this.s || !ev) return;
      switch (ev.t) {
        case 'down': this.down(ev); break;
        case 'up': this.up(ev); break;
        case 'wheel': this.wheel(ev); break;
        case 'drag': this.drag(ev); break;
        case 'move': this.move(ev); break;
        default: break;
      }
    }

    down(ev) {
      const id = ids(ev);
      if (this.held.has(id.pid) || this.ignored.has(id.pid)) return;
      if (id.kind === 'mouse') {
        this.fxDown(id.pid, ev);
        const mc = this.s.mouseClicks;
        const keyboardHeld = [...this.held.values()].some((h) => h.kind === 'key');
        if (mc === 'off' || (mc === 'withMods' && !keyboardHeld)) {
          this.ignored.add(id.pid);
          return;
        }
      }
      const h = { ...id, since: performance.now() };
      this.held.set(h.pid, h);

      const e = this.active;
      if (e) {
        const same = e.keys.find((k) => k.cid === h.cid);
        if (same && (same.mod || same.pids.size > 0)) {
          // Левый + правый Ctrl или повторно зажатый модификатор — та же клавиша на экране.
          same.pids.add(h.pid);
          this.paint(e, false);
          return;
        }
        if (!same && this.canJoin(e)) {
          e.keys.push(this.makeKey(h));
          this.commit(e, false);
          return;
        }
        // Основная клавиша нажата снова (Ctrl зажат, Z-Z-Z) или сочетание уже «отыграло» —
        // начинаем новое; одинаковые подряд склеятся в счётчик ×N.
        this.release(e);
      }
      const ne = this.newEntry();
      for (const hh of this.held.values()) this.addHeld(ne, hh);
      this.active = ne;
      this.commit(ne, true);
    }

    up(ev) {
      const id = ids(ev);
      if (id.kind === 'mouse') this.fxUp(id.pid);
      if (this.ignored.delete(id.pid)) return;
      if (!this.held.delete(id.pid)) return;
      const e = this.active;
      if (!e) return;
      for (const k of e.keys) k.pids.delete(id.pid);
      if (!e.keys.some((k) => k.pids.size > 0)) this.release(e);
      else this.paint(e, false);
    }

    wheel(ev) {
      if (!this.s.wheel) return;
      const dir = ev.dir;
      const e = this.active;
      if (e) {
        const wk = e.keys.find((k) => k.kind === 'wheel');
        if (wk) {
          if (wk.dir !== dir) { wk.dir = dir; e.sig = this.sig(e); this.paint(e, true); }
          this.tick(wk);
          return;
        }
        if (this.canJoin(e)) {
          e.keys.push(this.wheelKey(dir));
          this.commit(e, false);
          return;
        }
        this.release(e);
        const ne = this.newEntry();
        for (const hh of this.held.values()) this.addHeld(ne, hh);
        ne.keys.push(this.wheelKey(dir));
        this.active = ne;
        this.commit(ne, true);
        return;
      }
      const last = this.lastVisible();
      if (last && !last.live && last.keys.length === 1 && last.keys[0].kind === 'wheel') {
        const wk = last.keys[0];
        if (wk.dir !== dir) { wk.dir = dir; last.sig = this.sig(last); this.paint(last, true); }
        this.tick(wk);
        this.arm(last);
        return;
      }
      const ne = this.newEntry();
      ne.keys.push(this.wheelKey(dir));
      this.commit(ne, true);
      this.release(ne);
    }

    drag(ev) {
      if (!this.s.showDrag) return;
      const e = this.active;
      if (!e) return;
      const k = e.keys.find((x) => x.cid === 'mouse:' + Number(ev.name));
      if (!k || k.drag) return;
      k.drag = true;
      this.paint(e, true);
    }

    // ---------------------------------------------------------------- логика сочетаний
    newEntry() {
      return {
        keys: [], count: 1, live: true, visible: false, leaving: false, timer: null,
        slot: null, box: null, keysEl: null, countEl: null, plusEls: [], placed: false, sig: '',
      };
    }

    makeKey(h) {
      return { cid: h.cid, kind: h.kind, name: h.name, mod: h.mod, pids: new Set([h.pid]), drag: false, dir: null, el: null };
    }

    wheelKey(dir) {
      return { cid: 'wheel', kind: 'wheel', name: 'wheel', mod: null, pids: new Set(), drag: false, dir, el: null };
    }

    addHeld(e, h) {
      const same = e.keys.find((k) => k.cid === h.cid);
      if (same) same.pids.add(h.pid);
      else e.keys.push(this.makeKey(h));
    }

    // К текущему сочетанию можно добавить клавишу, пока все его «основные» клавиши ещё зажаты.
    canJoin(e) {
      return e.keys.every((k) => k.mod || k.pids.size > 0);
    }

    sig(e) {
      return e.keys.map((k) => k.cid + (k.dir ? ':' + k.dir : '')).sort().join('+');
    }

    hasMain(e) {
      return e.keys.some((k) => !k.mod && k.kind !== 'wheel');
    }

    isVisible(e) {
      const s = this.s;
      const mods = e.keys.filter((k) => k.mod);
      const main = e.keys.filter((k) => !k.mod);
      if (!main.length) return !!s.loneModifiers;
      if (main.some((k) => k.kind !== 'key')) return true; // мышь фильтруется на входе
      if (s.filter === 'all') return true;
      if (mods.some((k) => k.mod !== 'shift')) return true;
      const typing = main.every((k) => K.isTyping(k.name));
      if (s.filter === 'noTyping') return !typing;
      return mods.length > 0 && !typing; // 'combos'
    }

    prevOf(e, fresh) {
      const idx = fresh ? this.entries.length : this.entries.indexOf(e);
      for (let i = idx - 1; i >= 0; i--) {
        const p = this.entries[i];
        if (!p.leaving && p.visible) return p;
      }
      return null;
    }

    lastVisible() {
      for (let i = this.entries.length - 1; i >= 0; i--) {
        const p = this.entries[i];
        if (!p.leaving && p.visible) return p;
      }
      return null;
    }

    commit(e, fresh) {
      e.sig = this.sig(e);
      e.visible = this.isVisible(e);

      if (e.visible && this.s.repeatCounter && this.hasMain(e)) {
        const prev = this.prevOf(e, fresh);
        if (prev && !prev.live && prev.sig === e.sig && !prev.keys.some((k) => k.drag)) {
          if (fresh) {
            // То же сочетание ещё раз — увеличиваем счётчик у уже показанного.
            prev.count += 1;
            prev.live = true;
            clearTimeout(prev.timer);
            for (const pk of prev.keys) {
              const ek = e.keys.find((k) => k.cid === pk.cid);
              pk.pids = ek ? ek.pids : new Set();
            }
            this.active = prev;
            this.paint(prev, true, { bump: true });
            return;
          }
          e.count = prev.count + 1;
          this.leave(prev, true);
        }
      }

      if (fresh) this.entries.push(e);
      if (e.visible) {
        if (e.box) this.paint(e, true);
        else this.mount(e);
      } else if (e.box) {
        this.unmount(e);
      }
      this.trim();
      this.layout();
    }

    release(e) {
      if (this.active === e) this.active = null;
      e.live = false;
      for (const k of e.keys) k.pids = new Set();
      if (!e.visible) {
        this.drop(e);
        return;
      }
      this.paint(e, false);
      this.arm(e);
    }

    arm(e) {
      clearTimeout(e.timer);
      e.timer = setTimeout(() => this.leave(e), this.s.lingerMs);
    }

    trim() {
      const vis = this.entries.filter((e) => e.box && !e.leaving);
      let extra = vis.length - Math.max(1, this.s.maxEntries);
      for (let i = 0; i < vis.length && extra > 0; i++) {
        if (vis[i] === this.active) continue;
        this.leave(vis[i]);
        extra--;
      }
    }

    watchdog() {
      const now = performance.now();
      for (const h of [...this.held.values()]) {
        if (now - h.since > STUCK_MS) this.up({ t: 'up', kind: h.kind, name: h.name });
      }
    }

    clear() {
      for (const e of this.entries) {
        clearTimeout(e.timer);
        if (e.slot) e.slot.remove();
      }
      this.entries = [];
      this.active = null;
      this.held.clear();
      this.ignored.clear();
      for (const d of this.dots.values()) d.remove();
      this.dots.clear();
      if (this.cursor) this.cursor.clear();
      this.notify();
    }

    notify() {
      if (this.onChange) this.onChange(this.entries.filter((e) => e.box && !e.leaving).length);
    }

    // ---------------------------------------------------------------- DOM
    ordered(e) {
      if (!this.s.sortModifiers) return e.keys;
      const mods = e.keys.filter((k) => k.mod).sort((a, b) => K.MOD_ORDER[a.mod] - K.MOD_ORDER[b.mod]);
      return mods.concat(e.keys.filter((k) => !k.mod));
    }

    mount(e) {
      e.slot = el('div', 'ks-slot');
      e.box = el('div', 'ks-entry');
      e.keysEl = el('div', 'ks-keys');
      e.box.append(e.keysEl);
      e.slot.append(e.box);
      e.placed = false;
      this.stage.append(e.slot);
      this.paint(e, false);
      this.enter(e);
      this.notify();
    }

    unmount(e) {
      const slot = e.slot;
      const box = e.box;
      e.slot = e.box = e.keysEl = e.countEl = null;
      e.plusEls = [];
      e.placed = false;
      for (const k of e.keys) k.el = null;
      box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }).onfinish = () => slot.remove();
      this.notify();
    }

    paint(e, animate, opts = {}) {
      if (!e.box) return;
      const before = e.box.offsetWidth;
      if (e.widthAnim) { e.widthAnim.cancel(); e.widthAnim = null; }

      const nodes = [];
      const fresh = [];
      let pi = 0;
      this.ordered(e).forEach((k, i) => {
        if (i > 0 && this.s.showPlus) {
          let p = e.plusEls[pi];
          if (!p) {
            p = el('div', 'ks-plus');
            p.innerHTML = PLUS_SVG;
            e.plusEls[pi] = p;
          }
          pi++;
          nodes.push(p);
        }
        if (!k.el) {
          k.el = el('div', 'ks-cap');
          if (e.placed) fresh.push(k.el);
        }
        this.paintCap(k, e);
        nodes.push(k.el);
      });
      let countChanged = false;
      if (e.count > 1) {
        if (!e.countEl) e.countEl = el('div', 'ks-count');
        const txt = '×' + e.count;
        countChanged = e.countEl.textContent !== txt;
        e.countEl.textContent = txt;
        nodes.push(e.countEl);
      }

      // Аккуратно переставляем узлы, не трогая те, что уже на месте (чтобы не сбрасывать анимации).
      const box = e.keysEl;
      let ref = box.firstChild;
      for (const n of nodes) {
        if (n === ref) ref = ref.nextSibling;
        else box.insertBefore(n, ref);
      }
      while (ref) {
        const next = ref.nextSibling;
        ref.remove();
        ref = next;
      }

      const sp = this.s.animSpeed || 1;
      const none = this.s.animStyle === 'none';
      if (animate && !none) {
        const after = e.box.offsetWidth;
        if (Math.abs(after - before) > 0.5 && before > 0) {
          const w = spring(0.42 / sp, 1);
          e.box.classList.add('ks-clip');
          const a = e.box.animate([{ width: before + 'px' }, { width: after + 'px' }], { duration: w.ms, easing: w.easing });
          e.widthAnim = a;
          a.onfinish = a.oncancel = () => {
            if (e.widthAnim === a) e.widthAnim = null;
            if (e.box && !e.widthAnim) e.box.classList.remove('ks-clip');
          };
        }
        const pop = spring(0.38 / sp, 0.58);
        for (const c of fresh) {
          c.animate([{ transform: 'scale(.55)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: pop.ms, easing: pop.easing });
        }
        if (countChanged && e.countEl) {
          e.countEl.animate([{ transform: 'scale(.4)' }, { transform: 'scale(1)' }], { duration: pop.ms, easing: pop.easing });
        }
        if (opts.bump) {
          const b = spring(0.32 / sp, 0.5);
          e.box.animate([{ transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: b.ms, easing: b.easing });
        }
      }
      if (animate) this.layout();
    }

    paintCap(k, e) {
      const c = k.el;
      const s = this.s;
      const held = e.live && k.pids.size > 0;
      c.classList.toggle('held', held);
      c.classList.toggle('mod', !!k.mod);
      let html;
      let wide = false;
      const L = K.mouseLabels(s.lang, s.mouseLabels);
      if (k.kind === 'mouse') {
        const b = Number(k.name);
        const part = b === 1 ? 'left' : b === 2 ? 'right' : b === 3 ? 'middle' : 'side';
        html = K.mouseSvg(part) + `<span class="ks-t">${esc(L[b] || L.button + ' ' + b)}</span>`;
        if (k.drag && s.showDrag) html += `<span class="ks-sub">${esc(L.drag)}</span>`;
      } else if (k.kind === 'wheel') {
        html = K.mouseSvg('middle') + `<span class="ks-t">${esc(L.scroll)}</span><span class="ks-arrow">${K.WHEEL_ARROWS[k.dir] || ''}</span>`;
      } else {
        const inf = K.info(k.name);
        const iconHtml = inf.iconHtml || '';
        const text = `<span class="ks-t">${esc(inf.text)}</span>`;
        if (inf.iconOnly || (s.labelMode === 'icon' && iconHtml)) html = iconHtml;
        else if (s.labelMode === 'both' && iconHtml) html = iconHtml + text;
        else html = text;
        wide = !!inf.wide;
      }
      if (c._html !== html) {
        c.innerHTML = html;
        c._html = html;
      }
      c.classList.toggle('wide', wide);
    }

    tick(k) {
      if (!k.el) return;
      const sp = spring(0.3, 0.55);
      k.el.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: sp.ms, easing: sp.easing });
      const arrow = k.el.querySelector('.ks-arrow');
      if (arrow) {
        const d = { up: '0 -4px', down: '0 4px', left: '-4px 0', right: '4px 0' }[k.dir] || '0 0';
        arrow.animate([{ translate: d }, { translate: '0 0' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }

    enter(e) {
      const s = this.s;
      const sp = s.animSpeed || 1;
      const dir = this.vAlign() === 'top' ? -1 : 1;
      const box = e.box;
      if (s.animStyle === 'none') return;
      if (s.animStyle === 'smooth') {
        box.animate([{ transform: `translateY(${12 * dir}px)` }, { transform: 'none' }], { duration: 420 / sp, easing: 'cubic-bezier(.22,1,.36,1)' });
        box.animate([{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 320 / sp, easing: 'ease-out' });
      } else if (s.animStyle === 'pop') {
        const p = spring(0.42 / sp, 0.5);
        box.animate([{ transform: 'scale(.35)' }, { transform: 'none' }], { duration: p.ms, easing: p.easing });
        box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 / sp, easing: 'ease-out' });
      } else {
        const p = spring(0.5 / sp, 0.68);
        box.animate([{ transform: `translateY(${20 * dir}px) scale(.84)` }, { transform: 'none' }], { duration: p.ms, easing: p.easing });
        box.animate([{ opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 260 / sp, easing: 'ease-out' });
      }
    }

    leave(e, fast) {
      if (e.leaving) return;
      e.leaving = true;
      e.live = false;
      clearTimeout(e.timer);
      if (this.active === e) this.active = null;
      if (!e.box) {
        this.drop(e);
        return;
      }
      for (const k of e.keys) k.pids = new Set();
      this.paint(e, false);
      this.notify();
      const s = this.s;
      const dir = this.vAlign() === 'top' ? -1 : 1;
      const dur = s.animStyle === 'none' ? 0 : fast ? 200 : s.fadeMs;
      const done = () => {
        if (e.slot) e.slot.remove();
        this.drop(e);
      };
      if (!dur) {
        done();
        return;
      }
      const a = e.box.animate(
        [
          { opacity: 1, transform: 'none', filter: 'blur(0px)' },
          { opacity: 0, transform: `translateY(${8 * dir}px) scale(.9)`, filter: 'blur(6px)' },
        ],
        { duration: dur, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' },
      );
      a.onfinish = done;
    }

    drop(e) {
      const i = this.entries.indexOf(e);
      if (i >= 0) this.entries.splice(i, 1);
      if (this.active === e) this.active = null;
      this.layout();
      this.notify();
    }

    // Раскладка стопкой: новое сочетание у края, старые отодвигаются и приглушаются.
    layout() {
      const s = this.s;
      if (!s) return;
      const list = this.entries.filter((e) => e.slot);
      const v = this.vAlign();
      const h = this.hAlign();
      const gap = 10 * s.size;
      const tx = h === 'center' ? '-50%' : h === 'right' ? '-100%' : '0px';
      const lay = spring(0.5 / (s.animSpeed || 1), 0.84);
      let off = 0;
      for (let i = list.length - 1, n = 0; i >= 0; i--, n++) {
        const e = list[i];
        const hgt = e.box.offsetHeight;
        const sc = s.fadeOlder ? Math.max(0.8, 1 - n * 0.05) : 1;
        const op = s.fadeOlder ? Math.max(0.3, 1 - n * 0.2) : 1;
        let ty;
        if (v === 'top') ty = `${off}px`;
        else if (v === 'middle') ty = `calc(-50% - ${off}px)`;
        else ty = `${-off}px`;
        const tf = `translate(${tx}, ${ty}) scale(${sc})`;
        if (!e.placed) {
          e.slot.style.transition = 'none';
          e.slot.style.transform = tf;
          e.slot.style.opacity = String(op);
          void e.slot.offsetWidth;
          e.placed = true;
        }
        e.slot.style.transition = s.animStyle === 'none'
          ? 'none'
          : `transform ${lay.ms}ms ${lay.easing}, opacity 300ms ease`;
        e.slot.style.transform = tf;
        e.slot.style.opacity = String(op);
        off += hgt * sc + gap;
      }
    }

    // ---------------------------------------------------------------- эффекты у курсора
    fxDown(pid, ev) {
      if (!this.fx || !this.s.clickRipple || ev.x == null) return;
      const r = el('div', 'ks-ripple' + (pid === 'm2' ? ' right' : ''));
      r.style.left = ev.x + 'px';
      r.style.top = ev.y + 'px';
      this.fx.append(r);
      r.animate(
        [{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0 }],
        { duration: 640, easing: 'cubic-bezier(.2,.8,.2,1)' },
      ).onfinish = () => r.remove();

      // Метка ставится прямо в точку курсора (left/top), а масштаб анимируется вокруг неё самой:
      // так кружок вырастает из нуля под курсором, а не прилетает из угла экрана.
      const old = this.dots.get(pid);
      if (old) old.remove();
      const d = el('div', 'ks-dot');
      d.style.left = ev.x + 'px';
      d.style.top = ev.y + 'px';
      this.fx.append(d);
      const p = spring(0.32, 0.72);
      d.animate([{ scale: '0', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: p.ms, easing: p.easing });
      this.dots.set(pid, d);
    }

    fxUp(pid) {
      const d = this.dots.get(pid);
      if (!d) return;
      this.dots.delete(pid);
      d.animate([{ scale: '1', opacity: 1 }, { scale: '0', opacity: 0 }], { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).onfinish = () => d.remove();
    }

    move(ev) {
      if (!this.fx) return;
      if (ev.x != null) {
        for (const d of this.dots.values()) {
          d.style.left = ev.x + 'px';
          d.style.top = ev.y + 'px';
        }
      }
      this.cursor.move(ev.x, ev.y);
    }
  }

  KeyShowEngine.spring = spring;
  root.KeyShowEngine = KeyShowEngine;
})(window);
