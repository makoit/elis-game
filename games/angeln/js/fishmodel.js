import * as THREE from '../../../vendor/three.module.js';
import { FISH } from './data.js';

// Prozedurale 3D-Fische: Körper als Röhre mit gemalter Haut-Textur (Verlauf, artgerechte Muster, Schuppen-Normalmap, nasser Glanz),
// dazu Flossen als flache Formen. Länge des Modells = 1 (Kopf bei +x), mit fish.scale.setScalar(m) auf echte Länge bringen.

// Körperprofil je Form: Radius über t (0 = Schwanz, 1 = Kopf), Höhe/Breite, Kopfspitze
const SHAPES = {
  salmon: { h: 0.115, w: 0.06, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.8) * (0.35 + 0.65 * Math.min(1, t * 1.8)) },
  perch: { h: 0.15, w: 0.065, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.75) * (0.3 + 0.7 * Math.min(1, t * 1.6)), hump: 0.25 },
  pike: { h: 0.08, w: 0.06, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.6) * (0.45 + 0.55 * Math.min(1, t * 2)), snout: 0.5 },
  carp: { h: 0.17, w: 0.08, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.95)), 0.7) * (0.3 + 0.7 * Math.min(1, t * 1.5)), hump: 0.35 },
  flat: { h: 0.36, w: 0.025, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.95)), 0.55) * (0.2 + 0.8 * Math.min(1, t * 2.2)) },
  eel: { h: 0.045, w: 0.04, prof: (t) => 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (t < 0.15 ? t / 0.15 : 1) },
  catfish: { h: 0.085, w: 0.085, prof: (t) => (0.25 + 0.75 * Math.pow(t, 0.6)) * Math.pow(Math.sin(Math.PI * Math.min(0.98, 0.3 + t * 0.7)), 0.4), flatHead: true },
  grayling: { h: 0.12, w: 0.055, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.8) * (0.35 + 0.65 * Math.min(1, t * 1.8)) },
  sturgeon: { h: 0.08, w: 0.08, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.7) * (0.35 + 0.65 * Math.min(1, t * 1.6)), snout: 0.9 },
  shark: { h: 0.11, w: 0.095, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.65) * (0.3 + 0.7 * Math.min(1, t * 1.6)), snout: 0.6 },
  tuna: { h: 0.13, w: 0.095, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 1.15)), 0.75) },
};

