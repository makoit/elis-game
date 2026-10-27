import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TERRAIN } from './terrainmeta.js';

// Echtes Gelände je Angelplatz (erzeugt von tools/terrain.py aus Höhendaten + OpenStreetMap).
// Spielkoordinaten: Ursprung = Platz, +z = Blickrichtung, +x = links vom Angler, y = Höhe über dem Wasserspiegel (Wasser bei y = 0).
//
// assets/terrain/<id>.bin (little endian, ohne Kopf), n = meta.n (nah), m = meta.nFar (fern):
//   Int16[n*n]  Höhen nah in Dezimetern   (Zeile j = z, Spalte i = x; Punkt (i, j) liegt bei x = -size/2 + i*size/(n-1))
//   Int16[m*m]  Höhen fern in Dezimetern
//   Uint8[n*n]  Landnutzung nah: Bit 0–6 Klasse, Bit 7 = Wasser
//   Uint8[m*m]  Landnutzung fern
// assets/terrain/<id>.json: { buildings: [{ p: [[x, z], …], h, k, roof }] }

export const COVER = { MEADOW: 0, FOREST: 1, VINEYARD: 2, ORCHARD: 3, TOWN: 4, ROCK: 5, SAND: 6, FARM: 7, WETLAND: 8 };
export const WATER_BIT = 128;

export async function loadTerrain(spotId, base = './assets/terrain/') {
  const meta = TERRAIN[spotId];
  if (!meta) throw new Error('Kein Gelände für ' + spotId);
  const [buf, extra] = await Promise.all([
    fetch(`${base}${spotId}.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}${spotId}.json`).then((r) => r.json()).catch(() => ({ buildings: [] })),
  ]);
  const n = meta.n;
  const m = meta.nFar;
  const toM = (a) => Float32Array.from(a, (v) => v / 10);
  let o = 0;
  const hn = toM(new Int16Array(buf, o, n * n)); o += n * n * 2;
  const hf = toM(new Int16Array(buf, o, m * m)); o += m * m * 2;
  const mn = new Uint8Array(buf, o, n * n); o += n * n;
  const mf = new Uint8Array(buf, o, m * m);
  return {
    meta,
    near: { n, size: meta.nearSize, cell: meta.nearSize / (n - 1), h: hn, mask: mn },
    far: { n: m, size: meta.farSize, cell: meta.farSize / (m - 1), h: hf, mask: mf },
    buildings: extra.buildings || [],
  };
}

function sample(g, x, z) {
  const fx = (x + g.size / 2) / g.cell;
  const fz = (z + g.size / 2) / g.cell;
  if (fx < 0 || fz < 0 || fx > g.n - 1 || fz > g.n - 1) return null;
  const i = Math.min(g.n - 2, Math.floor(fx));
  const j = Math.min(g.n - 2, Math.floor(fz));
  const ax = fx - i;
  const az = fz - j;
  const k = j * g.n + i;
  return (g.h[k] * (1 - ax) + g.h[k + 1] * ax) * (1 - az) + (g.h[k + g.n] * (1 - ax) + g.h[k + g.n + 1] * ax) * az;
}

// Geländehöhe an (x, z): nah bilinear, außerhalb aus dem fernen Raster
export function heightAt(t, x, z) {
  return sample(t.near, x, z) ?? sample(t.far, x, z) ?? 0;
}

// Landnutzungsklasse an (x, z) (ohne Wasser-Bit) und ob dort Wasser ist
export function coverAt(t, x, z) {
  for (const g of [t.near, t.far]) {
    const i = Math.round((x + g.size / 2) / g.cell);
    const j = Math.round((z + g.size / 2) / g.cell);
    if (i >= 0 && j >= 0 && i < g.n && j < g.n) {
      const v = g.mask[j * g.n + i];
      return { cls: v & 0x7f, water: (v & WATER_BIT) > 0 };
    }
  }
  return { cls: COVER.MEADOW, water: false };
}

