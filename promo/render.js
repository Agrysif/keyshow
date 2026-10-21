// Покадровый рендер промо-ролика в MP4 (H.264 1080p60 + AAC).
//   npx electron promo/render.js                       → promo/out/KeyShow-promo.mp4
//   npx electron promo/render.js --stills 1,3.6,8      → PNG-кадры в promo/out/stills
// Нужен ffmpeg в PATH и трек в promo/music/keyshow-suno.mp3 (сгенерирован в Suno под этот ролик).
'use strict';

const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const argv = process.argv;
const arg = (name, def) => {
  const i = argv.indexOf(name);
  return i > 0 && argv[i + 1] ? argv[i + 1] : def;
};
const OUT_DIR = path.join(__dirname, 'out');
const OUT = arg('--out', path.join(OUT_DIR, 'KeyShow-promo.mp4'));
const MUSIC = arg('--music', path.join(__dirname, 'music', 'keyshow-suno.mp3'));
const STILLS = arg('--stills', null);
const W = 1920;
const H = 1080;

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const win = new BrowserWindow({
    width: W, height: H, useContentSize: true, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  const wc = win.webContents;
  wc.setFrameRate(60);
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('PAGE:', message); });

  let latest = null;
  let waiter = null;
  wc.on('paint', (_e, _dirty, image) => {
    latest = image;
    if (waiter) { const w = waiter; waiter = null; w(image); }
  });
  const paintOnce = () => new Promise((resolve) => {
    waiter = resolve;
    wc.invalidate();
    setTimeout(() => { if (waiter === resolve) { waiter = null; resolve(latest); } }, 1500);
  });
  // Кадры из окна без экрана приходят с запаздыванием, поэтому ждём снимок с меткой нужного кадра
  // (метку ставит clock.js в правом нижнем углу), а затем закрашиваем её соседними пикселями.
  const markerOf = (bmp) => {
    const o = ((H - 2) * W + (W - 2)) * 4; // BGRA
    return { r: Math.round((bmp[o + 2] - 2) / 4), g: Math.round((bmp[o + 1] - 2) / 4), b: bmp[o] };
  };
  const eraseMarker = (bmp) => {
    for (let y = H - 4; y < H; y++) {
      for (let x = W - 4; x < W; x++) {
        const dst = (y * W + x) * 4;
        const src = (y * W + (x - 4)) * 4;
        bmp.copy(bmp, dst, src, src + 4);
      }
      for (let x = 0; x < 2; x++) { // пиксели «толчка» слева
        const dst = (y * W + x) * 4;
        const src = (y * W + (x + 2)) * 4;
        bmp.copy(bmp, dst, src, src + 4);
      }
    }
    return bmp;
  };
  const grab = async (frame) => {
    const deadline = Date.now() + 5000;
    for (let attempt = 0; ; attempt++) {
      if (attempt > 0) await wc.executeJavaScript('__nudge()');
      const img = await paintOnce();
      const size = img.getSize();
      const bmp = (size.width === W && size.height === H ? img : img.resize({ width: W, height: H })).toBitmap();
      const m = markerOf(bmp);
      if ((m.r === frame % 64 && m.g === Math.floor(frame / 64) % 64 && Math.abs(m.b - 170) < 6) || Date.now() > deadline) {
        if (Date.now() > deadline) {
          const o = ((H - 2) * W + (W - 2)) * 4;
          console.warn(`кадр ${frame}: метка не дождалась, в снимке rgb(${bmp[o + 2]},${bmp[o + 1]},${bmp[o]}) → ${JSON.stringify(m)}`);
        }
        return eraseMarker(bmp);
      }
    }
  };

  await win.loadFile(path.join(__dirname, 'index.html'), argv.includes('--dbg') ? { query: { debug: '1' } } : {});
  for (let i = 0; i < 200 && !(await wc.executeJavaScript('!!window.__ready')); i++) await new Promise((r) => setTimeout(r, 50));
  const meta = await wc.executeJavaScript('window.__meta');
  const frames = Math.round(meta.duration * meta.fps);
  const tOf = (i) => (i * 1000) / meta.fps;
  const started = Date.now();

  if (STILLS) {
    const dir = path.join(OUT_DIR, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    const want = new Map(STILLS.split(',').map((s) => [Math.round(parseFloat(s) * meta.fps), s]));
    const last = Math.max(...want.keys());
    for (let i = 0; i <= last; i++) {
      const shoot = want.has(i);
      await wc.executeJavaScript(`__step(${tOf(i)}, ${shoot}, ${i})`);
      if (!shoot) continue;
      const bmp = await grab(i);
      const name = `t${String(want.get(i)).replace('.', '_')}.png`;
      fs.writeFileSync(path.join(dir, name), nativeImage.createFromBitmap(bmp, { width: W, height: H }).toPNG());
      console.log('still', name);
    }
    console.log(`готово за ${((Date.now() - started) / 1000).toFixed(1)} с`);
    app.exit(0);
    return;
  }

  // Размытие движения: каждый кадр видео — среднее из SUB подкадров (по умолчанию 3).
  const SUB = Math.max(1, parseInt(arg('--blur', '3'), 10) || 1);
  const subFps = meta.fps * SUB;
  const subFrames = frames * SUB;
  const vf = SUB > 1 ? `tmix=frames=${SUB},fps=${meta.fps}` : 'null';
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W}x${H}`, '-r', String(subFps), '-i', '-',
    '-ss', String(meta.musicStart), '-t', String(meta.duration), '-i', MUSIC,
    '-filter_complex', `[0:v]${vf}[v];[1:a]volume=-1.5dB,afade=t=in:st=0:d=0.05,afade=t=out:st=${meta.duration - 1.2}:d=1.2[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(meta.fps),
    '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', OUT,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((r) => ff.on('close', r));

  for (let i = 0; i < subFrames; i++) {
    await wc.executeJavaScript(`__step(${(i * 1000) / subFps}, true, ${i})`);
    const bmp = await grab(i);
    if (!ff.stdin.write(bmp)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % (60 * SUB) === 0) console.log(`кадр ${i / SUB}/${frames}  ${((Date.now() - started) / 1000).toFixed(0)} с`);
  }
  ff.stdin.end();
  const code = await ffDone;
  console.log(code === 0 ? `готово: ${OUT} за ${((Date.now() - started) / 1000).toFixed(0)} с` : `ffmpeg завершился с кодом ${code}`);
  app.exit(code === 0 ? 0 : 1);
});
