import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './trackdata.js';
import { loadSurface } from './pbr.js';

// Baut aus den Streckendaten die 3D-Welt: Gelände (in Abschnitten, damit Unsichtbares gespart wird),
// Straßenbelag mit Textur, Dekoration, Felsen, Boost-Felder, Start/Ziel.

const MESH_DS = 1.0; // Zeilenabstand des Geländes
const CHUNK = 120; // Meter pro Abschnitt

function canvasTexture(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

// kachelbares Wertrauschen (mehrere Oktaven) → Helligkeit 0..1
function noiseField(size, cells, seed) {
  const rnd = mulberry32(seed);
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => { // x,y in 0..1
    const gx = x * cells, gy = y * cells;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = sm(gx - x0), fy = sm(gy - y0);
    const g = (i, j) => grid[((j % cells) * cells) + (i % cells)];
    const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

function fractalTexture(size, base, contrast, seed, post) {
  return canvasTexture(size, size, (g, w, h) => {
    const n1 = noiseField(w, 8, seed), n2 = noiseField(w, 24, seed + 1), n3 = noiseField(w, 64, seed + 2);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w, v = y / h;
        let n = n1(u, v) * 0.5 + n2(u, v) * 0.3 + n3(u, v) * 0.2;
        n = (n - 0.5) * contrast + 0.5;
        const c = post ? post(n, u, v) : [n, n, n];
        const k = (y * w + x) * 4;
        img.data[k] = Math.max(0, Math.min(255, c[0] * 255 * base[0]));
        img.data[k + 1] = Math.max(0, Math.min(255, c[1] * 255 * base[1]));
        img.data[k + 2] = Math.max(0, Math.min(255, c[2] * 255 * base[2]));
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, true);
}

// ---------------------------------------------------------------------------------------------
// Vegetation & Landschaft: Bausteine (Geometrien mit Vertexfarben, ohne UV → lassen sich mergen)
// ---------------------------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Vertices gleicher Lage gemeinsam verschieben, damit geschlossene Hüllen dicht bleiben
function jitterGeo(g, fn) {
  const pos = g.attributes.position;
  const cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!cache.has(key)) cache.set(key, fn(x, y, z));
    const v = cache.get(key);
    pos.setXYZ(i, v[0], v[1], v[2]);
  }
  g.computeVertexNormals();
  return g;
}

// unregelmäßige Kugel (Blattbüschel, Steine)
function blob(r, detail, seed, squash = 1, smooth = false) {
  const rnd = mulberry32(seed);
  let g = new THREE.IcosahedronGeometry(r, detail);
  if (smooth) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g); } // weiche Normalen
  return jitterGeo(g, (x, y, z) => { const f = 0.82 + rnd() * 0.36; return [x * f, y * f * squash, z * f]; });
}

// Zylinder zwischen zwei Punkten (Stamm, Äste)
function tubeGeo(a, b, r1, r2, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// Vertexfarben per Funktion (c, x, y, z, faceIndex); entfernt UVs, damit alles zusammengefügt werden kann
function vcol(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(c, pos.getX(i), pos.getY(i), pos.getZ(i), Math.floor(i / 3));
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Rinde: leicht fleckig, unten dunkler; birch = weiß mit dunklen Querstreifen
const barkFn = (hex, seed = 0, birch = false) => {
  const base = new THREE.Color(hex);
  return (c, x, y, z, f) => {
    const n = hash(f * 3.17 + seed);
    c.copy(base).multiplyScalar((0.72 + 0.32 * n) * (0.75 + 0.25 * clamp01(y / 3)));
    if (birch && hash(Math.floor(y * 4) * 1.7 + seed) > 0.72) c.multiplyScalar(0.25);
  };
};
// Laub: innen und unten dunkler (Selbstverschattung), oben sonnig heller, fleckig pro Dreieck
const leafFn = (leafHex, tipHex, C, R, sq, seed) => {
  const leaf = new THREE.Color(leafHex), tip = new THREE.Color(tipHex);
  return (c, x, y, z, f) => {
    const d = Math.min(1.2, Math.hypot(x - C.x, (y - C.y) / Math.max(0.4, sq), z - C.z) / R);
    const h = clamp01((y - (C.y - R * sq)) / (2 * R * sq));
    const n = hash(Math.round(x * 9) * 1.31 + Math.round(y * 9) * 7.7 + Math.round(z * 9) * 3.9 + seed);
    c.copy(leaf).lerp(tip, h * h * (0.25 + 0.5 * n));
    c.multiplyScalar((0.55 + 0.5 * Math.pow(Math.min(1, d), 1.6)) * (0.8 + 0.4 * h) * (0.84 + 0.32 * n));
  };
};

// Laubbaum (Eiche/Linde/Walnuss/Birke): leicht schiefer, zweiteiliger Stamm, Äste, Krone aus vielen Blattbüscheln
function broadleaf(seed, hi, o = {}) {
  const rnd = mulberry32(seed);
  const H = (o.H ?? 2.6) * (0.9 + rnd() * 0.25), R = (o.R ?? 2.0) * (0.9 + rnd() * 0.2), sq = o.squash ?? 0.8;
  const tr = o.trunkR ?? 0.26, seg = hi ? 7 : 5;
  const lx = (rnd() - 0.5) * 0.7, lz = (rnd() - 0.5) * 0.7;
  const p1 = V(lx * 0.35, H * 0.55, lz * 0.35), p2 = V(lx, H, lz);
  const bark = barkFn(o.bark ?? 0x5a4330, seed, o.birch);
  const parts = [
    vcol(tubeGeo(V(0, -0.4, 0), p1, tr * 1.3, tr * 0.85, seg), bark),
    vcol(tubeGeo(p1, p2, tr * 0.85, tr * 0.55, seg), bark),
  ];
  const C = V(lx, H + R * sq * 0.55, lz);
  if (hi) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rnd();
      const end = V(C.x + Math.cos(a) * R * 0.6, C.y - R * sq * 0.15 + rnd() * R * sq * 0.4, C.z + Math.sin(a) * R * 0.6);
      parts.push(vcol(tubeGeo(p1.clone().lerp(p2, 0.5 + rnd() * 0.4), end, tr * 0.45, tr * 0.15, 5), bark));
    }
  }
  const lf = leafFn(o.leaf ?? 0x3b8a3c, o.tip ?? 0x9bc858, C, R, sq, seed);
  parts.push(vcol(blob(R * 0.75, 1, seed + 1, sq, hi).translate(C.x, C.y, C.z), lf));
  const n = !hi ? 4 : hi === 2 ? (o.n ?? 10) : Math.ceil((o.n ?? 10) * 0.6); // hi: 0 Tablet, 1 Mittel, 2 Hoch
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, el = -0.45 + rnd() * 1.35;
    const dist = R * (0.45 + rnd() * 0.3);
    const px = C.x + Math.cos(a) * Math.cos(el) * dist, py = C.y + Math.sin(el) * dist * sq, pz = C.z + Math.sin(a) * Math.cos(el) * dist;
    const r = R * (0.36 + rnd() * 0.22) * (el < 0 ? 0.85 : 1);
    parts.push(vcol(blob(r, hi ? 1 : 0, seed + 10 + i, 0.85, hi).translate(px, py, pz), lf));
  }
  return mergeGeometries(parts);
}

// Fichte/Tanne: viele unregelmäßige, hängende Astetagen
function conifer(seed, hi, o = {}) {
  const rnd = mulberry32(seed);
  const H = (o.H ?? 7.5) * (0.9 + rnd() * 0.25), R = (o.R ?? 2.0) * (0.9 + rnd() * 0.2);
  const tiers = hi ? (o.tiers ?? 8) : 4, seg = hi ? 9 : 7;
  const parts = [vcol(tubeGeo(V(0, -0.4, 0), V(0, H * 0.6, 0), 0.24, 0.1, 6), barkFn(0x4a3322, seed))];
  const needle = new THREE.Color(o.leaf ?? 0x245f38), tip = new THREE.Color(o.tip ?? 0x4f8a50);
  const y0 = H * 0.13, span = H - y0;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const y = y0 + span * t * 0.9;
    const r = R * Math.pow(1 - t, 1.05) * (0.85 + rnd() * 0.3) + 0.22;
    const h = (span / tiers) * 2.3 * (1 - t * 0.25);
    const g = new THREE.ConeGeometry(r, h, seg, 1).rotateY(rnd() * 6.28).translate(0, y + h / 2, 0);
    jitterGeo(g, (x, yy, z) => {
      if (Math.abs(yy - y) < 1e-3 && x * x + z * z > 0.01) { const k = 0.72 + rnd() * 0.5; return [x * k, yy - rnd() * 0.4 * (1 - t * 0.5), z * k]; }
      return [x, yy, z];
    });
    parts.push(vcol(g, (c, x, yy, z, f) => {
      const rr = Math.min(1, Math.hypot(x, z) / r);
      const n = hash(f * 5.3 + seed + i);
      c.copy(needle).lerp(tip, rr * rr * 0.45 * n + t * 0.15).multiplyScalar((0.45 + 0.55 * rr) * (0.7 + 0.35 * t) * (0.85 + 0.3 * n));
    }));
  }
  return mergeGeometries(parts);
}

// Palme: gebogener, geringelter Stamm, hängende, gefaltete Wedel (Material doppelseitig)
function palm(seed, hi) {
  const rnd = mulberry32(seed);
  const H = 5.5 + rnd() * 2, bend = 0.8 + rnd() * 1.4, n = hi ? 7 : 4;
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push(V(bend * t * t, H * t - (i === 0 ? 0.4 : 0), 0)); }
  const parts = [];
  for (let i = 0; i < n; i++) {
    const r1 = 0.3 - 0.13 * (i / n), r2 = 0.3 - 0.13 * ((i + 1) / n);
    parts.push(vcol(tubeGeo(pts[i], pts[i + 1], r1, r2 * 0.92, hi ? 7 : 5), barkFn(i % 2 ? 0x8a6a42 : 0x9d7c50, seed + i)));
  }
  const top = pts[n];
  const k = hi ? 10 : 6, st = hi ? 6 : 3;
  const pos = [];
  const dark = new THREE.Color(0x2b5f26), light = new THREE.Color(0x6aa040);
  const cols = [];
  for (let j = 0; j < k; j++) {
    const a = (j / k) * Math.PI * 2 + rnd() * 0.4;
    const L = 3.0 + rnd() * 1.0, droop = 0.55 + rnd() * 0.5, lift = 0.25 + rnd() * 0.35;
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    const st3 = [];
    for (let i = 0; i <= st; i++) {
      const t = i / st;
      const cx = top.x + dx * L * t, cz = top.z + dz * L * t, cy = top.y + L * (lift * t - droop * t * t);
      const w = 0.6 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.95)), 0.7);
      st3.push([[cx + sx * w, cy - 0.22 * w, cz + sz * w], [cx, cy + 0.05, cz], [cx - sx * w, cy - 0.22 * w, cz - sz * w], t]);
    }
    for (let i = 0; i < st; i++) {
      const A = st3[i], B = st3[i + 1];
      for (const [p, q2, r3, tt] of [[A[0], B[0], A[1], A[3]], [B[0], B[1], A[1], B[3]], [A[1], B[1], A[2], A[3]], [B[1], B[2], A[2], B[3]]]) {
        pos.push(...p, ...q2, ...r3);
        const c = dark.clone().lerp(light, tt * (0.6 + 0.4 * hash(j * 7 + i)));
        for (let v = 0; v < 3; v++) cols.push(c.r, c.g, c.b);
      }
    }
  }
  const fr = new THREE.BufferGeometry();
  fr.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fr.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  fr.computeVertexNormals();
  parts.push(fr);
  if (hi) for (let i = 0; i < 3; i++) parts.push(vcol(new THREE.IcosahedronGeometry(0.16, 0).translate(top.x + Math.cos(i * 2.1) * 0.22, top.y - 0.25, top.z + Math.sin(i * 2.1) * 0.22), barkFn(0x5a4020, i)));
  return mergeGeometries(parts);
}

