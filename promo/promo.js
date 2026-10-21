// Промо-ролик KeyShow (~24,5 с, 1920×1080). Всё — функции от времени t, синхронизированные с битом трека.
// Трек: promo/music/keyshow-suno.mp3 — 128 BPM, первая доля 0,406 с, дроп на 16-й доле (7,906 с),
// удар-переход на 31-й доле, финальный удар 22,22 с.
// Сцены: 3D-клавиатура (набор KEYSHO) → моушен (слово, сочетания, брейк, клик на дропе) → редактор →
// стили → языки → 3D-иконка.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W = 1920;
const H = 1080;
const BPM = 128;
const B = 60 / BPM;                  // доля, 0,469 с
const FIRST = 0.406;                 // первая доля трека
const T = (n) => FIRST + n * B;      // время n-й доли
const DROP = T(16);
const FINAL = 22.22;
const DURATION = 24.5;

const SHOT = {
  intro: [0, T(6)],
  motion: [T(6), T(20)],
  app: [T(20), T(31)],
  styles: [T(31), T(36)],
  langs: [T(36), T(44)],
  end: [T(44), DURATION + 1],
};
const inShot = (name, t) => t >= SHOT[name][0] && t < SHOT[name][1];

// ---------------------------------------------------------------- математика
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, p) => a + (b - a) * p;
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const easeInCubic = (p) => p * p * p;
const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const easeInExpo = (p) => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10));
const decay = (tau, k) => (tau < 0 ? 0 : Math.exp(-k * tau));
const window01 = (t, a, b) => clamp01((t - a) / (b - a));
function spring(tau, response = 0.5, damping = 0.7) {
  if (tau <= 0) return 0;
  const w = (2 * Math.PI) / response;
  if (damping < 1) {
    const wd = w * Math.sqrt(1 - damping * damping);
    return 1 - Math.exp(-damping * w * tau) * (Math.cos(wd * tau) + ((damping * w) / wd) * Math.sin(wd * tau));
  }
  return 1 - Math.exp(-w * tau) * (1 + w * tau);
}
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
// Нажатие: вниз за 40 мс, плавно вверх.
const pressCurve = (tau) => (tau < 0 ? 0 : tau < 0.04 ? tau / 0.04 : Math.exp(-(tau - 0.04) * 10));
// Удар: быстрая атака, медленный спад.
const punch = (tau, k = 6) => (tau < 0 ? 0 : Math.exp(-k * tau) * (1 - Math.exp(-50 * tau)));

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- 3D: рендер
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040509);
scene.fog = new THREE.FogExp2(0x040509, 0.035);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

const camera = new THREE.PerspectiveCamera(36, W / H, 0.05, 200);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bokeh = new BokehPass(scene, camera, { focus: 5, aperture: 0.004, maxblur: 0.012 });
composer.addPass(bokeh);
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.7, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const ambient = new THREE.AmbientLight(0xffffff, 0.08);
scene.add(ambient);
const spot = new THREE.SpotLight(0xffffff, 520, 40, 0.55, 0.85, 2);
spot.position.set(-6, 11, 7);
spot.target.position.set(0, 0, 0);
spot.castShadow = true;
spot.shadow.mapSize.set(2048, 2048);
spot.shadow.bias = -0.0004;
spot.shadow.radius = 4;
scene.add(spot, spot.target);
const rimBlue = new THREE.PointLight(0x2a7bff, 60, 26, 2);
rimBlue.position.set(-4, 2.5, -5);
scene.add(rimBlue);
const rimViolet = new THREE.PointLight(0x8a4dff, 34, 26, 2);
rimViolet.position.set(6.5, 2.2, -5);
scene.add(rimViolet);

