import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TIRE_WALL_COLORS } from './bikedata.js';

// Prozedurales, detailliertes Fahrradmodell mit Fahrer. Alle statischen Teile werden je Material zu EINEM Mesh
// zusammengefasst (wenige Draw-Calls, wichtig fürs Tablet). Nur Räder, Kurbel und Beine bewegen sich.
// Koordinaten: y oben, vorn = -z, Raddachse entlang x. Einheit Meter.
//
// Der Fahrer besteht aus "Lofts": glatten Körpern, deren Querschnitte (Superellipsen) entlang einer Kurve
// mit einem anatomischen Profil (Breite/Tiefe/Versatz je Höhe) gezogen werden. Die Beine sind EIN
// SkinnedMesh (Hüfte → Knie → Knöchel je Bein, Vertex-Farben für Hose/Haut/Socke/Schuh) = 1 Draw-Call.

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);
const _dir = new THREE.Vector3();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

// ---------- Profil-Tabellen: [[s, a, b, c], ...] glatt (kubisch-hermitesch) interpolieren ----------
function prof(rows, s) {
  const n = rows.length;
  if (s <= rows[0][0]) return rows[0].slice(1);
  if (s >= rows[n - 1][0]) return rows[n - 1].slice(1);
  let i = 0;
  while (s > rows[i + 1][0]) i++;
  const r0 = rows[Math.max(0, i - 1)], r1 = rows[i], r2 = rows[i + 1], r3 = rows[Math.min(n - 1, i + 2)];
  const h = r2[0] - r1[0], u = (s - r1[0]) / h, u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const out = [];
  for (let k = 1; k < r1.length; k++) {
    // Tangenten begrenzen, damit das Profil zwischen den Stützstellen nicht überschwingt
    let m1 = ((r2[k] - r0[k]) / (r2[0] - r0[0] || 1)) * h;
    let m2 = ((r3[k] - r1[k]) / (r3[0] - r1[0] || 1)) * h;
    const dk = r2[k] - r1[k];
    if (dk === 0 || Math.sign(m1) !== Math.sign(dk)) m1 = (r1 === r0) ? dk : m1 * 0.5;
    if (dk === 0 || Math.sign(m2) !== Math.sign(dk)) m2 = (r2 === r3) ? dk : m2 * 0.5;
    out.push(h00 * r1[k] + h10 * m1 + h01 * r2[k] + h11 * m2);
  }
  return out;
}

// ---------- Loft: Superellipsen-Querschnitte entlang einer Kurve ----------
// fn(s) → [w, d, o]: halbe Breite (Seitenachse), halbe Tiefe (Achse N), Versatz entlang N.
// s ist die Profil-Koordinate (Bogenlänge − s0). ref gibt die Richtung N vor (senkrecht zur Tangente projiziert).
// UV: u läuft um den Querschnitt (u0→u1, Start hinten = −N), v entlang (v0→v1).
const _T = new THREE.Vector3(), _N = new THREE.Vector3(), _S = new THREE.Vector3(), _C = new THREE.Vector3();
function loft(curve, fn, o) {
  const { a, b, s0 = 0, ref = v3(0, 0, -1), nT = 16, nR = 12, ex = 2, u0 = 0, u1 = 1, v0 = 0, v1 = 1, grow = 0, sx = 1, ends = 0 } = o;
  const len = curve.getLength();
  const cols = nR + 1, rows = nT + 1;
  const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2);
  const e = 2 / ex;
  for (let i = 0; i < rows; i++) {
    const ti = i / nT, tt = ti - (ends * Math.sin(2 * Math.PI * ti)) / (2 * Math.PI); // ends > 0: dichter an den Enden
    const s = a + (b - a) * tt;
    const arc = s + s0;
    const t = clamp(arc / len, 0, 1);
    curve.getPointAt(t, _C);
    curve.getTangentAt(t, _T);
    if (arc < 0) _C.addScaledVector(_T, arc);
    else if (arc > len) _C.addScaledVector(_T, arc - len);
    _N.copy(ref).addScaledVector(_T, -ref.dot(_T)).normalize();
    _S.crossVectors(_T, _N).multiplyScalar(sx);
    const p = fn(s);
    const w = Math.max(0, p[0] + (p[0] > 0.004 ? grow : 0)), d = Math.max(0, p[1] + (p[1] > 0.004 ? grow : 0)), off = p[2] || 0;
    for (let j = 0; j < cols; j++) {
      const ph = (j / nR) * Math.PI * 2;
      const sn = Math.sin(ph), cs = Math.cos(ph);
      const x = Math.sign(sn) * Math.pow(Math.abs(sn), e) * w;
      const y = off - Math.sign(cs) * Math.pow(Math.abs(cs), e) * d;
      const k = (i * cols + j) * 3;
      pos[k] = _C.x + _S.x * x + _N.x * y;
      pos[k + 1] = _C.y + _S.y * x + _N.y * y;
      pos[k + 2] = _C.z + _S.z * x + _N.z * y;
      const kk = (i * cols + j) * 2;
      uv[kk] = u0 + ((u1 - u0) * j) / nR;
      uv[kk + 1] = v0 + (v1 - v0) * tt;
    }
  }
  const idx = [];
  for (let i = 0; i < nT; i++) {
    for (let j = 0; j < nR; j++) {
      const A = i * cols + j, B = (i + 1) * cols + j, C = i * cols + j + 1, D = (i + 1) * cols + j + 1;
      if (sx > 0) idx.push(A, B, C, B, D, C);
      else idx.push(A, C, B, B, C, D);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Naht (u = 0 / u = 1) glätten
  const nr = g.attributes.normal;
  for (let i = 0; i < rows; i++) {
    const A = i * cols, B = i * cols + nR;
    _N.set(nr.getX(A) + nr.getX(B), nr.getY(A) + nr.getY(B), nr.getZ(A) + nr.getZ(B)).normalize();
    nr.setXYZ(A, _N.x, _N.y, _N.z);
    nr.setXYZ(B, _N.x, _N.y, _N.z);
  }
  return g;
}
const line = (a, b) => new THREE.LineCurve3(a, b);
const spline = (pts) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');

// ---------- Sammler für statische Geometrie ----------
class Bucket {
  constructor(frameScale = 1) { this.lists = new Map(); this.fs = frameScale; this.xf = null; }
  put(key, g) { // übernimmt die Geometrie (ohne Kopie)
    if (this.xf) g.applyMatrix4(this.xf);
    if (!this.lists.has(key)) this.lists.set(key, []);
    this.lists.get(key).push(g);
  }
  add(key, geo, matrix) {
    const g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    this.put(key, g);
  }
  // konisches Rohr von a nach b
  tube(key, a, b, r1, r2 = r1, seg = 10) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-5) return;
    _q.setFromUnitVectors(UP, _dir.divideScalar(len));
    _m.compose(v3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), _q, _one);
    const k = key === 'frame' ? this.fs : 1;
    const g = new THREE.CylinderGeometry(r2 * k, r1 * k, len, seg, 1);
    g.applyMatrix4(_m);
    this.put(key, g);
  }
  // wie tube(), aber seitlich abgeflacht (hydrogeformte Rahmenrohre in der Mittelebene)
  tubeF(key, a, b, r1, r2 = r1, seg = 10, flat = 0.8) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-5) return;
    _q.setFromUnitVectors(UP, _dir.divideScalar(len));
    _m.compose(v3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), _q, _one);
    const k = key === 'frame' ? this.fs : 1;
    const g = new THREE.CylinderGeometry(r2 * k, r1 * k, len, seg, 1);
    g.applyMatrix4(_m);
    const cx = (a.x + b.x) / 2;
    g.translate(-cx, 0, 0); g.scale(flat, 1, 1); g.translate(cx, 0, 0);
    this.put(key, g);
  }
  // Ellipsoid mit Halbachsen (rx, ry, rz), um die x-Achse gedreht
  ell(key, p, rx, ry, rz, rotX = 0, seg = 12) {
    _q.setFromAxisAngle(v3(1, 0, 0), rotX);
    _m.compose(p, _q, v3(rx, ry, rz));
    this.add(key, new THREE.SphereGeometry(1, seg, Math.max(6, seg - 4)), _m);
  }
  ball(key, p, r, sx = 1, sy = 1, sz = 1, seg = 12) {
    _m.compose(p, _q.identity(), v3(sx, sy, sz));
    this.add(key, new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), _m);
  }
  box(key, p, w, h, d, rotX = 0) {
    _q.setFromAxisAngle(v3(1, 0, 0), rotX);
    _m.compose(p, _q, _one);
    this.add(key, new THREE.BoxGeometry(w, h, d), _m);
  }
  curve(key, pts, r, seg = 24, radial = 8) {
    const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.put(key, new THREE.TubeGeometry(c, seg, r, radial, false));
  }
  flush(materials, group) {
    for (const [key, list] of this.lists) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) { console.warn('bikes: merge failed', key); continue; }
      const mesh = new THREE.Mesh(merged, materials[key]);
      mesh.castShadow = true;
      group.add(mesh);
    }
  }
}

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const hash01 = (n) => { const x = Math.sin(n * 127.1 + 3.7) * 43758.5453; return x - Math.floor(x); };

// ---------- Geometrie-Sätze je Rahmenstil ----------
const FRAMES = {
  mtb: { wb: 1.22, bbY: 0.31, bbZ: 0.07, st: v3(0, 0.80, 0.27), hb: v3(0, 0.74, -0.46), ht: v3(0, 0.90, -0.535), saddleY: 0.99, saddleZ: 0.3, stem: v3(0, 0.05, -0.05) },
  dh: { wb: 1.3, bbY: 0.32, bbZ: 0.08, st: v3(0, 0.78, 0.3), hb: v3(0, 0.76, -0.50), ht: v3(0, 0.94, -0.585), saddleY: 0.92, saddleZ: 0.36, stem: v3(0, 0.05, -0.045) },
  road: { wb: 1.14, bbY: 0.27, bbZ: 0.04, st: v3(0, 0.79, 0.21), hb: v3(0, 0.66, -0.42), ht: v3(0, 0.79, -0.4), saddleY: 0.96, saddleZ: 0.2, stem: v3(0, 0.025, -0.1) },
};
// Körperhaltung je Rahmenstil: reach = Schulter→Griff, curv = Rundrücken, pole = Ellbogenrichtung (rechts),
// pitch = Kopfneigung, neck = wie stark der Hals aufgerichtet ist, hip = Versatz der Hüfte (y, z)
const POSES = {
  road: { reach: 0.6, curv: 0.04, pole: v3(0.55, -1, 0.45), pitch: -0.02, neck: 0.42, hip: v3(0, 0, 0.0) },
  mtb: { reach: 0.585, curv: 0.022, pole: v3(1, -0.6, 0.35), pitch: 0.06, neck: 0.3, hip: v3(0, 0, -0.02) },
  dh: { reach: 0.55, curv: 0.03, pole: v3(1, -0.15, 0.35), pitch: 0.12, neck: 0.4, hip: v3(0, 0.07, -0.06) },
};

