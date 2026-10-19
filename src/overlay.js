'use strict';

(function () {
  const api = window.keyshow;
  const engine = new KeyShowEngine(document.getElementById('stage'), {
    root: document.body,
    fx: document.getElementById('fx'),
  });

  api.on('settings', (s) => engine.setSettings(s));
  api.on('input', (ev) => engine.input(ev));
  api.on('clear', () => engine.clear());
  api.init().then(({ settings }) => engine.setSettings(settings));
})();
