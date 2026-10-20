/* Языки интерфейса. Тексты лежат в src/locales/<код>.js — по файлу на язык.
   «Как в системе» выбирает язык по первому языку Windows; если такого нет — английский.
   Если в переводе не хватает строки, она берётся из запасного языка (для языков СНГ — русский). */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const CODES = ['ru', 'en', 'be', 'kk', 'ky', 'tt', 'tg', 'uz', 'az', 'hy', 'ro', 'tk'];
  const locales = isNode
    ? Object.fromEntries(CODES.map((code) => [code, require('./locales/' + code + '.js')]))
    : (root.KeyShowLocales || {});
  const api = factory(CODES, locales);
  if (isNode) module.exports = api;
  else root.KeyShowI18n = api;
})(typeof self !== 'undefined' ? self : this, function (CODES, LOCALES) {
  const ALIASES = { mo: 'ro' }; // старый код молдавского

  function detect(systemLocale) {
    const base = String(systemLocale || '').toLowerCase().split(/[-_]/)[0];
    const code = ALIASES[base] || base;
    return LOCALES[code] ? code : 'en';
  }

  function resolve(setting, systemLocale) {
    return LOCALES[setting] ? setting : detect(systemLocale);
  }

  // Язык и его запасные языки по цепочке, в конце всегда английский.
  function chain(lang) {
    const out = [];
    let code = LOCALES[lang] ? lang : 'en';
    while (code && LOCALES[code] && !out.includes(code)) {
      out.push(code);
      code = LOCALES[code].fallback;
    }
    if (!out.includes('en')) out.push('en');
    return out.map((c) => LOCALES[c]).filter(Boolean);
  }

  function translator(lang) {
    const dicts = chain(lang);
    return (key, vars) => {
      let s = key;
      for (const d of dicts) {
        if (d.strings[key] != null) { s = d.strings[key]; break; }
      }
      if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
      return s;
    };
  }

  // Подписи кнопок мыши: { 1: 'ЛКМ', …, drag, scroll, button }.
  function mouseLabels(lang, style) {
    const m = chain(lang).find((d) => d.mouse).mouse;
    return { ...(m[style] || m.short), drag: m.drag, scroll: m.scroll, button: m.button };
  }

  function languages() {
    return CODES.filter((c) => LOCALES[c]).map((c) => ({ code: c, name: LOCALES[c].name, english: LOCALES[c].english }));
  }

  return { CODES, detect, resolve, translator, mouseLabels, languages };
});