// ---------------------------------------------------------------- клавиши-легенды
const legendCache = new Map();
function legendTexture(text, { color = '#ffffff', size = 330, w = 512, h = 512 } = {}) {
  const id = [text, color, size, w, h].join('|');
  if (legendCache.has(id)) return legendCache.get(id);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.font = `600 ${size}px "Segoe UI Variable Display", "Segoe UI", "Segoe UI Symbol", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + size * 0.06);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  legendCache.set(id, tex);
  return tex;
}

// Клавиша для поля «языков» (синяя, глянцевая)
const capGeo = new RoundedBoxGeometry(1, 0.44, 1, 6, 0.11);
const legendGeo = new THREE.PlaneGeometry(0.88, 0.88);
function makeKey(letter, { color = 0x0866e8, legend = '#ffffff', w = 1, d = 1 } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.36, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.16,
    emissive: new THREE.Color(color), emissiveIntensity: 0,
  });
  const body = new THREE.Mesh(w === 1 && d === 1 ? capGeo : new RoundedBoxGeometry(w, 0.44, d, 6, 0.11), mat);
  g.add(body);
  if (letter) {
    const lm = new THREE.MeshBasicMaterial({ map: legendTexture(letter, { color: legend, size: letter.length > 1 ? 180 : 330 }), transparent: true, toneMapped: false, depthWrite: false });
    const lg = new THREE.Mesh(legendGeo, lm);
    lg.rotation.x = -Math.PI / 2;
    lg.position.y = 0.224;
    g.add(lg);
  }
  g.userData.mat = mat;
  return g;
}

// ================================================================ ШОТ 1: КЛАВИАТУРА
const kbGroup = new THREE.Group();
scene.add(kbGroup);

// Стол и корпус
const table = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0x0a0b10, roughness: 0.55, metalness: 0.35 }),
);
table.rotation.x = -Math.PI / 2;
table.position.y = -0.52;
table.receiveShadow = true;
kbGroup.add(table);
const caseMesh = new THREE.Mesh(
  new RoundedBoxGeometry(16.1, 0.52, 6.1, 6, 0.26),
  new THREE.MeshPhysicalMaterial({ color: 0x2a2d34, metalness: 0.88, roughness: 0.34, clearcoat: 0.25, clearcoatRoughness: 0.3 }),
);
caseMesh.position.y = -0.26;
caseMesh.castShadow = true;
caseMesh.receiveShadow = true;
kbGroup.add(caseMesh);
// Тёмная «внутренность» под клавишами
const well = new THREE.Mesh(
  new RoundedBoxGeometry(15.2, 0.02, 5.2, 2, 0.1),
  new THREE.MeshStandardMaterial({ color: 0x06070a, roughness: 0.9 }),
);
well.position.y = 0.005;
kbGroup.add(well);

const ROWS = [
  [['`', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1], ['⌫', 2]],
  [['Tab', 1.5], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1], ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1], ['[', 1], [']', 1], ['\\', 1.5]],
  [['Caps', 1.75], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1], ['H', 1], ['J', 1], ['K', 1], ['L', 1], [';', 1], ["'", 1], ['Enter', 2.25]],
  [['Shift', 2.25], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1], [',', 1], ['.', 1], ['/', 1], ['Shift', 2.75]],
  [['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], ['', 6.25], ['Alt', 1.25], ['Win', 1.25], ['Menu', 1.25], ['Ctrl', 1.25]],
];
const kbCapGeo = new Map();
const kbGlowGeo = new Map();
const geoFor = (cache, w, make) => { if (!cache.has(w)) cache.set(w, make(w)); return cache.get(w); };
const GLOW = new THREE.Color(0x1a7dff);
const kbKeys = [];
const byLetter = {};
ROWS.forEach((row, r) => {
  let x = -7.5;
  const z = r - 2;
  for (const [label, w] of row) {
    const cx = x + w / 2;
    x += w;
    const pivot = new THREE.Group();
    pivot.position.set(cx, 0, z);
    kbGroup.add(pivot);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x16181e, roughness: 0.5, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.4,
      emissive: GLOW.clone(), emissiveIntensity: 0,
    });
    const cap = new THREE.Mesh(geoFor(kbCapGeo, w, (ww) => new RoundedBoxGeometry(ww - 0.12, 0.34, 0.88, 4, 0.09)), mat);
    cap.position.y = 0.21;
    cap.castShadow = true;
    cap.receiveShadow = true;
    pivot.add(cap);
    let legendMat = null;
    if (label) {
      const single = label.length === 1;
      const lw = single ? 0.62 : Math.min(w - 0.3, 1.5);
      const lh = single ? 0.62 : 0.4;
      legendMat = new THREE.MeshBasicMaterial({
        map: legendTexture(label, single ? { size: 300 } : { size: 150, w: 512, h: Math.round(512 * (lh / lw)) }),
        transparent: true, toneMapped: false, depthWrite: false, color: new THREE.Color(0.5, 0.53, 0.6),
      });
      const legend = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), legendMat);
      legend.rotation.x = -Math.PI / 2;
      legend.position.y = 0.382;
      pivot.add(legend);
    }
    // Подсветка снизу: светится в щелях между клавишами и в пустом гнезде
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), toneMapped: false });
    const glow = new THREE.Mesh(geoFor(kbGlowGeo, w, (ww) => new RoundedBoxGeometry(ww - 0.04, 0.03, 0.96, 2, 0.08)), glowMat);
    glow.position.set(cx, 0.02, z);
    kbGroup.add(glow);
    const k = { label, w, x: cx, z, pivot, mat, legendMat, glowMat, dist: Math.hypot(cx, z * 1.6) };
    kbKeys.push(k);
    if (/^[A-Z]$/.test(label)) byLetter[label] = k;
  }
});

// Слово KEYSHOW набирается по клавише на долю; «W» нажимается уже в моушене (склейка на T(6))
const WORD = 'KEYSHOW';
const wordKeys = WORD.split('').slice(0, 6).map((ch, i) => Object.assign(byLetter[ch], { typedAt: T(i) }));
const dummy = new THREE.Object3D();

function updateKeyboard(t) {
  spot.intensity = 520;
  rimBlue.intensity = 36;
  rimViolet.intensity = 20;
  for (const k of kbKeys) {
    let g = 0;
    let press = 0;
    let legend = 0.5;
    let emissive = 0;
    if (k.typedAt !== undefined) {
      const tau = t - k.typedAt;
      press = 0.12 * pressCurve(tau);
      if (tau >= 0) {
        g = 3.2 * decay(tau, 5) + 1.1;
        legend = 2.4 + 3 * decay(tau, 6);
        emissive = 0.12 + 0.7 * decay(tau, 5);
      }
    }
    k.glowMat.color.copy(GLOW).multiplyScalar(g);
    k.mat.emissiveIntensity = emissive;
    if (k.legendMat) {
      const c = k.typedAt !== undefined && t >= k.typedAt ? [0.75, 0.88, 1] : [1, 1, 1];
      k.legendMat.color.setRGB(c[0] * legend, c[1] * legend, c[2] * legend);
    }
    k.pivot.position.set(k.x, -press, k.z);
  }
}

// Фокус переводится на только что нажатую клавишу за ~0,18 с (считается от t, без состояния)
const keyPoint = (k) => new THREE.Vector3(k.x, 0.3, k.z);
function typingFocus(t) {
  let j = 0;
  for (let n = 0; n < wordKeys.length; n++) if (t >= wordKeys[n].typedAt - 0.06) j = n;
  const cur = keyPoint(wordKeys[j]);
  if (j === 0) return cur;
  const p = easeInOut(clamp01((t - (wordKeys[j].typedAt - 0.06)) / 0.18));
  return keyPoint(wordKeys[j - 1]).lerp(cur, p);
}
// Камера вступления: два макро-плана со склейкой на четвёртой доле
function introCamera(t) {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  let fov;
  let aperture;
  if (t < T(4)) {
    // План 1: проезд над клавишами спереди, фокус прыгает на каждую нажатую
    const p = clamp01(t / T(4));
    pos.set(lerp(-3.0, -1.4, p), lerp(2.5, 2.3, p), lerp(4.6, 4.2, p));
    look.set(lerp(-1.6, -0.4, p), 0, -0.7);
    fov = 38;
    aperture = 0.0075;
  } else {
    // План 2: склейка — высокий ракурс сбоку, облёт с наездом
    const p = easeInOut(clamp01((t - T(4)) / (T(6) - T(4))));
    const ang = lerp(0.95, 0.72, p);
    const r = lerp(7.2, 6.4, p);
    pos.set(Math.sin(ang) * r - 0.6, lerp(5.2, 4.8, p), Math.cos(ang) * r);
    look.set(-0.8, 0, -0.3);
    fov = 34;
    aperture = 0.004;
  }
  camera.position.copy(pos);
  camera.lookAt(look);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  bokeh.uniforms.focus.value = camera.position.distanceTo(typingFocus(t));
  bokeh.uniforms.aperture.value = aperture;
  bloom.strength = 0.55;
  bloom.radius = 0.42;
}

