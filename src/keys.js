/* Названия, иконки и классификация клавиш. Общий модуль для оверлея и окна настроек. */
(function (root) {
  'use strict';

  const MOD_OF = {
    Ctrl: 'ctrl', CtrlRight: 'ctrl',
    Shift: 'shift', ShiftRight: 'shift',
    Alt: 'alt', AltRight: 'alt',
    Meta: 'win', MetaRight: 'win',
  };
  // Порядок как в документации Windows и Adobe: Win + Ctrl + Alt + Shift + клавиша.
  const MOD_ORDER = { win: 0, ctrl: 1, alt: 2, shift: 3 };

  const svg = (d) => '<svg class="ks-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';

  const IC = {
    win: '<svg class="ks-svg" viewBox="0 0 16 16"><path fill="currentColor" d="M1.6 2.7 6.9 2v5.3H1.6zM7.9 1.9 14.4 1v6.3H7.9zM1.6 8.3h5.3v5.3l-5.3-.7zM7.9 8.3h6.5V15l-6.5-.9z"/></svg>',
    shift: svg('<path d="M12 4.5 4.5 12.5H9V19h6v-6.5h4.5Z"/>'),
    caps: svg('<path d="M12 4.5 4.5 12H9v3.5h6V12h4.5Z"/><path d="M9 19.5h6"/>'),
    enter: svg('<path d="M19 5.5v6a2.5 2.5 0 0 1-2.5 2.5H5.5"/><path d="m9.5 10-4 4 4 4"/>'),
    backspace: svg('<path d="M9.2 5.5H19a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H9.2L3.5 12Z"/><path d="m11.5 9.5 5 5m0-5-5 5"/>'),
    del: svg('<path d="M14.8 5.5H5A1.5 1.5 0 0 0 3.5 7v10A1.5 1.5 0 0 0 5 18.5h9.8l5.7-6.5Z"/><path d="m7.5 9.5 5 5m0-5-5 5"/>'),
    tab: svg('<path d="M3.5 12h13"/><path d="m12 7.5 4.5 4.5-4.5 4.5"/><path d="M20.5 6v12"/>'),
    space: svg('<path d="M4 10v4.5h16V10"/>'),
    left: svg('<path d="M19 12H5.5"/><path d="m11 6-6 6 6 6"/>'),
    right: svg('<path d="M5 12h13.5"/><path d="m13 6 6 6-6 6"/>'),
    up: svg('<path d="M12 19V5.5"/><path d="m6 11 6-6 6 6"/>'),
    down: svg('<path d="M12 5v13.5"/><path d="m6 13 6 6 6-6"/>'),
    menu: svg('<path d="M5 7h14M5 12h14M5 17h14"/>'),
  };

  const MODS = {
    ctrl: { text: 'Ctrl' },
    shift: { text: 'Shift', iconHtml: IC.shift },
    alt: { text: 'Alt' },
    win: { text: 'Win', iconHtml: IC.win },
  };

  const arrow = (text, icon) => ({ text, iconHtml: icon, iconOnly: true });

  const SPECIAL = {
    Backspace: { text: 'Backspace', iconHtml: IC.backspace },
    Tab: { text: 'Tab', iconHtml: IC.tab },
    Enter: { text: 'Enter', iconHtml: IC.enter },
    NumpadEnter: { text: 'Enter', iconHtml: IC.enter },
    CapsLock: { text: 'Caps Lock', iconHtml: IC.caps },
    Escape: { text: 'Esc' },
    Space: { text: 'Space', iconHtml: IC.space, wide: true },
    PageUp: { text: 'Page Up' },
    PageDown: { text: 'Page Down' },
    Home: { text: 'Home' },
    End: { text: 'End' },
    ArrowLeft: arrow('←', IC.left),
    ArrowUp: arrow('↑', IC.up),
    ArrowRight: arrow('→', IC.right),
    ArrowDown: arrow('↓', IC.down),
    Insert: { text: 'Insert' },
    Delete: { text: 'Delete', iconHtml: IC.del },
    PrintScreen: { text: 'PrtSc' },
    NumLock: { text: 'Num Lock' },
    ScrollLock: { text: 'Scroll Lock' },
    ContextMenu: { text: 'Menu', iconHtml: IC.menu },
    Semicolon: { text: ';' }, Equal: { text: '=' }, Comma: { text: ',' }, Minus: { text: '-' },
    Period: { text: '.' }, Slash: { text: '/' }, Backquote: { text: '`' }, BracketLeft: { text: '[' },
    Backslash: { text: '\\' }, BracketRight: { text: ']' }, Quote: { text: "'" },
    NumpadMultiply: { text: 'Num *' }, NumpadAdd: { text: 'Num +' }, NumpadSubtract: { text: 'Num −' },
    NumpadDecimal: { text: 'Num .' }, NumpadDivide: { text: 'Num /' },
    NumpadEnd: { text: 'End' }, NumpadPageDown: { text: 'Page Down' }, NumpadHome: { text: 'Home' },
    NumpadPageUp: { text: 'Page Up' }, NumpadInsert: { text: 'Insert' }, NumpadDelete: { text: 'Delete' },
    NumpadArrowLeft: arrow('←', IC.left), NumpadArrowUp: arrow('↑', IC.up),
    NumpadArrowRight: arrow('→', IC.right), NumpadArrowDown: arrow('↓', IC.down),
    VolumeMute: { text: 'Mute' }, VolumeDown: { text: 'Vol −' }, VolumeUp: { text: 'Vol +' },
    MediaPlay: { text: 'Play' }, MediaStop: { text: 'Stop' }, MediaPrev: { text: 'Prev' }, MediaNext: { text: 'Next' },
  };

  const TYPING = new Set([
    'Space', 'Semicolon', 'Equal', 'Comma', 'Minus', 'Period', 'Slash', 'Backquote',
    'BracketLeft', 'Backslash', 'BracketRight', 'Quote',
    'NumpadMultiply', 'NumpadAdd', 'NumpadSubtract', 'NumpadDecimal', 'NumpadDivide',
  ]);

  // Подписи кнопок мыши на нужном языке (переводы — в src/locales).
  function mouseLabels(lang, style) {
    return root.KeyShowI18n.mouseLabels(lang, style);
  }
  const WHEEL_ARROWS = { up: IC.up, down: IC.down, left: IC.left, right: IC.right };

  function modOf(name) {
    return MOD_OF[name] || null;
  }

  function info(name) {
    const mod = MOD_OF[name];
    if (mod) return MODS[mod];
    if (SPECIAL[name]) return SPECIAL[name];
    let m = /^Numpad(\d)$/.exec(name);
    if (m) return { text: 'Num ' + m[1] };
    m = /^Key(\d+)$/.exec(name);
    if (m) return { text: 'Key ' + m[1] };
    return { text: String(name) };
  }

  function isTyping(name) {
    return /^[A-Z0-9]$/.test(name) || /^Numpad\d$/.test(name) || TYPING.has(name);
  }

  function mouseSvg(part) {
    const on = (p) => (part === p ? ' on' : '');
    const side = part === 'side'
      ? '<rect class="mp on" x="2.6" y="11" width="1.8" height="4.4" rx=".9"/>'
      : '';
    return '<svg class="ks-svg ks-mouse" viewBox="0 0 24 24" fill="none">'
      + `<path class="mp${on('left')}" d="M12 3.6V9.6H6A6 6 0 0 1 12 3.6Z"/>`
      + `<path class="mp${on('right')}" d="M12 3.6V9.6H18A6 6 0 0 0 12 3.6Z"/>`
      + '<rect x="5.2" y="2.8" width="13.6" height="18.4" rx="6.8" stroke="currentColor" stroke-width="1.8"/>'
      + '<path d="M5.2 9.6H18.8M12 2.8V4.8M12 8.4V9.6" stroke="currentColor" stroke-width="1.6"/>'
      + `<rect class="mw${on('middle')}" x="10.6" y="4.8" width="2.8" height="3.6" rx="1.4" stroke="currentColor" stroke-width="1.4"/>`
      + side
      + '</svg>';
  }

  root.KeyShowKeys = {
    MOD_ORDER, WHEEL_ARROWS,
    modOf, info, isTyping, mouseSvg, mouseLabels,
  };
})(window);
