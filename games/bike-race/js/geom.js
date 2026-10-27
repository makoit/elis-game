import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Gemeinsame Bauhelfer für Fahrrad- und Motorradmodell (bikes.js, motos.js):
// Profil-Tabellen, Lofts (glatte Körper aus Superellipsen-Querschnitten), Material-Bündel (Bucket), Canvas-Texturen.
// Koordinaten: y oben, vorn = -z, Raddachse entlang x. Einheit Meter.

export const UP = new THREE.Vector3(0, 1, 0);
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const _m = new THREE.Matrix4();
export const _q = new THREE.Quaternion();
export const _one = new THREE.Vector3(1, 1, 1);
export const _dir = new THREE.Vector3();
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

// ---------- Profil-Tabellen: [[s, a, b, c], ...] glatt (kubisch-hermitesch) interpolieren ----------
export function prof(rows, s) {
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
export const _T = new THREE.Vector3(), _N = new THREE.Vector3(), _S = new THREE.Vector3(), _C = new THREE.Vector3();
export function loft(curve, fn, o) {
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
export const line = (a, b) => new THREE.LineCurve3(a, b);
export const spline = (pts) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');

// ---------- Sammler für statische Geometrie ----------
export class Bucket {
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
    for (const [key, raw] of this.lists) {
      // gemischte Listen (z. B. ExtrudeGeometry ohne Index) einheitlich ohne Index zusammenfügen
      const list = raw.some((g) => !g.index) ? raw.map((g) => (g.index ? g.toNonIndexed() : g)) : raw;
      if (list !== raw) raw.forEach((g) => { if (g.index) g.dispose(); });
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) { console.warn('bikes: merge failed', key); continue; }
      const mesh = new THREE.Mesh(merged, materials[key]);
      mesh.castShadow = true;
      group.add(mesh);
    }
  }
}

export function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export const hex = (c) => '#' + c.toString(16).padStart(6, '0');
export const hash01 = (n) => { const x = Math.sin(n * 127.1 + 3.7) * 43758.5453; return x - Math.floor(x); };