// ================================================================ ШОТ 4: поле летящих клавиш (языки)
const fieldGroup = new THREE.Group();
scene.add(fieldGroup);
const fr = rng(42);
const FIELD_LETTERS = ['K', 'E', 'Y', 'S', 'H', 'O', 'W', 'Ctrl', 'Alt', 'Shift', 'Z', 'C', 'V'];
const field = Array.from({ length: 54 }, (_, i) => {
  const letter = FIELD_LETTERS[i % FIELD_LETTERS.length];
  const wide = letter.length > 1;
  const color = [0x0a84ff, 0x0a84ff, 0x0a84ff, 0x5e5ce6, 0x1c1c1e][Math.floor(fr() * 5)];
  const k = makeKey(letter, { color, w: wide ? 1.7 : 1 });
  fieldGroup.add(k);
  return { k, x: (fr() - 0.5) * 22, y: (fr() - 0.5) * 11, z0: -42 + fr() * 46, speed: 7 + fr() * 6, rx: fr() * 6, ry: fr() * 6, vr: (fr() - 0.5) * 1.6 };
});
function updateField(t) {
  const tau = t - SHOT.langs[0];
  for (const f of field) {
    let z = f.z0 + f.speed * tau;
    z = ((z + 42) % 46) - 42;
    f.k.position.set(f.x, f.y, z);
    f.k.rotation.set(f.rx + f.vr * tau, f.ry + f.vr * 0.7 * tau, 0.3 * f.vr);
    f.k.userData.mat.emissiveIntensity = 0.15;
  }
  const half = B / 2;
  const since = ((tau % half) + half) % half;
  bloom.strength = 0.9 + 0.8 * decay(since, 8);
  camera.position.set(Math.sin(tau * 0.6) * 0.6, Math.cos(tau * 0.5) * 0.3, 9);
  camera.lookAt(0, 0, -4);
  camera.fov = 52;
  camera.updateProjectionMatrix();
}

// ================================================================ ШОТ 5: 3D-иконка приложения
const iconGroup = new THREE.Group();
scene.add(iconGroup);
const iconBase = new THREE.Mesh(
  new RoundedBoxGeometry(2.6, 0.5, 2.6, 8, 0.6),
  new THREE.MeshPhysicalMaterial({ color: 0x0f6ef5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, emissive: 0x0a5fd0, emissiveIntensity: 0.05 }),
);
iconGroup.add(iconBase);
const iconKey = makeKey('K', { color: 0xdfe8f7, legend: '#0A6CE6', w: 1.5, d: 1.4 });
iconKey.position.y = 0.42;
iconKey.userData.mat.roughness = 0.5;
iconKey.userData.mat.clearcoat = 0.4;
iconGroup.add(iconKey);
const sparkle = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.04), new THREE.MeshBasicMaterial({ color: 0xbfe0ff, toneMapped: false }), 110);
scene.add(sparkle);
const sr = rng(99);
const sData = Array.from({ length: 110 }, () => ({ a: sr() * Math.PI * 2, r: 2.4 + sr() * 4.5, y: (sr() - 0.5) * 5, s: 0.6 + sr() * 1.6, sp: 0.2 + sr() * 0.5, ph: sr() * 6 }));
// Световые штрихи на подлёте иконки
const streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 1), new THREE.MeshBasicMaterial({ color: 0x8fc6ff, toneMapped: false }), 80);
scene.add(streaks);
const str = rng(5);
const stData = Array.from({ length: 80 }, () => ({ x: (str() - 0.5) * 14, y: (str() - 0.5) * 8, z0: -40 + str() * 40, len: 1 + str() * 3 }));
function updateEnd(t) {
  const approach = window01(t, SHOT.end[0], FINAL);
  const tau = t - FINAL;
  const sp = spring(tau, 0.75, 0.6);
  const zIn = lerp(-24, 0, easeInCubic(approach));
  iconGroup.position.set(0, 1.35 + 0.08 * Math.sin(Math.max(0, tau) * 2.2), tau < 0 ? zIn : 0);
  const spin = tau < 0 ? lerp(-3 * Math.PI, -0.5, easeOutCubic(approach)) : lerp(-0.5, 0, sp);
  iconGroup.rotation.set(Math.PI / 2 + 0.1 * Math.sin(Math.max(0, tau) * 1.4) - 0.1, spin + 0.06 * Math.sin(Math.max(0, tau) * 1.7), 0);
  iconGroup.scale.setScalar(tau < 0 ? lerp(0.6, 1.1, approach) : 1 + 0.1 * (1 - sp));
  iconBase.material.emissiveIntensity = 0.05 + 0.5 * punch(tau, 3);
  sData.forEach((q, i) => {
    const a = q.a + Math.max(0, tau) * q.sp;
    dummy.position.set(Math.cos(a) * q.r, q.y + 1.2, Math.sin(a) * q.r - 2);
    dummy.rotation.set(tau * 2 + q.ph, tau * 3, 0);
    dummy.scale.setScalar(tau < 0 ? 0 : q.s * clamp01(tau / 0.4) * (0.6 + 0.4 * Math.sin(tau * 5 + q.ph)));
    dummy.updateMatrix();
    sparkle.setMatrixAt(i, dummy.matrix);
  });
  sparkle.instanceMatrix.needsUpdate = true;
  // Штрихи летят навстречу, пока иконка подлетает
  const streakA = tau < 0 ? 1 : decay(tau, 6);
  stData.forEach((q, i) => {
    let z = q.z0 + 34 * (t - SHOT.end[0]);
    z = ((z + 40) % 44) - 40;
    dummy.position.set(q.x, q.y + 1, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, q.len * 3 * streakA);
    dummy.updateMatrix();
    streaks.setMatrixAt(i, dummy.matrix);
  });
  streaks.instanceMatrix.needsUpdate = true;
  camera.position.set(0, 0.6, 10.5);
  camera.lookAt(0, 0.4, 0);
  camera.fov = 38 - 3 * punch(tau, 4);
  camera.updateProjectionMatrix();
  bloom.strength = 0.4 + 1.1 * punch(tau, 3.5) + 0.3 * (tau < 0 ? approach : 0);
  bloom.threshold = 0.9;
}

function render3D(t) {
  const intro = inShot('intro', t);
  const langs = inShot('langs', t);
  const end = inShot('end', t);
  kbGroup.visible = intro;
  fieldGroup.visible = langs;
  iconGroup.visible = end;
  sparkle.visible = end;
  streaks.visible = end;
  spot.visible = intro;
  bokeh.enabled = intro;
  scene.fog.density = intro ? 0.03 : langs ? 0.035 : 0.02;
  bloom.threshold = 0.82;
  bloom.radius = 0.55;
  renderer.toneMappingExposure = end ? 0.92 : 1.0;
  rimBlue.intensity = 60;
  rimViolet.intensity = 34;
  if (intro) { updateKeyboard(t); introCamera(t); }
  if (langs) updateField(t);
  if (end) updateEnd(t);
  composer.render();
}