// Saguaro-Kaktus mit Rippen und gebogenen Armen
function saguaro(seed, hi) {
  const rnd = mulberry32(seed);
  const H = 3.0 + rnd() * 1.6, r = 0.34 + rnd() * 0.08, seg = hi ? 12 : 8;
  const green = new THREE.Color(0x4f7f43), lightG = new THREE.Color(0x7aa060);
  const cf = (c, x, y, z, f) => { c.copy(green).lerp(lightG, clamp01(y / H) * 0.4).multiplyScalar(0.8 + 0.3 * hash(f * 1.3 + seed)); };
  const rib = (g) => jitterGeo(g, (x, y, z) => {
    const a = Math.atan2(z, x);
    const idx = Math.round(((a + Math.PI) / (Math.PI * 2)) * seg);
    const k = idx % 2 ? 0.86 : 1;
    return [x * k, y, z * k];
  });
  const parts = [
    vcol(rib(new THREE.CylinderGeometry(r, r * 1.08, H + 0.4, seg, hi ? 3 : 1).translate(0, H / 2 - 0.2, 0)), cf),
    vcol(new THREE.SphereGeometry(r, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, H, 0), cf),
  ];
  const arms = hi ? 1 + Math.floor(rnd() * 2.5) : 1;
  for (let i = 0; i < arms; i++) {
    const a = rnd() * 6.28, y0 = H * (0.35 + rnd() * 0.25), out = 0.75 + rnd() * 0.2, up = 0.8 + rnd() * 0.9, ra = r * 0.6;
    const e = V(Math.cos(a) * out, y0 + 0.2, Math.sin(a) * out);
    parts.push(vcol(tubeGeo(V(0, y0 - 0.1, 0), e, ra, ra, hi ? 8 : 6), cf));
    parts.push(vcol(tubeGeo(e.clone().setY(e.y - 0.15), V(e.x, e.y + up, e.z), ra, ra * 0.95, hi ? 8 : 6), cf));
    parts.push(vcol(new THREE.SphereGeometry(ra * 0.95, hi ? 8 : 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(e.x, e.y + up, e.z), cf));
  }
  return mergeGeometries(parts);
}

// abgestorbener Baum (Wüste)
function deadTree(seed, hi) {
  const rnd = mulberry32(seed);
  const bark = barkFn(0x7a6a5a, seed);
  const parts = [];
  const grow = (a, dir, len, r, depth) => {
    const b = a.clone().addScaledVector(dir, len);
    parts.push(vcol(tubeGeo(a, b, r, r * 0.65, hi ? 6 : 4), bark));
    if (depth <= 0) return;
    const nb = depth > 1 ? 2 : 2 + (hi ? 1 : 0);
    for (let i = 0; i < nb; i++) {
      const d = dir.clone().add(V((rnd() - 0.5) * 1.4, rnd() * 0.4, (rnd() - 0.5) * 1.4)).normalize();
      grow(b, d, len * (0.55 + rnd() * 0.2), r * 0.6, depth - 1);
    }
  };
  grow(V(0, -0.3, 0), V((rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3).normalize(), 2.2, 0.22, hi ? 3 : 2);
  return mergeGeometries(parts);
}

// Zypresse: schlanke Flammenform aus einer verrauschten Rotationsfläche
function cypress(seed, hi) {
  const rnd = mulberry32(seed);
  const H = 7 + rnd() * 3, R = 0.9 + rnd() * 0.35, rows = hi ? 12 : 6, seg = hi ? 9 : 6;
  const pts = [new THREE.Vector2(0.02, 0.35)];
  for (let i = 1; i < rows; i++) {
    const t = i / rows;
    const rr = R * (t < 0.3 ? 0.7 + 0.3 * (t / 0.3) : Math.pow((1 - t) / 0.7, 0.8));
    pts.push(new THREE.Vector2(Math.max(0.05, rr), 0.35 + t * (H - 0.35)));
  }
  pts.push(new THREE.Vector2(0.0, H + 0.3));
  const g = jitterGeo(new THREE.LatheGeometry(pts, seg), (x, y, z) => {
    const rr = Math.hypot(x, z);
    if (rr < 0.04) return [x, y, z];
    const k = 0.78 + rnd() * 0.42;
    return [x * k, y + (rnd() - 0.5) * 0.25, z * k];
  });
  const dark = new THREE.Color(0x24401f), tip = new THREE.Color(0x52703a);
  return mergeGeometries([
    vcol(tubeGeo(V(0, -0.4, 0), V(0, 1.2, 0), 0.17, 0.1, 5), barkFn(0x4e3b2a, seed)),
    vcol(g, (c, x, y, z, f) => {
      const n = hash(Math.round(x * 6) * 1.7 + Math.round(y * 6) * 5.3 + Math.round(z * 6) * 2.1 + seed);
      const rr = clamp01(Math.hypot(x, z) / R);
      c.copy(dark).lerp(tip, 0.15 + 0.45 * n * rr).multiplyScalar((0.55 + 0.45 * rr) * (0.8 + 0.3 * clamp01(y / H)));
    }),
  ]);
}

// Baumarten je Landschaft: w = Anteil, size = Skalierbereich, double = doppelseitiges Material (Palmwedel)
const SPECIES = {
  round: [
    { w: 0.36, size: [0.8, 1.35], make: (s, hi) => broadleaf(s, hi, { leaf: 0x3b8a3c, tip: 0x9bc858 }) },
    { w: 0.26, size: [0.85, 1.4], make: (s, hi) => broadleaf(s, hi, { R: 2.5, H: 2.4, squash: 0.72, leaf: 0x47923f, tip: 0xa8cf5e, n: 12 }) },
    { w: 0.18, size: [0.8, 1.2], make: (s, hi) => broadleaf(s, hi, { H: 4.6, R: 1.35, squash: 1.15, trunkR: 0.15, bark: 0xe6e2d8, birch: true, leaf: 0x5a9a3a, tip: 0xb8d868, n: 8 }) },
    { w: 0.2, size: [0.7, 1.15], make: (s, hi) => conifer(s, hi) },
  ],
  pine: [
    { w: 0.4, size: [0.75, 1.3], make: (s, hi) => conifer(s, hi) },
    { w: 0.3, size: [0.8, 1.35], make: (s, hi) => conifer(s, hi, { H: 9.5, R: 1.6, tiers: 10, leaf: 0x1f5232, tip: 0x3f7a48 }) },
    { w: 0.15, size: [0.8, 1.2], make: (s, hi) => broadleaf(s, hi, { H: 4.6, R: 1.35, squash: 1.15, trunkR: 0.15, bark: 0xe6e2d8, birch: true, leaf: 0x4f9036, tip: 0xa8cc60, n: 8 }) },
    { w: 0.15, size: [0.7, 1.1], make: (s, hi) => broadleaf(s, hi, { leaf: 0x357a36, tip: 0x88b850 }) },
  ],
  palm: [
    { w: 0.42, size: [0.85, 1.25], make: palm, double: true },
    { w: 0.3, size: [0.8, 1.2], make: palm, double: true },
    { w: 0.28, size: [0.85, 1.2], make: (s, hi) => broadleaf(s, hi, { H: 4.6, R: 2.7, squash: 0.42, trunkR: 0.22, bark: 0x6a5240, leaf: 0x3d6a32, tip: 0x7a9a4a, n: 12 }) },
  ],
  cactus: [
    { w: 0.45, size: [0.8, 1.3], make: saguaro },
    { w: 0.35, size: [0.7, 1.15], make: saguaro },
    { w: 0.2, size: [0.8, 1.2], make: deadTree },
  ],
  garda: [ // Olivenbäume, Zypressen, ein paar Palmen und Steineichen
    { w: 0.42, size: [0.8, 1.2], make: (s, hi) => broadleaf(s, hi, { H: 1.9, R: 2.3, squash: 0.62, trunkR: 0.3, bark: 0x6e665c, leaf: 0x75865a, tip: 0xb4c29a, n: 12 }) },
    { w: 0.34, size: [0.8, 1.3], make: cypress },
    { w: 0.12, size: [0.85, 1.2], make: palm, double: true },
    { w: 0.12, size: [0.8, 1.2], make: (s, hi) => broadleaf(s, hi, { H: 3.2, R: 2.4, squash: 0.8, trunkR: 0.26, bark: 0x4e4438, leaf: 0x3a5a2c, tip: 0x7a9050, n: 10 }) },
  ],
  vine: [
    { w: 0.5, size: [0.8, 1.25], make: cypress },
    { w: 0.35, size: [0.85, 1.3], make: (s, hi) => broadleaf(s, hi, { H: 2.8, R: 3.0, squash: 0.66, trunkR: 0.3, bark: 0x77706a, leaf: 0x6a8a38, tip: 0xd2b048, n: 13 }) },
    { w: 0.15, size: [0.8, 1.2], make: (s, hi) => broadleaf(s, hi, { leaf: 0x55803a, tip: 0xc0a848 }) },
  ],
};

// Grasbüschel: schmale, nach außen geneigte Halme; Normalen zeigen nach oben (wie der Boden beleuchtet)
function tuftGeo(blades, seed) {
  const rnd = mulberry32(seed);
  const pos = [], cols = [];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rnd() * 0.8;
    const h = 0.14 + rnd() * 0.26, w = 0.014 + rnd() * 0.012, lean = 0.05 + rnd() * 0.16;
    const rr = rnd() * 0.07, ox = Math.cos(a) * rr, oz = Math.sin(a) * rr, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const tx = ox + Math.cos(a) * lean, tz = oz + Math.sin(a) * lean;
    pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, tx, h, tz);
    const tipK = 0.95 + rnd() * 0.25;
    cols.push(0.62, 0.64, 0.58, 0.62, 0.64, 0.58, tipK, tipK, tipK * 0.92);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
  return g;
}
// Blume: Stiel + kleine Blüte (Farbe pro Instanz über die Blüte, Stiel bleibt grün dank dunkler Vertexfarbe)
function flowerGeo() {
  const parts = [];
  for (const [x, z, h] of [[0, 0, 0.3], [0.09, 0.05, 0.22], [-0.06, 0.08, 0.26]]) {
    parts.push(vcol(tubeGeo(V(x * 0.3, 0, z * 0.3), V(x, h, z), 0.008, 0.006, 3), (c) => c.setRGB(0.1, 0.22, 0.06)));
    parts.push(vcol(new THREE.IcosahedronGeometry(0.045, 0).scale(1.3, 0.45, 1.3).translate(x, h + 0.01, z), (c, px, py) => { const k = py > h + 0.01 ? 1.15 : 0.8; c.setRGB(k, k, k); }));
  }
  return mergeGeometries(parts);
}

// Blätter-Struktur für Weinreben (Kachel): helle und dunkle Blattflecken
function leafTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, w, h);
    const rnd = mulberry32(5);
    for (let i = 0; i < 420; i++) {
      const x = rnd() * w, y = rnd() * h, r = 3 + rnd() * 6, l = Math.floor(120 + rnd() * 135);
      g.fillStyle = `rgb(${l},${l},${l})`;
      g.beginPath(); g.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, 7); g.fill();
      if (x < r * 2 || x > w - r * 2 || y < r * 2 || y > h - r * 2) { // kachelbar
        g.beginPath(); g.ellipse((x + w / 2) % w, y, r, r * 0.7, 0, 0, 7); g.fill();
      }
    }
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(30,30,30,0.5)'; g.beginPath(); g.arc(rnd() * w, rnd() * h, 1.5 + rnd() * 2.5, 0, 7); g.fill(); }
  }, true);
}
// Trockenmauer
function stoneTexture() {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#5d554b'; g.fillRect(0, 0, w, h);
    const rnd = mulberry32(17);
    let y = 0;
    while (y < h) {
      const rh = 14 + rnd() * 14;
      let x = -rnd() * 20;
      while (x < w) {
        const sw = 22 + rnd() * 30;
        const l = Math.floor(150 + rnd() * 80);
        g.fillStyle = `rgb(${l},${Math.floor(l * 0.95)},${Math.floor(l * 0.86)})`;
        g.beginPath();
        g.roundRect ? g.roundRect(x + 1.5, y + 1.5, sw - 3, rh - 3, 5) : g.rect(x + 1.5, y + 1.5, sw - 3, rh - 3);
        g.fill();
        x += sw;
      }
      y += rh;
    }
  }, true);
}

// Kies/Splitt für Seitenstreifen und Ufer (hell, wird per Vertexfarbe eingefärbt)
function gravelTexture(size, seed) {
  return canvasTexture(size, size, (g, w, h) => {
    const n1 = noiseField(w, 12, seed), n2 = noiseField(w, 48, seed + 1);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w, v = y / h;
        const n = 0.78 + (n1(u, v) - 0.5) * 0.25 + (n2(u, v) - 0.5) * 0.35 + (hash(x * 17 + y * 3) - 0.5) * 0.22;
        const k = (y * w + x) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.max(0, Math.min(255, n * 255));
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const rnd = mulberry32(seed + 5);
    for (let i = 0; i < size * 1.6; i++) { // Kiesel mit Schatten
      const x = rnd() * w, y = rnd() * h, r = 1 + rnd() * 2.6, l = Math.floor(170 + rnd() * 85);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(x + 0.8, y + 0.9, r, r * 0.75, 0, 0, 7); g.fill();
      g.fillStyle = `rgb(${l},${l},${Math.floor(l * 0.96)})`; g.beginPath(); g.ellipse(x, y, r, r * 0.75, rnd() * 3, 0, 7); g.fill();
    }
  }, true);
}

