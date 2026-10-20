// Промо-ролик KeyShow (~20 с, 1920×1080). Всё — функции от времени t, синхронизированные с битом трека.
// Трек: «Uplifting Bass» (Lily J, Mixkit), 134 BPM, отрезок с 10,761 с — дроп приходится на 8-ю долю.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W = 1920;
const H = 1080;
const BPM = 134;
const B = 60 / BPM;              // одна доля, ~0,448 с
const at = (beat) => beat * B;
const DURATION = 20;
const DROP = at(8);

const SHOT = {
  intro: [0, at(12)],
  app: [at(12), at(28)],
  styles: [at(28), at(32)],
  langs: [at(32), at(40)],
  end: [at(40), DURATION + 1],
};
const inShot = (name, t) => t >= SHOT[name][0] && t < SHOT[name][1];

// ---------------------------------------------------------------- математика
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, p) => a + (b - a) * p;
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const easeInExpo = (p) => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10));
const decay = (tau, k) => (tau < 0 ? 0 : Math.exp(-k * tau));
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
// Быстрое нажатие: вниз за 50 мс, затем плавно вверх.
const pressCurve = (tau) => (tau < 0 ? 0 : tau < 0.05 ? tau / 0.05 : Math.exp(-(tau - 0.05) * 9));

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- 3D: сцена
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060b);
scene.fog = new THREE.FogExp2(0x05060b, 0.045);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.38;

const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 200);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.7, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

scene.add(new THREE.AmbientLight(0xffffff, 0.12));
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(4, 8, 6);
scene.add(key);
const rimBlue = new THREE.PointLight(0x2a7bff, 40, 24, 2);
rimBlue.position.set(-5, 2.2, 3);
scene.add(rimBlue);
const rimViolet = new THREE.PointLight(0x8a4dff, 30, 24, 2);
rimViolet.position.set(5, 1.6, -2.5);
scene.add(rimViolet);