// ================================================================ 2D: настоящий движок KeyShow
const BASE = {
  keyColor: '#0A84FF', textColor: 'auto', keyStyle: 'solid', opacity: 1, size: 1.55, radius: 12,
  shadow: true, labelMode: 'both', showPlus: true, backdrop: false,
  lingerMs: 6000, fadeMs: 450, maxEntries: 3, filter: 'all', loneModifiers: true,
  repeatCounter: true, sortModifiers: true, holdPulse: true, fadeOlder: true,
  mouseClicks: 'all', mouseLabels: 'short', wheel: true, showDrag: true,
  clickRipple: true, cursorHalo: 'shake', haloLinger: 1200, cursorGrow: true, cursorGrowMax: 6,
  animStyle: 'spring', animSpeed: 1, position: 'bottom-center', marginX: 40, marginY: 70, lang: 'ru',
};
const engine = new KeyShowEngine($('stage'), { root: $('ovRoot'), fx: $('fx') });
engine.setSettings(BASE);

// Во вступлении: каждая нажатая 3D-клавиша появляется на экране — как в самом приложении
const introEngine = new KeyShowEngine($('introStage'), { root: $('introOv') });
introEngine.setSettings({ ...BASE, size: 2.5, marginY: 90, maxEntries: 1, lingerMs: 260, fadeMs: 220 });
const atMs = (sec) => Math.round(sec * 1000);
for (const k of wordKeys) {
  setTimeout(() => introEngine.input({ t: 'down', kind: 'key', name: k.label }), atMs(k.typedAt));
  setTimeout(() => introEngine.input({ t: 'up', kind: 'key', name: k.label }), atMs(k.typedAt + 0.14));
}

// ================================================================ МОУШЕН (доли 6–20)
// Слово из клавиш → сочетания на нарастании → брейк «Ты нажимаешь — зритель видит» → клик на дропе
const PLUS_SVG = '<svg viewBox="0 0 10 10"><path d="M5 1.6v6.8M1.6 5h6.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const CX = W / 2;
const CY = H / 2;
const KK = window.KeyShowKeys;

