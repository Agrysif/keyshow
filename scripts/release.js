// Выпуск новой версии KeyShow: сборка установщика и публикация релиза на GitHub.
//
// Перед запуском:
//   1. Поднимите "version" в package.json.
//   2. Добавьте запись для этой версии в src/changelog.js (ru + en).
//   3. Закоммитьте изменения.
// Затем: npm run release
//
// Нужен GitHub CLI (gh) с входом в аккаунт. Путь к gh можно задать переменной GH_PATH.
// Уже установленные копии KeyShow сами скачают релиз и обновятся.
'use strict';

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require('../package.json');
const changelog = require('../src/changelog.js');

const version = pkg.version;
const gh = process.env.GH_PATH || 'gh';
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });
const out = (cmd) => execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();

function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

const entry = changelog.find((e) => e.version === version);
if (!entry) fail(`В src/changelog.js нет записи для версии ${version}`);
if (out('git status --porcelain')) fail('Есть незакоммиченные изменения — сначала сделайте коммит');

console.log(`→ Выпуск KeyShow ${version}`);
run('git push');
run('npx electron-builder --win nsis --publish never');

const dist = path.join(root, 'dist');
const setup = `KeyShow-Setup-${version}.exe`;
const files = [setup, `${setup}.blockmap`, 'latest.yml'].map((f) => path.join(dist, f));
for (const f of files) if (!fs.existsSync(f)) fail(`Не найден файл сборки: ${f}`);

const notes = [
  '## Что нового',
  '',
  ...entry.ru.map((s) => `- ${s}`),
  '',
  '## What’s new',
  '',
  ...entry.en.map((s) => `- ${s}`),
  '',
  '---',
  '',
  `**Установка:** скачайте \`${setup}\` ниже и запустите — дальше KeyShow обновляется сам.`,
  '',
  `**Install:** download \`${setup}\` below and run it — KeyShow keeps itself up to date.`,
].join('\n');
const notesFile = path.join(dist, `release-notes-${version}.md`);
fs.writeFileSync(notesFile, notes);

execFileSync(gh, [
  'release', 'create', `v${version}`, ...files,
  '--title', `KeyShow ${version}`,
  '--notes-file', notesFile,
], { cwd: root, stdio: 'inherit' });

console.log(`✓ KeyShow ${version} опубликован`);