// Пол с едва заметной сеткой
function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(90,150,255,0.6)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(48, 48);
  return tex;
}
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(96, 96),
  new THREE.MeshStandardMaterial({ color: 0x07080d, roughness: 0.38, metalness: 0.7, emissive: 0xffffff, emissiveMap: gridTexture(), emissiveIntensity: 0.22 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.235;
scene.add(floor);

// Клавиши
const legendCache = new Map();
function legendTexture(text, color) {
  const id = text + color;
  if (legendCache.has(id)) return legendCache.get(id);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.font = `700 ${text.length > 1 ? 180 : 330}px "Segoe UI Variable Display", "Segoe UI", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 270);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  legendCache.set(id, tex);
  return tex;
}
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
    const lm = new THREE.MeshBasicMaterial({ map: legendTexture(letter, legend), transparent: true, toneMapped: false, depthWrite: false });
    const lg = new THREE.Mesh(legendGeo, lm);
    lg.rotation.x = -Math.PI / 2;
    lg.position.y = 0.224;
    g.add(lg);
  }
  g.userData.mat = mat;
  return g;
}

// ---------- Шот 1: интро «KEYSHOW»
const introGroup = new THREE.Group();
scene.add(introGroup);
const WORD = 'KEYSHOW';
const keys = WORD.split('').map((ch, i) => {
  const k = makeKey(ch);
  k.position.x = (i - 3) * 1.22;
  introGroup.add(k);
  return k;
});
const landT = (i) => at(i + 1);
const FALL = 0.36;

// Кольца-волны на полу
const ringGeo = new THREE.RingGeometry(0.9, 1, 128);
const rings = [];
function addRing(t0, x, z, max, dur, color = 0x5aa8ff) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const r = new THREE.Mesh(ringGeo, m);
  r.rotation.x = -Math.PI / 2;
  r.position.set(x, -0.225, z);
  introGroup.add(r);
  rings.push({ r, t0, max, dur });
}
keys.forEach((k, i) => addRing(landT(i), k.position.x, 0, 2.2, 0.8));
addRing(DROP, 0, 0, 16, 1.5, 0x7fbaff);
addRing(DROP + 0.08, 0, 0, 10, 1.2, 0x9a6bff);

// Частицы дропа
const PCOUNT = 360;
const parts = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.07, 0.07, 0.07),
  new THREE.MeshBasicMaterial({ color: 0xa8d4ff, toneMapped: false }),
  PCOUNT,
);
introGroup.add(parts);
const pr = rng(7);
const pData = Array.from({ length: PCOUNT }, () => ({
  x: (Math.floor(pr() * 7) - 3) * 1.22 + (pr() - 0.5) * 0.8,
  z: (pr() - 0.5) * 0.8,
  vx: (pr() - 0.5) * 8,
  vy: 2.5 + pr() * 6.5,
  vz: (pr() - 0.5) * 6 + 1.4,
  s: 0.5 + pr() * 1.3,
  life: 0.9 + pr() * 1.1,
  rx: pr() * 9,
  ry: pr() * 9,
}));
const dummy = new THREE.Object3D();

function pumpDepth(t, i) {
  // Дроп: нажимаются все клавиши; дальше — «качаем» по долям через одну.
  let d = 0.18 * pressCurve(t - DROP);
  let g = 2.4 * decay(t - DROP, 3.5);
  for (const b of [9, 10, 11]) {
    if ((i + b) % 2 === 0) {
      d += 0.1 * pressCurve(t - at(b));
      g += 0.9 * decay(t - at(b), 5);
    }
  }
  return { d, g };
}

function updateIntro(t) {
  keys.forEach((k, i) => {
    const tau = t - landT(i);
    let y = 6;
    let rx = 0;
    let rz = 0;
    let sy = 1;
    let sxz = 1;
    k.visible = tau >= -FALL;
    if (tau < 0) {
      const p = 1 + tau / FALL;
      y = 5.5 * (1 - p * p);
      rx = (1 - p) * 1.3;
      rz = (1 - p) * (i % 2 ? 0.5 : -0.5);
    } else {
      y = 0.2 * Math.exp(-7 * tau) * Math.abs(Math.sin(13 * tau));
      const sq = Math.exp(-13 * tau);
      sy = 1 - 0.2 * sq;
      sxz = 1 + 0.08 * sq;
    }
    const { d, g } = pumpDepth(t, i);
    k.position.y = y - d;
    k.rotation.set(rx, 0, rz);
    k.scale.set(sxz, sy, sxz);
    k.userData.mat.emissiveIntensity = (tau >= 0 ? 1.3 * decay(tau, 5) : 0) + g * 0.6 + 0.06 * clamp01((t - at(6)) / (DROP - at(6)));
  });
  for (const { r, t0, max, dur } of rings) {
    const p = (t - t0) / dur;
    r.visible = p >= 0 && p < 1;
    if (!r.visible) continue;
    const s = lerp(0.4, max, easeOutExpo(p));
    r.scale.set(s, s, s);
    r.material.opacity = 0.95 * (1 - p) * (1 - p);
  }
  const tau = t - DROP;
  pData.forEach((q, i) => {
    if (tau < 0 || tau > q.life) {
      dummy.scale.setScalar(0);
    } else {
      dummy.position.set(q.x + q.vx * tau, 0.2 + q.vy * tau - 4.9 * tau * tau, q.z + q.vz * tau);
      dummy.rotation.set(q.rx * tau, q.ry * tau, 0);
      dummy.scale.setScalar(q.s * (1 - tau / q.life));
    }
    dummy.updateMatrix();
    parts.setMatrixAt(i, dummy.matrix);
  });
  parts.instanceMatrix.needsUpdate = true;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
function introCamera(t) {
  const look = new THREE.Vector3(0, 0.1, 0);
  const pos = new THREE.Vector3();
  const orbitPos = (p) => {
    const ang = lerp(0, 0.34, p);
    const r = lerp(8.2, 6.4, easeInOut(p));
    return new THREE.Vector3(Math.sin(ang) * r, lerp(2.3, 3.5, p), Math.cos(ang) * r);
  };
  if (t < DROP) {
    const p = easeInOut(clamp01(t / DROP));
    pos.set(lerp(-5.8, 0, p), lerp(0.85, 2.3, p), lerp(5.4, 8.2, p));
    look.set(lerp(-1.8, 0, p), 0.1, 0);
  } else if (t < at(11.5)) {
    pos.copy(orbitPos(clamp01((t - DROP) / (at(11.5) - DROP))));
  } else {
    // Влетаем в клавишу «K»
    const p = easeInExpo(clamp01((t - at(11.5)) / (at(12) - at(11.5))));
    tmpA.copy(orbitPos(1));
    tmpB.set(keys[0].position.x, 0.9, 0.35);
    pos.lerpVectors(tmpA, tmpB, p);
    look.set(lerp(0, keys[0].position.x, p), lerp(0.1, 0.22, p), 0);
  }
  // Встряска на дропе
  const k = decay(t - DROP, 5.5);
  pos.x += 0.14 * k * Math.sin((t - DROP) * 57);
  pos.y += 0.1 * k * Math.sin((t - DROP) * 43 + 1);
  camera.position.copy(pos);
  camera.lookAt(look);
  const punch = t >= DROP ? Math.exp(-5 * (t - DROP)) * (1 - Math.exp(-45 * (t - DROP))) : 0;
  camera.fov = 38 - 6 * punch;
  camera.updateProjectionMatrix();
  bloom.strength = 0.65 + 2.1 * decay(t - DROP, 3.2) + 0.35 * clamp01((t - at(6)) / (DROP - at(6)));
}

// ---------- Шот 4: поле летящих клавиш (фон для языков)
const fieldGroup = new THREE.Group();
scene.add(fieldGroup);
const fr = rng(42);
const FIELD_LETTERS = ['K', 'E', 'Y', 'S', 'H', 'O', 'W', 'Ctrl', 'Alt', 'Shift', 'Z', 'C', 'V'];
const field = Array.from({ length: 54 }, (_, i) => {
  const letter = FIELD_LETTERS[i % FIELD_LETTERS.length];
  const wide = letter.length > 1;
  const color = [0x0a84ff, 0x0a84ff, 0x0a84ff, 0x5e5ce6, 0x1c1c1e][Math.floor(fr() * 5)];
  const k = makeKey(letter, { color, w: wide ? 1.7 : 1 });
  const data = {
    k,
    x: (fr() - 0.5) * 22,
    y: (fr() - 0.5) * 11,
    z0: -42 + fr() * 46,
    speed: 7 + fr() * 6,
    rx: fr() * 6, ry: fr() * 6, vr: (fr() - 0.5) * 1.6,
  };
  fieldGroup.add(k);
  return data;
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
  // Каждая половина доли — вспышка «на смене языка»
  const half = B / 2;
  const since = (tau % half + half) % half;
  bloom.strength = 0.9 + 0.8 * decay(since, 8);
  camera.position.set(Math.sin(tau * 0.6) * 0.6, Math.cos(tau * 0.5) * 0.3, 9);
  camera.lookAt(0, 0, -4);
  camera.fov = 52;
  camera.updateProjectionMatrix();
}

// ---------- Шот 5: 3D-иконка приложения
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
iconGroup.rotation.x = Math.PI / 2;
const sparkle = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.04), new THREE.MeshBasicMaterial({ color: 0xbfe0ff, toneMapped: false }), 90);
scene.add(sparkle);
const sr = rng(99);
const sData = Array.from({ length: 90 }, () => ({ a: sr() * Math.PI * 2, r: 2.4 + sr() * 4.5, y: (sr() - 0.5) * 5, s: 0.6 + sr() * 1.6, sp: 0.2 + sr() * 0.5, ph: sr() * 6 }));
function updateEnd(t) {
  const tau = t - SHOT.end[0];
  const sp = spring(tau, 0.9, 0.72);
  iconGroup.position.set(0, 1.35 + 0.08 * Math.sin(tau * 2.2), 0);
  iconGroup.rotation.set(Math.PI / 2 + 0.12 * Math.sin(tau * 1.4) - 0.1, lerp(-2.6, 0, sp) + 0.08 * Math.sin(tau * 1.7), 0);
  iconGroup.scale.setScalar(lerp(0.25, 1, sp));
  iconBase.material.emissiveIntensity = 0.05 + 0.35 * decay(tau, 3);
  sData.forEach((q, i) => {
    const a = q.a + tau * q.sp;
    dummy.position.set(Math.cos(a) * q.r, q.y + 1.2, Math.sin(a) * q.r - 2);
    dummy.rotation.set(tau * 2 + q.ph, tau * 3, 0);
    dummy.scale.setScalar(q.s * clamp01(tau / 0.5) * (0.6 + 0.4 * Math.sin(tau * 5 + q.ph)));
    dummy.updateMatrix();
    sparkle.setMatrixAt(i, dummy.matrix);
  });
  sparkle.instanceMatrix.needsUpdate = true;
  camera.position.set(0, 0.6, 10.5);
  camera.lookAt(0, 0.4, 0);
  camera.fov = 38;
  camera.updateProjectionMatrix();
  bloom.strength = 0.35 + 0.7 * decay(tau, 3);
  bloom.threshold = 0.92;
}

function render3D(t) {
  const intro = inShot('intro', t);
  const langs = inShot('langs', t);
  const end = inShot('end', t);
  introGroup.visible = intro;
  floor.visible = intro;
  fieldGroup.visible = langs;
  iconGroup.visible = end;
  sparkle.visible = end;
  scene.fog.density = langs ? 0.035 : end ? 0.02 : 0.045;
  bloom.threshold = 0.82;
  renderer.toneMappingExposure = end ? 0.92 : 1.05;
  if (intro) { updateIntro(t); introCamera(t); }
  if (langs) updateField(t);
  if (end) updateEnd(t);
  composer.render();
}

// ---------------------------------------------------------------- 2D: настоящий движок KeyShow
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

const ev = (beat, e) => setTimeout(() => engine.input(e), Math.round(at(beat) * 1000));
const key2 = (beat, t, name) => ev(beat, { t, kind: 'key', name });

// Точки для мыши — по реальной разметке
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

// Выделение кнопки на макете
{
  const cta = $('cta');
  const box = document.createElement('div');
  box.className = 'sel-box';
  box.style.cssText = `left:${cta.offsetLeft - 5}px;top:${cta.offsetTop - 5}px;width:${cta.offsetWidth + 10}px;height:${cta.offsetHeight + 10}px`;
  $('artboard').append(box);
}

// Сочетания на долях
key2(12.25, 'down', 'Ctrl'); key2(12.75, 'down', 'C'); key2(13.0, 'up', 'C'); key2(13.25, 'up', 'Ctrl');
key2(14.0, 'down', 'Ctrl');
for (const b of [14.25, 14.75, 15.25]) { key2(b, 'down', 'V'); key2(b + 0.25, 'up', 'V'); }
key2(15.75, 'up', 'Ctrl');
key2(16.5, 'down', 'Ctrl'); key2(16.75, 'down', 'Alt'); key2(17.0, 'down', 'Shift'); key2(17.5, 'down', 'K');
key2(19.5, 'up', 'K'); key2(19.6, 'up', 'Shift'); key2(19.7, 'up', 'Alt'); key2(19.8, 'up', 'Ctrl');
key2(20.0, 'down', 'Space');
ev(20.5, { t: 'down', kind: 'mouse', name: 1, ...P1 });
ev(20.8, { t: 'drag', kind: 'mouse', name: 1 });
ev(22.75, { t: 'up', kind: 'mouse', name: 1, ...P2 });
key2(23.0, 'up', 'Space');

// Путь курсора
function pointer(t) {
  const lerpP = (a, b, p) => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });
  if (t < at(19.2)) return P_REST;
  if (t < at(20.5)) return lerpP(P_REST, P1, easeInOut(clamp01((t - at(19.2)) / (at(20.5) - at(19.2)))));
  if (t < at(22.6)) return lerpP(P1, P2, easeInOut(clamp01((t - at(20.8)) / (at(22.5) - at(20.8)))));
  if (t < at(24)) return lerpP(P2, P_SHAKE, easeInOut(clamp01((t - at(23)) / (at(24) - at(23)))));
  if (t < at(27)) {
    const tau = t - at(24);
    const amp = 190 * clamp01(tau / 0.15) * (1 - 0.3 * clamp01((tau - 1.0) / 0.4));
    return { x: P_SHAKE.x + amp * Math.sin(tau * 2 * Math.PI * 3.1), y: P_SHAKE.y + 16 * Math.sin(tau * 2 * Math.PI * 2.3) };
  }
  return P_SHAKE;
}

// Камера «записи экрана»: въезд и толчки на нажатиях
const PUNCHES = [12.75, 14.25, 14.75, 15.25, 17.5, 20.5, 24];
function updateApp(t) {
  const tau = t - SHOT.app[0];
  const enter = spring(tau, 0.55, 0.86);
  let s = lerp(1.22, 1, enter) + 0.05 * clamp01(tau / (SHOT.app[1] - SHOT.app[0]));
  for (const b of PUNCHES) s += 0.022 * decay(t - at(b), 6) * (t >= at(b) ? 1 : 0);
  const blur = 14 * (1 - clamp01(tau / 0.3));
  const inner = $('appInner');
  inner.style.transform = `scale(${s.toFixed(4)})`;
  inner.style.filter = blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : '';
  const p = pointer(t);
  const c = $('cursor');
  c.style.left = p.x + 'px';
  c.style.top = p.y + 'px';
  // Пока виден увеличенный курсор, маленький прячем — так кадр чище
  c.style.opacity = engine.cursor.growLevel > 0.12 ? '0' : '1';
}

// ---------- Шот 3: стили и цвета
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
  setTimeout(() => tileEngines.forEach((e) => e.input({ t: 'down', kind: 'key', name })), Math.round(at(26.5) * 1000));
}
function updateStyles(t) {
  const idx = Math.min(3, Math.floor((t - SHOT.styles[0]) / B));
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

// ---------- Шот 4: языки
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

// ---------- Шот 5: финальная плашка
function updateEndText(t) {
  const items = [[$('endTitle'), 40.6], [$('endSub'), 41.2], [$('endPills'), 41.8]];
  for (const [el, b] of items) {
    const p = spring(t - at(b), 0.6, 0.82);
    el.style.opacity = String(clamp01((t - at(b)) / 0.25));
    el.style.transform = `translateY(${(36 * (1 - p)).toFixed(2)}px)`;
  }
}

// ---------------------------------------------------------------- подписи
const CAPTIONS = [
  { from: at(8.5), to: at(11.4), eyebrow: '', title: 'Каждое нажатие — на экране', hero: true },
  { from: at(12.4), to: at(16.35), eyebrow: 'Горячие клавиши', title: 'Видно каждое сочетание' },
  { from: at(16.5), to: at(19.9), eyebrow: 'Любой длины', title: '3, 4 и больше клавиш' },
  { from: at(20.0), to: at(23.9), eyebrow: 'Мышь', title: 'Клики и перетаскивание' },
  { from: at(24.0), to: at(27.9), eyebrow: 'Как на Mac', title: 'Потряси — курсор найдётся' },
  { from: at(28.0), to: at(31.95), eyebrow: 'Стили и цвета', title: 'Под любой ролик' },
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
  const words = [...el.querySelectorAll('.w')];
  words.forEach((w, n) => {
    const pin = easeOutExpo(clamp01((t - c.from - n * 0.045) / 0.4));
    const pout = clamp01((t - (c.to - 0.16)) / 0.16);
    const y = (1 - pin) * 105 - pout * 60;
    w.style.transform = `translateY(${y.toFixed(2)}%)`;
    w.style.opacity = String(Math.min(pin * 1.4, 1 - pout));
  });
}

// ---------------------------------------------------------------- вспышки и склейки
function updateFlash(t) {
  const f = $('flash');
  let color = '#000';
  let a = 0;
  if (t < 0.5) { a = 1 - clamp01(t / 0.5); color = '#000'; }
  const dropA = 0.85 * decay(t - DROP, 9);
  if (dropA > a) { a = dropA; color = '#fff'; }
  if (t >= at(11.6) && t < SHOT.app[0] + 0.35) {
    const p = t < SHOT.app[0] ? clamp01((t - at(11.6)) / (SHOT.app[0] - at(11.6))) : 1 - clamp01((t - SHOT.app[0]) / 0.35);
    a = p; color = '#0A84FF';
  }
  for (const cut of [SHOT.styles[0], SHOT.langs[0], SHOT.end[0]]) {
    const ca = 0.7 * decay(t - cut, 12);
    if (ca > a) { a = ca; color = '#fff'; }
  }
  if (t > DURATION - 0.6) { a = clamp01((t - (DURATION - 0.6)) / 0.5); color = '#000'; }
  f.style.background = color;
  f.style.opacity = a.toFixed(3);
}

// ---------------------------------------------------------------- кадр
function setOn(id, on) { $(id).classList.toggle('on', on); }
let lastPtr = null;
const DEBUG = new URLSearchParams(location.search).has('debug');
let debugEl = null;
if (DEBUG) {
  debugEl = document.createElement('div');
  debugEl.style.cssText = 'position:absolute;right:20px;bottom:16px;z-index:99;font:600 28px monospace;color:#0f0;background:#000a;padding:4px 10px';
  $('frame').append(debugEl);
}
window.__frame = (t, draw = true) => {
  if (debugEl) {
    const c = engine.cursor;
    debugEl.textContent = `t=${t.toFixed(3)} beat=${(t / B).toFixed(2)} grow=${c.growLevel.toFixed(2)}/${c.growTarget.toFixed(2)} halo=${c.haloLevel.toFixed(2)} rev=${c.reversals.length} big=${!!c.big}`;
  }
  const app = inShot('app', t);
  setOn('app', app);
  setOn('styles', inShot('styles', t));
  setOn('langs', inShot('langs', t));
  setOn('endcard', inShot('end', t));
  const gl = inShot('intro', t) || inShot('langs', t) || inShot('end', t);
  $('gl').style.display = gl ? 'block' : 'none';
  $('vignette').classList.toggle('soft', !gl);
  if (gl && draw) render3D(t);
  // Мышь шлём движку и до показа сцены, чтобы детектор встряхивания был в курсе
  if (t >= at(18)) {
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

window.__meta = { fps: 60, duration: DURATION, bpm: BPM, musicStart: 10.761 };
document.fonts.ready.then(() => { window.__ready = true; });