// Оформление клавиш берём у настоящего движка: он выставляет CSS-переменные и классы стиля
const looks = new Map();
function lookOf(style, color, size) {
  const id = [style, color, size].join('|');
  if (!looks.has(id)) {
    const root = document.createElement('div');
    const stage = document.createElement('div');
    root.append(stage);
    new KeyShowEngine(stage, { root }).setSettings({ ...BASE, keyStyle: style, keyColor: color, size });
    const cls = [...stage.classList].filter((c) => c.startsWith('ks-style-') || c === 'ks-shadow').join(' ');
    looks.set(id, { vars: root.style.cssText, cls });
  }
  return looks.get(id);
}
function capHtml(name) {
  const inf = KK.info(name);
  const text = `<span class="ks-t">${inf.text}</span>`;
  const html = inf.iconOnly ? inf.iconHtml : (inf.iconHtml || '') + text;
  return `<div class="ks-cap${KK.modOf(name) ? ' mod' : ''}${inf.wide ? ' wide' : ''}">${html}</div>`;
}
// Сочетание как в оверлее. Элемент — точка, содержимое отцентрировано вокруг неё.
function makeCombo(parent, names, { style = 'solid', color = '#0A84FF', size = 2.4, plus = true } = {}) {
  const lk = lookOf(style, color, size);
  const el = document.createElement('div');
  el.className = 'm-item ks-root';
  el.style.cssText = lk.vars;
  const sep = plus ? `<div class="ks-plus">${PLUS_SVG}</div>` : '';
  el.innerHTML = `<div class="m-center ${lk.cls}"><div class="ks-keys">${names.map(capHtml).join(sep)}</div></div>`;
  parent.append(el);
  return el;
}
const place = (el, x, y, s = 1, rot = 0) => {
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(4)})${rot ? ` rotate(${rot.toFixed(2)}deg)` : ''}`;
};
const blurOf = (px) => (px > 0.05 ? `blur(${px.toFixed(2)}px)` : '');

// ---------- 1. Слово KEYSHOW: «W» нажимается на склейке, по слову проходит волна нажатий
const wordEl = makeCombo($('mWord'), WORD.split(''), { size: 3.6, plus: false });
const wordCaps = [...wordEl.querySelectorAll('.ks-cap')];
function updateWord(t) {
  const on = t >= T(6) && t < T(8);
  wordEl.style.display = on ? '' : 'none';
  if (!on) return;
  const tau = t - T(6);
  const push = lerp(1.12, 1, easeOutCubic(clamp01(tau / 0.55))) + 0.035 * clamp01(tau / 0.9);
  const zoom = easeInExpo(window01(t, T(7.65), T(8)));
  place(wordEl, CX, CY, push * (1 + 7 * zoom));
  wordEl.style.opacity = String(1 - clamp01((zoom - 0.55) / 0.45));
  wordEl.style.filter = blurOf(10 * zoom);
  wordCaps.forEach((c, i) => {
    let s = 1;
    let held = false;
    if (i === 6) {
      s = lerp(0.55, 1, spring(tau, 0.38, 0.58));
      c.style.opacity = String(clamp01(tau / 0.06));
      held = tau < 0.16;
    }
    const wave = t - (T(7) + i * 0.045);
    if (wave >= 0 && wave < 0.14) held = true;
    c.style.transform = `scale(${s.toFixed(4)})`;
    c.classList.toggle('held', held);
  });
}

// ---------- 2. Сочетания на нарастании: каждое влетает в центр, потом уходит на край
const COMBOS = [
  { at: 8, keys: ['Ctrl', 'C'], label: 'Копировать', style: 'solid', color: '#0A84FF', slot: [330, 210] },
  { at: 9, keys: ['Ctrl', 'V'], label: 'Вставить', style: 'glass', color: '#5E5CE6', slot: [1600, 230] },
  { at: 10, keys: ['Ctrl', 'Z'], label: 'Отменить', style: 'light', color: '#FF375F', slot: [320, 870] },
  { at: 11, keys: ['Meta', 'Shift', 'S'], label: 'Скриншот', style: 'dark', color: '#FF9F0A', slot: [1590, 860] },
  { at: 11.5, keys: ['Alt', 'Tab'], label: 'Другое окно', style: 'solid', color: '#BF5AF2', slot: [960, 150] },
  { at: 12, keys: ['Ctrl', 'Shift', 'Escape'], label: 'Диспетчер задач', style: 'solid', color: '#30D158', slot: [960, 945] },
  { at: 12.5, keys: ['Ctrl', 'Alt', 'Delete'], style: 'glass', color: '#0A84FF', slot: [260, 400] },
  { at: 13, keys: ['Ctrl', 'S'], style: 'light', color: '#0A84FF', slot: [1680, 680] },
  { at: 13.25, keys: ['Alt', 'F4'], style: 'dark', color: '#FF375F', slot: [640, 330] },
  { at: 13.5, keys: ['Ctrl', 'Shift', 'N'], style: 'solid', color: '#FF9F0A', slot: [1290, 760] },
  { at: 13.75, keys: ['Ctrl', 'Alt', 'Shift', 'K'], style: 'solid', color: '#0A84FF' },
];
for (const c of COMBOS) c.el = makeCombo($('mCombos'), c.keys, { style: c.style, color: c.color, size: 3.4 });
function updateCombos(t) {
  const implode = easeInExpo(window01(t, T(14) - 0.06, T(14) + 0.1));
  let last = -1;
  COMBOS.forEach((c, i) => { if (t >= T(c.at)) last = i; });
  const kick = last >= 0 ? decay(t - T(COMBOS[last].at), 10) : 0;
  COMBOS.forEach((c, i) => {
    const tau = t - T(c.at);
    const on = tau >= 0 && implode < 1;
    c.el.style.display = on ? '' : 'none';
    if (!on) return;
    const next = COMBOS[i + 1] ? T(COMBOS[i + 1].at) : Infinity;
    const out = easeOutExpo(clamp01((t - next) / 0.32));
    let x = CX;
    let y = CY;
    let s = lerp(0.55, 1, spring(tau, 0.38, 0.58));
    let op = clamp01(tau / 0.06);
    if (c.slot) {
      x = lerp(CX, c.slot[0], out) + 10 * out * Math.sin(t * 1.3 + i);
      y = lerp(CY, c.slot[1], out) + 8 * out * Math.cos(t * 1.1 + i * 2);
      s *= lerp(1, 0.45, out) * (1 + 0.07 * kick * out);
      op *= lerp(1, 0.6, out);
    }
    x = lerp(x, CX, implode);
    y = lerp(y, CY, implode);
    s *= 1 - implode;
    place(c.el, x, y, s);
    c.el.style.opacity = (op * (1 - implode)).toFixed(3);
    c.el.style.filter = blurOf(1.6 * out);
    c.el.querySelectorAll('.ks-cap').forEach((cap) => cap.classList.toggle('held', tau < 0.16));
  });
  // Подпись под сочетанием, пока оно в центре
  const lab = $('mLabel');
  const cur = COMBOS[last];
  const nextAt = COMBOS[last + 1] ? T(COMBOS[last + 1].at) : T(14);
  if (cur && cur.label && t < nextAt) {
    if (lab.textContent !== cur.label) lab.textContent = cur.label;
    const p = easeOutExpo(clamp01((t - T(cur.at) - 0.05) / 0.25));
    const q = clamp01((t - (nextAt - 0.07)) / 0.07);
    lab.style.opacity = String(p * (1 - q));
    lab.style.transform = `translateY(${(18 * (1 - p)).toFixed(1)}px)`;
  } else {
    lab.style.opacity = '0';
  }
}

// ---------- 3. Брейк: слова по полудолям, в центр прилетает курсор
const breakWords = [...$('mBreak').querySelectorAll('.m-w')];
const tagWords = [...$('mTag').querySelectorAll('.m-w')];
// Строка держится по центру уже появившихся слов и плавно съезжает, когда добавляется новое
function centerLines(box, words, times, t) {
  if (!box._lines) {
    if (!box.offsetWidth) return;
    box._lines = [...box.querySelectorAll('.m-line')].map((line) => {
      const idx = words.map((w, i) => (w.parentElement === line ? i : -1)).filter((i) => i >= 0);
      const L = (i) => words[i].offsetLeft;
      const R = (i) => words[i].offsetLeft + words[i].offsetWidth;
      const full = idx.length ? (L(idx[0]) + R(idx[idx.length - 1])) / 2 : 0;
      return { line, idx, targets: idx.map((_, k) => full - (L(idx[0]) + R(idx[k])) / 2) };
    });
  }
  for (const { line, idx, targets } of box._lines) {
    if (idx.length < 2) continue;
    let x = targets[0];
    for (let k = 1; k < idx.length; k++) {
      x = lerp(x, targets[k], easeOutExpo(clamp01((t - times[idx[k]]) / 0.3)));
    }
    line.style.transform = `translateX(${x.toFixed(1)}px)`;
  }
}
function slam(el, since, from = 1.35) {
  const p = easeOutExpo(clamp01(since / 0.2));
  el.style.opacity = String(clamp01(since / 0.05));
  el.style.transform = `scale(${(from - (from - 1) * p).toFixed(4)})`;
  el.style.filter = blurOf(14 * (1 - p));
}
function updateBreak(t) {
  const on = t >= T(14) && t < DROP + 0.3;
  $('mBreak').style.display = on ? '' : 'none';
  if (!on) return;
  const times = [14, 14.5, 15, 15.5].map(T);
  times.forEach((at, i) => slam(breakWords[i], t - at));
  centerLines($('mBreak'), breakWords, times, t);
  const s = 1 + 0.05 * window01(t, T(14), DROP) + 0.012 * decay(t - T(Math.floor((t - FIRST) / (B / 2)) / 2), 14);
  $('mBreak').style.transform = `translateY(-50%) scale(${s.toFixed(4)})`;
}
const CLICK = { x: CX + 6, y: CY + 4 };
function updateCursor(t) {
  const el = $('mCursor');
  const on = t >= T(15.55) && t < DROP + 0.5;
  el.style.display = on ? '' : 'none';
  if (!on) return;
  const p = easeOutCubic(window01(t, T(15.55), DROP - 0.04));
  const x = lerp(CX + 640, CLICK.x, p);
  const y = lerp(CY + 470, CLICK.y, p);
  const press = t >= DROP ? 1 - 0.18 * pressCurve(t - DROP) : 1;
  const gone = easeInCubic(window01(t, DROP + 0.06, DROP + 0.22));
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(press * (1 - gone)).toFixed(4)})`;
}