// Gitter als BufferGeometry mit Normalen und Landnutzungs-Gewichten für einen Splat-Shader:
// aCover = (Wald, Fels, Sand, Wein+Obst), aCover2 = (Ort, Acker, Feuchtgebiet, Wiese), über ~1 Zelle weichgezeichnet.
// opts.holeSize: Punkte innerhalb dieses Quadrats (nahes Gelände) werden um opts.sink (4 m) abgesenkt.
export function terrainGeometry(g, opts = {}) {
  const { n, size, cell, h, mask } = g;
  const pos = new Float32Array(n * n * 3);
  const half = opts.holeSize ? opts.holeSize / 2 - cell * 0.5 : -1;
  const sink = opts.sink ?? 4;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = -size / 2 + i * cell;
      const z = -size / 2 + j * cell;
      let y = h[k];
      if (half > 0 && Math.abs(x) < half && Math.abs(z) < half) y -= sink;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    }
  }
  // Klassen-Gewichte (8 Kanäle), dann 3×3 weichzeichnen
  const ch = new Float32Array(n * n * 8);
  const slot = [7, 0, 3, 3, 4, 1, 2, 5, 6]; // Klasse -> Kanal: Wiese 7, Wald 0, Wein 3, Obst 3, Ort 4, Fels 1, Sand 2, Acker 5, Feucht 6
  for (let k = 0; k < n * n; k++) ch[k * 8 + (slot[mask[k] & 0x7f] ?? 7)] = 1;
  const blur = new Float32Array(n * n * 8);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let w = 0;
      const k = j * n + i;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const jj = j + dj;
          const ii = i + di;
          if (jj < 0 || ii < 0 || jj >= n || ii >= n) continue;
          const f = di || dj ? 0.5 : 1;
          const q = (jj * n + ii) * 8;
          for (let c = 0; c < 8; c++) blur[k * 8 + c] += ch[q + c] * f;
          w += f;
        }
      }
      for (let c = 0; c < 8; c++) blur[k * 8 + c] /= w;
    }
  }
  const c1 = new Float32Array(n * n * 4);
  const c2 = new Float32Array(n * n * 4);
  for (let k = 0; k < n * n; k++) {
    for (let c = 0; c < 4; c++) { c1[k * 4 + c] = blur[k * 8 + c]; c2[k * 4 + c] = blur[k * 8 + 4 + c]; }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let p = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      // Reihenfolge so, dass die Normalen nach oben zeigen
      idx[p++] = a; idx[p++] = a + n; idx[p++] = a + 1;
      idx[p++] = a + 1; idx[p++] = a + n; idx[p++] = a + n + 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCover', new THREE.BufferAttribute(c1, 4));
  geo.setAttribute('aCover2', new THREE.BufferAttribute(c2, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Baumstandorte aus der Landnutzung. kind: 'forest' | 'orchard' | 'vineyard' | 'town' (Gartenbäume).
// Nah dicht (dichter je näher an der Kamera), fern ein Baum je Zelle (opts.far = false schaltet das ab).
export function treeInstances(t, kind, max = 2000, opts = {}) {
  const cls = { forest: [COVER.FOREST], orchard: [COVER.ORCHARD], vineyard: [COVER.VINEYARD], town: [COVER.TOWN] }[kind] || [COVER.FOREST];
  const rnd = mulberry((opts.seed ?? 1) * 7919 + kind.length);
  const perCell = { forest: 1.6, orchard: 0.8, vineyard: 1.2, town: 0.12 }[kind] ?? 1;
  const out = [];
  const add = (g, i, j, chance, far) => {
    const k = j * g.n + i;
    const v = g.mask[k];
    if ((v & WATER_BIT) || !cls.includes(v & 0x7f) || g.h[k] < 0.4) return;
    let c = chance;
    while (c > 0) {
      if (rnd() < c) {
        const x = -g.size / 2 + (i + rnd() - 0.5) * g.cell;
        const z = -g.size / 2 + (j + rnd() - 0.5) * g.cell;
        if (Math.hypot(x, z) < 12) { c -= 1; continue; }
        if (far && Math.abs(x) < t.near.size / 2 && Math.abs(z) < t.near.size / 2) { c -= 1; continue; }
        const y = heightAt(t, x, z);
        if (y > 0.3) out.push({ x, y, z, s: 0.75 + rnd() * 0.55, rot: rnd() * Math.PI * 2 });
      }
      c -= 1;
    }
  };
  const g = t.near;
  for (let j = 0; j < g.n; j++) {
    for (let i = 0; i < g.n; i++) {
      const x = -g.size / 2 + i * g.cell;
      const z = -g.size / 2 + j * g.cell;
      const d = Math.hypot(x, z);
      add(g, i, j, perCell * Math.min(1, 220 / (d + 60)), false);
    }
  }
  if (opts.far !== false && kind === 'forest') {
    const f = t.far;
    for (let j = 0; j < f.n; j++) for (let i = 0; i < f.n; i++) add(f, i, j, 1.2, true);
  }
  // Bei zu vielen: gleichmäßig ausdünnen, nahe Bäume bevorzugen
  out.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  if (out.length <= max) return out;
  const keep = out.slice(0, Math.floor(max * 0.6));
  const rest = out.slice(keep.length);
  const step = rest.length / (max - keep.length);
  for (let q = 0; q < rest.length && keep.length < max; q += step) keep.push(rest[Math.floor(q)]);
  return keep;
}

// Gebäude aus OSM-Grundrissen: Wände in Putzfarben, Satteldach (Terrakotta/Dunkelgrau) oder Flachdach.
// opts.walls / opts.roofs: Farbpaletten (z. B. rote Holzhäuser in Norwegen).
export function buildingMeshes(t, opts = {}) {
  const walls = (opts.walls || [0xf2e6cf, 0xe9d3a9, 0xf5efe4, 0xe8c9a0, 0xf0d8c8, 0xd9cbb2, 0xfaf6ee]).map((c) => new THREE.Color(c));
  const roofs = (opts.roofs || [0xa8502e, 0xb5603a, 0x8e4428, 0x5a5856, 0x6b4a3a]).map((c) => new THREE.Color(c));
  const rnd = mulberry(opts.seed ?? 3);
  const wallGeos = [];
  const roofGeos = [];
  for (const b of t.buildings) {
    const pts = b.p;
    if (pts.length < 3) continue;
    let base = Infinity;
    let cx = 0;
    let cz = 0;
    for (const [x, z] of pts) { base = Math.min(base, heightAt(t, x, z)); cx += x; cz += z; }
    cx /= pts.length; cz /= pts.length;
    if (base < 0.2) base = 0.2;
    base -= 0.5;
    const top = base + 0.5 + b.h;
    const wc = walls[Math.floor(rnd() * walls.length)];
    const rc = roofs[Math.floor(rnd() * roofs.length)];
    // Wände
    const wp = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[(i + 1) % pts.length];
      // Dreiecksnormale von (p0, p1, p1 oben) zeigt nach (-(z1-z0), x1-x0); muss weg vom Schwerpunkt zeigen
      const nx = -(z1 - z0);
      const nz = x1 - x0;
      const out = nx * ((x0 + x1) / 2 - cx) + nz * ((z0 + z1) / 2 - cz) > 0;
      const q = out
        ? [x0, base, z0, x1, base, z1, x1, top, z1, x0, base, z0, x1, top, z1, x0, top, z0]
        : [x1, base, z1, x0, base, z0, x0, top, z0, x1, base, z1, x0, top, z0, x1, top, z1];
      wp.push(...q);
    }
    // Dach: kleine/mittlere Häuser Satteldach über dem gedrehten Rechteck, große Flachdach
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const [a, c] = pts[i]; const [d, e] = pts[(i + 1) % pts.length]; area += a * e - d * c; }
    area = Math.abs(area) / 2;
    const rp = [];
    if (b.roof !== 'flat' && area < 450 && b.h < 16) {
      // Hauptachse per Kovarianz
      let sxx = 0; let szz = 0; let sxz = 0;
      for (const [x, z] of pts) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
      const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
      const ux = Math.cos(ang); const uz = Math.sin(ang);
      let u0 = Infinity; let u1 = -Infinity; let v0 = Infinity; let v1 = -Infinity;
      for (const [x, z] of pts) {
        const u = (x - cx) * ux + (z - cz) * uz;
        const v = -(x - cx) * uz + (z - cz) * ux;
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
      const ov = 0.4;
      u0 -= ov; u1 += ov; v0 -= ov; v1 += ov;
      const rh = Math.min(5, (v1 - v0) * 0.32);
      const P = (u, v, y) => [cx + u * ux - v * uz, y, cz + u * uz + v * ux];
      const vm = (v0 + v1) / 2;
      const A = P(u0, v0, top); const B = P(u1, v0, top); const C = P(u1, v1, top); const D = P(u0, v1, top);
      const E = P(u0, vm, top + rh); const F = P(u1, vm, top + rh);
      // zwei Dachflächen (nach außen/oben orientiert) + Giebeldreiecke
      rp.push(...A, ...F, ...B, ...A, ...E, ...F);
      rp.push(...C, ...F, ...E, ...C, ...E, ...D);
      wp.push(...A, ...D, ...E, ...B, ...F, ...C);
    } else {
      const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const [a, c, d] of tris) {
        // nach oben zeigend: Reihenfolge prüfen
        const [ax, az] = pts[a]; const [bx, bz] = pts[c]; const [dx, dz] = pts[d];
        const up = (bz - az) * (dx - ax) - (bx - ax) * (dz - az) > 0;
        const tri = up ? [a, c, d] : [a, d, c];
        for (const v of tri) rp.push(pts[v][0], top, pts[v][1]);
      }
    }
    const mk = (arr, col) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const cols = new Float32Array(arr.length);
      const shade = 0.92 + rnd() * 0.16;
      for (let i = 0; i < arr.length; i += 3) { cols[i] = col.r * shade; cols[i + 1] = col.g * shade; cols[i + 2] = col.b * shade; }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      return geo;
    };
    wallGeos.push(mk(wp, wc));
    if (rp.length) roofGeos.push(mk(rp, rc));
  }
  const group = new THREE.Group();
  group.name = 'buildings';
  if (wallGeos.length) {
    const m = new THREE.Mesh(mergeGeometries(wallGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  if (roofGeos.length) {
    const m = new THREE.Mesh(mergeGeometries(roofGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  wallGeos.concat(roofGeos).forEach((g) => g.dispose());
  return group;
}