// Wellen-Normalmap für den See (kachelbar)
function waveNormalTexture(size, seed) {
  const n1 = noiseField(size, 8, seed), n2 = noiseField(size, 20, seed + 3);
  const H = (u, v) => n1(u, v) * 0.65 + n2(u, v) * 0.35;
  return canvasTexture(size, size, (g, w, h) => {
    const img = g.createImageData(w, h);
    const e = 1 / w;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w, v = y / h;
        const dx = (H((u + e) % 1, v) - H((u - e + 1) % 1, v)) * 9, dy = (H(u, (v + e) % 1) - H(u, (v - e + 1) % 1)) * 9;
        const l = Math.hypot(dx, dy, 1);
        const k = (y * w + x) * 4;
        img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, true);
}

export function buildTrackMesh(track, quality = 'high') {
  const { map, halfW: hw, pointAt, terrainAt, rampAt, bankAt, bankH } = track;
  const col = map.colors;
  const group = new THREE.Group();
  const rng = mulberry32(map.seed * 7 + 1);
  const tex = quality === 'low' ? 256 : 512;

  // ---- Texturen ----
  const grassTex = fractalTexture(tex, [1.85, 1.85, 1.85], 0.55, map.seed, (n, u, v) => {
    const blade = hash(Math.floor(u * 400) * 7 + Math.floor(v * 400)) > 0.93 ? 0.06 : 0;
    return [n + blade, n + blade, n + blade * 0.5];
  });
  grassTex.repeat.set(1, 1);
  const road = new THREE.Color(col.road);
  const asphalt = map.surface === 'asphalt';
  const roadTex = canvasTexture(256, 512, (g, w, h) => {
    const n1 = noiseField(w, 16, map.seed + 9), n2 = noiseField(w, 64, map.seed + 10);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w, v = y / h;
        let n = 0.62 + (n1(u, v) - 0.5) * 0.35 + (n2(u, v) - 0.5) * 0.3;
        if (!asphalt) {
          // Reifenspuren
          const t1 = Math.exp(-Math.pow((u - 0.34) / 0.045, 2)), t2 = Math.exp(-Math.pow((u - 0.66) / 0.045, 2));
          n -= (t1 + t2) * 0.16;
          if (hash(x * 13 + y * 7) > 0.985) n += 0.25; // Kieselsteine
        }
        let r = road.r * n * 1.1, gg = road.g * n * 1.1, b = road.b * n * 1.1;
        if (asphalt) {
          const edge = u < 0.025 || u > 0.975;
          const dash = Math.abs(u - 0.5) < 0.008 && (v * 4) % 1 < 0.5;
          if (edge || dash) { r = 0.9; gg = 0.9; b = 0.88; }
        }
        const k = (y * w + x) * 4;
        // road.r etc. sind linear; Canvas erwartet sRGB
        const enc = (c) => Math.pow(Math.max(0, Math.min(1, c)), 1 / 2.2) * 255;
        img.data[k] = enc(r); img.data[k + 1] = enc(gg); img.data[k + 2] = enc(b); img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, true);

  const MatCls = quality === 'low' ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const terrainMat = new MatCls({ vertexColors: true, map: grassTex, ...(quality === 'low' ? {} : { roughness: 0.95, metalness: 0 }) });
  const roadMat = new MatCls({ vertexColors: true, map: roadTex, ...(quality === 'low' ? {} : { roughness: asphalt ? 0.8 : 0.98, metalness: 0 }) });
  // Seitenstreifen/Bankett und Ufer: eigene Kies-Struktur, damit sie sich deutlich von Belag und Wiese abheben
  const shoulderMat = new MatCls({ vertexColors: true, map: gravelTexture(quality === 'low' ? 128 : 256, map.seed + 21), ...(quality === 'low' ? {} : { roughness: 1, metalness: 0 }) });

  // Foto-Texturen (PBR-Detail) laden, sobald verfügbar; bis dahin bleiben die prozeduralen Texturen
  if (quality !== 'low') {
    const ground = { round: 'grass', palm: 'sand', pine: 'forest', cactus: 'red', vine: 'vineyard', garda: 'grass' }[map.decor] || 'grass';
    loadSurface(ground).then((s) => {
      if (!s) return;
      s.diff.repeat.set(2.5, 2.5);
      s.nor.repeat.set(3, 3);
      terrainMat.map = s.diff;
      terrainMat.normalMap = s.nor;
      terrainMat.normalScale.set(0.9, 0.9);
      terrainMat.needsUpdate = true;
    });
    loadSurface(asphalt ? 'asphalt' : 'dirt').then((s) => {
      if (!s) return;
      s.nor.repeat.set((2 * hw) / 1.8, 16 / 1.8);
      roadMat.normalMap = s.nor;
      roadMat.normalScale.set(asphalt ? 0.6 : 1, asphalt ? 0.6 : 1);
      roadMat.needsUpdate = true;
    });
    loadSurface('dirt').then((s) => {
      if (!s) return;
      const nor = s.nor.clone();
      nor.repeat.set(1.2, 1.2);
      nor.needsUpdate = true;
      shoulderMat.normalMap = nor;
      shoulderMat.normalScale.set(0.8, 0.8);
      shoulderMat.needsUpdate = true;
    });
  }

  // ---- Gelände-Band, in Abschnitten ----
  const S = map.span || 40; // seitliche Breite des Geländebandes (kleine Rundkurse: schmaler, damit sich nichts überlappt)
  const lakeSide = map.lake ? map.lake.side : 0;
  const level = track.lakeLevel;
  let cross = S >= 30 ? [
    { lat: -S, t: 'g', drop: -40 }, { lat: -S + 6, t: 'g' }, { lat: -20, t: 'g' }, { lat: -hw - 8, t: 'g' },
    { lat: -hw - 3, t: 'v' }, { lat: -hw - 0.9, t: 'e' }, { lat: -hw, t: 'e' }, { lat: -hw, t: 'r' }, { lat: hw, t: 'r' },
    { lat: hw, t: 'e' }, { lat: hw + 0.9, t: 'e' }, { lat: hw + 3, t: 'v' }, { lat: hw + 8, t: 'g' }, { lat: 20, t: 'g' },
    { lat: S - 6, t: 'g' }, { lat: S, t: 'g', drop: -40 },
  ] : [
    { lat: -S, t: 'g', drop: -40 }, { lat: -S + 3, t: 'g' }, { lat: -hw - 6, t: 'g' },
    { lat: -hw - 3, t: 'v' }, { lat: -hw - 0.9, t: 'e' }, { lat: -hw, t: 'e' }, { lat: -hw, t: 'r' }, { lat: hw, t: 'r' },
    { lat: hw, t: 'e' }, { lat: hw + 0.9, t: 'e' }, { lat: hw + 3, t: 'v' }, { lat: hw + 6, t: 'g' },
    { lat: S - 3, t: 'g' }, { lat: S, t: 'g', drop: -40 },
  ];
  if (lakeSide) {
    // Seeseite: ebener Streifen (Zuschauer, Mauer), kurzer Felsabbruch, Kiesufer, dann unter den Seespiegel.
    // lake = Höhe relativ zum Seespiegel (absolut, unabhängig vom Straßenprofil)
    const lakeHalf = [
      { lat: hw + 3, t: 'v' }, { lat: hw + 6.6, t: 'g' }, { lat: hw + 7.4, t: 'c', drop: -0.4 }, { lat: hw + 11, t: 'b', lake: 0.35 },
      { lat: hw + 15, t: 'b', lake: -1.6 }, { lat: S - 6, t: 'b', lake: -4 }, { lat: S, t: 'b', lake: -4, drop: -40 },
    ];
    const keep = cross.filter((c) => Math.sign(c.lat) !== lakeSide || Math.abs(c.lat) <= hw + 0.9 + 1e-6);
    const add = lakeHalf.map((c) => ({ ...c, lat: c.lat * lakeSide }));
    cross = lakeSide > 0 ? [...keep, ...add] : [...add.reverse(), ...keep];
  }
  const m = cross.length;
  const roadJ = cross.findIndex((c) => c.t === 'r');
  // e = ausgefahrener Randstreifen zwischen Piste und Bankett (Mischung aus Belag und Bankett)
  const base = {
    g: new THREE.Color(col.grass), v: new THREE.Color(col.verge),
    e: col.edge != null ? new THREE.Color(col.edge) : new THREE.Color(col.verge).lerp(new THREE.Color(col.road), asphalt ? 0.3 : 0.55).multiplyScalar(asphalt ? 0.85 : 0.92),
    c: new THREE.Color(col.cliff ?? col.rock), b: new THREE.Color(col.beach ?? col.rock),
  };
  const town = map.town && map.decor === 'garda' ? { s0: map.town.s, s1: map.town.s + map.town.len } : null;
  const paving = new THREE.Color(0xbcb3a3);
  const shoulderSeg = (a, b) => a === 'c' || a === 'b' || b === 'c' || b === 'b' || ((a === 'e' || a === 'v') && (b === 'e' || b === 'v'));
  const rampCol = new THREE.Color(col.ramp);
  const tmp = new THREE.Color();
  const p = {};
  const range = track.meshTo - track.meshFrom;
  // Zeilen: 1 m Abstand, an Schanzen und Wellen fein (0,2 m), damit Auffahrt und Abflugkante exakt der Physik folgen
  const rowS = [];
  for (let s = track.meshFrom; ;) {
    rowS.push(s);
    if (s >= track.meshTo - 1e-6) break;
    const ds = track.inRampZone(s, 3, 3) ? 0.2 : MESH_DS;
    s = track.meshTo - (s + ds) < ds * 0.3 ? track.meshTo : s + ds;
  }
  const totalRows = rowS.length - 1;

  for (let r0 = 0; r0 < totalRows;) {
    let r1 = r0 + 1;
    while (r1 < totalRows && rowS[r1] - rowS[r0] < CHUNK) r1++;
    const nr = r1 - r0 + 1;
    const pos = new Float32Array(nr * m * 3);
    const colr = new Float32Array(nr * m * 3);
    const uvT = new Float32Array(nr * m * 2);
    const uvR = new Float32Array(nr * m * 2);
    const uvS = new Float32Array(nr * m * 2);
    for (let i = 0; i < nr; i++) {
      const s = rowS[r0 + i];
      pointAt(s, p);
      const rx = Math.cos(p.theta), rz = Math.sin(p.theta);
      const terr = terrainAt(s);
      const ramp = rampAt(s);
      const bt = Math.tan(bankAt(s));
      const band = Math.floor(s / 8) % 2 ? 1 : 0.95;
      const inTown = town && s > town.s0 - 8 && s < town.s1 + 8;
      for (let j = 0; j < m; j++) {
        const c = cross[j];
        const a = Math.abs(c.lat);
        const fade = a <= hw + 1 ? 1 : Math.max(0, 1 - (a - hw - 1) / 3);
        const k = (i * m + j) * 3;
        const x = p.x + rx * c.lat, z = p.z + rz * c.lat;
        pos[k] = x;
        pos[k + 2] = z;
        pos[k + 1] = c.lake != null ? level + c.lake + (c.drop || 0) : terr + ramp * fade + bankH(c.lat) - c.lat * bt * fade + (c.drop || 0);
        uvT[(i * m + j) * 2] = x * 0.12;
        uvT[(i * m + j) * 2 + 1] = z * 0.12;
        uvS[(i * m + j) * 2] = x * 0.4;
        uvS[(i * m + j) * 2 + 1] = z * 0.4;
        uvR[(i * m + j) * 2] = (c.lat + hw) / (2 * hw);
        uvR[(i * m + j) * 2 + 1] = s / 16;
        if (c.t === 'r') {
          tmp.setRGB(1, 1, 1);
          if (ramp > 0.03) tmp.lerp(rampCol, 0.55);
        } else {
          tmp.copy(base[c.t]);
          if (c.t === 'v') tmp.multiplyScalar(band * (0.9 + hash(s * 0.37 + j) * 0.2));
          else if (c.t === 'e') tmp.multiplyScalar(0.85 + hash(s * 1.7 + j) * 0.3);
          else tmp.multiplyScalar(0.88 + hash((r0 + i) * 31 + j) * 0.24);
          if (inTown && (c.t === 'v' || c.t === 'g') && a < hw + 7) tmp.copy(paving).multiplyScalar(0.9 + hash(s * 0.9 + j) * 0.15); // Gehweg im Ort
        }
        colr[k] = tmp.r; colr[k + 1] = tmp.g; colr[k + 2] = tmp.b;
      }
    }
    const idxT = [], idxR = [], idxS = [];
    for (let i = 0; i < nr - 1; i++) {
      for (let j = 0; j < m - 1; j++) {
        const a = i * m + j, b = a + 1, c2 = a + m, d = c2 + 1;
        (j === roadJ ? idxR : shoulderSeg(cross[j].t, cross[j + 1].t) ? idxS : idxT).push(a, b, c2, b, d, c2);
      }
    }
    const make = (idx, uv, mat) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    make(idxT, uvT, terrainMat);
    make(idxR, uvR, roadMat);
    make(idxS, uvS, shoulderMat);
    r0 = r1;
  }

  // ---- Dekoration (instanziert) ----
  const hi = quality !== 'low';
  const count = Math.round((range / 100) * map.trees);
  const colored = (geo, hexColor, bottomDark = true) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    const c = new THREE.Color(hexColor);
    const arr = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) {
      const t = (g.attributes.position.getY(i) - min.y) / (max.y - min.y || 1);
      const k = bottomDark ? 0.55 + 0.6 * t : 1;
      arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g;
  };

  // Geländehöhe an beliebiger Stelle – exakt wie das Gelände-Mesh (lineare Interpolation zwischen den Querschnittspunkten)
  const yCross = (c, terr, ramp, bt) => {
    if (c.lake != null) return level + c.lake + (c.drop || 0);
    const a = Math.abs(c.lat);
    const fade = a <= hw + 1 ? 1 : Math.max(0, 1 - (a - hw - 1) / 3);
    return terr + ramp * fade + bankH(c.lat) - c.lat * bt * fade + (c.drop || 0);
  };
  const groundAt = (s, lat) => {
    const terr = terrainAt(s), ramp = rampAt(s), bt = Math.tan(bankAt(s));
    let j = 0;
    while (j < m - 2 && cross[j + 1].lat < lat) j++;
    const c0 = cross[j], c1 = cross[j + 1];
    const t = c1.lat > c0.lat ? clamp01((lat - c0.lat) / (c1.lat - c0.lat)) : 0;
    const y0 = yCross(c0, terr, ramp, bt), y1 = yCross(c1, terr, ramp, bt);
    return y0 + (y1 - y0) * t;
  };
  const worldAt = (s, lat, out) => { pointAt(s, p); out.x = p.x + Math.cos(p.theta) * lat; out.z = p.z + Math.sin(p.theta) * lat; out.theta = p.theta; return out; };

  // Rundkurse: Dekoration nicht auf andere Streckenteile setzen
  const samples = [];
  for (let sm = track.meshFrom; sm < track.meshTo; sm += 6) { pointAt(sm, p); samples.push(p.x, p.z, sm); }
  const nearTrack = (x, z, s, margin = 4) => {
    const lim = (hw + margin) ** 2;
    for (let i = 0; i < samples.length; i += 3) {
      const d2 = (samples[i] - x) ** 2 + (samples[i + 1] - z) ** 2;
      if (d2 < lim && Math.abs(samples[i + 2] - s) > 30 && Math.abs(samples[i + 2] - s) < range - 30) return true;
    }
    return false;
  };
  const w0 = {};
  // Seeseite: nur auf dem ebenen Streifen an der Straße; im Ort keine zufällige Deko (dort stehen Häuser)
  const wet = (lat) => lakeSide && Math.sign(lat) === lakeSide && Math.abs(lat) > hw + 6.2;
  const townZone = (s, lat) => town && s > town.s0 - 14 && s < town.s1 + 14 && Math.abs(lat) < hw + 42;
  const spotOk = (s, lat, margin = 4) => {
    if (wet(lat) || townZone(s, lat)) return false;
    if (!track.loop) return true;
    worldAt(s, lat, w0);
    return !nearTrack(w0.x, w0.z, s, margin);
  };

  // Instanzen in Abschnitte gruppieren (Frustum-Culling pro Abschnitt); Tablet: ein Mesh für alles (wenig Draw-Calls)
  const CH = hi ? 260 : 1e9;
  const q4 = new THREE.Quaternion(), sc4 = new THREE.Vector3(), m4d = new THREE.Matrix4(), pv4 = new THREE.Vector3(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
  const scatter = (geo, mat, items, { shadow = false, receive = false } = {}) => {
    if (!items.length) return;
    const buckets = new Map();
    for (const it of items) {
      const k = Math.floor((it.s - track.meshFrom) / CH);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(it);
    }
    for (const list of buckets.values()) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        q4.setFromEuler(eul.set(it.rx || 0, it.ry || 0, it.rz || 0));
        sc4.set(it.sx, it.sy ?? it.sx, it.sz ?? it.sx);
        m4d.compose(pv4.set(it.x, it.y, it.z), q4, sc4);
        im.setMatrixAt(i, m4d);
        im.setColorAt(i, tmp.setRGB(it.r ?? 1, it.g ?? 1, it.b ?? 1));
      });
      if (hi) im.computeBoundingSphere(); else im.frustumCulled = false;
      im.castShadow = shadow;
      im.receiveShadow = receive;
      group.add(im);
    }
  };

  // ---- Weinberg: Rebzeilen, Trockenmauern, Kapelle, Weingut ----
  const vineBlocks = [];
  if (map.decor === 'vine') buildVineyard();
  const gardaFx = map.decor === 'garda' ? buildGarda() : null;
  const inVineyard = (s, lat) => vineBlocks.some((b) => Math.sign(lat) === b.side && s > b.s0 - 2 && s < b.s1 + 2 && Math.abs(lat) > b.l0 - 2.5 && Math.abs(lat) < b.l1 + 2);

  // ---- Bäume (mehrere Arten und Varianten, Größe/Farbe variiert) ----
  const species = SPECIES[map.decor];
  if (species && count > 0) {
    const lists = species.map(() => []);
    const wsum = species.reduce((a, sp) => a + sp.w, 0);
    const addTree = (s, lat, forceKind = -1) => {
      if (!spotOk(s, lat) || inVineyard(s, lat)) return;
      let k = forceKind;
      if (k < 0) { let r = rng() * wsum; k = 0; while (k < species.length - 1 && (r -= species[k].w) > 0) k++; }
      const sp = species[k];
      worldAt(s, lat, w0);
      const size = sp.size[0] + rng() * (sp.size[1] - sp.size[0]);
      const hue = rng();
      lists[k].push({
        s, x: w0.x, z: w0.z, y: groundAt(s, lat) - 0.15, ry: rng() * 6.28, rx: (rng() - 0.5) * 0.08, rz: (rng() - 0.5) * 0.08,
        sx: size, sy: size * (0.88 + rng() * 0.26),
        r: 0.82 + hue * 0.3, g: 0.86 + rng() * 0.2, b: 0.8 + (1 - hue) * 0.25,
      });
    };
    const nTrees = Math.round(count * (hi ? 1.25 : 1));
    for (let i = 0; i < nTrees; i++) {
      const s = track.meshFrom + rng() * range;
      const side = rng() < 0.5 ? -1 : 1;
      // in kleinen Gruppen (natürlicher als gleichmäßig verstreut)
      const grp = hi && rng() < 0.35 ? 2 + Math.floor(rng() * 3) : 1;
      const lat0 = hw + 5 + rng() * 24;
      for (let g = 0; g < grp; g++) addTree(s + (g ? (rng() - 0.5) * 14 : 0), side * (lat0 + (g ? (rng() - 0.5) * 8 : 0)));
    }
    // Waldkante auf dem Hügelkamm (Silhouette)
    if (hi && (map.decor === 'pine' || map.decor === 'round') && S >= 30) {
      const nr = Math.round((range / 100) * Math.min(30, map.trees) * 0.8);
      for (let i = 0; i < nr; i++) addTree(track.meshFrom + rng() * range, (rng() < 0.5 ? -1 : 1) * (S - 9 + rng() * 6));
    }
    // Weinberg: Zypressen-Allee in den Lücken zwischen den Rebflächen
    if (map.decor === 'vine') {
      for (const b of vineBlocks) {
        if (rng() < 0.45) continue;
        const n = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) addTree(b.s1 + 4 + i * 4.5, b.side * (hw + 6.8 + rng() * 0.6), 0);
      }
    }
    species.forEach((sp, k) => {
      const geo = sp.make(map.seed * 31 + k * 101, quality === 'high' ? 2 : hi ? 1 : 0);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: sp.double ? THREE.DoubleSide : THREE.FrontSide });
      scatter(geo, mat, lists[k], { shadow: quality === 'high' });
    });
  }

  // ---- Büsche (bzw. Findlinge in der Wüste) am Rand ----
  {
    const rockish = map.decor === 'cactus';
    const bushCol = { pine: 0x3d7a3a, palm: 0x4f8a3e, vine: 0x6a7f3a, garda: 0x4a7436 }[map.decor] ?? 0x4c9a4a;
    let bushGeo;
    if (rockish) {
      bushGeo = mergeGeometries([colored(blob(0.7, 1, 5, 0.7).translate(0, 0.4, 0), 0xffffff), colored(blob(0.5, 1, 6, 0.7).translate(0.6, 0.3, 0.2), 0xe0e0e0)]);
    } else {
      const C0 = V(0, 0.45, 0);
      const lf = leafFn(bushCol, 0xb0c860, C0, 0.9, 0.7, 3);
      const parts = [vcol(blob(0.7, 1, 5, 0.7, hi).translate(0, 0.4, 0), lf), vcol(blob(0.5, hi ? 1 : 0, 6, 0.7, hi).translate(0.6, 0.3, 0.2), lf)];
      if (hi) parts.push(vcol(blob(0.45, 1, 7, 0.8, true).translate(-0.5, 0.32, -0.25), lf), vcol(blob(0.38, 1, 8, 0.8, true).translate(0.15, 0.62, -0.35), lf));
      bushGeo = mergeGeometries(parts);
    }
    const n = Math.max(1, Math.round(count * 1.5));
    const items = [];
    const rc = new THREE.Color(col.rock);
    for (let i = 0; i < n; i++) {
      const s = track.meshFrom + rng() * range;
      const lat = (rng() < 0.5 ? -1 : 1) * (hw + 3.5 + rng() * 12);
      if (!spotOk(s, lat) || inVineyard(s, lat)) continue;
      worldAt(s, lat, w0);
      const k = 0.8 + rng() * 0.4, sz = 0.7 + rng() * 1.0;
      const it = { s, x: w0.x, z: w0.z, y: groundAt(s, lat) - 0.12, ry: rng() * 6.28, sx: sz, sy: sz * (0.8 + rng() * 0.4) };
      if (rockish) Object.assign(it, { r: rc.r * k * 1.35, g: rc.g * k * 1.35, b: rc.b * k * 1.35 });
      else Object.assign(it, { r: k * (0.9 + rng() * 0.2), g: k, b: k * (0.85 + rng() * 0.2) });
      items.push(it);
    }
    scatter(bushGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), items, { shadow: quality === 'high' });
  }

  // ---- Bodenbewuchs: Grasbüschel, Blumen, Steinchen (nur Mittel/Hoch) ----
  if (hi && map.decor !== 'none') {
    const dens = quality === 'high' ? 1 : 0.45;
    const dry = map.decor === 'cactus';
    const grassC = new THREE.Color(col.grass), straw = new THREE.Color(dry ? 0xc9a060 : 0xc8b878);
    const tuftN = Math.round(range * 2 * (dry ? 1.5 : 7) * dens);
    const tufts = [];
    const c2 = new THREE.Color();
    for (let i = 0; i < tuftN; i++) {
      const s = track.meshFrom + rng() * range;
      const lat = (rng() < 0.5 ? -1 : 1) * (hw + 0.35 + Math.pow(rng(), 1.7) * 14);
      if (!spotOk(s, lat, 1)) continue;
      worldAt(s, lat, w0);
      c2.copy(grassC).multiplyScalar(1.25).lerp(straw, dry ? 0.7 + rng() * 0.3 : Math.pow(rng(), 2) * 0.7);
      const sz = 0.6 + rng() * 0.9;
      tufts.push({ s, x: w0.x, z: w0.z, y: groundAt(s, lat) - 0.03, ry: rng() * 6.28, sx: sz, sy: sz * (0.7 + rng() * 0.7), r: c2.r, g: c2.g, b: c2.b });
    }
    scatter(tuftGeo(quality === 'high' ? 12 : 8, map.seed), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), tufts);

    // Blumen (Wiese, Weinberg, Wald, Küste)
    const flowerCols = {
      round: [0xffffff, 0xffe04a, 0xc77dff, 0xff5a4a, 0xffffff],
      vine: [0xffe04a, 0xffffff, 0xd88a3a],
      pine: [0xffffff, 0xfff27a],
      palm: [0xff6ab0, 0xffffff, 0xffd54a],
      garda: [0xff5aa0, 0xffffff, 0xff8cc0, 0xffd54a, 0xc77dff], // Oleander, Margeriten
    }[map.decor];
    if (flowerCols) {
      const fl = [];
      const fn = Math.round(range * 2 * (map.decor === 'round' ? 0.5 : map.decor === 'garda' ? 0.25 : 0.15) * dens);
      for (let i = 0; i < fn; i++) {
        const s = track.meshFrom + rng() * range;
        const lat = (rng() < 0.5 ? -1 : 1) * (hw + 1.2 + Math.pow(rng(), 1.3) * 16);
        if (!spotOk(s, lat, 1)) continue;
        worldAt(s, lat, w0);
        c2.set(flowerCols[Math.floor(rng() * flowerCols.length)]);
        const sz = 0.8 + rng() * 0.6;
        // Blumen in kleinen Grüppchen
        for (let k = 0; k < 2; k++) fl.push({ s, x: w0.x + (rng() - 0.5) * 0.8, z: w0.z + (rng() - 0.5) * 0.8, y: groundAt(s, lat) - 0.02, ry: rng() * 6.28, sx: sz, r: c2.r, g: c2.g, b: c2.b });
      }
      scatter(flowerGeo(), new THREE.MeshLambertMaterial({ vertexColors: true }), fl);
    }

    // Steinchen am Wegrand
    const stoneN = Math.round(range * 2 * (dry ? 2.2 : 1.1) * dens);
    const st = [];
    const rc = new THREE.Color(col.rock), rd = new THREE.Color(col.road);
    for (let i = 0; i < stoneN; i++) {
      const s = track.meshFrom + rng() * range;
      const lat = (rng() < 0.5 ? -1 : 1) * (hw + 0.15 + Math.pow(rng(), 2) * 10);
      if (!spotOk(s, lat, 1)) continue;
      worldAt(s, lat, w0);
      c2.copy(rc).lerp(rd, rng() * 0.6).multiplyScalar(0.75 + rng() * 0.5);
      const sz = 0.06 + Math.pow(rng(), 3) * 0.32;
      st.push({ s, x: w0.x, z: w0.z, y: groundAt(s, lat) - sz * 0.25, ry: rng() * 6.28, rx: rng() * 0.5, sx: sz * (1 + rng() * 0.6), sy: sz * (0.5 + rng() * 0.4), sz, r: c2.r, g: c2.g, b: c2.b });
    }
    scatter(colored(blob(1, 0, 21, 0.8), 0xffffff), new THREE.MeshLambertMaterial({ vertexColors: true }), st);
  }

  function buildVineyard() {
    const vr = mulberry32(map.seed * 17 + 3);
    const lt = leafTexture();
    const canopyMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: lt });
    const woodMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: stoneTexture() });
    const L = range;
    // Sondergebäude: Weingut kurz nach dem Start (links), Kapelle auf dem Hang (rechts)
    const winery = { s: track.meshFrom + 62, side: -1, lat: hw + 15 };
    const chapel = { s: track.meshFrom + L * 0.56, side: 1, lat: hw + 22 };
    const reserved = [{ s0: winery.s - 22, s1: winery.s + 22, side: -1 }, { s0: chapel.s - 14, s1: chapel.s + 14, side: 1 }];
    // Rebflächen-Blöcke je Seite
    for (const side of [-1, 1]) {
      let s = track.meshFrom + 26 + vr() * 10;
      while (s < track.meshFrom + L - 34) {
        let len = 26 + vr() * 46;
        const res = reserved.find((r) => r.side === side && r.s1 > s && r.s0 < s + len);
        if (res) { len = res.s0 - s; if (len < 12) { s = res.s1 + 4; continue; } }
        len = Math.min(len, track.meshFrom + L - 30 - s);
        if (len > 10) {
          const tone = vr();
          vineBlocks.push({ side, s0: s, s1: s + len, l0: hw + 7.6, l1: Math.min(S - 5, hw + 7.6 + 14 + vr() * 12), tone });
        }
        s += len + (vr() < 0.18 ? 26 + vr() * 20 : 6 + vr() * 10);
        if (res) s = Math.max(s, res.s1 + 4);
      }
    }
    // Rebzeilen quer zum Hang (vom Weg den Hang hinauf), Querschnitt der Laubwand
    const prof = hi
      ? [[-0.07, 0.55], [-0.23, 0.78], [-0.27, 1.15], [-0.25, 1.55], [-0.13, 1.82], [0.13, 1.82], [0.25, 1.55], [0.27, 1.15], [0.23, 0.78], [0.07, 0.55]]
      : [[-0.08, 0.5], [-0.27, 0.95], [-0.2, 1.75], [0.2, 1.75], [0.27, 0.95], [0.08, 0.5]];
    const np = prof.length;
    const rowGap = quality === 'high' ? 2.4 : quality === 'mid' ? 2.7 : 3.4;
    const segL = hi ? 1.2 : 2.2;
    const green = new THREE.Color(0x86b040), gold = new THREE.Color(0xe8c050), rust = new THREE.Color(0xc0602c), grape = new THREE.Color(0x3a2040), white = new THREE.Color(0xb0b048);
    const buckets = new Map();
    const bucket = (s) => {
      const k = Math.floor((s - track.meshFrom) / CH);
      if (!buckets.has(k)) buckets.set(k, { pos: [], col: [], uv: [], idx: [], wall: { pos: [], col: [], uv: [], idx: [] } });
      return buckets.get(k);
    };
    const wood = [];
    const cc = new THREE.Color(), wp = {};
    for (const b of vineBlocks) {
      const leafBase = new THREE.Color().copy(green).lerp(b.tone > 0.85 ? rust : gold, b.tone > 0.85 ? 0.45 : b.tone * 0.55);
      const flip = b.side < 0; // Dreiecke nach außen orientieren
      const red = b.tone > 0.5;
      for (let s = b.s0; s <= b.s1; s += rowGap) {
        // Zeile: Stützpunkte entlang lat, endet vor anderen Streckenteilen
        const lats = [];
        for (let l = b.l0; l <= b.l1 + 1e-3; l += segL) {
          const lat = b.side * l;
          if (track.loop && !spotOk(s, lat, 7)) break;
          lats.push(lat);
        }
        if (lats.length < 3) continue;
        pointAt(s, p);
        const fx = Math.sin(p.theta), fz = -Math.cos(p.theta); // quer zur Zeile (= Fahrtrichtung)
        const B = bucket(s);
        const v0 = B.pos.length / 3;
        lats.forEach((lat, i) => {
          worldAt(s, lat, wp);
          const gy = groundAt(s, lat);
          const ws = 0.8 + vr() * 0.4, wob = (vr() - 0.5) * 0.12;
          const end = i === 0 || i === lats.length - 1 ? 0.8 : 1;
          for (let k = 0; k < np; k++) {
            const [w, h] = prof[k];
            const hh = h * (k === 0 || k === np - 1 ? 1 : end * (0.9 + vr() * 0.2));
            const ww = w * ws * end * (0.85 + vr() * 0.3) + wob;
            B.pos.push(wp.x + fx * ww, gy + hh, wp.z + fz * ww);
            const hn = (h - 0.5) / 1.3;
            cc.copy(leafBase).multiplyScalar((0.62 + 0.5 * hn) * (0.75 + vr() * 0.5));
            if (hn < 0.4 && vr() < 0.3) cc.copy(red ? grape : white).multiplyScalar(0.8 + vr() * 0.4); // Trauben unten in der Laubwand
            B.col.push(cc.r, cc.g, cc.b);
            B.uv.push(Math.abs(lat) * 0.8, (k / (np - 1)) * 1.4);
          }
        });
        const ns = lats.length;
        for (let i = 0; i < ns - 1; i++) {
          for (let k = 0; k < np; k++) {
            const k2 = (k + 1) % np;
            const a = v0 + i * np + k, bb = v0 + i * np + k2, c3 = v0 + (i + 1) * np + k, d = v0 + (i + 1) * np + k2;
            if (flip) B.idx.push(a, bb, c3, bb, d, c3); else B.idx.push(a, c3, bb, bb, c3, d);
          }
        }
        // Enden schließen (Fächer)
        for (const i of [0, ns - 1]) {
          const rev = (i === 0) === flip;
          for (let k = 1; k < np - 1; k++) {
            if (rev) B.idx.push(v0 + i * np, v0 + i * np + k + 1, v0 + i * np + k);
            else B.idx.push(v0 + i * np, v0 + i * np + k, v0 + i * np + k + 1);
          }
        }
        // Pfähle (alle ~5 m + Endpfähle, schräg abgespannt) und Rebstämme
        const woodC = 0.55 + vr() * 0.2;
        lats.forEach((lat, i) => {
          const last = i === lats.length - 1;
          const stake = i === 0 || last || (i % Math.round(5 / segL) === 0);
          worldAt(s, lat, wp);
          const gy = groundAt(s, lat);
          if (stake) {
            const endPost = i === 0 || last;
            wood.push({ s, x: wp.x, z: wp.z, y: gy - 0.2, ry: -p.theta, rz: endPost ? (i === 0 ? -0.12 : 0.12) * b.side : (vr() - 0.5) * 0.05, sx: endPost ? 0.1 : 0.065, sy: endPost ? 2.15 : 2.0, sz: endPost ? 0.1 : 0.065, r: woodC * 1.15, g: woodC, b: woodC * 0.85 });
          }
          if (hi && !last) {
            const step = quality === 'high' ? 2 : 1;
            for (let t = 0; t < step; t++) {
              const l2 = lat + b.side * segL * (t + 0.5) / step;
              worldAt(s, l2, wp);
              wood.push({ s, x: wp.x, z: wp.z, y: groundAt(s, l2) - 0.1, ry: vr() * 6, rx: (vr() - 0.5) * 0.3, rz: (vr() - 0.5) * 0.3, sx: 0.08, sy: 0.75, r: 0.32, g: 0.22, b: 0.15 });
            }
          }
        });
      }
      // Trockenmauer unten am Hang (Stützmauer zum Weg hin)
      const B0 = bucket(b.s0);
      const W = B0.wall;
      const wl0 = hw + 5.9, wl1 = hw + 6.7;
      const v0 = W.pos.length / 3;
      let ns = 0;
      for (let s = b.s0 - 3; s <= b.s1 + 3; s += 1.5) {
        const lA = b.side * wl0, lB = b.side * wl1;
        if (track.loop && !spotOk(s, lA, 5)) break;
        const yA = groundAt(s, lA), yB = groundAt(s, lB);
        const top = Math.max(yA + 0.75, yB + 0.3);
        const pts = [[lA, yA - 0.3], [lA, top], [lB, top], [lB, yB - 0.3]];
        pts.forEach(([l, y], k) => {
          worldAt(s, l, wp);
          W.pos.push(wp.x, y, wp.z);
          const sh = k === 1 || k === 2 ? 1 : 0.8;
          cc.setRGB(1, 0.97, 0.92).multiplyScalar(sh * (0.85 + vr() * 0.3));
          W.col.push(cc.r, cc.g, cc.b);
          W.uv.push(s / 2.2, k === 0 ? (yA - 0.3) / 1.1 : k === 3 ? (yB - 0.3) / 1.1 : top / 1.1 + (k === 2 ? 0.3 : 0));
        });
        ns++;
      }
      for (let i = 0; i < ns - 1; i++) for (let k = 0; k < 3; k++) {
        const a = v0 + i * 4 + k, c3 = v0 + (i + 1) * 4 + k;
        if (b.side > 0) W.idx.push(a, a + 1, c3, a + 1, c3 + 1, c3); else W.idx.push(a, c3, a + 1, a + 1, c3, c3 + 1);
      }
      // Stirnseiten der Mauer schließen (beide Umlaufrichtungen, Seite egal)
      if (ns > 1) for (const e of [v0, v0 + (ns - 1) * 4]) W.idx.push(e, e + 1, e + 2, e, e + 2, e + 3, e, e + 2, e + 1, e, e + 3, e + 2);
    }
    for (const B of buckets.values()) {
      for (const [d, mat, shadow] of [[B, canopyMat, quality === 'high'], [B.wall, wallMat, quality === 'high']]) {
        if (!d.idx.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
        g.setIndex(d.idx);
        g.computeVertexNormals();
        if (mat === canopyMat) { // Laub weich beleuchten: Normalen Richtung Himmel neigen
          const nr = g.attributes.normal;
          for (let i = 0; i < nr.count; i++) {
            const x = nr.getX(i), y = nr.getY(i) + 0.9, z = nr.getZ(i), l = Math.hypot(x, y, z) || 1;
            nr.setXYZ(i, x / l, y / l, z / l);
          }
        }
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = shadow;
        mesh.receiveShadow = hi;
        if (!hi) mesh.frustumCulled = false;
        group.add(mesh);
      }
    }
    scatter(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), woodMat, wood, { shadow: quality === 'high' });

    // Gebäude
    const building = (o) => {
      const parts = { wall: [], roof: [], dark: [], wood: [] };
      const { w, l, h } = o; // Breite (quer zum Weg), Länge, Traufhöhe
      parts.wall.push(new THREE.BoxGeometry(w, h + 6, l).translate(0, (h - 6) / 2, 0)); // reicht in den Hang hinein
      // Satteldach (Dreiecksprisma), First quer zum Weg
      const rh = w * 0.38, ov = 0.35;
      const roof = new THREE.BufferGeometry();
      const hx = w / 2 + ov, hz = l / 2 + ov;
      const P = [[-hx, h, -hz], [hx, h, -hz], [0, h + rh, -hz], [-hx, h, hz], [hx, h, hz], [0, h + rh, hz]];
      const tri = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3];
      roof.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap((i) => P[i]), 3));
      roof.computeVertexNormals();
      parts.roof.push(roof);
      // Fenster/Tür
      for (const sz of [-1, 1]) for (let i = 0; i < o.win; i++) {
        const x = -w / 2 + (w / (o.win + 1)) * (i + 1);
        parts.dark.push(new THREE.BoxGeometry(0.7, 1.0, 0.08).translate(x, h * 0.62, sz * (l / 2 + 0.02)));
      }
      parts.wood.push(new THREE.BoxGeometry(0.08, 2.1, 1.3).translate(o.doorSide * (w / 2 + 0.03), 1.05, 0));
      if (o.tower) {
        parts.wall.push(new THREE.BoxGeometry(2.2, o.tower + 6, 2.2).translate(o.doorSide * (w / 2 - 1.1), (o.tower - 6) / 2, l / 2 - 1.3));
        parts.roof.push(new THREE.ConeGeometry(1.75, 2.6, 4).rotateY(Math.PI / 4).translate(o.doorSide * (w / 2 - 1.1), o.tower + 1.3, l / 2 - 1.3));
        parts.dark.push(new THREE.BoxGeometry(2.24, 0.9, 0.6).translate(o.doorSide * (w / 2 - 1.1), o.tower - 1.0, l / 2 - 1.3));
        parts.dark.push(new THREE.BoxGeometry(0.6, 0.9, 2.24).translate(o.doorSide * (w / 2 - 1.1), o.tower - 1.0, l / 2 - 1.3));
      }
      const hold = new THREE.Group();
      const mats = { wall: o.wallCol, roof: 0xa4482c, dark: 0x2a2420, wood: 0x6a4428 };
      for (const k of Object.keys(parts)) {
        const g = mergeGeometries(parts[k].map((x) => { const y = x.index ? x.toNonIndexed() : x; if (y.attributes.uv) y.deleteAttribute('uv'); if (!y.attributes.normal) y.computeVertexNormals(); return y; }));
        const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: mats[k], side: k === 'roof' ? THREE.DoubleSide : THREE.FrontSide }));
        mesh.castShadow = hi; mesh.receiveShadow = hi;
        hold.add(mesh);
      }
      const lat = o.side * o.lat;
      worldAt(o.s, lat, wp);
      hold.position.set(wp.x, Math.min(groundAt(o.s, lat - o.side * w / 2), groundAt(o.s, lat + o.side * w / 2)) + 0.05, wp.z);
      hold.rotation.y = -wp.theta;
      group.add(hold);
      return hold;
    };
    if (spotOk(winery.s, winery.side * winery.lat, 8)) {
      building({ ...winery, lat: winery.lat, w: 8, l: 15, h: 4.2, win: 3, doorSide: -winery.side, wallCol: 0xe9d3a8 });
      // Fässer und Kisten vor dem Weingut
      const barrels = [], crates = [];
      for (let i = 0; i < 7; i++) {
        const s = winery.s - 6 + i * 1.3 + vr() * 0.3, lat = winery.side * (hw + 9.6 + (i % 2) * 0.2);
        worldAt(s, lat, wp);
        barrels.push({ s, x: wp.x, z: wp.z, y: groundAt(s, lat), ry: vr() * 6, sx: 1 });
      }
      for (let i = 0; i < 6; i++) {
        const s = winery.s + 4 + (i % 3) * 0.7, lat = winery.side * (hw + 9.8), lvl = Math.floor(i / 3);
        worldAt(s, lat, wp);
        crates.push({ s, x: wp.x, z: wp.z, y: groundAt(s, lat) + lvl * 0.42, ry: -wp.theta + (vr() - 0.5) * 0.2, sx: 1, r: 0.9 + vr() * 0.2, g: 0.85 + vr() * 0.2, b: 0.8 });
      }
      const barrelGeo = mergeGeometries([
        vcol(new THREE.CylinderGeometry(0.42, 0.42, 1.05, hi ? 14 : 8).translate(0, 0.52, 0), (c, x, y) => c.set(0x7a4a28).multiplyScalar(0.85 + 0.3 * Math.sin(y * 3.1))),
        vcol(new THREE.CylinderGeometry(0.47, 0.47, 0.06, hi ? 14 : 8).translate(0, 0.25, 0), (c) => c.set(0x333333)),
        vcol(new THREE.CylinderGeometry(0.47, 0.47, 0.06, hi ? 14 : 8).translate(0, 0.8, 0), (c) => c.set(0x333333)),
      ]);
      scatter(barrelGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), barrels, { shadow: hi });
      scatter(vcol(new THREE.BoxGeometry(0.6, 0.4, 0.45).translate(0, 0.2, 0), (c, x, y, z, f) => c.set(0xb08550).multiplyScalar(0.8 + 0.3 * hash(f))), new THREE.MeshLambertMaterial({ vertexColors: true }), crates, { shadow: hi });
    }
    if (spotOk(chapel.s, chapel.side * chapel.lat, 8)) building({ ...chapel, w: 5.5, l: 8, h: 4.4, win: 2, doorSide: -1, tower: 8.5, wallCol: 0xf2ece0 });
  }

  // ---- Gardasee: See, Uferstraße mit Mauern, Torri del Benaco (Häuser, Hafen, Scaliger-Burg), Boote, Limonaie ----
  function buildGarda() {
    const gr = mulberry32(map.seed * 23 + 9);
    const side = lakeSide || 1; // Seeseite
    const land = -side; // Bergseite
    const L = range;
    const wp = {};
    const cTmp = new THREE.Color();
    const animated = [];
    const T = town || { s0: L * 0.5, s1: L * 0.5 };
    const tl = T.s1 - T.s0;
    const inT = (s, pad = 0) => s > T.s0 - pad && s < T.s1 + pad;

    // ---- See: Fläche innerhalb der Uferlinie ----
    const shore = [];
    const shape = new THREE.Shape();
    for (let s0 = track.meshFrom; s0 < track.meshTo - 0.1; s0 += 6) {
      worldAt(s0, side * (hw + 8), wp);
      shore.push([wp.x, wp.z]);
      if (shore.length === 1) shape.moveTo(wp.x, -wp.z); else shape.lineTo(wp.x, -wp.z);
    }
    const farFromRoad = (x, z, d) => {
      for (let i = 0; i < samples.length; i += 3) if ((samples[i] - x) ** 2 + (samples[i + 1] - z) ** 2 < d * d) return false;
      return true;
    };
    const inLake = (x, z) => { // Strahltest gegen die Uferlinie
      let inside = false;
      for (let i = 0, j = shore.length - 1; i < shore.length; j = i++) {
        const [xi, zi] = shore[i], [xj, zj] = shore[j];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      return inside;
    };
    let waterMat;
    if (hi) {
      const nor = waveNormalTexture(256, map.seed);
      nor.colorSpace = THREE.NoColorSpace;
      nor.repeat.set(1 / 14, 1 / 14);
      waterMat = new THREE.MeshStandardMaterial({ color: 0x2a6f92, roughness: 0.07, metalness: 0.1, normalMap: nor, normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 1.15 });
      animated.push((dt) => { nor.offset.x += dt * 0.012; nor.offset.y += dt * 0.007; });
    } else waterMat = new THREE.MeshLambertMaterial({ color: 0x3a82a8 });
    const water = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1).rotateX(-Math.PI / 2), waterMat);
    water.position.y = level;
    water.receiveShadow = hi;
    group.add(water);

    // ---- Stein-Bänder (Kaimauern, Brüstungen, Stützmauern) ----
    // prof(s) → [[lat, y], ...] Querschnitt; aufeinanderfolgende Querschnitte werden zu Flächen verbunden, Enden geschlossen.
    // UV: u entlang der Strecke, v = Höhe + Seitenabstand (passt für senkrechte und waagerechte Flächen)
    const stoneMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: stoneTexture(), side: THREE.DoubleSide });
    const band = (s0, s1, prof, color, ds = 2) => {
      const pos = [], cols = [], uvs = [], idx = [];
      let prev = -1, n = 0;
      for (let s = s0; ; s = Math.min(s1, s + ds)) {
        const pr = prof(s);
        const v0 = pos.length / 3;
        for (const [lat, y] of pr) {
          worldAt(s, lat, wp);
          pos.push(wp.x, y, wp.z);
          cTmp.set(color).multiplyScalar(0.86 + gr() * 0.24);
          cols.push(cTmp.r, cTmp.g, cTmp.b);
          uvs.push(s / 2.2, (y + Math.abs(lat)) / 1.1);
        }
        n = pr.length;
        if (prev >= 0) for (let k = 0; k < n - 1; k++) { const a = prev + k, b = v0 + k; idx.push(a, b, a + 1, a + 1, b, b + 1); }
        else for (let k = 1; k < n - 1; k++) idx.push(v0, v0 + k, v0 + k + 1);
        prev = v0;
        if (s >= s1) break;
      }
      for (let k = 1; k < n - 1; k++) idx.push(prev, prev + k, prev + k + 1);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, stoneMat);
      mesh.castShadow = quality === 'high';
      mesh.receiveShadow = hi;
      group.add(mesh);
    };
    // Mauer zwischen l0 und l1 (Seitenabstand, beide > 0) auf Seite sg; top = Höhe über dem Boden
    const wallRun = (sg, s0, s1, l0, l1, top) => band(s0, s1, (s) => {
      const yA = groundAt(s, sg * l0), yB = groundAt(s, sg * l1);
      const t = Math.max(yA + top, yB + 0.3);
      return [[sg * l0, yA - 0.3], [sg * l0, t], [sg * l1, t], [sg * l1, yB - 0.3]];
    }, 0xf2ece2);
    const runs = (s0, s1, minL, maxL, gapMin, gapMax, skip, fn) => {
      let s = s0;
      while (s < s1) {
        const len = Math.min(minL + gr() * (maxL - minL), s1 - s);
        if (len > 6 && !skip(s, s + len)) fn(s, s + len);
        s += len + gapMin + gr() * (gapMax - gapMin);
      }
    };
    const nearTown = (a, b) => b > T.s0 - 12 && a < T.s1 + 12;
    // Brüstung am Seeufer (Gardesana), Lücken für Zufahrten
    runs(track.meshFrom + 14, track.meshTo - 14, 50, 150, 6, 22, nearTown, (a, b) => wallRun(side, a, b, hw + 6.05, hw + 6.55, 0.85));
    // Stützmauern am Hang (Bergseite)
    const lemon = [track.meshFrom + L * 0.35, track.meshFrom + L * 0.8].filter((x) => !inT(x, 60));
    runs(track.meshFrom + 30, track.meshTo - 30, 40, 120, 30, 90, (a, b) => nearTown(a, b) || lemon.some((x) => b > x - 30 && a < x + 30), (a, b) => wallRun(land, a, b, hw + 5.6, hw + 6.4, 1.1));
    for (const x of lemon) wallRun(land, x - 26, x + 26, hw + 5.6, hw + 6.4, 1.4);

    // ---- Limonaie (Zitronengärten): weiße Pfeiler mit Holzbalken auf Terrassen ----
    const pillars = [], beams = [];
    for (const x of lemon) {
      for (let li = 0; li < 4; li++) {
        const lat = land * (hw + 9 + li * 4.2);
        const top = groundAt(x, lat) + 5.6;
        for (let k = -5; k <= 5; k++) {
          const s = x + k * 4.2;
          if (!spotOk(s, lat, 6)) continue;
          worldAt(s, lat, wp);
          const gy = groundAt(s, lat);
          pillars.push({ s, x: wp.x, z: wp.z, y: gy - 0.3, ry: -wp.theta, sx: 0.62, sy: top - gy + 0.3, sz: 0.62 });
          if (k < 5) {
            worldAt(s + 2.1, lat, wp);
            beams.push({ s, x: wp.x, z: wp.z, y: top - 0.05, ry: -wp.theta, sx: 0.16, sy: 0.16, sz: 4.3, r: 0.55, g: 0.4, b: 0.28 });
          }
          if (li < 3) {
            worldAt(s, lat + land * 2.1, wp);
            beams.push({ s, x: wp.x, z: wp.z, y: top - 0.05, ry: -wp.theta, sx: 4.3, sy: 0.14, sz: 0.14, r: 0.5, g: 0.36, b: 0.25 });
          }
        }
      }
    }
    const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    scatter(unitBox, new THREE.MeshLambertMaterial({ color: 0xf1ece0 }), pillars, { shadow: quality === 'high', receive: hi });
    scatter(unitBox, new THREE.MeshLambertMaterial({ vertexColors: true }), beams, { shadow: quality === 'high' });

    if (!town) return { update: (dt) => animated.forEach((f) => f(dt)) };

    // ---- Kai (Uferplattform) im Ort: vor den Häusern, Hafenbecken, Burg ----
    const quayTop = (s) => terrainAt(s) + 0.03;
    const quay = (a, b, l1) => band(a, b, (s) => [[side * (hw + 6.0), quayTop(s)], [side * l1, quayTop(s)], [side * l1, level - 2.5], [side * (hw + 6.0), level - 2.5]], 0xfff6e2);
    const qA = T.s0 + tl * 0.42, qB = T.s0 + tl * 0.66;
    quay(T.s0 - 6, qA, hw + 19);
    quay(qA, qB, hw + 10.5);
    quay(qB, T.s1 + 6, hw + 35);

    // ---- Häuser ----
    const HB = { wall: [], roof: [], win: [], shut: [], wood: [], awn: [], stone: [] };
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), P0 = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
    const frameAt = (s, lat, y, rot = 0) => { worldAt(s, lat, wp); return M.compose(P0.set(wp.x, y, wp.z), Q.setFromAxisAngle(Y, -wp.theta + rot), ONE).clone(); };
    const put = (key, geo, Mx, color) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      if (g.attributes.uv) g.deleteAttribute('uv');
      g.applyMatrix4(Mx);
      const c = new THREE.Color(color);
      const arr = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      HB[key].push(g);
    };
    const box = (key, Mx, w, h, d, x, y, z, color, rotZ = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      if (rotZ) g.rotateZ(rotZ);
      put(key, g.translate(x, y, z), Mx, color);
    };
    const gable = (w, l, h, rh, ov = 0.35) => { // Satteldach, First entlang z
      const hx = w / 2 + ov, hz = l / 2 + ov;
      const Pv = [[-hx, h, -hz], [hx, h, -hz], [0, h + rh, -hz], [-hx, h, hz], [hx, h, hz], [0, h + rh, hz]];
      const tri = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap((i) => Pv[i]), 3));
      g.computeVertexNormals();
      return g;
    };
    const WALLS = [0xf0d9a8, 0xe9a97f, 0xf6e9cf, 0xdc8f72, 0xf2c766, 0xd8dcbc, 0xf3d0c0, 0xe7c08e];
    const SHUT = [0x3f6b43, 0x2f5a3c, 0x6b4a2e, 0x51677a];
    const AWN = [0xb8322a, 0x2f7a4a, 0x2a5a9a, 0xd8792a];
    const ROOF = [0xb0532e, 0xa4482c, 0xbd6a3e, 0x9c4a30];
    const pick = (a) => a[Math.floor(gr() * a.length)];
    const house = (s, sg, front, w, l, floors, base, shop) => {
      const latC = sg * (front + w / 2);
      const Mx = frameAt(s, latC, base);
      const H = floors * 3 + 0.4;
      const wc = pick(WALLS), sc = pick(SHUT);
      box('wall', Mx, w, H + 5, l, 0, (H - 5) / 2, 0, wc);
      box('stone', Mx, w + 0.12, 0.22, l + 0.12, 0, H, 0, cTmp.set(wc).multiplyScalar(1.08).getHex()); // Gesims
      put('roof', gable(w, l, H + 0.1, w * 0.2), Mx, pick(ROOF));
      const fx = -sg * (w / 2 + 0.04); // Fassade zur Straße
      const n = Math.max(1, Math.floor((l - 1) / 2.5));
      for (let f = 0; f < floors; f++) {
        for (let i = 0; i < n; i++) {
          const z = -l / 2 + (l / n) * (i + 0.5);
          if (f === 0) {
            if (shop && i === 0) continue;
            if (i === n - 1 || n === 1) { box('wood', Mx, 0.1, 2.25, 1.1, fx, 1.12, z, 0x5a3a24); continue; } // Tür
          }
          box('win', Mx, 0.08, 1.35, 0.82, fx, f * 3 + 1.55, z, 0x23262c);
          if (hi) for (const dz of [-0.66, 0.66]) box('shut', Mx, 0.07, 1.42, 0.46, fx - sg * 0.03, f * 3 + 1.55, z + dz, sc);
          if (quality === 'high') box('win', Mx, 0.08, 1.2, 0.75, -fx, f * 3 + 1.6, z, 0x2b2e34); // Rückseite
        }
      }
      if (shop) { // Laden mit Markise
        const z = -l / 2 + (l / n) * 0.5;
        box('win', Mx, 0.08, 2.0, Math.min(2.4, l / n - 0.3), fx, 1.15, z, 0x30363e);
        box('awn', Mx, 1.5, 0.07, Math.min(2.8, l / n), fx - sg * 0.72, 2.75, z, pick(AWN), sg * 0.28);
      }
    };
    // Bergseite: geschlossene Häuserzeile entlang der Gardesana
    for (let s = T.s0 + 2; s < T.s1 - 4;) {
      const l = 7 + gr() * 4, w = 8 + gr() * 3, floors = 2 + Math.floor(gr() * 2.4);
      const sc = s + l / 2;
      const front = hw + 5.8;
      house(sc, land, front, w, l, floors, groundAt(sc, land * front) - 0.05, gr() < 0.45);
      s += l + (gr() < 0.25 ? 2.5 + gr() * 3 : 0.2);
    }
    // Seeseite: Altstadthäuser auf dem Kai
    for (let s = T.s0 + 1; s < qA - 6;) {
      const l = 7 + gr() * 3.5, w = 7 + gr() * 2, floors = 2 + Math.floor(gr() * 2.2);
      const sc = s + l / 2;
      house(sc, side, hw + 7.2, w, l, floors, quayTop(sc), gr() < 0.6);
      s += l + 0.2;
    }

    // ---- Scaliger-Burg auf dem Kai: Ringmauer, Ecktürme, Bergfried, Schwalbenschwanz-Zinnen ----
    {
      const sC = T.s0 + tl * 0.83;
      const Wd = 22, Ln = 26, latC = side * (hw + 11 + Wd / 2);
      const Mx = frameAt(sC, latC, quayTop(sC) - 0.1);
      const stoneC = () => cTmp.set(0xcbb48c).multiplyScalar(0.88 + gr() * 0.2).getHex();
      const merlons = (x0, z0, x1, z1, y, th) => { // Zinnenreihe von (x0,z0) nach (x1,z1)
        const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 1.5);
        const along = Math.abs(x1 - x0) < 1e-3;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
          const c = stoneC();
          box('stone', Mx, along ? th : 0.85, 1.0, along ? 0.85 : th, x, y + 0.5, z, c);
          if (hi) for (const d of [-0.3, 0.3]) box('stone', Mx, along ? th : 0.25, 0.42, along ? 0.25 : th, x + (along ? 0 : d), y + 1.2, z + (along ? d : 0), c); // Schwalbenschwanz
        }
      };
      const wallH = 7.5, th = 1.4;
      const hx = Wd / 2, hz = Ln / 2;
      for (const [x0, z0, x1, z1] of [[-hx, -hz, hx, -hz], [-hx, hz, hx, hz], [-hx, -hz, -hx, hz], [hx, -hz, hx, hz]]) {
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, along = x0 === x1;
        box('stone', Mx, along ? th : Wd, wallH + 4, along ? Ln : th, cx, (wallH - 4) / 2, cz, stoneC());
        merlons(x0, z0, x1, z1, wallH, th);
      }
      box('win', Mx, 0.3, 4.2, 3.2, -side * (hx + 0.55), 2.1, 0, 0x2a2622); // Tor zur Straße
      const tower = (x, z, w, h) => {
        box('stone', Mx, w, h + 4, w, x, (h - 4) / 2, z, stoneC());
        merlons(x - w / 2, z - w / 2, x + w / 2, z - w / 2, h, 0.9); merlons(x - w / 2, z + w / 2, x + w / 2, z + w / 2, h, 0.9);
        merlons(x - w / 2, z - w / 2, x - w / 2, z + w / 2, h, 0.9); merlons(x + w / 2, z - w / 2, x + w / 2, z + w / 2, h, 0.9);
        for (let k = 1; k < h / 4; k++) for (const sg of [-1, 1]) box('win', Mx, 0.1, 1.2, 0.35, sg * (w / 2 + 0.05), k * 4, z, 0x2a2622); // Schießscharten
      };
      tower(-side * hx, -hz, 4.4, 12.5);
      tower(-side * hx, hz, 4.4, 12.5);
      tower(side * hx, -hz, 4.4, 11.5);
      tower(side * (hx - 3.2), hz - 3.2, 6.8, 21); // Bergfried
    }

    // Mole ins Hafenbecken + Poller
    const pierS = T.s0 + tl * 0.58;
    {
      const Mx = frameAt(pierS, side * (hw + 10.5 + 11), 0);
      box('stone', Mx, 22, quayTop(pierS) - level + 2.5, 3.2, 0, (quayTop(pierS) + level - 2.5) / 2, 0, 0xd2c6ae);
      for (let i = 0; i < 6; i++) box('wood', Mx, 0.28, 0.5, 0.28, -11 + 2 + i * 3.6, quayTop(pierS) + 0.25, side * 1.3, 0x3a3a3c);
    }
    const flushHB = () => {
      for (const k of Object.keys(HB)) {
        if (!HB[k].length) continue;
        const g = mergeGeometries(HB[k]);
        HB[k].forEach((x) => x.dispose());
        g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: k === 'roof' || k === 'awn' ? THREE.DoubleSide : THREE.FrontSide }));
        mesh.castShadow = hi;
        mesh.receiveShadow = hi;
        group.add(mesh);
      }
    };
    flushHB();

    // ---- Palmen an der Promenade ----
    const palmItems = [];
    for (let s = T.s0 + 4; s < qB; s += 13 + gr() * 6) {
      const lat = side * (s < qA ? hw + 6.6 : hw + 8.6);
      worldAt(s, lat, wp);
      const sz = 0.85 + gr() * 0.3;
      palmItems.push({ s, x: wp.x, z: wp.z, y: quayTop(s) - 0.1, ry: gr() * 6.28, sx: sz, sy: sz * (0.9 + gr() * 0.2), r: 0.9 + gr() * 0.2, g: 1, b: 0.9 + gr() * 0.15 });
    }
    scatter(palm(map.seed + 3, quality === 'high' ? 2 : hi ? 1 : 0), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), palmItems, { shadow: quality === 'high' });

    // ---- Laternen im Ort ----
    {
      const poleGeo = mergeGeometries([
        vcol(new THREE.CylinderGeometry(0.06, 0.09, 4.6, 6).translate(0, 2.3, 0), (c) => c.set(0x2c3a30)),
        vcol(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 5).rotateZ(Math.PI / 2).translate(-0.45, 4.45, 0), (c) => c.set(0x2c3a30)),
        vcol(new THREE.CylinderGeometry(0.2, 0.12, 0.2, 6).translate(-0.85, 4.35, 0), (c) => c.set(0x2c3a30)),
      ]);
      const headGeo = new THREE.SphereGeometry(0.14, 8, 6).translate(-0.85, 4.18, 0);
      const poles = [];
      for (let s = T.s0 - 4; s < T.s1 + 4; s += 19) {
        for (const sg of [-1, 1]) {
          const lat = sg * (hw + 4.4);
          worldAt(s + (sg > 0 ? 0 : 9.5), lat, wp);
          poles.push({ s, x: wp.x, z: wp.z, y: groundAt(s, lat) - 0.05, ry: -wp.theta + (sg > 0 ? 0 : Math.PI), sx: 1 });
        }
      }
      scatter(poleGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), poles, { shadow: quality === 'high' });
      scatter(headGeo, new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), poles);
    }

    // ---- Ortsschilder (weiß, schwarzer Rand; am Ortsende rot durchgestrichen) ----
    const sign = (s, end) => {
      const tex = canvasTexture(512, 192, (g, w, h) => {
        g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
        g.fillStyle = '#111'; g.font = '700 50px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const words = map.town.name.split(' ');
        const mid = Math.ceil(words.length / 2);
        g.fillText(words.slice(0, mid).join(' '), w / 2, h * 0.37);
        g.fillText(words.slice(mid).join(' '), w / 2, h * 0.67);
        if (end) { g.strokeStyle = '#c8102e'; g.lineWidth = 16; g.beginPath(); g.moveTo(40, h - 30); g.lineTo(w - 40, 30); g.stroke(); }
      });
      const hold = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshLambertMaterial({ map: tex }));
      plate.position.y = 2.1;
      const back = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9).rotateY(Math.PI), new THREE.MeshLambertMaterial({ color: 0x8a8d92 }));
      back.position.set(0, 2.1, -0.01);
      hold.add(plate, back);
      for (const x of [-0.8, 0.8]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0x8a8d92 }));
        post.position.set(x, 1.3, -0.04);
        hold.add(post);
      }
      const lat = hw + 2.6;
      worldAt(s, lat, wp);
      hold.position.set(wp.x, groundAt(s, lat), wp.z);
      hold.rotation.y = -wp.theta;
      hold.traverse((o) => { o.castShadow = hi; });
      group.add(hold);
    };
    sign(T.s0 - 28, false);
    sign(T.s1 + 14, true);

    // ---- Boote: im Hafen (vertäut) und Segelboote auf dem See (schaukeln) ----
    const hull = mergeGeometries([
      vcol(new THREE.SphereGeometry(1, hi ? 14 : 8, hi ? 6 : 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.9, 0.55, 2.5), (c) => c.setRGB(1, 1, 1)),
      vcol(new THREE.CylinderGeometry(0.9, 0.9, 0.08, hi ? 14 : 8).scale(1, 1, 2.78).translate(0, 0.02, 0), (c) => c.setRGB(0.95, 0.92, 0.85)),
      vcol(new THREE.BoxGeometry(0.9, 0.5, 1.1).translate(0, 0.27, 0.6), (c) => c.setRGB(0.95, 0.95, 0.95)),
    ]);
    const rig = mergeGeometries([
      vcol(new THREE.CylinderGeometry(0.05, 0.06, 8, 5).translate(0, 4.05, -0.4), (c) => c.setRGB(0.8, 0.8, 0.82)),
      vcol(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5).rotateX(Math.PI / 2).translate(0, 1.0, 1.2), (c) => c.setRGB(0.6, 0.6, 0.62)),
      (() => { // Großsegel + Fock
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.1, -0.35, 0, 7.8, -0.35, 0, 1.1, 2.7, 0, 1.0, -0.5, 0, 7.2, -0.5, 0, 0.6, -2.6], 3));
        g.computeVertexNormals();
        return vcol(g, (c) => c.setRGB(1, 1, 1));
      })(),
    ]);
    const boats = [];
    for (let i = 0; i < 9; i++) { // im Hafen
      const s = qA + 6 + (i / 9) * (qB - qA - 10);
      if (Math.abs(s - pierS) < 3.5) continue;
      const lat = side * (hw + 13.5 + gr() * 12);
      worldAt(s, lat, wp);
      boats.push({ x: wp.x, z: wp.z, ry: -wp.theta + side * Math.PI / 2 + (gr() - 0.5) * 0.4, k: 0.55 + gr() * 0.3, sail: false, c: pick([0xffffff, 0x2a5a9a, 0xb8322a, 0x2f7a4a, 0xf2c766]), ph: gr() * 6 });
    }
    for (let i = 0, tries = 0; i < (hi ? 14 : 7) && tries < 400; tries++) { // Segelboote draußen
      const s = track.meshFrom + gr() * L, lat = side * (hw + 40 + gr() * 260);
      worldAt(s, lat, wp);
      if (!inLake(wp.x, wp.z) || !farFromRoad(wp.x, wp.z, hw + 34)) continue;
      boats.push({ x: wp.x, z: wp.z, ry: gr() * 6.28, k: 0.9 + gr() * 0.5, sail: true, c: gr() < 0.7 ? 0xffffff : pick([0x1d4fd8, 0xc8102e, 0x2b2e33]), ph: gr() * 6 });
      i++;
    }
    const nSail = boats.filter((b) => b.sail).length;
    const hullIM = new THREE.InstancedMesh(hull, new THREE.MeshLambertMaterial({ vertexColors: true }), boats.length);
    const rigIM = new THREE.InstancedMesh(rig, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), Math.max(1, nSail));
    rigIM.count = nSail;
    boats.forEach((b, i) => hullIM.setColorAt(i, cTmp.set(b.c)));
    hullIM.frustumCulled = rigIM.frustumCulled = false;
    hullIM.castShadow = quality === 'high';
    group.add(hullIM, rigIM);
    let bt = 0;
    const eu = new THREE.Euler(0, 0, 0, 'YXZ'), mq = new THREE.Quaternion(), mp = new THREE.Vector3(), ms = new THREE.Vector3(), m4 = new THREE.Matrix4();
    const placeBoats = (dt) => {
      bt += dt;
      let r = 0;
      boats.forEach((b, i) => {
        const roll = Math.sin(bt * 1.1 + b.ph) * (b.sail ? 0.06 : 0.035) + (b.sail ? 0.12 : 0);
        mq.setFromEuler(eu.set(Math.sin(bt * 0.8 + b.ph * 1.3) * 0.03, b.ry, roll));
        m4.compose(mp.set(b.x, level + 0.12 + Math.sin(bt * 1.3 + b.ph) * 0.06, b.z), mq, ms.setScalar(b.k));
        hullIM.setMatrixAt(i, m4);
        if (b.sail) rigIM.setMatrixAt(r++, m4);
      });
      hullIM.instanceMatrix.needsUpdate = rigIM.instanceMatrix.needsUpdate = true;
    };
    placeBoats(0);
    let acc = 0;
    animated.push((dt) => { acc += dt; if (acc > (hi ? 0.033 : 0.1)) { placeBoats(acc); acc = 0; } });

    return { update: (dt) => animated.forEach((f) => f(dt)) };
  }

  // ---- Hindernisse ----
  const rockGeo = colored(blob(0.8, 1, 9, 0.8), 0xffffff);
  const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: col.rock });
  const logMat = new THREE.MeshLambertMaterial({ color: 0x8a5f33 });
  const logEnd = new THREE.MeshLambertMaterial({ color: 0xcaa26a });
  const baleTex = canvasTexture(128, 64, (g, w, h) => {
    g.fillStyle = '#d9b44a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,80,20,0.55)'; g.lineWidth = 2;
    for (let i = 0; i < 40; i++) { const x = hash(i * 3.1) * w, y = hash(i * 7.7) * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y + (hash(i) - 0.5) * 6); g.stroke(); }
    g.fillStyle = '#b02a22'; g.fillRect(w * 0.3, 0, 5, h); g.fillRect(w * 0.7, 0, 5, h);
  });
  const baleMat = new THREE.MeshLambertMaterial({ map: baleTex });
  const coneMat = new THREE.MeshLambertMaterial({ color: 0xff6a1a });
  const coneWhite = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
  const coneBase = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const mk = {
    rock(r) {
      const mesh = new THREE.Mesh(rockGeo, rockMat);
      mesh.scale.set(1 + hash(r.s) * 0.5, 0.9 + hash(r.s + 3) * 0.6, 1 + hash(r.s + 7) * 0.5);
      mesh.rotation.y = hash(r.s + 1) * 6;
      return mesh;
    },
    log(r) {
      const g = new THREE.Group();
      const len = r.hw * 2;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, len, 10).rotateZ(Math.PI / 2), logMat);
      g.add(body);
      for (const sx of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10).rotateY(sx * Math.PI / 2), logEnd);
        cap.position.x = sx * (len / 2 + 0.005);
        g.add(cap);
      }
      g.position.y = 0.05;
      g.rotation.y = (hash(r.s) - 0.5) * 0.25;
      return g;
    },
    bale(r) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.9), baleMat);
      box.position.y = 0.4;
      g.add(box);
      if (hash(r.s + 5) > 0.5) { const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), baleMat); top.position.set(0.1, 1.15, 0); g.add(top); }
      g.rotation.y = (hash(r.s) - 0.5) * 0.6;
      return g;
    },
    cone() {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5), coneBase);
      base.position.y = 0.025;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 12), coneMat);
      cone.position.y = 0.36;
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.145, 0.1, 12), coneWhite);
      stripe.position.y = 0.3;
      g.add(base, cone, stripe);
      return g;
    },
  };
  const rockMeshes = track.rocks.map((r) => {
    const mesh = mk[r.kind](r);
    pointAt(r.s, p);
    const y = terrainAt(r.s) + rampAt(r.s) - (r.lat * Math.tan(bankAt(r.s)));
    mesh.position.x += p.x + Math.cos(p.theta) * r.lat;
    mesh.position.z += p.z + Math.sin(p.theta) * r.lat;
    mesh.position.y += y + (r.kind === 'rock' ? 0.25 : 0);
    if (r.kind !== 'rock') {
      mesh.rotation.y += -p.theta;
      mesh.rotation.x = Math.atan(track.slopeAt(r.s));
      mesh.rotation.order = 'YXZ';
    }
    mesh.traverse((o) => { o.castShadow = true; });
    group.add(mesh);
    return mesh;
  });

  // ---- Pfützen, Matsch, Sand (folgen dem Gelände) ----
  const patchLook = {
    puddle: { color: 0x3b6f9c, rough: 0.05, metal: 0.4, opacity: 0.82, ring: 0x2a4f70 },
    mud: { color: 0x4a3120, rough: 0.9, metal: 0, opacity: 0.95, ring: 0x35231a },
    sand: { color: 0xe3c98a, rough: 1, metal: 0, opacity: 0.97, ring: 0xc8ad6c },
  };
  const patchMats = {};
  for (const k of Object.keys(patchLook)) {
    const l = patchLook[k];
    patchMats[k] = new THREE.MeshStandardMaterial({ color: l.color, roughness: l.rough, metalness: l.metal, transparent: true, opacity: l.opacity, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false });
  }
  for (const pt of track.patches) {
    const NX = 14, NZ = 8;
    const pos = new Float32Array((NX + 1) * (NZ + 1) * 3);
    for (let i = 0; i <= NX; i++) {
      for (let j = 0; j <= NZ; j++) {
        const u = (i / NX) * 2 - 1, v = (j / NZ) * 2 - 1;
        const x = u * Math.sqrt(1 - (v * v) / 2), z = v * Math.sqrt(1 - (u * u) / 2); // Quadrat → Scheibe
        const ss = pt.s + x * (pt.len / 2), lt = pt.lat + z * pt.r;
        pointAt(ss, p);
        const k = (i * (NZ + 1) + j) * 3;
        pos[k] = p.x + Math.cos(p.theta) * lt;
        pos[k + 2] = p.z + Math.sin(p.theta) * lt;
        pos[k + 1] = track.heightAt(ss) - lt * Math.tan(bankAt(ss)) + 0.05;
      }
    }
    const idx = [];
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { const a2 = i * (NZ + 1) + j, b2 = a2 + 1, c2 = a2 + NZ + 1, d2 = c2 + 1; idx.push(a2, b2, c2, b2, d2, c2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, patchMats[pt.kind]);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ---- Leuchtstreifen am Rand (Abendstimmung) ----
  if (map.neon) {
    const post = new THREE.BoxGeometry(0.07, 0.3, 0.07);
    const nm = new THREE.MeshBasicMaterial({ color: map.neon });
    const gap = 4;
    const cnt = Math.floor(range / gap);
    const mesh = new THREE.InstancedMesh(post, nm, cnt * 2);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < cnt; i++) {
      const ss = track.meshFrom + i * gap + 1;
      pointAt(ss, p);
      for (const sx of [-1, 1]) {
        const lt = sx * (hw + 0.7);
        const y = track.terrainAt(ss) + bankH(lt) - lt * Math.tan(bankAt(ss)) + 0.22;
        m4.makeTranslation(p.x + Math.cos(p.theta) * lt, y, p.z + Math.sin(p.theta) * lt);
        mesh.setMatrixAt(k++, m4);
      }
    }
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // ---- Boost-Felder ----
  const padTex = canvasTexture(64, 96, (g, w, h) => {
    g.fillStyle = '#1b2a49'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd400';
    for (let k = 0; k < 3; k++) {
      const y = 12 + k * 28;
      g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w - 8, y + 22); g.lineTo(w - 20, y + 22); g.lineTo(w / 2, y + 8);
      g.lineTo(20, y + 22); g.lineTo(8, y + 22); g.closePath(); g.fill();
    }
  });
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const padGeo = new THREE.PlaneGeometry(2.0, 3.2);
  const padMeshes = track.pads.map((pd) => {
    const holder = new THREE.Group();
    holder.rotation.order = 'YXZ';
    const mesh = new THREE.Mesh(padGeo, padMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.07;
    holder.add(mesh);
    pointAt(pd.s, p);
    holder.position.set(p.x + Math.cos(p.theta) * pd.lat, track.heightAt(pd.s) - pd.lat * Math.tan(bankAt(pd.s)), p.z + Math.sin(p.theta) * pd.lat);
    holder.rotation.set(Math.atan(track.slopeAt(pd.s)), -p.theta, -bankAt(pd.s));
    group.add(holder);
    return holder;
  });

  // ---- Start- und Zielbogen ----
  function arch(s, label, checkered) {
    const tex2 = canvasTexture(512, 96, (g, w, h) => {
      g.fillStyle = checkered ? '#fff' : '#2fae4d'; g.fillRect(0, 0, w, h);
      if (checkered) {
        g.fillStyle = '#111';
        for (let y = 0; y < 4; y++) for (let x = 0; x < 32; x++) if ((x + y) % 2) g.fillRect(x * 16, y * 24, 16, 24);
        g.fillStyle = '#e5352b'; g.fillRect(96, 12, 320, 72);
      }
      g.fillStyle = '#fff'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, w / 2, h / 2 + 4);
    });
    const holder = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5, metalness: 0.4 });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), postMat);
      post.position.set(sx * (hw + 1.4), 3.5, 0);
      holder.add(post);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2.8, 1.5, 0.25), new THREE.MeshBasicMaterial({ map: tex2 }));
    banner.position.y = 6.6;
    holder.add(banner);
    pointAt(s, p);
    holder.position.set(p.x, track.heightAt(s), p.z);
    holder.rotation.y = -p.theta;
    group.add(holder);
  }
  if (track.loop) {
    arch(0, 'START · ZIEL', true);
  } else {
    arch(0, 'START', false);
    arch(track.length, 'ZIEL', true);
  }

  return { group, rockMeshes, padMeshes, update: gardaFx ? gardaFx.update : null };
}

export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mt) => { if (mt.map) mt.map.dispose(); mt.dispose(); });
    }
  });
}