// ---------- 4. Дроп: волна от клика заливает экран синим, клавиши разлетаются, слоган
const RING_COUNT = 5;
const rings = Array.from({ length: RING_COUNT }, () => {
  const r = document.createElement('div');
  r.className = 'm-ring';
  $('mRings').append(r);
  return r;
});
// Импульсы: на каждом сочетании, на клике (две волны) и на долях после дропа
const PULSES = [
  ...COMBOS.map((c) => ({ at: T(c.at), max: 760, w: 3, color: '77,163,255', dur: 0.7 })),
  { at: DROP, max: 1500, w: 14, color: '255,255,255', dur: 0.95 },
  { at: DROP + 0.08, max: 1200, w: 6, color: '170,210,255', dur: 0.9 },
  ...[17, 18, 19].map((b) => ({ at: T(b), max: 900, w: 4, color: '255,255,255', dur: 0.8 })),
];
function updateRings(t) {
  const live = PULSES.filter((p) => t >= p.at && t < p.at + p.dur).slice(-RING_COUNT);
  rings.forEach((el, i) => {
    const p = live[i];
    el.style.display = p ? '' : 'none';
    if (!p) return;
    const q = (t - p.at) / p.dur;
    const r = lerp(24, p.max, easeOutExpo(q));
    const w = Math.max(1.5, p.w * (1 - q));
    el.style.left = `${(CLICK.x - r).toFixed(1)}px`;
    el.style.top = `${(CLICK.y - r).toFixed(1)}px`;
    el.style.width = el.style.height = `${(2 * r).toFixed(1)}px`;
    el.style.borderWidth = `${w.toFixed(2)}px`;
    el.style.borderColor = `rgba(${p.color},${(0.85 * Math.pow(1 - q, 1.5)).toFixed(3)})`;
  });
}
function updateFlood(t) {
  const el = $('mFlood');
  const q = (t - DROP - 0.02) / 0.6;
  el.style.display = q > 0 ? '' : 'none';
  if (q <= 0) return;
  const r = 1300 * easeOutExpo(clamp01(q));
  el.style.left = `${(CLICK.x - r).toFixed(1)}px`;
  el.style.top = `${(CLICK.y - r).toFixed(1)}px`;
  el.style.width = el.style.height = `${(2 * r).toFixed(1)}px`;
}
const BURST_KEYS = ['Ctrl', 'Shift', 'Alt', 'Tab', 'Escape', 'Enter', 'Meta', 'A', 'S', 'D', 'F', 'Z', 'X', 'C',
  'V', 'Q', '1', '2', 'F5', 'ArrowUp', 'ArrowLeft', 'Backspace', 'Delete', 'K', 'W', 'Space'];
const br = rng(77);
const burst = BURST_KEYS.map((name, i) => {
  const style = i % 5 === 3 ? 'dark' : i % 7 === 5 ? 'glass' : 'light';
  const el = makeCombo($('mBurst'), [name], { style, color: style === 'glass' ? '#FFFFFF' : '#0A84FF', size: 2.0, plus: false });
  const a = (i / BURST_KEYS.length) * Math.PI * 2 + (br() - 0.5) * 0.22;
  // Улетают за эллипс слогана, чтобы не перекрывать текст
  const edge = 1 / Math.hypot(Math.cos(a) / 760, Math.sin(a) / 330);
  return { el, a, d: edge * (1.02 + br() * 0.55), z: 0.65 + br() * 0.6, rot: (br() - 0.5) * 40, spin: (br() < 0.5 ? -1 : 1) * (90 + br() * 160), ph: br() * 6 };
});
function updateBurst(t) {
  const tau = t - DROP;
  const on = tau >= 0;
  $('mBurst').style.display = on ? '' : 'none';
  if (!on) return;
  const beat = Math.max(...[17, 18, 19].map((b) => decay(t - T(b), 9) * (t >= T(b) ? 1 : 0)), 0);
  for (const q of burst) {
    const go = 1 - Math.exp(-5 * tau);
    const x = CX + Math.cos(q.a) * q.d * go + 12 * Math.sin(t * 0.9 + q.ph);
    const y = CY + Math.sin(q.a) * q.d * go + 10 * Math.cos(t * 0.8 + q.ph);
    const s = q.z * lerp(0.3, 1, spring(tau, 0.45, 0.6)) * (1 + 0.08 * beat);
    place(q.el, x, y, s, q.rot + q.spin * go + 5 * Math.sin(t * 1.1 + q.ph));
    q.el.style.filter = blurOf(q.z < 0.8 ? 2.2 : 0);
  }
}
function updateTag(t) {
  const on = t >= T(16.5) - 0.05;
  $('mTag').style.display = on ? '' : 'none';
  if (!on) return;
  const times = [16.5, 16.75, 17].map(T);
  times.forEach((at, i) => slam(tagWords[i], t - at, 1.4));
  centerLines($('mTag'), tagWords, times, t);
  const beat = Math.max(...[17, 18, 19].map((b) => decay(t - T(b), 8) * (t >= T(b) ? 1 : 0)), 0);
  $('mTag').style.transform = `translateY(-50%) scale(${(1 + 0.03 * beat).toFixed(4)})`;
  $('mBar').style.transform = `scaleX(${easeOutExpo(window01(t, T(17.25), T(17.25) + 0.45)).toFixed(4)})`;
}

function updateMotion(t) {
  // Фон: сетка точек медленно наезжает и поворачивается, на райзере ярче
  const riser = window01(t, T(12), T(14));
  const g = $('mGrid');
  g.style.transform = `scale(${(1 + 0.14 * window01(t, T(6), T(16))).toFixed(4)}) rotate(${lerp(-3, 3, window01(t, T(6), T(16))).toFixed(3)}deg)`;
  g.style.opacity = (t < T(8) ? 0.55 : t < T(14) ? 0.7 + 0.3 * riser : 0.3).toFixed(3);
  $('mGlow').style.opacity = (t < T(8) ? 0.8 : t < T(14) ? 0.5 + 0.5 * riser : 0.25).toFixed(3);
  updateWord(t);
  updateCombos(t);
  updateBreak(t);
  updateFlood(t);
  updateRings(t);
  updateBurst(t);
  updateTag(t);
  updateCursor(t);
  // «Камера»: дрожь на пике райзера и улёт в приложение в конце
  const shake = riser * (t < T(14) ? 1 : 0) * 4;
  const out = easeInExpo(window01(t, T(19.4), T(20)));
  const cam = $('mCam');
  cam.style.transform = `translate(${(shake * Math.sin(t * 91)).toFixed(2)}px, ${(shake * Math.cos(t * 77)).toFixed(2)}px) scale(${(1 + 2.6 * out).toFixed(4)})`;
  cam.style.filter = blurOf(9 * out);
}