const hash = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// Körper als Röhre mit sauberen UVs: u = Länge (0 Schwanz … 1 Maul), v = Umfang (0 Rücken, 0.5 Bauch, 1 Rücken)
function bodyGeometry(sh, look) {
  const NU = 64;
  const NV = 40;
  const pos = [];
  const uv = [];
  const idx = [];
  const slim = look.slim ? 0.82 : 1;
  for (let i = 0; i <= NU; i++) {
    const t = i / NU;
    let p = Math.max(0.025, sh.prof(t));
    if (sh.snout && t > 0.8) p *= 1 - ((t - 0.8) / 0.2) * sh.snout * 0.5;
    // Kopfende rund schließen
    const cap = t > 0.97 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.97) / 0.03, 2))) : 1;
    for (let k = 0; k <= NV; k++) {
      const v = k / NV;
      const a = v * Math.PI * 2;
      const cy = Math.cos(a);
      const cz = Math.sin(a);
      let y = cy * sh.h * p * slim * cap;
      const z = cz * sh.w * p * cap;
      if (sh.hump && cy > 0) y *= 1 + sh.hump * Math.sin(Math.PI * Math.min(1, t * 1.3));
      if (sh.flatHead && cy > 0 && t > 0.6) y *= 1 - (t - 0.6) * 0.9;
      if (cy < 0) y *= 0.92; // Bauch etwas flacher
      let x = t - 0.5;
      if (look.nose && t > 0.92 && cy > -0.2) x += (t - 0.92) * 0.5;
      pos.push(x, y, z);
      uv.push(t, v);
    }
  }
  for (let i = 0; i < NU; i++) {
    for (let k = 0; k < NV; k++) {
      const a = i * (NV + 1) + k;
      const b = a + NV + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Haut-Textur je Art: Farbverlauf Rücken → Flanke → Bauch, artgerechte Muster, Seitenlinie, Kiemendeckel, Schuppen
const skinCache = {};
function skinTextures(fishId, look) {
  if (skinCache[fishId]) return skinCache[fishId];
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const css = (col, a = 1) => { const q = new THREE.Color(col); return `rgba(${q.r * 255 | 0},${q.g * 255 | 0},${q.b * 255 | 0},${a})`; };
  // Grundverlauf (v = 0 Rücken, 0.5 Bauch, 1 Rücken)
  const grad = g.createLinearGradient(0, 0, 0, H);
  const stops = [[0, look.back], [0.06, look.back], [0.16, look.body], [0.3, look.body], [0.4, look.belly], [0.6, look.belly], [0.7, look.body], [0.84, look.body], [0.94, look.back], [1, look.back]];
  for (const [o, col] of stops) grad.addColorStop(o, css(col));
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  // feines Rauschen
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 1 + Math.random() * 3);
  }
  const both = (fn) => { fn(false); fn(true); }; // Muster auf beiden Flanken
  const Y = (v, mirror) => (mirror ? 1 - v : v) * H;
  const rnd = (() => { let s = fishId.length * 7919; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const shape = look.shape;
  if (look.bars != null) {
    // Querbinden (Barsch kräftig, Zander blass)
    const n = fishId === 'barsch' ? 7 : 9;
    both((m) => {
      for (let i = 0; i < n; i++) {
        const u = 0.22 + (i / n) * 0.58;
        g.fillStyle = css(look.bars, fishId === 'barsch' ? 0.7 : 0.35);
        g.beginPath();
        g.moveTo(u * W - 14, Y(0.02, m)); g.lineTo(u * W + 14, Y(0.02, m));
        g.lineTo(u * W + 6 + rnd() * 8, Y(0.33, m)); g.lineTo(u * W - 6, Y(0.35, m));
        g.closePath(); g.fill();
      }
    });
  }
  if (look.spots != null) {
    both((m) => {
      const count = { pike: 160, flat: 70, catfish: 120, salmon: 90, grayling: 25 }[shape] || 80;
      for (let i = 0; i < count; i++) {
        const u = 0.08 + rnd() * 0.82;
        let v = shape === 'flat' ? 0.05 + rnd() * 0.4 : shape === 'grayling' ? 0.18 + rnd() * 0.12 : 0.04 + rnd() * (fishId === 'lachs' ? 0.2 : 0.3);
        if (shape === 'grayling' && u < 0.55) continue;
        const r = shape === 'pike' ? 5 + rnd() * 4 : shape === 'flat' ? 5 + rnd() * 4 : shape === 'catfish' ? 6 + rnd() * 14 : 3 + rnd() * 4;
        if (fishId === 'forelle' && rnd() < 0.45) {
          // rote Punkte mit hellem Hof
          g.fillStyle = 'rgba(245,235,220,0.8)'; g.beginPath(); g.arc(u * W, Y(v + 0.06, m), r + 3, 0, 7); g.fill();
          g.fillStyle = css(0xc0392b, 0.95); g.beginPath(); g.arc(u * W, Y(v + 0.06, m), r, 0, 7); g.fill();
          continue;
        }
        g.fillStyle = css(look.spots, shape === 'catfish' ? 0.45 : 0.85);
        g.beginPath();
        if (shape === 'pike') g.ellipse(u * W, Y(v + 0.05, m), r * 1.8, r * 0.9, 0, 0, 7);
        else if (shape === 'flat') g.ellipse(u * W, Y(v, m), r * 0.9, r * 0.35, 0, 0, 7); // Plattfisch ist hoch gestreckt
        else g.arc(u * W, Y(v, m), r, 0, 7);
        g.fill();
      }
    });
  }
  if (look.waves != null) {
    // Makrele: dunkle Wellenlinien auf dem Rücken
    both((m) => {
      g.strokeStyle = css(look.waves, 0.85); g.lineWidth = 7;
      for (let i = 0; i < 26; i++) {
        const u = 0.12 + i * 0.027;
        g.beginPath(); g.moveTo(u * W, Y(0.01, m));
        g.bezierCurveTo(u * W + 22, Y(0.07, m), u * W - 18, Y(0.12, m), u * W + 8, Y(0.2, m));
        g.stroke();
      }
    });
  }
  if (shape === 'shark') {
    // Kiemenspalten statt Kiemendeckel, keine Seitenlinie
    both((m) => {
      g.strokeStyle = 'rgba(20,30,40,0.45)'; g.lineWidth = 3;
      for (let i = 0; i < 5; i++) { const x = (0.74 + i * 0.022) * W; g.beginPath(); g.moveTo(x, Y(0.17, m)); g.lineTo(x - 4, Y(0.31, m)); g.stroke(); }
    });
  } else both((m) => {
    // Seitenlinie
    g.strokeStyle = 'rgba(30,30,30,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0.12 * W, Y(0.24, m)); g.quadraticCurveTo(0.5 * W, Y(0.22, m), 0.82 * W, Y(0.17, m)); g.stroke();
    // Kiemendeckel
    g.strokeStyle = 'rgba(20,20,20,0.35)'; g.lineWidth = 4;
    g.beginPath(); g.arc(0.8 * W, Y(0.25, m), H * 0.18, -1.2, 1.2); g.stroke();
  });
  // Kopf etwas dunkler, Maulspitze
  const hg = g.createLinearGradient(0.86 * W, 0, W, 0);
  hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = hg; g.fillRect(0.86 * W, 0, 0.14 * W, H);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  // Schuppen-Normalmap (Halbkreis-Reihen), Karpfen grob, Aal/Wels glatt
  const scaleSize = { carp: 26, salmon: 9, perch: 12, pike: 9, grayling: 14, sturgeon: 0, eel: 0, catfish: 0, flat: 6, shark: 0, tuna: 5 }[shape] ?? 10;
  const n = document.createElement('canvas');
  n.width = W; n.height = H;
  const ng = n.getContext('2d');
  ng.fillStyle = 'rgb(128,128,255)'; ng.fillRect(0, 0, W, H);
  if (scaleSize) {
    const sx = scaleSize * 1.6;
    const sy = scaleSize;
    for (let row = 0; row * sy < H + sy; row++) {
      for (let col = 0; col * sx < W * 0.84; col++) {
        const x = col * sx + (row % 2) * sx * 0.5;
        const y = row * sy;
        const gr = ng.createRadialGradient(x, y, 0, x, y, sy * 1.05);
        gr.addColorStop(0, 'rgb(150,128,255)'); gr.addColorStop(0.75, 'rgb(128,128,255)'); gr.addColorStop(1, 'rgb(90,128,230)');
        ng.fillStyle = gr;
        ng.beginPath(); ng.arc(x, y, sy * 1.05, -Math.PI / 2, Math.PI / 2); ng.fill();
      }
    }
  }
  const normal = new THREE.CanvasTexture(n);
  skinCache[fishId] = { map, normal };
  return skinCache[fishId];
}

// Flossen: halbtransparent mit Flossenstrahlen
let finTex = null;
function finTexture() {
  if (finTex) return finTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
  for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(i * 9 + 4, 128); g.lineTo(i * 9 + 4 + (i - 7) * 1.5, 0); g.stroke(); }
  finTex = new THREE.CanvasTexture(c);
  finTex.wrapS = finTex.wrapT = THREE.RepeatWrapping;
  finTex.repeat.set(6, 6);
  return finTex;
}

function finShape(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

export function createFish(fishId) {
  const f = FISH[fishId];
  const look = f.look;
  const sh = SHAPES[look.shape] || SHAPES.salmon;
  const g = new THREE.Group();
  g.name = 'fish-' + fishId;

  const skin = skinTextures(fishId, look);
  const silver = ['salmon', 'grayling', 'sturgeon', 'tuna'].includes(look.shape) || fishId === 'doebel' || fishId === 'nase';
  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: skin.map, normalMap: skin.normal, normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.4, metalness: silver ? 0.15 : 0.0, clearcoat: 0.8, clearcoatRoughness: 0.2, // nass glänzende Haut
    iridescence: silver ? 0.25 : 0.05, iridescenceIOR: 1.6, side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(bodyGeometry(sh, look), bodyMat);
  body.castShadow = true;
  g.add(body);

  const finMat = new THREE.MeshStandardMaterial({
    color: look.fin, map: finTexture(), roughness: 0.45, side: THREE.DoubleSide, transparent: true, opacity: 0.82, depthWrite: false,
  });
  const H = sh.h * (look.slim ? 0.82 : 1);

  // Schwanzflosse
  const tailH = look.shape === 'eel' ? H * 1.2 : look.shape === 'flat' ? H * 0.5 : H * 1.25;
  const tail = new THREE.Mesh(
    look.shape === 'sturgeon'
      ? finShape([[0, 0], [-0.16, tailH * 1.3], [-0.12, 0], [-0.1, -tailH * 0.5]])
      : look.shape === 'shark' // oberer Lappen lang (heterozerk)
        ? finShape([[0.03, 0], [-0.2, tailH * 2.1], [-0.15, tailH * 1.7], [-0.05, 0], [-0.1, -tailH * 0.9], [-0.04, -tailH * 0.2]])
        : look.shape === 'tuna' // Sichelschwanz
          ? finShape([[0.02, 0], [-0.04, tailH * 0.5], [-0.14, tailH * 1.7], [-0.09, tailH * 0.5], [-0.07, 0], [-0.09, -tailH * 0.5], [-0.14, -tailH * 1.7], [-0.04, -tailH * 0.5]])
          : finShape([[0.02, 0], [-0.12, tailH], [-0.08, 0], [-0.12, -tailH]]),
    finMat,
  );
  tail.position.x = -0.48;
  g.add(tail);
  g.userData.tail = tail;

  // Rückenflosse(n)
  if (look.shape === 'eel') {
    const pts = [];
    for (let i = 0; i <= 20; i++) pts.push([0.15 - i * 0.032, H * 0.6 + Math.sin(i / 20 * Math.PI) * H * 0.35]);
    for (let i = 20; i >= 0; i--) pts.push([0.15 - i * 0.032, H * 0.55]);
    g.add(new THREE.Mesh(finShape(pts), finMat));
  } else if (look.shape === 'grayling') {
    const d = new THREE.Mesh(finShape([[0.2, H * 0.85], [0.12, H * 2.4], [-0.15, H * 2.0], [-0.2, H * 0.7]]), finMat.clone());
    d.material.color.set(look.fin); d.material.emissive = new THREE.Color(0x3a1a5a);
    g.add(d);
  } else if (look.shape === 'perch') {
    // zwei Rückenflossen, die vordere stachelig mit dunklem Fleck
    const spikes = [[0.24, H * 0.95]];
    for (let i = 0; i < 7; i++) spikes.push([0.22 - i * 0.03, H * (1.8 - (i % 2) * 0.35)]);
    spikes.push([0.0, H * 1.0]);
    g.add(new THREE.Mesh(finShape(spikes), finMat));
    g.add(new THREE.Mesh(finShape([[-0.02, H * 1.0], [-0.06, H * 1.6], [-0.2, H * 1.3], [-0.24, H * 0.75]]), finMat));
  } else if (look.shape === 'pike') {
    g.add(new THREE.Mesh(finShape([[-0.18, H * 0.85], [-0.24, H * 1.55], [-0.38, H * 0.9]]), finMat));
  } else if (look.shape === 'catfish') {
    g.add(new THREE.Mesh(finShape([[0.18, H * 0.9], [0.14, H * 1.4], [0.1, H * 0.9]]), finMat));
  } else if (look.shape === 'shark') {
    g.add(new THREE.Mesh(finShape([[0.14, H * 0.8], [0.0, H * 2.5], [-0.05, H * 2.3], [-0.07, H * 0.8]]), finMat));
    g.add(new THREE.Mesh(finShape([[-0.28, H * 0.55], [-0.32, H * 1.1], [-0.35, H * 0.5]]), finMat));
    g.add(new THREE.Mesh(finShape([[-0.26, -H * 0.55], [-0.31, -H * 1.0], [-0.34, -H * 0.5]]), finMat));
  } else if (look.shape === 'tuna') {
    g.add(new THREE.Mesh(finShape([[0.12, H * 0.85], [0.06, H * 1.9], [-0.02, H * 1.15], [-0.05, H * 0.85]]), finMat));
    const yellow = finMat.clone();
    yellow.color.set(look.finlets ?? look.fin);
    g.add(new THREE.Mesh(finShape([[-0.1, H * 0.75], [-0.13, H * 1.9], [-0.2, H * 0.6]]), yellow)); // zweite Rücken- und Afterflosse
    g.add(new THREE.Mesh(finShape([[-0.1, -H * 0.75], [-0.13, -H * 1.9], [-0.2, -H * 0.6]]), yellow));
    for (let i = 0; i < 6; i++) { // Flösschen vor dem Schwanz
      const x = -0.24 - i * 0.035;
      const r = H * Math.max(0.12, sh.prof(x + 0.5));
      for (const sg of [1, -1]) g.add(new THREE.Mesh(finShape([[x + 0.012, sg * r * 0.9], [x - 0.01, sg * (r * 0.9 + H * 0.22)], [x - 0.016, sg * r * 0.9]]), yellow));
    }
  } else if (look.shape === 'flat') {
    // Saumflossen rundherum
    const pts = [];
    for (let i = 0; i <= 24; i++) { const a = 0.15 + (i / 24) * 0.7; pts.push([0.42 - a * 0.85, H * Math.sin(Math.PI * a) * 1.12]); }
    g.add(new THREE.Mesh(finShape(pts.concat(pts.slice().reverse().map(([x, y]) => [x, y * 0.6]))), finMat));
    const pb = pts.map(([x, y]) => [x, -y]);
    g.add(new THREE.Mesh(finShape(pb.concat(pb.slice().reverse().map(([x, y]) => [x, y * 0.6]))), finMat));
  } else {
    g.add(new THREE.Mesh(finShape([[0.12, H * 0.9], [0.05, H * 1.75], [-0.1, H * 1.4], [-0.12, H * 0.85]]), finMat));
    if (look.shape === 'salmon') g.add(new THREE.Mesh(finShape([[-0.3, H * 0.6], [-0.33, H * 0.95], [-0.37, H * 0.55]]), finMat)); // Fettflosse
  }

  // Brust- und Bauchflossen
  if (look.shape !== 'flat') {
    for (const side of [1, -1]) {
      const big = look.shape === 'shark' ? 2.6 : look.shape === 'tuna' ? 1.8 : 1; // Haie: lange Brustflossen wie Flügel
      const pec = new THREE.Mesh(finShape([[0, 0], [-0.1 * big, -H * 0.5 * big], [-0.05 * big, -H * 0.1]]), finMat);
      pec.position.set(0.28 - (big - 1) * 0.04, -H * 0.35, side * sh.w * 0.75);
      pec.rotation.y = side * 0.5;
      g.add(pec);
    }
    g.add(new THREE.Mesh(finShape([[-0.05, -H * 0.8], [-0.12, -H * 1.35], [-0.2, -H * 0.7]]), finMat));
  }

  // Augen
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: look.eye || 0xc8a040, roughness: 0.25, metalness: 0.4, clearcoat: 1 });
  const pupilMat = new THREE.MeshPhysicalMaterial({ color: 0x020202, roughness: 0.02, clearcoat: 1 });
  const eyeR = look.shape === 'catfish' ? 0.008 : look.shape === 'eel' ? 0.01 : look.shape === 'shark' ? 0.009 : look.shape === 'zander' ? 0.02 : 0.016;
  const eyeX = look.shape === 'pike' || look.shape === 'sturgeon' ? 0.4 : look.shape === 'shark' ? 0.38 : 0.42;
  for (const side of look.shape === 'flat' ? [1] : [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR * (look.shape === 'flat' ? 1.4 : 1), 12, 8), eyeMat);
    const ey = look.shape === 'flat' ? 0.06 : H * 0.28;
    const ez = look.shape === 'flat' ? sh.w * 0.6 : side * sh.w * 0.55;
    eye.position.set(eyeX, ey, ez);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.6, 10, 6), pupilMat);
    pupil.position.set(eyeX + eyeR * 0.15, ey, ez + Math.sign(ez || 1) * eyeR * 0.55);
    g.add(pupil);
    if (look.shape === 'flat') {
      const e2 = eye.clone(); e2.position.set(eyeX - 0.06, ey + 0.05, ez); g.add(e2);
      const p2 = pupil.clone(); p2.position.set(eyeX - 0.06 + eyeR * 0.15, ey + 0.05, ez + eyeR * 0.55); g.add(p2);
    }
  }

  // Barteln (Wels, Karpfen, Stör)
  if (look.shape === 'catfish' || fishId === 'karpfen' || look.shape === 'sturgeon') {
    const barbMat = new THREE.MeshStandardMaterial({ color: look.back, roughness: 0.7 });
    const n = look.shape === 'catfish' ? 2 : look.shape === 'sturgeon' ? 4 : 2;
    const len = look.shape === 'catfish' ? 0.22 : 0.04;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.47, -H * 0.1, side * 0.02),
        new THREE.Vector3(0.47 + len * 0.3, -H * 0.3, side * (0.03 + len * 0.3)),
        new THREE.Vector3(0.47 + len * 0.2, -H * 0.8, side * (0.04 + len * 0.7)),
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.004, 4), barbMat));
    }
  }
  // Knochenplatten (Stör)
  if (look.shape === 'sturgeon') {
    const plateMat = new THREE.MeshStandardMaterial({ color: look.plates, roughness: 0.5 });
    for (let i = 0; i < 12; i++) {
      const t = 0.15 + i * 0.06;
      const p = sh.prof(t);
      for (const [yy, zz] of [[H * p * 0.98, 0], [0, sh.w * p], [0, -sh.w * p]]) {
        const pl = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.016, 5), plateMat);
        pl.position.set(t - 0.5, yy, zz);
        if (zz) pl.rotation.x = Math.sign(zz) * Math.PI / 2;
        g.add(pl);
      }
    }
  }
  // Saibling: weiße Flossensäume
  if (look.finEdge) {
    const edge = new THREE.MeshBasicMaterial({ color: look.finEdge, side: THREE.DoubleSide });
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(finShape([[0.28, -H * 0.36], [0.27, -H * 0.42], [0.2, -H * 0.84], [0.19, -H * 0.78]]), edge);
      m.position.z = side * sh.w * 0.8;
      g.add(m);
    }
  }
  return g;
}

// Schwimmbewegung (Schwanzschlag) – im Loop aufrufen
export function animateFish(fish, t, speed = 1) {
  const tail = fish.userData.tail;
  if (tail) tail.rotation.y = Math.sin(t * 9 * speed) * 0.45;
  fish.children[0].rotation.y = Math.sin(t * 9 * speed + 1) * 0.06;
}
