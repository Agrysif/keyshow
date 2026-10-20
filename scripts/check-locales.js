// Проверка переводов: у каждого языка те же строки, что у русского, и те же подстановки ({v}, {hotkey}…).
// Запуск: npm run check:locales
'use strict';

const I18N = require('../src/i18n.js');

const load = (code) => require(`../src/locales/${code}.js`);
const base = load('ru');
const baseKeys = Object.keys(base.strings);
const vars = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
let problems = 0;

for (const code of I18N.CODES) {
  const loc = load(code);
  const keys = Object.keys(loc.strings);
  const missing = baseKeys.filter((k) => !(k in loc.strings));
  const extra = keys.filter((k) => !(k in base.strings));
  const badVars = baseKeys.filter((k) => k in loc.strings && vars(loc.strings[k]) !== vars(base.strings[k]));
  const mouse = ['short', 'full'].flatMap((style) => [1, 2, 3, 4, 5].filter((b) => !loc.mouse?.[style]?.[b]).map((b) => `${style}.${b}`));
  const issues = [
    missing.length && `нет строк: ${missing.join(', ')}`,
    extra.length && `лишние строки: ${extra.join(', ')}`,
    badVars.length && `подстановки не совпадают: ${badVars.join(', ')}`,
    mouse.length && `нет подписей мыши: ${mouse.join(', ')}`,
  ].filter(Boolean);
  problems += issues.length;
  console.log(`${issues.length ? '✗' : '✓'} ${code} ${loc.name} — ${keys.length} строк${issues.length ? '\n    ' + issues.join('\n    ') : ''}`);
}

// Определение языка по языку Windows.
const cases = { 'ru-RU': 'ru', 'kk-KZ': 'kk', 'be-BY': 'be', 'uz-Latn-UZ': 'uz', 'tg-Cyrl-TJ': 'tg', 'ro-MD': 'ro', 'mo-MD': 'ro', 'de-DE': 'en', '': 'en' };
for (const [sys, want] of Object.entries(cases)) {
  const got = I18N.resolve('auto', sys);
  if (got !== want) { problems++; console.log(`✗ detect(${sys || '""'}) = ${got}, ожидалось ${want}`); }
}

console.log(problems ? `\nНайдено проблем: ${problems}` : '\nВсе переводы в порядке.');
process.exit(problems ? 1 : 0);