const ev = (beat, e) => setTimeout(() => engine.input(e), atMs(T(beat)));
const key2 = (beat, t, name) => ev(beat, { t, kind: 'key', name });

function centerOf(el, dx = 0, dy = 0) {
  const r = el.getBoundingClientRect();
  const o = $('ovRoot').getBoundingClientRect();
  return { x: r.left - o.left + r.width / 2 + dx, y: r.top - o.top + r.height / 2 + dy };
}
$('app').classList.add('on');
const P_REST = centerOf($('cta'), 40, 10);
const P1 = centerOf($('card2'), -20, 10);
const P2 = { x: P1.x + 230, y: P1.y - 170 };
const P_SHAKE = centerOf($('artboard'), 0, -40);
$('app').classList.remove('on');
{
  const cta = $('cta');
  const box = document.createElement('div');
  box.className = 'sel-box';
  box.style.cssText = `left:${cta.offsetLeft - 5}px;top:${cta.offsetTop - 5}px;width:${cta.offsetWidth + 10}px;height:${cta.offsetHeight + 10}px`;
  $('artboard').append(box);
}

// Сочетания на долях (сцена редактора: доли 20–31)
key2(20.25, 'down', 'Ctrl'); key2(20.5, 'down', 'C'); key2(20.75, 'up', 'C'); key2(21.0, 'up', 'Ctrl');
key2(21.5, 'down', 'Ctrl');
for (const b of [21.75, 22.25, 22.75]) { key2(b, 'down', 'V'); key2(b + 0.25, 'up', 'V'); }
key2(23.25, 'up', 'Ctrl');
key2(23.75, 'down', 'Ctrl'); key2(23.9, 'down', 'Alt'); key2(24.05, 'down', 'Shift'); key2(24.25, 'down', 'K');
key2(25.75, 'up', 'K'); key2(25.8, 'up', 'Shift'); key2(25.85, 'up', 'Alt'); key2(25.9, 'up', 'Ctrl');
key2(26.0, 'down', 'Space');
ev(26.25, { t: 'down', kind: 'mouse', name: 1, ...P1 });
ev(26.5, { t: 'drag', kind: 'mouse', name: 1 });
ev(27.75, { t: 'up', kind: 'mouse', name: 1, ...P2 });
key2(28.0, 'up', 'Space');

function pointer(t) {
  const lerpP = (a, b, p) => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });
  if (t < T(25.2)) return P_REST;
  if (t < T(26.25)) return lerpP(P_REST, P1, easeInOut(window01(t, T(25.2), T(26.25))));
  if (t < T(27.7)) return lerpP(P1, P2, easeInOut(window01(t, T(26.5), T(27.6))));
  if (t < T(28.4)) return lerpP(P2, P_SHAKE, easeInOut(window01(t, T(27.8), T(28.4))));
  if (t < T(30.75)) {
    const tau = t - T(28.4);
    const amp = 190 * clamp01(tau / 0.12) * (1 - 0.3 * clamp01((tau - 0.8) / 0.3));
    return { x: P_SHAKE.x + amp * Math.sin(tau * 2 * Math.PI * 3.2), y: P_SHAKE.y + 16 * Math.sin(tau * 2 * Math.PI * 2.3) };
  }
  return P_SHAKE;
}

const PUNCHES = [20.5, 21.75, 22.25, 22.75, 24.25, 26.25, 28.4];
function updateApp(t) {
  const tau = t - SHOT.app[0];
  const enter = spring(tau, 0.55, 0.86);
  let s = lerp(1.22, 1, enter) + 0.05 * clamp01(tau / (SHOT.app[1] - SHOT.app[0]));
  for (const b of PUNCHES) s += 0.022 * decay(t - T(b), 6) * (t >= T(b) ? 1 : 0);
  const blur = 14 * (1 - clamp01(tau / 0.3));
  const inner = $('appInner');
  inner.style.transform = `scale(${s.toFixed(4)})`;
  inner.style.filter = blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : '';
  const p = pointer(t);
  const c = $('cursor');
  c.style.left = p.x + 'px';
  c.style.top = p.y + 'px';
  c.style.opacity = engine.cursor.growLevel > 0.12 ? '0' : '1';
}

// ---------- стили и цвета: по плитке на долю
const tiles = [...document.querySelectorAll('.tile')];
const tileEngines = tiles.map((tile) => {
  const root = document.createElement('div');
  root.className = 'ks-root';
  const stage = document.createElement('div');
  root.append(stage);
  tile.append(root);
  const e = new KeyShowEngine(stage, { root });
  e.setSettings({ ...BASE, keyStyle: tile.dataset.style, keyColor: tile.dataset.color, size: 3.1, position: 'middle-center', maxEntries: 1 });
  return e;
});
for (const name of ['Ctrl', 'Shift', 'S']) {
  setTimeout(() => tileEngines.forEach((e) => e.input({ t: 'down', kind: 'key', name })), atMs(T(28)));
}
function updateStyles(t) {
  const idx = Math.min(tiles.length - 1, Math.floor((t - SHOT.styles[0]) / B));
  tiles.forEach((tile, i) => {
    tile.style.display = i === idx ? 'block' : 'none';
    if (i !== idx) return;
    const tau = t - (SHOT.styles[0] + idx * B);
    const p = easeOutExpo(clamp01(tau / 0.16));
    const dir = idx % 2 ? -1 : 1;
    tile.style.transform = `translateX(${(dir * 9 * (1 - p)).toFixed(2)}%) scale(${(1.06 - 0.06 * p).toFixed(4)})`;
    tile.style.filter = p < 0.99 ? `blur(${(16 * (1 - p)).toFixed(2)}px)` : '';
  });
}

// ---------- языки
const LANG_ORDER = ['ru', 'en', 'be', 'kk', 'ky', 'tt', 'tg', 'uz', 'az', 'hy', 'ro', 'tk'];
const L = window.KeyShowLocales;
function updateLangs(t) {
  const tau = t - SHOT.langs[0];
  const half = B / 2;
  const i = Math.floor(tau / half);
  const word = $('langWord');
  const sub = $('langSub');
  let text;
  let subText;
  let since;
  if (i < LANG_ORDER.length) {
    const loc = L[LANG_ORDER[i]];
    text = loc.strings['master.label'];
    subText = loc.name;
    since = tau - i * half;
  } else {
    text = '12 языков';
    subText = '<b>Автообновление</b> · Русский, English и языки СНГ';
    since = tau - LANG_ORDER.length * half;
  }
  if (word.textContent !== text) word.textContent = text;
  if (sub.innerHTML !== subText) sub.innerHTML = subText;
  const p = easeOutExpo(clamp01(since / 0.2));
  const big = i >= LANG_ORDER.length ? 1.25 : 1;
  word.style.transform = `scale(${(big * (1.14 - 0.14 * p)).toFixed(4)})`;
  word.style.opacity = String(p);
  word.style.filter = p < 0.99 ? `blur(${(10 * (1 - p)).toFixed(2)}px)` : '';
  sub.style.opacity = String(clamp01(since / 0.12));
}