// ---------- Anatomie-Profile [s, halbe Breite, halbe Tiefe, Versatz nach vorn] (Meter) ----------
const TORSO_P = [ // s ab Hüftgelenk entlang der Wirbelsäule
  [-0.172, 0.0, 0.0, -0.03],
  [-0.168, 0.05, 0.032, -0.03],
  [-0.157, 0.098, 0.064, -0.026],
  [-0.14, 0.124, 0.078, -0.02],
  [-0.115, 0.14, 0.087, -0.015],
  [-0.065, 0.158, 0.1, -0.006],
  [0.01, 0.163, 0.102, 0.0],
  [0.1, 0.15, 0.1, 0.004],
  [0.19, 0.138, 0.096, 0.01],
  [0.29, 0.146, 0.104, 0.016],
  [0.39, 0.163, 0.112, 0.02],
  [0.47, 0.176, 0.113, 0.014],
  [0.535, 0.18, 0.101, 0.002],
  [0.585, 0.162, 0.083, -0.01],
  [0.625, 0.112, 0.066, -0.01],
  [0.65, 0.068, 0.058, -0.002],
  [0.675, 0.062, 0.056, 0.004],
  [0.685, 0.0, 0.0, 0.004],
];
const ARM_P = [ // s ab Schultergelenk
  [-0.06, 0.02, 0.02, 0],
  [-0.035, 0.05, 0.052, 0],
  [0.02, 0.058, 0.057, 0],
  [0.08, 0.051, 0.05, 0],
  [0.15, 0.046, 0.047, -0.002],
  [0.23, 0.041, 0.042, 0],
  [0.29, 0.037, 0.038, 0],
  [0.34, 0.042, 0.041, 0.002],
  [0.41, 0.038, 0.034, 0],
  [0.49, 0.031, 0.026, 0],
  [0.545, 0.028, 0.021, 0],
  [0.575, 0.028, 0.02, 0],
];
const LT = 0.47, LS = 0.46; // Oberschenkel, Unterschenkel
const LEG_P = [ // s ab Hüftgelenk nach unten (Bind-Pose)
  [-0.075, 0.0, 0.0, 0.0],
  [-0.068, 0.04, 0.045, 0.0],
  [-0.05, 0.066, 0.075, 0.0],
  [-0.02, 0.082, 0.09, 0.0],
  [0.03, 0.09, 0.094, 0.0],
  [0.13, 0.085, 0.088, 0.007],
  [0.23, 0.076, 0.078, 0.01],
  [0.33, 0.064, 0.066, 0.008],
  [0.41, 0.055, 0.056, 0.005],
  [0.465, 0.05, 0.054, 0.009],
  [0.51, 0.047, 0.05, 0.002],
  [0.57, 0.05, 0.057, -0.012],
  [0.63, 0.05, 0.058, -0.017],
  [0.71, 0.043, 0.049, -0.012],
  [0.81, 0.033, 0.037, -0.004],
  [0.89, 0.029, 0.032, 0.0],
  [0.93, 0.03, 0.035, 0.006],
  [0.97, 0.028, 0.03, 0.01],
];
const HEAD_P = [ // y (Kopf-lokal), halbe Breite, Ausdehnung nach vorn, nach hinten → in [w, d, o] umgerechnet
  [-0.122, 0.006, 0.062, -0.045],
  [-0.116, 0.026, 0.078, -0.022],
  [-0.1, 0.042, 0.088, 0.008],
  [-0.077, 0.055, 0.09, 0.038],
  [-0.05, 0.063, 0.092, 0.066],
  [-0.02, 0.069, 0.095, 0.086],
  [0.01, 0.073, 0.095, 0.097],
  [0.04, 0.075, 0.091, 0.101],
  [0.07, 0.072, 0.081, 0.097],
  [0.095, 0.062, 0.064, 0.083],
  [0.113, 0.044, 0.043, 0.058],
  [0.124, 0.014, 0.014, 0.022],
  [0.126, 0.0, 0.0, 0.0],
].map(([y, w, f, b]) => [y, w, (f + b) / 2, (f - b) / 2]);

