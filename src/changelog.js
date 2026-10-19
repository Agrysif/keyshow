/* История изменений на русском и английском.
   Используется окном «Что нового» и скриптом выпуска релиза (scripts/release.js).
   Новая версия — новая запись сверху. */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.KeyShowChangelog = data;
})(typeof self !== 'undefined' ? self : this, function () {
  return [
    {
      version: '1.1.0',
      date: '2026-10-20',
      ru: [
        'Автообновление: новые версии скачиваются с GitHub в фоне и устанавливаются, когда вы не пользуетесь компьютером, — запись не прервётся.',
        'Окно «Что нового» на русском и английском и раздел «Обновления» в настройках.',
        'Найти курсор, как на Mac: потрясите мышь — курсор плавно увеличивается.',
        'Подсветка курсора при встряхивании: плавно загорается и медленно гаснет. Её можно оставить и постоянной.',
        'Метка при зажатой кнопке мыши теперь вырастает прямо под курсором, а не прилетает из угла экрана.',
        'KeyShow теперь устанавливается (без прав администратора) — так он может обновляться сам.',
      ],
      en: [
        'Auto-update: new versions download from GitHub in the background and install while you are away from the computer, so a recording is never interrupted.',
        '“What’s New” window in English and Russian, plus an Updates section in Settings.',
        'Find your cursor like on a Mac: shake the mouse and the pointer smoothly grows.',
        'Cursor highlight on shake: fades in smoothly and slowly fades out. It can also stay on all the time.',
        'The press-and-hold marker now grows right under the cursor instead of flying in from the screen corner.',
        'KeyShow is now installed (no admin rights needed), which lets it update itself.',
      ],
    },
    {
      version: '1.0.0',
      date: '2026-10-20',
      ru: [
        'Первая версия: показ клавиш и сочетаний любой длины, кнопок мыши, перетаскивания и прокрутки поверх всех окон.',
        'Подсветка зажатых клавиш, счётчик повторов, плавное исчезновение.',
        'Настройки в стиле iOS с живым предпросмотром.',
      ],
      en: [
        'First release: shows keys and shortcuts of any length, mouse buttons, dragging and scrolling on top of all windows.',
        'Held-key highlight, repeat counter, smooth fade-out.',
        'iOS-style settings with a live preview.',
      ],
    },
  ];
});