// ---------- финальная плашка
function updateEndText(t) {
  const items = [[$('endTitle'), FINAL + 0.12], [$('endSub'), FINAL + 0.42], [$('endPills'), FINAL + 0.72]];
  for (const [el, at] of items) {
    const p = spring(t - at, 0.6, 0.82);
    el.style.opacity = String(clamp01((t - at) / 0.25));
    el.style.transform = `translateY(${(36 * (1 - p)).toFixed(2)}px)`;
  }
}

// ---------------------------------------------------------------- подписи
const CAPTIONS = [
  { from: T(20.3), to: T(23.6), eyebrow: 'Горячие клавиши', title: 'Любые сочетания' },
  { from: T(23.75), to: T(25.9), eyebrow: 'Любой длины', title: '3, 4 и больше клавиш' },
  { from: T(26.0), to: T(28.3), eyebrow: 'Мышь', title: 'Клики и перетаскивание' },
  { from: T(28.4), to: T(30.95), eyebrow: 'Как на Mac', title: 'Потряси — курсор найдётся' },
  { from: T(31.1), to: T(35.95), eyebrow: 'Стили и цвета', title: 'Под любой ролик' },
];
let capIdx = -1;
function updateCaption(t) {
  const el = $('caption');
  const i = CAPTIONS.findIndex((c) => t >= c.from && t < c.to);
  if (i !== capIdx) {
    capIdx = i;
    el.innerHTML = '';
    if (i >= 0) {
      const c = CAPTIONS[i];
      el.className = c.hero ? 'hero' : '';
      const mk = (cls, text) => {
        const line = document.createElement('div');
        line.className = cls;
        for (const w of text.split(' ')) {
          const mask = document.createElement('span');
          mask.className = 'w-mask';
          const span = document.createElement('span');
          span.className = 'w';
          span.textContent = w;
          mask.append(span);
          line.append(mask, document.createTextNode(' '));
        }
        return line;
      };
      if (c.eyebrow) el.append(mk('eyebrow', c.eyebrow));
      el.append(mk('title', c.title));
    }
  }
  if (i < 0) return;
  const c = CAPTIONS[i];
  [...el.querySelectorAll('.w')].forEach((w, n) => {
    const pin = easeOutExpo(clamp01((t - c.from - n * 0.04) / 0.35));
    const pout = clamp01((t - (c.to - 0.14)) / 0.14);
    w.style.transform = `translateY(${((1 - pin) * 105 - pout * 60).toFixed(2)}%)`;
    w.style.opacity = String(Math.min(pin * 1.4, 1 - pout));
  });
}

// ---------------------------------------------------------------- вспышки и склейки
function updateFlash(t) {
  const f = $('flash');
  let color = '#000';
  let a = 0;
  if (t < 0.35) { a = 1 - clamp01(t / 0.35); color = '#000'; }
  for (const [cut, k] of [[T(6), 0.5], [T(8), 0.35], [DROP, 0.45]]) {
    const ca = k * decay(t - cut, 11);
    if (ca > a) { a = ca; color = '#fff'; }
  }
  if (t >= T(19.6) && t < SHOT.app[0] + 0.35) {
    a = t < SHOT.app[0] ? window01(t, T(19.6), SHOT.app[0]) : 1 - clamp01((t - SHOT.app[0]) / 0.35);
    color = '#0A84FF';
  }
  for (const [cut, k] of [[SHOT.styles[0], 0.75], [SHOT.langs[0], 0.65], [SHOT.end[0], 0.4], [FINAL, 0.9]]) {
    const ca = k * decay(t - cut, 11);
    if (ca > a) { a = ca; color = '#fff'; }
  }
  if (t > DURATION - 0.6) { a = clamp01((t - (DURATION - 0.6)) / 0.5); color = '#000'; }
  f.style.background = color;
  f.style.opacity = a.toFixed(3);
}

// ---------------------------------------------------------------- кадр
function setOn(id, on) { $(id).classList.toggle('on', on); }
const DEBUG = new URLSearchParams(location.search).has('debug');
let debugEl = null;
if (DEBUG) {
  debugEl = document.createElement('div');
  debugEl.style.cssText = 'position:absolute;right:20px;bottom:16px;z-index:99;font:600 28px monospace;color:#0f0;background:#000a;padding:4px 10px';
  $('frame').append(debugEl);
}
let lastPtr = null;
window.__frame = (t, draw = true) => {
  if (debugEl) debugEl.textContent = `t=${t.toFixed(3)} beat=${((t - FIRST) / B).toFixed(2)}`;
  const app = inShot('app', t);
  setOn('app', app);
  setOn('styles', inShot('styles', t));
  setOn('langs', inShot('langs', t));
  setOn('endcard', inShot('end', t));
  setOn('introOv', inShot('intro', t));
  setOn('motion', inShot('motion', t));
  if (inShot('motion', t)) updateMotion(t);
  const gl = inShot('intro', t) || inShot('langs', t) || inShot('end', t);
  $('gl').style.display = gl ? 'block' : 'none';
  $('vignette').classList.toggle('soft', !gl && !(inShot('motion', t) && t < DROP));
  if (gl && draw) render3D(t);
  if (t >= T(24)) {
    const p = pointer(t);
    if (!lastPtr || p.x !== lastPtr.x || p.y !== lastPtr.y) {
      engine.input({ t: 'move', x: p.x, y: p.y });
      lastPtr = p;
    }
  }
  if (app) updateApp(t);
  if (inShot('styles', t)) updateStyles(t);
  if (inShot('langs', t)) updateLangs(t);
  if (inShot('end', t)) updateEndText(t);
  updateCaption(t);
  updateFlash(t);
};

window.__meta = { fps: 60, duration: DURATION, bpm: BPM, musicStart: 0, music: 'keyshow-suno.mp3' };
document.fonts.ready.then(() => { window.__ready = true; });