export function createBike(def, opts = {}) {
  const low = opts.lod === 'low';
  const F = FRAMES[def.look.frame] || FRAMES.mtb;
  const PZ = POSES[def.look.frame] || POSES.mtb;
  const L = def.look;
  const col = def.colors;
  const r = L.wheelR;
  const group = new THREE.Group();
  const roadKit = L.frame === 'road';
  const big = F === FRAMES.mtb || F === FRAMES.dh; // kräftige, abgeflachte Rohre wie bei modernen Trail-/Enduro-Rädern

  // ----- Materialien -----
  const std = (color, rough = 0.5, metal = 0.1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const RD = def.rider;
  const kit = RD.kit;
  // Trikot-Textur: links (u 0..0.5) Rumpf, rechts linker/rechter Ärmel.
  // Rumpf: x = 0 Rückenmitte, T/4 rechte Seite, T/2 Brust (Reißverschluss), 3T/4 linke Seite. y = 0 Kragen, H Saum.
  const jerseyTex = canvasTex(512, 256, (g, W, H) => {
    const T = W / 2;
    const base = hex(col.jersey), acc = hex(col.accent === col.jersey ? 0xffffff : col.accent);
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    g.fillStyle = acc;
    if (kit === 'bands') {
      g.fillRect(0, H * 0.3, T, H * 0.12); g.fillRect(0, H * 0.48, T, H * 0.04);
      g.fillRect(T, H * 0.55, T, H * 0.1);
    } else if (kit === 'stripe') {
      g.fillRect(T * 0.5 - 15, 0, 30, H); g.fillRect(0, 0, 13, H); g.fillRect(T - 13, 0, 13, H);
      g.fillRect(T * 0.25 - 4, 0, 8, H); g.fillRect(T * 0.75 - 4, 0, 8, H);
      for (const x0 of [T, T * 1.5]) g.fillRect(x0 + T * 0.25 - 9, 0, 18, H);
    } else if (kit === 'halves') {
      g.fillRect(T * 0.5, 0, T * 0.5, H); g.fillRect(T, 0, T * 0.5, H);
    } else if (kit === 'fade') {
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, base); gr.addColorStop(0.35, base); gr.addColorStop(1, acc);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    } else if (kit === 'checks') {
      const n = 8, cw = T / n, ch = H / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n * 2; x++) if ((x + y) % 2) g.fillRect(x * cw, y * ch, cw, ch);
    }
    // Seitenpaneele (dunkler) mit Nähten
    g.globalAlpha = 0.2; g.fillStyle = '#000';
    for (const cx of [T * 0.25, T * 0.75]) g.fillRect(cx - 15, 0, 30, H);
    g.globalAlpha = 0.45;
    for (const cx of [T * 0.25, T * 0.75]) { g.fillRect(cx - 16, 0, 1.5, H); g.fillRect(cx + 15, 0, 1.5, H); }
    // Ärmel-Naht (oben, Raglan) leicht angedeutet
    for (const x0 of [T, T * 1.5]) g.fillRect(x0 + T * 0.25 - 0.75, 0, 1.5, H * 0.2);
    // Kragen + Saum + Gripper
    g.globalAlpha = 0.35; g.fillRect(0, 0, T, 9); g.fillRect(0, H - 7, T, 7);
    g.globalAlpha = 1; g.fillStyle = acc; g.fillRect(0, 9, T, 1.5);
    // Ärmelbündchen
    g.fillStyle = acc; g.fillRect(T, H - 22, T, 12);
    g.fillStyle = '#16161a'; g.globalAlpha = 0.75; g.fillRect(T, H - 10, T, 10);
    // Rückentaschen (Rennrad)
    g.globalAlpha = 0.5; g.fillStyle = '#000';
    if (roadKit) {
      g.fillRect(0, H * 0.74, 44, 2); g.fillRect(T - 44, H * 0.74, 44, 2);
      g.fillRect(14, H * 0.74, 1.5, H * 0.26 - 7); g.fillRect(T - 15, H * 0.74, 1.5, H * 0.26 - 7);
      g.fillRect(43, H * 0.74, 1.5, H * 0.26 - 7); g.fillRect(T - 44, H * 0.74, 1.5, H * 0.26 - 7);
    }
    // Reißverschluss vorn
    g.globalAlpha = 0.9; g.fillStyle = '#1b1b20';
    g.fillRect(T * 0.5 - 1.5, 0, 3, roadKit ? H : H * 0.32);
    g.fillStyle = '#8d9097'; g.fillRect(T * 0.5 - 1.5, 12, 3, 6);
    // Schriftzug: Rücken (über die Naht x = 0 / T) und Brust
    g.globalAlpha = 1;
    const name = def.brandDef.name.toUpperCase();
    g.fillStyle = kit === 'solid' || kit === 'fade' ? acc : '#ffffff';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.beginPath(); g.rect(0, 0, T, H); g.clip();
    g.font = `${def.brandDef.font} 19px "Trebuchet MS", "Segoe UI", sans-serif`;
    g.fillText(name, 0, H * 0.17); g.fillText(name, T, H * 0.17);
    g.font = `${def.brandDef.font} 10px "Trebuchet MS", "Segoe UI", sans-serif`;
    g.fillText(name, T * 0.5 - 21, H * 0.2);
    g.restore();
  }, true);
  const frameTex = L.pattern === 'none' ? null : canvasTex(256, 256, (g, w, h) => {
    const base = hex(col.frame), acc = hex(col.accent === col.frame ? 0xffffff : col.accent);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = acc;
    if (L.pattern === 'stripes') { g.fillRect(0, h * 0.18, w, h * 0.09); g.fillRect(0, h * 0.34, w, h * 0.03); g.fillRect(w * 0.43, 0, w * 0.14, h); }
    else if (L.pattern === 'dots') { for (let y = 0; y < 10; y++) for (let x = 0; x < 6; x++) { g.beginPath(); g.arc(((x + (y % 2) * 0.5) * w) / 6, ((y + 0.5) * h) / 10, 7, 0, 6.3); g.fill(); } }
    else if (L.pattern === 'fade') { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, acc); gr.addColorStop(0.6, base); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    else if (L.pattern === 'flames') {
      for (let i = 0; i < 6; i++) { const x0 = (i * w) / 6; g.beginPath(); g.moveTo(x0, 0); g.quadraticCurveTo(x0 + w / 12, h * 0.25, x0 + w / 14, h * 0.55); g.quadraticCurveTo(x0 + w / 7, h * 0.3, x0 + w / 6, 0); g.fill(); }
      g.fillStyle = '#ffffff55'; for (let i = 0; i < 6; i++) { const x0 = (i * w) / 6 + 8; g.beginPath(); g.moveTo(x0, 0); g.quadraticCurveTo(x0 + w / 24, h * 0.14, x0 + w / 28, h * 0.28); g.quadraticCurveTo(x0 + w / 14, h * 0.15, x0 + w / 12, 0); g.fill(); }
    } else if (L.pattern === 'camo') {
      const tints = [acc, '#00000055', '#ffffff33'];
      for (let i = 0; i < 38; i++) { g.fillStyle = tints[i % 3]; g.beginPath(); g.ellipse(hash01(i * 3 + 1) * w, hash01(i * 7 + 2) * h, 10 + hash01(i) * 24, 6 + hash01(i + 9) * 14, hash01(i + 4) * 3, 0, 6.3); g.fill(); }
    }
  }, true);
  const fin = L.finish;
  const frameParams = { color: frameTex ? 0xffffff : col.frame, map: frameTex, roughness: fin === 'matte' ? 0.85 : fin === 'metal' ? 0.22 : 0.3, metalness: fin === 'metal' ? 0.92 : fin === 'matte' ? 0.08 : 0.35, envMapIntensity: 1.2 };
  const numTex = (L.number > 0 && !low) ? canvasTex(160, 120, (g, w, h) => {
    g.fillStyle = '#f6f6f6'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill();
    g.lineWidth = 6; g.strokeStyle = hex(col.frame); g.stroke();
    g.fillStyle = '#15151a'; g.font = '900 78px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(L.number), w / 2, h / 2 + 5);
  }) : null;
  const mats = {
    frame: !low && fin === 'gloss' ? new THREE.MeshPhysicalMaterial({ ...frameParams, clearcoat: 1, clearcoatRoughness: 0.08 }) : std(frameParams.color, frameParams.roughness, frameParams.metalness, { map: frameTex, envMapIntensity: 1.2 }),
    accent: std(col.accent, 0.4, 0.2),
    dark: std(0x1a1a1d, 0.55, 0.3),
    chain: std(0x55585e, 0.38, 0.85),
    rubber: std(0x111112, 0.95, 0),
    tire: std(TIRE_WALL_COLORS[L.tireWall] ?? 0x111112, 0.9, 0),
    metal: std(0xc9ccd2, 0.28, 0.9),
    gold: std(L.fork === 'rigid' ? 0xc9ccd2 : 0xd4a537, 0.25, 0.9),
    saddle: std(0x151515, 0.62, 0),
    skin: std(RD.skin, 0.58, 0),
    hair: std(RD.hair, 0.75, 0),
    jersey: std(0xffffff, 0.72, 0, { map: jerseyTex }),
    shorts: std(col.shorts, 0.7, 0),
    glove: std(0x1c1c20, 0.75, 0),
    helmet: std(col.helmet, 0.3, 0.1, { side: THREE.DoubleSide }),
    glass: std(0x0b0d12, 0.08, 0.85, { side: THREE.DoubleSide }),
    rimMat: std(col.rim ?? (L.rim > 0.04 ? 0x15161a : 0x9ea2aa), 0.35, 0.7, { side: THREE.DoubleSide }),
  };

  const B = new Bucket(L.tubes || 1);
  const R = v3(0, r, F.wb / 2);
  const Fw = v3(0, r, -F.wb / 2);
  const bb = v3(0, F.bbY, F.bbZ);
  const seg = low ? 6 : 10;
  const mid = (a, b, t) => a.clone().lerp(b, t);

  // ----- Rahmen -----
  const tt0 = F.st.clone().add(v3(0, -0.015, -0.02));
  const ttR = L.frame === 'road' ? 0.017 : 0.022;
  if (big) {
    B.tubeF('frame', tt0, F.ht.clone().add(v3(0, -0.03, 0)), 0.03, 0.04, seg, 0.8); // Oberrohr
    B.tubeF('frame', bb, F.hb.clone().add(v3(0, 0.01, 0)), 0.04, 0.052, seg, 0.78); // Unterrohr
    B.tubeF('frame', bb, F.st, 0.028, 0.024, seg, 0.85); // Sitzrohr
    B.tube('frame', F.hb.clone().add(v3(0, -0.02, 0.004)), F.ht.clone().add(v3(0, 0.015, -0.004)), 0.043, 0.04, seg + 2); // Steuerrohr (konisch)
    for (const p of [tt0, F.ht.clone().add(v3(0, -0.03, 0)), F.hb.clone().add(v3(0, 0.01, 0))]) B.ball('frame', p, 0.042, 0.8, 1, 1, low ? 8 : 12); // Knoten
  } else {
    B.tube('frame', tt0, F.ht.clone().add(v3(0, -0.015, 0)), ttR, ttR * 1.25, seg); // Oberrohr
    B.tube('frame', bb, F.hb, 0.034, 0.03, seg); // Unterrohr (dick)
    B.tube('frame', bb, F.st, 0.022, 0.02, seg); // Sitzrohr
    B.tube('frame', F.hb.clone().add(v3(0, -0.01, 0.002)), F.ht.clone().add(v3(0, 0.01, -0.002)), 0.032, 0.03, seg); // Steuerrohr
    if (!low) B.ball('frame', tt0, 0.024, 1, 1, 1, 8);
  }
  for (const sx of [-1, 1]) {
    B.tube('frame', bb.clone().add(v3(sx * 0.02, 0, 0)), R.clone().add(v3(sx * 0.06, 0, 0)), big ? 0.027 : 0.02, big ? 0.016 : 0.014, seg); // Kettenstrebe
    B.tube('frame', F.st.clone().add(v3(sx * 0.02, -0.03, 0.01)), R.clone().add(v3(sx * 0.06, 0.01, 0)), big ? 0.02 : 0.015, big ? 0.014 : 0.012, seg); // Sitzstrebe
    if (!low) B.box('frame', R.clone().add(v3(sx * 0.063, 0.0, 0.0)), 0.008, 0.045, 0.045); // Ausfallende
  }
  B.ball('frame', bb, big ? 0.05 : 0.04, 1, 1, 1, low ? 8 : 12); // Tretlager
  if (!low) B.tube('dark', bb.clone().add(v3(-0.07, 0, 0)), bb.clone().add(v3(0.07, 0, 0)), 0.025, 0.025, 12); // Lagerschalen

  // Hinterbau-Dämpfer (Fully): Luftdämpfer zwischen Sitzrohr und Unterrohr, Umlenkhebel zur Kettenstrebe
  if (!L.hardtail) {
    const A = mid(bb, F.st, 0.48).add(v3(0, 0, -0.025));
    const Bm = mid(bb, F.hb, 0.16);
    const C = mid(bb, R, 0.3);
    B.tube('dark', A, mid(A, Bm, 0.62), 0.024, 0.024, seg); // Dämpferzylinder
    B.tube('accent', mid(A, Bm, 0.6), Bm, 0.032, 0.032, seg); // Luftkammer / Feder
    B.tube('metal', mid(A, Bm, 0.12), A, 0.011, 0.011, seg); // Kolbenstange
    if (!low) {
      B.tube('dark', mid(A, Bm, 0.66), mid(A, Bm, 0.7), 0.035, 0.035, seg); // Einstellring
      B.tube('dark', mid(A, Bm, 0.3), mid(A, Bm, 0.3).add(v3(0.045, 0.012, 0.0)), 0.009, 0.009, 6); // Hebel
    }
    B.ball('metal', A, 0.02);
    B.ball('metal', Bm, 0.022);
    for (const sx of [-1, 1]) {
      B.tubeF('frame', Bm.clone().add(v3(sx * 0.035, 0, 0)), C.clone().add(v3(sx * 0.05, 0, 0)), 0.017, 0.015, seg, 1); // Umlenkhebel
      B.ball('metal', F.st.clone().add(v3(sx * 0.03, -0.03, 0.01)), 0.017); // Hauptlager Sitzstrebe
    }
    B.ball('metal', C, 0.02);
  }

  // ----- Gabel (Neigung folgt dem Steuerrohr) -----
  const hDir = F.ht.clone().sub(F.hb).normalize();
  const crown = F.hb.clone().addScaledVector(hDir, -0.055);
  B.tube('dark', F.hb, crown, 0.03, 0.03, seg);
  const dropout = Fw.clone();
  const fDir = crown.clone().sub(dropout).normalize(); // von der Achse nach oben
  if (L.fork === 'rigid') {
    for (const sx of [-1, 1]) {
      const a = crown.clone().add(v3(sx * 0.045, 0, 0)), b = dropout.clone().add(v3(sx * 0.055, 0, 0));
      if (low) B.tube('frame', a, b, 0.02, 0.012, seg);
      else B.curve('frame', [a, mid(a, b, 0.35).add(v3(0, 0, -0.008)), mid(a, b, 0.75).add(v3(0, 0, -0.018)), b], 0.015, 10, 8); // leicht nach vorn gebogen
    }
    B.box('frame', crown.clone(), 0.11, 0.035, 0.05);
  } else {
    const wide = L.fork === 'full' ? 0.07 : 0.06;
    const up = L.fork === 'full' ? 0.027 : 0.022;
    for (const sx of [-1, 1]) {
      const mid2 = crown.clone().lerp(dropout, 0.5).add(v3(sx * wide, 0, 0));
      const top = crown.clone().addScaledVector(fDir, L.fork === 'full' ? 0.17 : 0.13).add(v3(sx * wide, 0, 0));
      B.tube('gold', top, mid2, up, up, seg); // Standrohre
      B.tube('dark', mid2, dropout.clone().add(v3(sx * 0.06, 0, 0)), up * 1.4, up * 1.05, seg); // Tauchrohre
      if (!low) {
        B.tube('dark', mid2.clone().addScaledVector(fDir, 0.01), mid2.clone().addScaledVector(fDir, -0.012), up * 1.55, up * 1.55, seg); // Staubabstreifer
        B.tube('metal', dropout.clone().add(v3(sx * 0.06, 0.0, 0)), dropout.clone().add(v3(sx * 0.075, 0, 0)), 0.014, 0.014, 6); // Steckachse
        B.tube(sx > 0 ? 'accent' : 'dark', top.clone().addScaledVector(fDir, 0.015), top.clone().addScaledVector(fDir, 0.035), 0.013, 0.013, 8); // Einstellknöpfe
      }
    }
    B.box('dark', crown.clone(), wide * 2 + 0.055, 0.05, 0.065); // Gabelkrone
    if (L.fork === 'full') {
      B.box('dark', crown.clone().addScaledVector(fDir, 0.16), wide * 2 + 0.045, 0.036, 0.05); // obere Krone
      if (!low) B.tube('dark', crown.clone().addScaledVector(fDir, 0.17), F.ht.clone().add(v3(0, 0.03, 0)), 0.02, 0.02, seg); // Gabelschaft sichtbar
    }
    if (!low) B.tube('dark', crown.clone().lerp(dropout, 0.52).add(v3(-wide, 0.0, -0.005)), crown.clone().lerp(dropout, 0.52).add(v3(wide, 0.0, -0.005)), 0.014, 0.014, 6); // Gabelbrücke
  }

  // ----- Cockpit -----
  const stemTop = F.ht.clone().add(F.stem);
  const htTop = F.ht.clone().add(v3(0, 0.02, 0));
  if (!low) for (let i = 0; i < 2; i++) B.tube('dark', htTop.clone().addScaledVector(hDir, i * 0.014), htTop.clone().addScaledVector(hDir, i * 0.014 + 0.011), 0.021, 0.021, 12); // Spacer
  const stemBase = htTop.clone().addScaledVector(hDir, low ? 0 : 0.028);
  if (big) B.tubeF('dark', stemBase, stemTop, 0.023, 0.02, seg, 0.85);
  else B.tube('dark', stemBase, stemTop, 0.018, 0.016, seg);
  B.ball('dark', stemTop, 0.026, 1.3, 0.9, 1, low ? 8 : 12); // Lenkerklemmung
  if (!low) B.tube('dark', stemBase.clone().addScaledVector(hDir, -0.012), stemBase.clone().addScaledVector(hDir, 0.022), 0.022, 0.022, 12); // Klemmung Gabelschaft
  // Griffpositionen (rechte Seite, x > 0) + Griff-Achse
  let grip, gripAxis, gripR;
  const levers = []; // Bremshebel-Positionen für Leitungen
  if (L.bars === 'drop') {
    gripR = 0.02;
    for (const sx of [-1, 1]) {
      const p = (x, y, z) => stemTop.clone().add(v3(sx * x, y, z));
      const pts = [p(0.0, 0, 0), p(0.1, 0, 0.0), p(0.17, 0, -0.005), p(0.2, 0.0, -0.035), p(0.212, -0.012, -0.075), p(0.215, -0.05, -0.098), p(0.215, -0.095, -0.088), p(0.215, -0.125, -0.05), p(0.215, -0.135, 0.0), p(0.215, -0.132, 0.05)];
      if (low) B.curve('dark', pts, 0.013, 16, 5);
      else {
        B.curve('dark', pts.slice(0, 3), 0.0125, 6, 8); // Klemmbereich
        B.curve('rubber', pts.slice(1), 0.0138, 34, 8); // Lenkerband
        B.tube('dark', pts[9], pts[9].clone().add(v3(0, -0.004, 0.006)), 0.014, 0.014, 8); // Endkappe
      }
      // Bremsgriff mit Gummi-Hood + Hebel
      const hb0 = p(0.214, -0.035, -0.093), ht1 = p(0.214, 0.012, -0.148);
      const hd = ht1.clone().sub(hb0).normalize();
      _q.setFromUnitVectors(UP, hd);
      _m.compose(mid(hb0, ht1, 0.5), _q, v3(0.022, 0.04, 0.026));
      B.add('rubber', new THREE.SphereGeometry(1, low ? 8 : 12, low ? 6 : 8), _m);
      B.ball('rubber', ht1.clone().add(v3(0, 0.004, 0.006)), 0.017, 0.9, 1, 1.1, 8); // Hood-Nase
      if (!low) B.curve('dark', [ht1.clone().add(v3(0, -0.008, -0.006)), p(0.216, -0.05, -0.16), p(0.22, -0.1, -0.135), p(0.222, -0.13, -0.1)], 0.0065, 12, 5); // Hebel
      levers.push(p(0.205, -0.02, -0.09));
    }
    grip = stemTop.clone().add(v3(0.214, 0.012, -0.112));
    gripAxis = v3(0, 0.62, -1).normalize();
  } else {
    gripR = 0.017;
    const riser = L.bars === 'riser';
    const half = riser ? 0.39 : 0.36;
    const rise = riser ? 0.045 : 0.0, back = riser ? 0.04 : 0.025;
    for (const sx of [-1, 1]) {
      const centre = stemTop.clone();
      const m1 = centre.clone().add(v3(sx * 0.1, rise * 0.25, back * 0.1));
      const m2 = centre.clone().add(v3(sx * 0.17, rise * 0.85, back * 0.5));
      const end = centre.clone().add(v3(sx * half, rise, back));
      if (low) { B.tube('dark', centre, m2, 0.013, 0.012, seg); B.tube('dark', m2, end, 0.012, 0.012, seg); }
      else B.curve('dark', [centre, m1, m2, end], 0.0115, 16, 8);
      const gIn = centre.clone().add(v3(sx * (half - 0.135), rise, back));
      B.tube('rubber', gIn, end, gripR, gripR, seg + 2); // Griff
      if (!low) {
        B.tube('dark', gIn.clone().add(v3(-sx * 0.012, 0, 0)), gIn, gripR + 0.003, gripR + 0.003, 10); // Klemmring
        B.tube('dark', end, end.clone().add(v3(sx * 0.008, 0, 0)), gripR + 0.002, gripR + 0.002, 10); // Endkappe
        // Bremsgriff: Geber + Hebel
        const lv = centre.clone().add(v3(sx * (half - 0.16), rise + 0.01, back));
        B.ball('dark', lv, 0.016, 1.1, 1, 1.4, 8);
        B.tube('dark', lv, lv.clone().add(v3(sx * 0.03, 0.03, -0.01)), 0.011, 0.011, 8); // Ausgleichsbehälter
        B.curve('metal', [lv.clone().add(v3(0, -0.005, -0.02)), lv.clone().add(v3(sx * 0.05, -0.008, -0.045)), lv.clone().add(v3(sx * 0.1, -0.02, -0.04))], 0.0055, 8, 5); // Hebel
        if (sx > 0) B.box('dark', lv.clone().add(v3(-0.03, -0.025, 0.02)), 0.04, 0.025, 0.035); // Schalthebel
        else if (!L.hardtail || big) B.box('dark', lv.clone().add(v3(0.04, -0.022, 0.015)), 0.025, 0.018, 0.025); // Remote (Sattelstütze)
        levers.push(lv);
      }
    }
    grip = stemTop.clone().add(v3(half - 0.065, rise, back));
    gripAxis = v3(1, 0, 0);
  }

  // ----- Sattel + Sattelstütze -----
  const saddle = v3(0, F.saddleY, F.saddleZ);
  const stDir = F.st.clone().sub(bb).normalize();
  const postTop = saddle.clone().add(v3(0, 0.005, 0.0));
  if (big && !low) { // Vario-Sattelstütze: Außenrohr, Dichtkopf, Innenrohr (schwarz), Kopf
    const collar = F.st.clone().addScaledVector(stDir, 0.07);
    B.tube('dark', F.st.clone().addScaledVector(stDir, -0.02), collar, 0.0165, 0.0165, 12);
    B.tube('dark', collar, collar.clone().addScaledVector(stDir, 0.012), 0.019, 0.019, 12);
    B.tube('chain', collar, postTop, 0.0145, 0.0145, 12);
    B.tube('frame', F.st.clone().addScaledVector(stDir, -0.012), F.st.clone().addScaledVector(stDir, 0.006), 0.024, 0.024, 12); // Sattelklemme
  } else {
    B.tube(roadKit ? 'dark' : 'metal', F.st, postTop, 0.0135, 0.0135, seg);
  }
  B.box('dark', postTop.clone().add(v3(0, 0.012, 0)), 0.03, 0.02, 0.05); // Sattelkopf
  {
    const wide = big ? 1.08 : 1;
    const SAD = [ // s ab Sattelnase: halbe Breite, halbe Höhe, Versatz nach oben
      [0, 0.004, 0.006, 0.002],
      [0.015, 0.018, 0.014, 0.004],
      [0.07, 0.026 * wide, 0.017, 0.001],
      [0.14, 0.046 * wide, 0.019, 0.001],
      [0.2, 0.066 * wide, 0.021, 0.004],
      [0.245, 0.072 * wide, 0.02, 0.007],
      [0.265, 0.06 * wide, 0.016, 0.008],
      [0.272, 0.0, 0.004, 0.008],
    ];
    const nose = saddle.clone().add(v3(0, 0.045, -0.15)), tail = saddle.clone().add(v3(0, 0.05, 0.122));
    const sc = line(nose, tail);
    const sfn = (s) => prof(SAD, s);
    B.put('saddle', loft(sc, sfn, { a: 0, b: 0.272, ref: UP, nT: low ? 8 : 16, nR: low ? 8 : 14, ex: 3 }));
    if (!low) {
      for (const sx of [-1, 1]) B.curve('metal', [nose.clone().add(v3(sx * 0.01, -0.012, 0.03)), saddle.clone().add(v3(sx * 0.022, 0.012, -0.05)), saddle.clone().add(v3(sx * 0.024, 0.012, 0.06)), tail.clone().add(v3(sx * 0.035, -0.015, -0.02))], 0.0035, 10, 5); // Streben
      B.put('accent', loft(sc, (s) => { const p = sfn(s); return [p[0] + 0.0015, p[1] * 0.5, p[2] - p[1] * 0.45]; }, { a: 0.2, b: 0.271, ref: UP, nT: 6, nR: 12, ex: 3 })); // Heckkante farbig
    }
  }

  // ----- Antrieb (statische Teile) -----
  const chainX = 0.055;
  const RING = 0.095, COG = 0.048;
  if (!low) {
    // Schaltwerk: Leitrollen
    const J1 = R.clone().add(v3(chainX, -0.072, 0.03)), J2 = R.clone().add(v3(chainX, -0.148, -0.005));
    const JR = 0.017;
    // Kette als geschlossene Schleife
    const pts = [];
    const arc = (c, rad, t0, t1, n, front) => { for (let i = 0; i <= n; i++) { const t = t0 + ((t1 - t0) * i) / n; pts.push(v3(chainX, c.y + rad * Math.sin(t), c.z + (front ? -1 : 1) * rad * Math.cos(t))); } };
    const ringC = v3(chainX, bb.y, bb.z);
    arc(ringC, RING, -Math.PI / 2, Math.PI / 2, 8, true); // vorn um das Kettenblatt
    arc(R, COG, Math.PI / 2, -Math.PI / 4, 6, false); // hinten um das Ritzel
    arc(J1, JR, Math.PI * 0.35, -Math.PI / 2, 4, true); // vorne um die obere Leitrolle
    arc(J2, JR, Math.PI / 2, -Math.PI / 2, 4, false); // hinten um die untere Leitrolle
    const chain = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    B.put('chain', new THREE.TubeGeometry(chain, 160, 0.0042, 4, true));
    // Schaltwerk-Körper und Käfig
    const hanger = R.clone().add(v3(0.068, -0.015, 0.012));
    B.tubeF('dark', hanger, J1.clone().add(v3(0.022, 0.015, 0.01)), 0.016, 0.013, 8, 0.7);
    B.box('dark', mid(hanger, J1, 0.5).add(v3(0.025, 0, 0.01)), 0.018, 0.04, 0.03);
    for (const dx of [-0.011, 0.011]) {
      B.tubeF(dx > 0 ? 'dark' : 'accent', J1.clone().add(v3(dx, 0, 0)), J2.clone().add(v3(dx, 0, 0)), 0.02, 0.02, 10, 0.18);
    }
    for (const J of [J1, J2]) B.add('dark', new THREE.CylinderGeometry(JR - 0.002, JR - 0.002, 0.008, 12).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(J.x, J.y, J.z));
    if (L.frame === 'road') { // Umwerfer
      const fd = mid(bb, F.st, 0.24).add(v3(0.045, 0.0, 0.02));
      B.box('dark', fd, 0.02, 0.025, 0.07, 0.3);
    } else { // Kettenführung
      B.box('dark', v3(chainX, bb.y + RING + 0.02, bb.z + 0.01), 0.022, 0.02, 0.04);
    }
    // Bremsen
    if (L.disc !== false) {
      for (const P of [Fw, R]) {
        const cal = P.clone().add(v3(-0.07, 0.068, P === Fw ? 0.02 : 0.03));
        B.box('dark', cal, 0.028, 0.042, 0.06, P === Fw ? 0.5 : -0.3);
        B.box('metal', cal.clone().add(v3(-0.016, 0, 0)), 0.006, 0.03, 0.045, P === Fw ? 0.5 : -0.3);
      }
    } else { // Felgenbremsen
      B.box('dark', F.hb.clone().add(v3(0, -0.12, -0.02)), 0.11, 0.025, 0.03);
      B.box('dark', F.st.clone().add(v3(0, -0.1, 0.03)), 0.11, 0.025, 0.03);
      for (const sx of [-1, 1]) {
        B.box('dark', F.hb.clone().add(v3(sx * 0.055, -0.15, -0.02)), 0.012, 0.06, 0.02);
        B.box('dark', F.st.clone().add(v3(sx * 0.055, -0.13, 0.03)), 0.012, 0.06, 0.02);
      }
    }
    // Leitungen: Bremse vorn (in Schlaufe zum Gabelholm), Bremse hinten + Schaltzug am Unterrohr entlang
    if (levers.length === 2) {
      const [lvL, lvR] = levers;
      const htFront = F.ht.clone().add(v3(0, -0.02, -0.07));
      const fCal = L.disc !== false ? Fw.clone().add(v3(-0.07, 0.11, 0.02)) : F.hb.clone().add(v3(0, -0.11, -0.03));
      const forkSide = L.fork === 'rigid' ? 0.06 : 0.09;
      B.curve('dark', [lvL, lvL.clone().add(v3(0.03, -0.05, -0.06)), htFront.clone().add(v3(-0.05, 0.02, -0.02)), mid(crown, Fw, 0.3).add(v3(-forkSide, 0, -0.03)), fCal], 0.0035, 30, 5);
      const dtA = mid(bb, F.hb, 0.82).add(v3(0, -0.045, 0)), dtB = mid(bb, F.hb, 0.12).add(v3(0, -0.05, 0));
      const rCal = L.disc !== false ? R.clone().add(v3(-0.07, 0.1, -0.02)) : F.st.clone().add(v3(0, -0.08, 0.03));
      const rDer = R.clone().add(v3(0.07, -0.02, 0.02));
      for (const [lv, dx, end] of [[lvR, 0.012, rCal], [lvR.clone().add(v3(-0.03, -0.02, 0.02)), -0.012, rDer]]) {
        const sideX = end === rDer ? 0.035 : -0.035;
        B.curve('dark', [lv, lv.clone().add(v3(-0.02, -0.06, -0.05)), htFront.clone().add(v3(0.04 + dx, 0.0, -0.01)), F.hb.clone().add(v3(dx, -0.02, -0.04)), dtA.clone().add(v3(dx, 0, 0)), dtB.clone().add(v3(dx, 0, 0)), bb.clone().add(v3(sideX, -0.06, 0.06)), mid(bb, R, 0.5).add(v3(sideX, 0.03, 0)), end], 0.0033, 60, 4);
      }
    }
  }

  // Trinkflasche (Rennrad/Gravel)
  if (L.frame === 'road' && !low) {
    const m0 = bb.clone().lerp(F.hb, 0.42);
    const dd = F.hb.clone().sub(bb).normalize();
    const nrm = v3(0, dd.z, -dd.y).negate(); // senkrecht zum Unterrohr, nach oben
    const a = m0.clone().addScaledVector(nrm, 0.05), b = a.clone().addScaledVector(dd, 0.19);
    B.tube('accent', a, b, 0.035, 0.035, seg + 2);
    B.tube('dark', b, b.clone().addScaledVector(dd, 0.025), 0.03, 0.016, seg);
    B.tube('dark', a.clone().addScaledVector(dd, 0.02).addScaledVector(nrm, -0.01), a.clone().addScaledVector(dd, 0.06).addScaledVector(nrm, -0.01), 0.037, 0.037, seg + 2); // Halter
  }

  // =====================================================================================
  // ----- Fahrer (statisch): Rumpf, Arme, Hände, Kopf -----
  // =====================================================================================
  const nT = low ? 12 : 30, nR = low ? 9 : 20;
  const TORSO = 0.53, SHX = 0.172;
  const hipC = v3(0, F.saddleY + 0.105, F.saddleZ - 0.02).add(PZ.hip);
  // Schulterhöhe aus zwei Kreisen (Rumpflänge um die Hüfte, Armreichweite um den Griff) in der y-z-Ebene
  const rb = Math.sqrt(Math.max(0.02, PZ.reach * PZ.reach - (grip.x - SHX) ** 2));
  const gy = grip.y - hipC.y, gz = grip.z - hipC.z, gD = Math.hypot(gy, gz);
  const ang = Math.acos(clamp((TORSO * TORSO + gD * gD - rb * rb) / (2 * TORSO * gD), -1, 1));
  const by = gy / gD, bz = gz / gD;
  const dY = by * Math.cos(ang) + -bz * Math.sin(ang), dZ = bz * Math.cos(ang) + by * Math.sin(ang);
  const d = v3(0, dY, dZ).normalize(); // Rumpfachse (Hüfte → Schulter)
  const bn = v3(0, -d.z, d.y); // Rücken-Normale (nach oben/hinten)
  const chest = bn.clone().negate();
  const sp = (s, b = 0) => hipC.clone().addScaledVector(d, s).addScaledVector(bn, b);
  const spine = spline([sp(-0.19), sp(0), sp(0.26, PZ.curv), sp(0.52, PZ.curv * 0.35), sp(0.7, -0.005)]);
  const s0 = 0.19;
  const torsoFn = (s) => prof(TORSO_P, s);
  const tOpt = { s0, ref: chest, nT, nR, ex: 2.3 };
  // Hose (Bib) unten, Trikot oben (etwas weiter, MTB lockerer)
  const hem = roadKit ? 0.03 : 0.0;
  B.put('shorts', loft(spine, torsoFn, { ...tOpt, a: -0.172, b: hem + 0.04, nT: Math.round(nT * 0.45), ends: 0.75, grow: roadKit ? 0.002 : 0.007 }));
  const loose = roadKit ? 0.0045 : 0.014;
  const jerseyFn = (s) => { const p = torsoFn(s); const k = s < 0.55 ? loose * (1 - smooth((s - 0.3) / 0.25) * 0.5) : loose * 0.5; return [p[0] + (p[0] > 0.01 ? k : 0), p[1] + (p[1] > 0.01 ? k : 0), p[2]]; };
  B.put('jersey', loft(spine, jerseyFn, { ...tOpt, a: hem, b: 0.685, ends: 0.4, u0: 0.498, u1: 0.002, v0: 0.02, v1: 0.985 }));
  // Startnummer auf dem Rücken
  if (numTex) {
    const s = 0.3, p = torsoFn(s);
    const c = spine.getPointAt(clamp((s + s0) / spine.getLength(), 0, 1));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.112), new THREE.MeshStandardMaterial({ map: numTex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.copy(c).addScaledVector(bn, p[1] - p[2] + loose + 0.004);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v3(1, 0, 0), d, bn));
    m.castShadow = false;
    group.add(m);
  }

  // ----- Hals + Kopf -----
  const neckBase = sp(0.6, -0.005);
  const nd = d.clone().lerp(UP, PZ.neck).normalize();
  const neckTop = neckBase.clone().addScaledVector(nd, 0.115);
  const headQ = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -PZ.pitch);
  const HC = neckTop.clone().add(v3(0, 0.07, -0.03).applyQuaternion(headQ));
  const headM = new THREE.Matrix4().compose(HC, headQ, v3(1.06, 1.06, 1.06));
  const neckFn = (s) => [0.055 - s * 0.03, 0.058 - s * 0.03, 0.004];
  const neckA = neckBase.clone().addScaledVector(nd, -0.04), neckB = HC.clone().add(v3(0, -0.02, 0.025).applyQuaternion(headQ));
  B.put('skin', loft(line(neckA, neckB), neckFn, { a: 0, b: neckA.distanceTo(neckB), s0: 0, ref: v3(0, -nd.z, nd.y).negate(), nT: low ? 3 : 6, nR: low ? 8 : 14 }));
  B.xf = headM; // ab hier: Kopf-lokale Koordinaten (y oben, −z Gesicht)
  B.put('skin', loft(line(v3(0, -0.13, 0), v3(0, 0.13, 0)), (s) => prof(HEAD_P, s - 0.13), { a: 0.005, b: 0.258, s0: 0, ref: v3(0, 0, -1), nT: low ? 10 : 24, nR: low ? 10 : 20, ex: 2.15, ends: 0.5 }));
  if (!low) {
    B.ell('skin', v3(0, -0.006, -0.095), 0.0095, 0.024, 0.014, -0.4, 8); // Nase
    B.ell('skin', v3(0, -0.026, -0.097), 0.014, 0.0075, 0.009, 0, 8); // Nasenflügel
    B.ell('dark', v3(0, -0.056, -0.093), 0.019, 0.0035, 0.006, 0, 6); // Mund
    for (const sx of [-1, 1]) {
      B.ell('skin', v3(sx * 0.073, -0.006, 0.012), 0.011, 0.029, 0.019, 0.15, 8); // Ohren
      if (!RD.glasses || RD.helmetType === 'full') {
        B.ell('sock', v3(sx * 0.031, 0.013, -0.084), 0.012, 0.008, 0.006, 0, 8); // Augapfel
        B.ell('dark', v3(sx * 0.031, 0.013, -0.0895), 0.0055, 0.0055, 0.003, 0, 6); // Pupille
      }
      B.ell('hair', v3(sx * 0.032, 0.031, -0.09), 0.017, 0.0035, 0.006, 0.1, 6); // Augenbrauen
    }
  }
  // Haare (unter dem Helm sichtbar)
  const hs = RD.hairStyle;
  if (hs !== 'none') {
    B.ell('hair', v3(0, 0.02, 0.012), 0.081, 0.088, 0.1, 0, low ? 8 : 12);
    if (!low) for (const sx of [-1, 1]) B.ell('hair', v3(sx * 0.07, 0.0, -0.035), 0.008, 0.025, 0.014, 0, 6); // Koteletten
    if (hs === 'pony') { B.ell('hair', v3(0, -0.02, 0.1), 0.026, 0.024, 0.024, 0, 6); B.curve('hair', [v3(0, -0.025, 0.112), v3(0, -0.06, 0.15), v3(0, -0.13, 0.17)], 0.02, 8, 6); B.ell('hair', v3(0, -0.14, 0.17), 0.016, 0.03, 0.014, 0.3, 6); }
    else if (hs === 'long') { // fällt unter dem Helm über den Nacken
      const lh = line(v3(0, 0.0, 0.075), v3(0, -0.24, 0.2));
      B.put('hair', loft(lh, (s) => { const k = s / 0.27; return [0.074 + 0.012 * k - (k > 0.9 ? (k - 0.9) * 0.6 : 0), 0.03 - 0.014 * k, -0.01]; }, { a: 0, b: 0.27, ref: v3(0, -0.45, -1).normalize(), nT: low ? 4 : 10, nR: low ? 8 : 14, ex: 2.5 }));
    }
    else if (hs === 'curly' && !low) { for (let i = 0; i < 11; i++) { const a = (i / 10) * Math.PI; B.ell('hair', v3(Math.cos(a) * 0.075, -0.03 - Math.sin(a) * 0.012 - (i % 2) * 0.012, 0.055 + Math.sin(a) * 0.05), 0.032, 0.032, 0.032, 0, 6); } }
  }
  // Helm (Kopf-lokal)
  const ht = RD.helmetType;
  // Helmschale = vergrößertes Kopfprofil (folgt der Kopfform), unten offen, um tilt nach hinten gekippt
  const shellM = (tilt, dz) => new THREE.Matrix4().compose(v3(0, 0, dz), new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), tilt), _one);
  const shellFn = (kx, ky, kz, g, P = HEAD_P) => (y) => { const p = prof(P, y / ky); return [p[0] * kx + (p[0] > 0.004 ? g : 0), p[1] * kz + (p[1] > 0.004 ? g : 0), p[2] * kz]; };
  const shellGeo = (fn, yA, yB, M, nt = 18) => loft(line(v3(0, -0.3, 0), v3(0, 0.3, 0)), (s) => fn(s - 0.3), { a: yA + 0.3, b: yB + 0.3, s0: 0, ref: v3(0, 0, -1), nT: low ? Math.ceil(nt / 2) : nt, nR: low ? 12 : 26, ex: 2.2 }).applyMatrix4(M);
  // Punkt auf der Schalen-Oberseite über (x, z) (lokal, vor dem Kippen)
  const shellTop = (fn, x, z, yA, yB) => { for (let y = yB; y > yA; y -= 0.002) { const [w, dd, o] = fn(y); if (w > 0 && (x / w) ** 2 + ((z + o) / dd) ** 2 <= 1) return y; } return yA; };
  const vents = (fn, M, yA, yB, list) => { if (low) return; for (const [x, z, len, rot] of list) { const y = shellTop(fn, x, z, yA, yB); _q.setFromAxisAngle(v3(1, 0, 0), rot); _m.compose(v3(x, y - 0.0068, z), _q, v3(0.0085, 0.0062, len)); B.add('dark', new THREE.SphereGeometry(1, 8, 6), _m.premultiply(M)); } };
  if (ht === 'road' || ht === 'mtb') {
    const road = ht === 'road';
    const fn = road ? shellFn(1.0, 1.16, 1.12, 0.026) : shellFn(1.02, 1.15, 1.08, 0.028);
    const M = shellM(road ? 0.24 : 0.32, road ? 0.012 : 0.008);
    const yA = road ? 0.0 : -0.02, yB = 0.126 * (road ? 1.16 : 1.15);
    B.put('helmet', shellGeo(fn, yA, yB, M));
    if (!low) B.put('dark', shellGeo((y) => { const p = fn(y); return [p[0] + 0.002, p[1] + 0.002, p[2]]; }, yA, yA + 0.012, M, 2)); // Schalenrand
    if (road) {
      vents(fn, M, yA, yB, [[-0.058, 0.0, 0.07, 0.05], [-0.022, 0.01, 0.085, 0.05], [0.022, 0.01, 0.085, 0.05], [0.058, 0.0, 0.07, 0.05], [-0.035, -0.09, 0.022, 0.5], [0, -0.1, 0.02, 0.5], [0.035, -0.09, 0.022, 0.5]]);
    } else {
      vents(fn, M, yA, yB, [[-0.05, 0.0, 0.06, 0.05], [0, 0.0, 0.07, 0.05], [0.05, 0.0, 0.06, 0.05]]);
      const pv = fn(0.0);
      const visor = new THREE.RingGeometry(pv[0] * 0.97, pv[0] * 0.97 + 0.05, 12, 1, Math.PI / 2 - 0.7, 1.4).rotateX(-Math.PI / 2).scale(1, 1, (pv[1] + pv[2]) / pv[0]);
      B.add('helmet', visor, new THREE.Matrix4().compose(v3(0, 0.002, 0), new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -0.28), _one).premultiply(M)); // Schirm
    }
  } else { // Fullface: Schale mit echter Gesichtsöffnung (vorn unten zurückversetzt), Kinnbügel, Goggle
    const FF = [ // y, halbe Breite, vorn, hinten
      [-0.14, 0.11, -0.005, 0.128], [-0.09, 0.121, 0.012, 0.14], [-0.03, 0.126, 0.026, 0.147], [0.015, 0.127, 0.05, 0.149], [0.042, 0.127, 0.128, 0.148],
      [0.08, 0.121, 0.128, 0.142], [0.11, 0.106, 0.11, 0.127], [0.138, 0.078, 0.078, 0.092], [0.156, 0.038, 0.038, 0.046], [0.163, 0.0, 0.0, 0.0],
    ].map(([y, w, f, b]) => [y, w, (f + b) / 2, (f - b) / 2]);
    const fn = shellFn(1, 1, 1, 0, FF);
    const M = shellM(0.06, 0.0);
    B.put('helmet', shellGeo(fn, -0.14, 0.163, M, 26));
    if (!low) B.put('dark', shellGeo((y) => { const p = fn(y); return [p[0] + 0.002, p[1] + 0.002, p[2]]; }, -0.14, -0.128, M, 2)); // Rand
    // Kinnbügel: flacher Loft von Wange zu Wange
    const cbC = spline([v3(-0.118, -0.03, 0.02), v3(-0.108, -0.07, -0.05), v3(-0.06, -0.097, -0.11), v3(0, -0.103, -0.128), v3(0.06, -0.097, -0.11), v3(0.108, -0.07, -0.05), v3(0.118, -0.03, 0.02)]);
    const cbL = cbC.getLength();
    const cbG = loft(cbC, (s) => { const e = Math.min(s, cbL - s); const k = smooth(e / 0.05); return [0.012 + 0.008 * k, 0.03 + 0.012 * k, 0]; }, { a: 0, b: cbL, ref: UP, nT: low ? 10 : 26, nR: low ? 6 : 10, ex: 2.6 });
    B.put('helmet', cbG.applyMatrix4(M));
    if (!low) { // Lüftungsgitter vorn am Kinnbügel
      for (const x of [-0.022, 0, 0.022]) { _m.compose(v3(x, -0.1, -0.142), _q.setFromAxisAngle(v3(1, 0, 0), 0.25), v3(0.007, 0.018, 0.006)); B.add('dark', new THREE.SphereGeometry(1, 6, 4), _m.premultiply(M)); }
      vents(fn, M, -0.14, 0.163, [[-0.045, -0.02, 0.05, 0.3], [0, -0.03, 0.055, 0.3], [0.045, -0.02, 0.05, 0.3]]);
    }
    // Goggle: Band (Akzentfarbe) um die Schale + gebogene Scheibe in der Öffnung
    B.put('accent', shellGeo((y) => { const p = fn(y); return [p[0] + 0.005, p[1] + 0.005, p[2]]; }, 0.004, 0.04, M, 2));
    const gog = new THREE.CylinderGeometry(0.112, 0.112, 0.048, low ? 10 : 20, 1, true, Math.PI - 1.15, 2.3);
    B.add('glass', gog, new THREE.Matrix4().compose(v3(0, 0.02, -0.004), _q.identity(), v3(0.98, 1, 0.98)).premultiply(M));
    if (!low) {
      const gf = new THREE.TorusGeometry(0.112, 0.0055, 4, 24, 2.3).rotateX(-Math.PI / 2).rotateY(Math.PI / 2 - 1.15).scale(0.98, 1, 0.98);
      for (const y of [-0.004, 0.044]) B.add('dark', gf, new THREE.Matrix4().makeTranslation(0, y, -0.004).premultiply(M)); // Goggle-Rahmen
    }
    // Schirm: gebogener Ring-Ausschnitt über der Stirn
    const pv = fn(0.06);
    const visor = new THREE.RingGeometry(pv[0] * 0.95, pv[0] * 0.95 + 0.06, low ? 6 : 12, 1, Math.PI / 2 - 0.8, 1.6).rotateX(-Math.PI / 2).scale(1, 1, (pv[1] + pv[2]) / pv[0]);
    B.add('helmet', visor, new THREE.Matrix4().compose(v3(0, 0.07, 0), new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), 0.22), _one).premultiply(M));
  }
  if (!low && ht !== 'full') { // Kinnriemen
    for (const sx of [-1, 1]) B.curve('dark', [v3(sx * 0.082, -0.0, 0.0), v3(sx * 0.07, -0.07, -0.025), v3(sx * 0.03, -0.118, -0.06)], 0.004, 6, 4);
  }
  if (RD.glasses && ht !== 'full' && !low) { // Sportbrille: gebogene Scheibe + Bügel
    const lens = new THREE.CylinderGeometry(0.1, 0.1, 0.052, 20, 1, true, Math.PI - 1.0, 2.0);
    B.add('glass', lens, new THREE.Matrix4().compose(v3(0, 0.018, -0.006), new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), 0.08), v3(0.86, 1, 1.06)));
    B.ell('dark', v3(0, 0.038, -0.1), 0.07, 0.006, 0.012, 0, 8); // Rahmen oben
    for (const sx of [-1, 1]) B.tube('dark', v3(sx * 0.074, 0.02, -0.06), v3(sx * 0.08, 0.016, 0.02), 0.004, 0.004, 4);
  }
  B.xf = null;

  // ----- Arme: Schulter → Ellbogen → Handgelenk (Zwei-Gelenk-IK), Hände greifen den Lenker -----
  const longSleeve = !roadKit;
  const ik = (a, c, l1, l2, pole) => {
    const ac = c.clone().sub(a);
    const D = clamp(ac.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    ac.normalize();
    const cA = (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D);
    const pp = pole.clone().addScaledVector(ac, -pole.dot(ac)).normalize();
    return a.clone().addScaledVector(ac, l1 * cA).addScaledVector(pp, l1 * Math.sqrt(Math.max(0, 1 - cA * cA)));
  };
  const armFn = (s) => prof(ARM_P, s);
  for (const sx of [-1, 1]) {
    const Sj = sp(0.525, -0.012).add(v3(sx * SHX, 0, 0));
    const G = v3(sx * grip.x, grip.y, grip.z);
    const W = G.clone().addScaledVector(Sj.clone().sub(G).normalize(), 0.075).add(v3(0, 0.012, 0));
    const pole = v3(sx * PZ.pole.x, PZ.pole.y, PZ.pole.z);
    const E = ik(Sj, W, 0.3, 0.27, pole);
    const fw = W.clone().sub(E).normalize();
    const arm = spline([Sj.clone().add(v3(-sx * 0.06, 0.01, 0)), Sj, mid(Sj, E, 0.5), E, mid(E, W, 0.5), W, W.clone().addScaledVector(fw, 0.03)]);
    const aO = { s0: 0.061, ref: UP, nT: low ? 10 : 26, nR: low ? 8 : 14, sx };
    const u0 = sx < 0 ? 0.502 : 0.752, u1 = sx < 0 ? 0.748 : 0.998;
    const sleeveEnd = longSleeve ? 0.535 : 0.17;
    B.put('jersey', loft(arm, armFn, { ...aO, a: -0.06, b: sleeveEnd, grow: longSleeve ? 0.007 : 0.003, u0, u1, v0: 0.985, v1: 0.02 }));
    if (!longSleeve) B.put('skin', loft(arm, armFn, { ...aO, a: sleeveEnd - 0.01, b: 0.575, nT: low ? 8 : 20 }));
    B.put('glove', loft(arm, armFn, { ...aO, a: 0.53, b: 0.6, nT: 3, grow: 0.0035 })); // Handschuh-Bündchen
    // Hand: Handrücken auf dem Griff, Finger als Wulst um den Griff, Daumen
    const ax = gripAxis.clone(); // Griff-Achse
    const topV = UP.clone().addScaledVector(ax, -UP.dot(ax)).normalize();
    const side = new THREE.Vector3().crossVectors(ax, topV);
    const back = Sj.clone().sub(G); back.addScaledVector(ax, -back.dot(ax)).normalize(); // vom Griff zum Fahrer
    const palmC = G.clone().addScaledVector(topV, gripR + 0.012).addScaledVector(back, 0.018);
    const hb = new THREE.Matrix4().makeBasis(ax, topV, side);
    _q.setFromRotationMatrix(hb);
    _m.compose(palmC, _q, v3(0.045, 0.02, 0.042));
    B.add('glove', new THREE.SphereGeometry(1, low ? 8 : 12, low ? 6 : 8), _m); // Handrücken
    B.tube('glove', W.clone().addScaledVector(fw, -0.01), palmC.clone().addScaledVector(back, 0.012), 0.029, 0.031, low ? 6 : 10); // Handgelenk → Hand
    // Finger um den Griff: Torusbogen, Lücke oben-hinten (dort liegt der Handballen)
    const fing = new THREE.TorusGeometry(gripR + 0.011, 0.0115, low ? 4 : 6, low ? 6 : 12, Math.PI * 1.45);
    const toBack = Math.atan2(back.dot(side), back.dot(topV)); // Winkel der "hinten"-Richtung in der (top, side)-Ebene
    fing.rotateZ(toBack + Math.PI * 0.12);
    fing.scale(1, 1, 3.4);
    const fb = new THREE.Matrix4().makeBasis(topV, side, ax).setPosition(G.clone().addScaledVector(ax, sx > 0 && L.bars !== 'drop' ? -0.002 : 0));
    B.add('glove', fing, fb);
    if (!low) B.tube('glove', palmC.clone().addScaledVector(ax, L.bars === 'drop' ? 0 : -sx * 0.035).addScaledVector(back, -0.005), G.clone().addScaledVector(side, 0).addScaledVector(topV, -0.004).addScaledVector(ax, L.bars === 'drop' ? -sx * 0.03 : -sx * 0.045).addScaledVector(back, -0.02), 0.012, 0.01, 6); // Daumen
  }

  // ----- Dekor: Markenschriftzug -----
  if (!low) {
    const text = def.brandDef.name.toUpperCase();
    const textCol = col.accent === col.frame ? 0xffffff : col.accent;
    const decalMat = (label, fontCss) => new THREE.MeshStandardMaterial({
      map: canvasTex(512, 96, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = hex(textCol);
        g.font = `${fontCss} 72px "Trebuchet MS", "Segoe UI", sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(label, w / 2, h / 2 + 4);
      }),
      transparent: true, roughness: 0.4, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const decal = (label, a, b, rad, hgt, font) => {
      const mat = decalMat(label, font);
      const dir = b.clone().sub(a);
      const len = dir.length();
      dir.normalize();
      for (const sx of [-1, 1]) {
        const side = v3(sx, 0, 0);
        const yAxis = new THREE.Vector3().crossVectors(side, dir).normalize();
        const basis = new THREE.Matrix4().makeBasis(dir.clone().multiplyScalar(sx), yAxis.multiplyScalar(sx), side);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.62, hgt), mat);
        mesh.quaternion.setFromRotationMatrix(basis);
        mesh.position.copy(a).lerp(b, 0.5).add(v3(sx * (rad + 0.002), 0, 0));
        group.add(mesh);
      }
    };
    decal(text, bb.clone().lerp(F.hb, 0.16), bb.clone().lerp(F.hb, 0.95), big ? 0.047 * 0.78 * (L.tubes || 1) + 0.004 : 0.032 * (L.tubes || 1), big ? 0.07 : 0.062, def.brandDef.font);
    decal(def.cat === 'road' ? 'RACE' : def.cat.toUpperCase(), tt0.clone().lerp(F.ht, 0.12), F.ht.clone().lerp(tt0, 0.1), big ? 0.035 * 0.8 * (L.tubes || 1) + 0.003 : 0.02 * (L.tubes || 1), 0.026, '700');
  }

  mats.sock = std(0xf2f2f2, 0.9, 0);
  B.flush(mats, group);

  // ----- Räder -----
  function makeWheel(isRear) {
    const wg = new THREE.Group();
    const WB = new Bucket();
    const tire = L.tire;
    const rimR = r - tire * 2 + 0.004; // Felgenhorn (Reifensitz)
    // Reifen (+ Stollen)
    WB.add('rubber', new THREE.TorusGeometry(r - tire, tire, low ? 6 : 12, low ? 20 : 48).rotateY(Math.PI / 2));
    if (L.tireWall !== 'black') { // farbige Reifenflanke
      for (const sx of [-1, 1]) WB.add('tire', new THREE.RingGeometry(rimR + 0.004, r - tire * 0.75, low ? 20 : 48).rotateY(sx * Math.PI / 2), new THREE.Matrix4().makeTranslation(sx * (tire * 0.86), 0, 0));
    }
    if (!low && L.tread === 'knobs') {
      const n = 44;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        _q.setFromAxisAngle(v3(1, 0, 0), a);
        _m.compose(v3(0, Math.cos(a) * (r - tire * 0.1 + 0.004), Math.sin(a) * (r - tire * 0.1 + 0.004)), _q, _one);
        WB.add('rubber', new THREE.BoxGeometry(tire * 0.7, 0.012, 0.02), _m);
        for (const sx of [-1, 1]) { // Seitenstollen
          const rr = r - tire * 0.45;
          _q.setFromAxisAngle(v3(1, 0, 0), a + 0.07);
          _m.compose(v3(sx * tire * 0.78, Math.cos(a + 0.07) * rr, Math.sin(a + 0.07) * rr), _q, _one);
          WB.add('rubber', new THREE.BoxGeometry(0.014, 0.016, 0.016), _m);
        }
      }
    } else if (!low && L.tread === 'fine') {
      const n = 72;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        for (const sx of [-1, 1]) {
          const rr = r - tire * 0.28;
          _q.setFromAxisAngle(v3(1, 0, 0), a + (sx > 0 ? 0.04 : 0));
          _m.compose(v3(sx * tire * 0.5, Math.cos(a + (sx > 0 ? 0.04 : 0)) * rr, Math.sin(a + (sx > 0 ? 0.04 : 0)) * rr), _q, _one);
          WB.add('rubber', new THREE.BoxGeometry(0.012, 0.007, 0.01), _m);
        }
      }
    }
    // Felge als Drehkörper (Hohlkammerprofil, Tiefe nach Laufradtyp)
    const depth = Math.max(0.02, L.rim);
    const hw = big ? 0.0155 : 0.012;
    const rp = [
      [rimR + 0.003, -hw * 0.95], [rimR - 0.002, -hw], [rimR - depth * 0.55, -hw * 0.92], [rimR - depth + 0.004, -hw * 0.55], [rimR - depth, 0],
      [rimR - depth + 0.004, hw * 0.55], [rimR - depth * 0.55, hw * 0.92], [rimR - 0.002, hw], [rimR + 0.003, hw * 0.95],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    WB.add('rimMat', new THREE.LatheGeometry(rp, low ? 20 : 48).rotateZ(-Math.PI / 2));
    // Speichen + Nabe
    const spokes = low ? 6 : 24;
    const hubR = 0.028;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const side = i % 2 ? 1 : -1;
      const off = side * (isRear && side > 0 ? 0.026 : 0.034);
      const ah = a + side * 0.35; // tangential gekreuzt
      WB.tube('metal', v3(off, Math.cos(ah) * hubR, Math.sin(ah) * hubR), v3(side * 0.004, Math.cos(a) * (rimR - depth + 0.003), Math.sin(a) * (rimR - depth + 0.003)), 0.0018, 0.0018, low ? 3 : 4);
    }
    WB.add('metal', new THREE.CylinderGeometry(0.018, 0.018, 0.1, low ? 8 : 12).rotateZ(Math.PI / 2));
    if (!low) {
      for (const x of [-0.034, isRear ? 0.026 : 0.034]) WB.add('metal', new THREE.CylinderGeometry(0.03, 0.03, 0.004, 16).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, 0, 0)); // Nabenflansche
      WB.add('dark', new THREE.CylinderGeometry(0.0035, 0.0035, 0.032, 6), new THREE.Matrix4().makeTranslation(0, rimR - depth - 0.012, 0)); // Ventil
      // Bremsscheibe
      if (L.disc !== false) {
        WB.add('metal', new THREE.RingGeometry(0.058, 0.09, 24).rotateY(-Math.PI / 2), new THREE.Matrix4().makeTranslation(-0.052, 0, 0));
        WB.add('metal', new THREE.RingGeometry(0.058, 0.09, 24).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(-0.048, 0, 0));
        for (let i = 0; i < 6; i++) { // Spider
          const a = (i / 6) * Math.PI * 2;
          WB.tube('dark', v3(-0.05, Math.cos(a) * 0.02, Math.sin(a) * 0.02), v3(-0.05, Math.cos(a + 0.4) * 0.062, Math.sin(a + 0.4) * 0.062), 0.004, 0.004, 4);
        }
      }
      if (isRear) { // Kassette
        for (let i = 0; i < 8; i++) {
          const rad = COG + 0.004 - i * 0.0055;
          WB.add(i % 2 ? 'dark' : 'metal', new THREE.CylinderGeometry(rad, rad, 0.0035, 18).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(0.028 + i * 0.0045, 0, 0));
        }
      }
    }
    WB.flush(mats, wg);
    return wg;
  }
  const wf = makeWheel(false);
  wf.position.copy(Fw);
  const wr = makeWheel(true);
  wr.position.copy(R);
  group.add(wf, wr);

  // ----- Kurbel (dreht mit) -----
  const CR = 0.17, PX = 0.118;
  const crankG = new THREE.Group();
  crankG.position.copy(bb);
  const pedals = [];
  const flatPedal = L.frame !== 'road';
  {
    const CB = new Bucket();
    // Kettenblatt mit Zähnen
    if (low) CB.add('dark', new THREE.CylinderGeometry(RING - 0.004, RING - 0.004, 0.004, 16).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(chainX, 0, 0));
    else {
      for (const sx of [-1, 1]) CB.add('dark', new THREE.RingGeometry(RING - 0.022, RING, 36, 1).rotateY(sx * Math.PI / 2), new THREE.Matrix4().makeTranslation(chainX + sx * 0.002, 0, 0)); // Kettenblatt (Ring)
      CB.add('metal', new THREE.CylinderGeometry(0.03, 0.03, 0.008, 16).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(chainX + 0.004, 0, 0)); // Spider-Mitte
      CB.add('metal', new THREE.TorusGeometry(RING - 0.006, 0.0035, 4, 36).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(chainX + 0.002, 0, 0));
      const nTeeth = 34;
      for (let i = 0; i < nTeeth; i++) {
        const a = (i / nTeeth) * Math.PI * 2;
        _q.setFromAxisAngle(v3(1, 0, 0), a);
        _m.compose(v3(chainX, Math.cos(a) * (RING + 0.001), Math.sin(a) * (RING + 0.001)), _q, _one);
        CB.add('dark', new THREE.BoxGeometry(0.0035, 0.008, 0.007), _m);
      }
      for (let i = 0; i < 4; i++) { // Spider
        const a = (i / 4) * Math.PI * 2 + 0.4;
        CB.tube('dark', v3(chainX + 0.006, 0, 0), v3(chainX + 0.004, Math.cos(a) * 0.075, Math.sin(a) * 0.075), 0.009, 0.006, 6);
      }
    }
    // Kurbelarme (flach, konisch)
    for (const sx of [1, -1]) {
      const g = new THREE.CylinderGeometry(0.011, 0.016, CR, low ? 6 : 10).scale(0.65, 1, 1);
      CB.add('dark', g, new THREE.Matrix4().makeTranslation(sx * 0.078, sx * CR / 2, 0));
      if (!low) CB.add('metal', new THREE.CylinderGeometry(0.012, 0.012, 0.006, 10).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(sx * 0.083, sx * CR, 0));
    }
    CB.tube('metal', v3(-0.08, 0, 0), v3(0.08, 0, 0), 0.012, 0.012, 8); // Achse
    CB.flush(mats, crankG);
    for (const sx of [1, -1]) {
      let geo;
      if (low) geo = new THREE.BoxGeometry(0.09, 0.018, 0.09);
      else if (flatPedal) { // Plattform mit Pins
        const parts = [new THREE.BoxGeometry(0.095, 0.016, 0.1), new THREE.CylinderGeometry(0.008, 0.008, 0.07, 8).rotateZ(Math.PI / 2).translate(-sx * 0.01, 0, 0)];
        for (const px of [-0.035, 0.035]) for (const pz of [-0.042, -0.014, 0.014, 0.042]) for (const py of [-1, 1]) parts.push(new THREE.CylinderGeometry(0.002, 0.002, 0.008, 4).translate(px, py * 0.011, pz));
        geo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
      } else { // Klickpedal
        const parts = [new THREE.SphereGeometry(1, 12, 8).scale(0.034, 0.011, 0.04), new THREE.BoxGeometry(0.05, 0.008, 0.03).translate(0, 0.009, 0.012), new THREE.CylinderGeometry(0.007, 0.007, 0.05, 8).rotateZ(Math.PI / 2).translate(-sx * 0.03, 0, 0)];
        geo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
      }
      const p = new THREE.Mesh(geo, mats.dark);
      p.position.set(sx * PX, sx * CR, 0);
      p.castShadow = true;
      crankG.add(p);
      pedals.push(p);
    }
  }
  group.add(crankG);

  // =====================================================================================
  // ----- Beine (animiert): EIN SkinnedMesh, je Bein Hüfte → Knie → Knöchel -----
  // =====================================================================================
  const HX = 0.105;
  const legMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0 });
  const legParts = [];
  const cl = (h) => new THREE.Color(h);
  const cSkin = cl(RD.skin), cShorts = cl(col.shorts), cSock = cl(0xf2f2f2), cShoe = cl(col.shoes), cSole = cl(0x18181c), cDark = cl(0x1a1a1d), cAcc = cl(col.accent);
  const padded = def.cat === 'downhill';
  const ankleY = -(LT + LS);
  const soleBot = flatPedal ? 0.096 : 0.087; // Sohle unter dem Knöchel
  function finish(geo, c, side, mode) {
    const n = geo.attributes.position.count;
    const ca = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const b0 = side * 3;
    for (let i = 0; i < n; i++) {
      ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b;
      const s = -geo.attributes.position.getY(i);
      let h = 0, k = 0, a = 0;
      if (mode === 'ankle') a = 1;
      else if (mode === 'hip') h = 1;
      else {
        const tk = smooth((s - (LT - 0.055)) / 0.11), ta = smooth((s - (LT + LS - 0.035)) / 0.07);
        h = 1 - tk; k = tk * (1 - ta); a = tk * ta;
      }
      si[i * 4] = b0; si[i * 4 + 1] = b0 + 1; si[i * 4 + 2] = b0 + 2;
      sw[i * 4] = h; sw[i * 4 + 1] = k; sw[i * 4 + 2] = a;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    legParts.push(geo);
  }
  const lnR = low ? 8 : 14;
  const legFn = (s) => prof(LEG_P, s);
  [-1, 1].forEach((sx, side) => {
    const x = sx * HX;
    const lc = line(v3(x, 0.15, 0), v3(x, -1.0, 0));
    const lo = { s0: 0.15, ref: v3(0, 0, -1), nR: lnR };
    const piece = (a, b, n, c, extra = {}) => finish(loft(lc, extra.fn || legFn, { ...lo, a, b, nT: Math.max(2, Math.round(n * (low ? 0.45 : 1))), ...extra }), c, side, extra.mode);
    if (roadKit) {
      piece(-0.075, 0.215, 12, cShorts, { grow: 0.003, ends: 0.5 });
      piece(0.215, 0.245, 2, cAcc, { grow: 0.0045 }); // Beinabschluss
      piece(0.235, 0.79, 30, cSkin);
      piece(0.79, 0.97, 7, cSock, { grow: 0.002 });
    } else {
      piece(0.2, 0.76, 30, cSkin);
      piece(0.76, 0.97, 7, cSock, { grow: 0.003 });
      // weite Baggy-Shorts, starr am Oberschenkel, mit Saum
      const bag = (s) => { const p = legFn(Math.min(s, 0.3)); const k = (0.006 + 0.022 * smooth((s + 0.0) / 0.3)) * smooth((s + 0.075) / 0.04); const hemIn = smooth((s - 0.385) / 0.015) * 0.022; return [p[0] + k - hemIn, p[1] + k + 0.002 - hemIn, p[2] - 0.004]; };
      piece(-0.075, 0.4, 16, cShorts, { fn: bag, mode: 'hip', ends: 0.4 });
      if (padded) { // Knieschoner
        const pad = (s) => { const p = legFn(s); const e = Math.sin(clamp((s - 0.36) / 0.27, 0, 1) * Math.PI); return [p[0] + 0.012 * e + 0.004, p[1] + 0.008 * e + 0.004, p[2] + 0.014 * e]; };
        piece(0.36, 0.63, 10, cDark, { fn: pad });
      }
    }
    // Schuh im Knöchel-Bezug (Ferse +z, Spitze −z), nur am Knöchel-Knochen
    const fb = flatPedal ? 0.006 : 0;
    const SHOE = [
      [0, 0.013, 0.022, -0.008],
      [0.012, 0.032 + fb, 0.045 + fb, 0.0],
      [0.04, 0.037 + fb, 0.056 + fb, 0.008],
      [0.09, 0.04 + fb, 0.058 + fb, 0.008],
      [0.14, 0.043 + fb, 0.048 + fb, -0.004],
      [0.19, 0.046 + fb, 0.039 + fb, -0.013],
      [0.24, 0.043 + fb, 0.029 + fb, -0.019],
      [0.275, 0.03 + fb, 0.021 + fb, -0.022],
      [0.295, 0.0, 0.008, -0.024],
    ];
    const shoeC = line(v3(x, ankleY - 0.03, 0.082), v3(x, ankleY - 0.03, -0.22));
    const so = { s0: 0, ref: UP, nR: low ? 8 : 14, mode: 'ankle' };
    finish(loft(shoeC, (s) => prof(SHOE, s), { ...so, a: 0, b: 0.295, nT: low ? 6 : 16, ex: 2.4 }), cShoe, side, 'ankle');
    const soleTh = flatPedal ? 0.009 : 0.006;
    const soleC = line(v3(x, ankleY - soleBot + soleTh, 0.082), v3(x, ankleY - soleBot + soleTh, -0.22));
    finish(loft(soleC, (s) => { const p = prof(SHOE, s); return [p[0] > 0.004 ? p[0] + 0.003 : p[0], soleTh, 0]; }, { ...so, a: 0.006, b: 0.29, nT: low ? 4 : 10, ex: 5 }), cSole, side, 'ankle');
    if (!low) {
      if (!flatPedal) { // Drehverschluss + Cleat
        const dial = new THREE.CylinderGeometry(0.014, 0.014, 0.01, 10).rotateX(-0.5).translate(x + sx * 0.022, ankleY + 0.012, -0.05);
        finish(dial, cDark, side, 'ankle');
        finish(new THREE.BoxGeometry(0.04, 0.008, 0.05).translate(x, ankleY - soleBot - 0.002, -0.115), cDark, side, 'ankle');
      } else { // Zehenkappe + Schnürung
        finish(new THREE.SphereGeometry(1, 10, 6).scale(0.046, 0.022, 0.05).translate(x, ankleY - 0.066, -0.17), cSole, side, 'ankle');
        finish(new THREE.BoxGeometry(0.03, 0.006, 0.08).rotateX(0.25).translate(x, ankleY + 0.0, -0.075), cDark, side, 'ankle');
      }
    }
  });
  const legGeo = mergeGeometries(legParts, false);
  legParts.forEach((g) => g.dispose());
  const legMesh = new THREE.SkinnedMesh(legGeo, legMat);
  const bones = [];
  for (const sx of [-1, 1]) {
    const hb = new THREE.Bone(); hb.position.set(sx * HX, 0, 0);
    const kb = new THREE.Bone(); kb.position.set(0, -LT, 0); hb.add(kb);
    const ab = new THREE.Bone(); ab.position.set(0, -LS, 0); kb.add(ab);
    bones.push(hb, kb, ab);
    legMesh.add(hb);
  }
  legMesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  legMesh.bind(skeleton);
  legMesh.frustumCulled = false;
  legMesh.castShadow = true;
  legGeo.addEventListener('dispose', () => skeleton.dispose());
  group.add(legMesh);
  const legs = [-1, 1].map((sx, i) => ({ sx, hip: bones[i * 3], knee: bones[i * 3 + 1], ankle: bones[i * 3 + 2] }));

  const ankOff = v3(0, soleBot + 0.009, 0.115); // Knöchel relativ zur Pedalachse (Fuß-Bezug)
  function pose(crank) {
    crankG.rotation.x = -crank;
    pedals[0].rotation.x = crank;
    pedals[1].rotation.x = crank;
    for (const l of legs) {
      const a = crank + (l.sx > 0 ? 0 : Math.PI);
      const py = bb.y + Math.cos(a) * CR, pz = bb.z - Math.sin(a) * CR;
      const fp = -(0.17 + 0.11 * Math.sin(a - Math.PI / 2)); // Fußneigung (Spitze unten), "Ankle-Pedaling"
      const c = Math.cos(fp), s = Math.sin(fp);
      const ay = py + ankOff.y * c - ankOff.z * s, az = pz + ankOff.y * s + ankOff.z * c;
      const hy = hipC.y, hz = hipC.z;
      const dy = ay - hy, dz = az - hz;
      const D = clamp(Math.hypot(dy, dz), Math.abs(LT - LS) + 1e-3, LT + LS - 1e-3);
      const uy = dy / (Math.hypot(dy, dz) || 1), uz = dz / (Math.hypot(dy, dz) || 1);
      const cb = clamp((LT * LT + D * D - LS * LS) / (2 * LT * D), -1, 1), sb = Math.sqrt(1 - cb * cb);
      // Knie nach vorn (−z)
      const ty = uy * cb - uz * sb, tz = uz * cb + uy * sb;
      const ky = hy + ty * LT, kz = hz + tz * LT;
      const th1 = Math.atan2(-tz, -ty);
      const th2 = Math.atan2(-(az - kz), -(ay - ky));
      l.hip.position.set(l.sx * HX, hy, hz);
      l.hip.rotation.x = th1;
      l.knee.rotation.x = th2 - th1;
      l.ankle.rotation.x = fp - th2;
    }
  }
  pose(0);

  // Startnummer am Lenker (von hinten lesbar)
  if (numTex) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.11), new THREE.MeshStandardMaterial({ map: numTex, transparent: true, roughness: 0.7 }));
    pl.position.copy(stemTop).add(v3(0, L.bars === 'drop' ? 0.05 : 0.075, -0.045));
    pl.rotation.x = -0.35;
    group.add(pl);
  }

  if (opts.shadows === false) group.traverse((o) => { o.castShadow = false; });

  return {
    group,
    wheels: [wf, wr],
    wheelR: r,
    pose,
    spin(dist) { wf.rotation.x = wr.rotation.x = -dist / r; },
  };
}
