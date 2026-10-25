import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TIRE_WALL_COLORS } from './bikedata.js';

// Prozedurales, detailliertes Fahrradmodell. Alle statischen Teile werden je Material zu EINEM Mesh
// zusammengefasst (wenige Draw-Calls, wichtig fürs Tablet). Nur Räder, Kurbel und Beine bewegen sich.
// Koordinaten: y oben, vorn = -z, Raddachse entlang x. Einheit Meter.

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);
const _dir = new THREE.Vector3();

// ---------- Sammler für statische Geometrie ----------
class Bucket {
  constructor(frameScale = 1) { this.lists = new Map(); this.fs = frameScale; }
  add(key, geo, matrix) {
    const g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!this.lists.has(key)) this.lists.set(key, []);
    this.lists.get(key).push(g);
  }
  // konisches Rohr von a nach b
  tube(key, a, b, r1, r2 = r1, seg = 10) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-5) return;
    _q.setFromUnitVectors(UP, _dir.divideScalar(len));
    _m.compose(v3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), _q, _one);
    const k = key === 'frame' ? this.fs : 1;
    this.add(key, new THREE.CylinderGeometry(r2 * k, r1 * k, len, seg, 1), _m);
  }
  // Ellipsoid mit Halbachsen (rx, ry, rz), um die x-Achse gedreht (für geneigten Oberkörper)
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
  curve(key, pts, r, seg = 24) {
    const c = new THREE.CatmullRomCurve3(pts);
    this.add(key, new THREE.TubeGeometry(c, seg, r, 8, false));
  }
  flush(materials, group) {
    for (const [key, list] of this.lists) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
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
  mtb: { wb: 1.22, bbY: 0.31, bbZ: 0.07, st: v3(0, 0.80, 0.27), hb: v3(0, 0.74, -0.52), ht: v3(0, 0.89, -0.55), saddleY: 0.99, saddleZ: 0.3, stem: v3(0, 0.06, -0.06), shoulderY: 0.46, shoulderZ: -0.06 },
  dh: { wb: 1.3, bbY: 0.32, bbZ: 0.08, st: v3(0, 0.78, 0.3), hb: v3(0, 0.76, -0.58), ht: v3(0, 0.93, -0.62), saddleY: 0.92, saddleZ: 0.36, stem: v3(0, 0.06, -0.06), shoulderY: 0.48, shoulderZ: -0.05 },
  road: { wb: 1.14, bbY: 0.27, bbZ: 0.04, st: v3(0, 0.79, 0.21), hb: v3(0, 0.66, -0.42), ht: v3(0, 0.79, -0.4), saddleY: 0.96, saddleZ: 0.2, stem: v3(0, 0.03, -0.1), shoulderY: 0.34, shoulderZ: -0.2 },
};

export function createBike(def, opts = {}) {
  const low = opts.lod === 'low';
  const F = FRAMES[def.look.frame] || FRAMES.mtb;
  const L = def.look;
  const col = def.colors;
  const r = L.wheelR;
  const group = new THREE.Group();

  // ----- Materialien -----
  const std = (color, rough = 0.5, metal = 0.1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const RD = def.rider;
  const kit = RD.kit;
  const jerseyTex = canvasTex(128, 128, (g, w, h) => {
    const base = hex(col.jersey), acc = hex(col.accent === col.jersey ? 0xffffff : col.accent);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = acc;
    if (kit === 'bands') { g.fillRect(0, h * 0.38, w, h * 0.1); g.fillRect(0, h * 0.58, w, h * 0.05); }
    else if (kit === 'stripe') { g.fillRect(w * 0.4, 0, w * 0.2, h); g.fillRect(w * 0.9, 0, w * 0.06, h); g.fillRect(w * 0.1, 0, w * 0.06, h); }
    else if (kit === 'halves') g.fillRect(0, 0, w * 0.5, h);
    else if (kit === 'fade') { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, base); gr.addColorStop(1, acc); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    else if (kit === 'checks') { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) g.fillRect((x * w) / 8, (y * h) / 8, w / 8, h / 8); }
    g.globalAlpha = 0.14; g.fillStyle = '#000';
    for (let i = 0; i < w; i += 6) g.fillRect(i, 0, 1, h); // Stoffstruktur
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
    rubber: std(0x111112, 0.95, 0),
    tire: std(TIRE_WALL_COLORS[L.tireWall] ?? 0x111112, 0.9, 0),
    metal: std(0xc9ccd2, 0.28, 0.9),
    gold: std(L.fork === 'rigid' ? 0xc9ccd2 : 0xd4a537, 0.25, 0.9),
    saddle: std(0x151515, 0.8, 0),
    skin: std(RD.skin, 0.62, 0),
    hair: std(RD.hair, 0.8, 0),
    jersey: std(0xffffff, 0.75, 0, { map: jerseyTex }),
    shorts: std(col.shorts, 0.8, 0),
    sock: std(0xf4f4f4, 0.9, 0),
    glove: std(0x1c1c20, 0.8, 0),
    helmet: std(col.helmet, 0.3, 0.1),
    shoe: std(col.shoes, 0.55, 0),
    sole: std(0x16161a, 0.9, 0),
    glass: std(0x0b0d12, 0.1, 0.8),
    rimMat: std(col.rim ?? (L.rim > 0.04 ? 0x15161a : 0x9ea2aa), 0.35, 0.7),
  };

  const B = new Bucket(L.tubes || 1);
  const R = v3(0, r, F.wb / 2);
  const Fw = v3(0, r, -F.wb / 2);
  const bb = v3(0, F.bbY, F.bbZ);
  const seg = low ? 6 : 10;

  // ----- Rahmen -----
  const tt0 = F.st.clone().add(v3(0, -0.015, -0.02));
  const ttR = L.frame === 'road' ? 0.017 : 0.022;
  B.tube('frame', tt0, F.ht.clone().add(v3(0, -0.015, 0)), ttR, ttR * 1.25, seg); // Oberrohr
  B.tube('frame', bb, F.hb, 0.034, 0.03, seg); // Unterrohr (dick)
  B.tube('frame', bb, F.st, 0.022, 0.02, seg); // Sitzrohr
  B.tube('frame', F.hb, F.ht, 0.034, 0.034, seg); // Steuerrohr
  for (const sx of [-1, 1]) {
    B.tube('frame', bb.clone().add(v3(sx * 0.02, 0, 0)), R.clone().add(v3(sx * 0.06, 0, 0)), 0.02, 0.014, seg); // Kettenstrebe
    B.tube('frame', F.st.clone().add(v3(sx * 0.02, -0.03, 0.01)), R.clone().add(v3(sx * 0.06, 0.01, 0)), 0.015, 0.012, seg); // Sitzstrebe
  }
  B.ball('frame', bb, 0.04); // Tretlager

  // Hinterbau-Dämpfer (Fully)
  if (!L.hardtail) {
    B.tube('dark', v3(0, F.st.y - 0.2, F.st.z - 0.02), v3(0, F.bbY + 0.1, F.bbZ + 0.25), 0.026, 0.026, seg);
    B.tube('metal', v3(0, F.st.y - 0.17, F.st.z - 0.02), v3(0, F.st.y - 0.3, F.st.z + 0.0), 0.014, 0.014, seg);
    B.tube('accent', v3(0, F.bbY + 0.1, F.bbZ + 0.25), v3(0, F.bbY + 0.02, F.bbZ + 0.1), 0.02, 0.02, seg);
  }

  // ----- Gabel -----
  const crown = F.hb.clone().add(v3(0, -0.05, -0.012));
  B.tube('dark', F.hb, crown, 0.03, 0.03, seg);
  const dropout = Fw.clone();
  if (L.fork === 'rigid') {
    for (const sx of [-1, 1]) B.tube('frame', crown.clone().add(v3(sx * 0.05, 0, 0)), dropout.clone().add(v3(sx * 0.055, 0, 0)), 0.02, 0.012, seg);
  } else {
    const wide = L.fork === 'full' ? 0.07 : 0.06;
    const up = L.fork === 'full' ? 0.026 : 0.021;
    for (const sx of [-1, 1]) {
      const top = crown.clone().add(v3(sx * wide, 0.12, -0.03));
      const mid = crown.clone().lerp(dropout, 0.5).add(v3(sx * wide, 0, 0));
      B.tube('gold', top, mid, up, up, seg); // Standrohre
      B.tube('dark', mid, dropout.clone().add(v3(sx * 0.06, 0, 0)), up * 1.35, up * 1.05, seg); // Tauchrohre
    }
    B.box('dark', crown.clone().add(v3(0, 0.02, -0.01)), wide * 2 + 0.05, 0.045, 0.06);
    if (L.fork === 'full') B.box('dark', crown.clone().add(v3(0, 0.14, -0.03)), wide * 2 + 0.04, 0.035, 0.05);
  }

  // ----- Cockpit -----
  const stemTop = F.ht.clone().add(F.stem);
  B.tube('dark', F.ht.clone().add(v3(0, 0.02, 0)), stemTop, 0.02, 0.02, seg);
  let hand; // Position der Hände (rechts, x>0)
  if (L.bars === 'drop') {
    for (const sx of [-1, 1]) {
      const p = (x, y, z) => stemTop.clone().add(v3(sx * x, y, z));
      B.curve('dark', [p(0.03, 0, 0), p(0.12, 0, 0.0), p(0.205, 0, -0.01), p(0.215, 0, -0.1), p(0.215, -0.09, -0.17), p(0.215, -0.17, -0.13), p(0.215, -0.2, -0.04)], 0.012, 28);
      B.box('dark', p(0.215, 0.015, -0.085), 0.035, 0.05, 0.12);
    }
    hand = stemTop.clone().add(v3(0.215, 0.03, -0.09));
  } else {
    const riser = L.bars === 'riser';
    const half = riser ? 0.39 : 0.36;
    for (const sx of [-1, 1]) {
      const centre = stemTop.clone();
      const mid = centre.clone().add(v3(sx * 0.13, riser ? 0.05 : 0, riser ? 0.02 : 0));
      const end = centre.clone().add(v3(sx * half, riser ? 0.065 : 0, riser ? 0.06 : 0.04));
      B.tube('dark', centre, mid, 0.012, 0.012, seg);
      B.tube('dark', mid, end, 0.012, 0.012, seg);
      B.tube('rubber', centre.clone().add(v3(sx * (half - 0.1), riser ? 0.063 : 0, riser ? 0.058 : 0.04)), end, 0.019, 0.019, seg); // Griff
      B.tube('metal', centre.clone().add(v3(sx * (half - 0.14), riser ? 0.06 : 0.0, riser ? 0.04 : 0.03)), centre.clone().add(v3(sx * (half - 0.2), riser ? 0.045 : 0, riser ? -0.02 : -0.02)), 0.005, 0.005, 6); // Bremshebel
    }
    hand = end0(stemTop, half, riser);
  }
  function end0(c, half, riser) { return c.clone().add(v3(half - 0.04, riser ? 0.07 : 0.015, riser ? 0.06 : 0.04)); }
  B.ball('dark', stemTop, 0.03, 1.3, 0.8, 1);

  // ----- Sattel -----
  const saddle = v3(0, F.saddleY, F.saddleZ);
  B.tube('metal', F.st, saddle.clone().add(v3(0, -0.02, 0)), 0.014, 0.014, seg);
  B.box('saddle', saddle.clone().add(v3(0, 0.03, -0.06)), 0.07, 0.04, 0.16);
  B.ball('saddle', saddle.clone().add(v3(0, 0.032, 0.07)), 0.075, 1.0, 0.45, 1.25);

  // ----- Antrieb (statische Teile) -----
  const chainX = 0.055;
  if (!low) {
    const ringTop = v3(chainX, bb.y + 0.095, bb.z);
    const ringBot = v3(chainX, bb.y - 0.095, bb.z);
    const cogTop = v3(chainX, R.y + 0.045, R.z);
    const cogBot = v3(chainX, R.y - 0.045, R.z);
    B.tube('dark', ringTop, cogTop, 0.006, 0.006, 5);
    B.tube('dark', ringBot, cogBot.clone().add(v3(0, -0.05, 0.03)), 0.006, 0.006, 5);
    B.box('dark', cogBot.clone().add(v3(0.01, -0.06, 0.04)), 0.03, 0.09, 0.05); // Schaltwerk
    if (L.disc !== false) { // Scheibenbremse-Sättel
      B.box('dark', Fw.clone().add(v3(-0.07, 0.07, -0.02)), 0.02, 0.045, 0.045);
      B.box('dark', R.clone().add(v3(-0.07, 0.07, -0.02)), 0.02, 0.045, 0.045);
    } else { // Felgenbremsen
      B.box('dark', F.hb.clone().add(v3(0, -0.12, -0.02)), 0.11, 0.025, 0.03);
      B.box('dark', F.st.clone().add(v3(0, -0.1, 0.03)), 0.11, 0.025, 0.03);
    }
  }

  // Trinkflasche (Rennrad/Gravel)
  if (L.frame === 'road' && !low) {
    const mid = bb.clone().lerp(F.hb, 0.5);
    B.tube('accent', mid.clone().add(v3(0, 0.02, 0.0)), mid.clone().add(v3(0, 0.15, -0.03)), 0.036, 0.034, seg);
  }

  // ----- Fahrer (statisch) -----
  const hip = v3(0, F.saddleY + 0.07, F.saddleZ - 0.08);
  const shoulder = v3(0, F.saddleY + F.shoulderY, F.shoulderZ);
  const tdir = shoulder.clone().sub(hip).normalize();
  const lean = Math.atan2(-tdir.z, tdir.y); // Vorneigung des Oberkörpers
  const along = (t, dx = 0, dy = 0, dz = 0) => hip.clone().lerp(shoulder, t).add(v3(dx, dy, dz));
  // Oberkörper aus überlappenden Ellipsoiden (schlanke Taille, breite Schultern)
  const E = (key, t, rx, ry, rz, dz = 0) => B.ell(key, along(t, 0, 0, dz), rx, ry, rz, -lean, low ? 8 : 12);
  E('shorts', 0.0, 0.158, 0.125, 0.13);
  E('jersey', 0.2, 0.14, 0.12, 0.108);
  E('jersey', 0.45, 0.16, 0.14, 0.12);
  E('jersey', 0.72, 0.178, 0.13, 0.125);
  E('jersey', 1.0, 0.2, 0.085, 0.115);
  const roadKit = L.frame === 'road';
  if (!low && roadKit) { // Trikottaschen hinten
    for (const x of [-0.08, 0, 0.08]) B.ell('dark', along(0.2, x, 0.01, 0.1), 0.045, 0.045, 0.012, -lean, 8);
  }
  const head = shoulder.clone().add(v3(0, 0.18, -0.075));
  B.tube('skin', shoulder.clone().add(v3(0, 0.04, 0)), head.clone().add(v3(0, -0.07, 0.025)), 0.052, 0.046, 8); // Hals
  // Kopf: Schädel, Kinn, Nase, Ohren (+ Augen)
  B.ell('skin', head, 0.092, 0.105, 0.1, 0, low ? 8 : 12);
  B.ell('skin', head.clone().add(v3(0, -0.075, -0.045)), 0.062, 0.05, 0.058, 0, 8);
  if (!low) {
    B.ell('skin', head.clone().add(v3(0, -0.015, -0.098)), 0.02, 0.028, 0.03, 0, 8);
    for (const sx of [-1, 1]) {
      B.ell('skin', head.clone().add(v3(sx * 0.094, -0.01, 0.01)), 0.014, 0.03, 0.022, 0, 6);
      B.ell('dark', head.clone().add(v3(sx * 0.036, 0.018, -0.088)), 0.013, 0.01, 0.01, 0, 6);
    }
  }
  // Haare (unter dem Helm sichtbar)
  const hs = RD.hairStyle;
  if (hs !== 'none') {
    B.ell('hair', head.clone().add(v3(0, -0.01, 0.045)), 0.098, 0.088, 0.085, 0, 8);
    if (hs === 'pony') { B.tube('hair', head.clone().add(v3(0, -0.04, 0.115)), head.clone().add(v3(0, -0.13, 0.24)), 0.032, 0.02, 6); B.ell('hair', head.clone().add(v3(0, -0.15, 0.255)), 0.026, 0.05, 0.026, 0.2, 6); }
    else if (hs === 'long') { B.ell('hair', head.clone().add(v3(0, -0.1, 0.09)), 0.105, 0.15, 0.075, 0, 8); B.tube('hair', head.clone().add(v3(0, -0.12, 0.12)), head.clone().add(v3(0, -0.2, 0.3)), 0.07, 0.04, 8); }
    else if (hs === 'curly' && !low) { for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.28; B.ell('hair', head.clone().add(v3(Math.cos(a) * 0.1, -0.02 - (i % 3) * 0.03, 0.06 + Math.abs(Math.sin(a)) * 0.05)), 0.045, 0.045, 0.045, 0, 6); } }
  }
  // Helm
  const helm = head.clone().add(v3(0, 0.03, 0.02));
  const ht = RD.helmetType;
  if (ht === 'road') {
    B.ell('helmet', helm.clone().add(v3(0, 0.012, 0.025)), 0.112, 0.092, 0.152, 0, low ? 8 : 14);
    B.ell('helmet', helm.clone().add(v3(0, -0.012, 0.15)), 0.06, 0.05, 0.085, 0, 8);
    if (!low) for (const x of [-0.06, -0.03, 0, 0.03, 0.06]) B.box('dark', helm.clone().add(v3(x, 0.098 - Math.abs(x) * 0.7, 0.0)), 0.016, 0.01, 0.15);
  } else if (ht === 'mtb') {
    B.ell('helmet', helm.clone().add(v3(0, 0.02, 0.03)), 0.122, 0.1, 0.152, 0, low ? 8 : 14);
    B.ell('helmet', helm.clone().add(v3(0, -0.035, 0.1)), 0.105, 0.06, 0.07, 0, 8);
    B.box('helmet', helm.clone().add(v3(0, 0.0, -0.13)), 0.19, 0.01, 0.08, -0.16); // Schirm
    if (!low) for (const x of [-0.05, 0, 0.05]) B.box('dark', helm.clone().add(v3(x, 0.105 - Math.abs(x) * 0.6, 0.0)), 0.02, 0.01, 0.13);
  } else { // Fullface
    B.ell('helmet', helm.clone().add(v3(0, 0.0, 0.03)), 0.135, 0.125, 0.16, 0, low ? 8 : 14);
    B.ell('helmet', head.clone().add(v3(0, -0.075, -0.1)), 0.088, 0.062, 0.065, 0, 8); // Kinnbügel
    B.box('helmet', helm.clone().add(v3(0, 0.07, -0.15)), 0.22, 0.012, 0.13, -0.25); // Schirm
    B.ell('glass', head.clone().add(v3(0, 0.012, -0.09)), 0.115, 0.04, 0.03, 0, 8); // Goggle
    B.box('dark', head.clone().add(v3(0, 0.012, 0.0)), 0.265, 0.04, 0.012); // Goggle-Band
  }
  if (!low) { // Kinnriemen
    for (const sx of [-1, 1]) B.tube('dark', helm.clone().add(v3(sx * 0.1, -0.02, 0.0)), head.clone().add(v3(sx * 0.03, -0.1, -0.06)), 0.005, 0.005, 4);
    if (RD.glasses && ht !== 'full') { // Sportbrille
      B.ell('glass', head.clone().add(v3(0, 0.016, -0.092)), 0.1, 0.027, 0.026, 0, 8);
      for (const sx of [-1, 1]) B.tube('dark', head.clone().add(v3(sx * 0.098, 0.018, -0.07)), head.clone().add(v3(sx * 0.096, 0.012, -0.0)), 0.006, 0.006, 4);
    }
  }
  // Startnummer auf dem Rücken
  const numPlanes = [];
  if (numTex) {
    const back = along(0.5, 0, 0, 0.128 + 0.012);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.112), new THREE.MeshStandardMaterial({ map: numTex, transparent: true, roughness: 0.8 }));
    m.position.copy(back);
    m.rotation.x = -lean;
    group.add(m);
  }

  // Arme: kurze Ärmel (Rennrad) oder lange Ärmel (MTB), Handschuhe am Lenker
  const longSleeve = !roadKit;
  for (const sx of [-1, 1]) {
    const sh = along(1.0, sx * 0.205, -0.04, 0.0);
    const hd = v3(sx * hand.x, hand.y, hand.z);
    const el = sh.clone().lerp(hd, 0.5).add(v3(sx * 0.075, -0.06, 0.03));
    const wrist = hd.clone().add(v3(0, 0.0, 0.05));
    B.ell('jersey', sh, 0.07, 0.07, 0.07, 0, 10);
    if (longSleeve) {
      B.tube('jersey', sh, el, 0.058, 0.047, 8);
      B.ball('jersey', el, 0.048);
      B.tube('jersey', el, wrist, 0.047, 0.036, 8);
    } else {
      const cut = sh.clone().lerp(el, 0.5);
      B.tube('jersey', sh, cut, 0.058, 0.052, 8);
      B.tube('skin', cut, el, 0.049, 0.045, 8);
      B.ball('skin', el, 0.045);
      B.tube('skin', el, wrist, 0.045, 0.034, 8);
    }
    B.tube('glove', wrist, hd, 0.036, 0.034, 6);
    B.ell('glove', hd, 0.044, 0.04, 0.056, 0, 8); // Hand
    B.ell('glove', hd.clone().add(v3(0, -0.026, -0.036)), 0.036, 0.022, 0.03, 0, 6); // Finger um den Griff
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
    decal(text, bb.clone().lerp(F.hb, 0.12), bb.clone().lerp(F.hb, 0.95), 0.032, 0.062, def.brandDef.font);
    decal(def.cat === 'road' ? 'RACE' : def.cat.toUpperCase(), tt0, F.ht, 0.02, 0.026, '700');
  }

  B.flush(mats, group);

  // ----- Räder -----
  function makeWheel(isRear) {
    const wg = new THREE.Group();
    const WB = new Bucket();
    const tire = L.tire;
    const rimR = r - tire * 2 - 0.004;
    // Reifen (+ Stollen)
    WB.add('rubber', new THREE.TorusGeometry(r - tire, tire, low ? 6 : 10, low ? 20 : 36).rotateY(Math.PI / 2));
    if (L.tireWall !== 'black') { // farbige Reifenflanke
      for (const sx of [-1, 1]) WB.add('tire', new THREE.RingGeometry(rimR + 0.006, r - tire * 0.15, low ? 20 : 40).rotateY(sx * Math.PI / 2), new THREE.Matrix4().makeTranslation(sx * (tire * 0.92), 0, 0));
    }
    if (!low && L.tread === 'knobs') {
      const n = 44;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        _q.setFromAxisAngle(v3(1, 0, 0), a);
        _m.compose(v3(0, Math.cos(a) * (r - tire * 0.1 + 0.004), Math.sin(a) * (r - tire * 0.1 + 0.004)), _q, _one);
        WB.add('rubber', new THREE.BoxGeometry(tire * 1.5, 0.014, 0.022), _m);
        _m.compose(v3(0, Math.cos(a + 0.07) * (r - tire * 0.1 + 0.004), Math.sin(a + 0.07) * (r - tire * 0.1 + 0.004)), _q.setFromAxisAngle(v3(1, 0, 0), a + 0.07), _one);
        WB.add('rubber', new THREE.BoxGeometry(tire * 0.9, 0.012, 0.02), _m);
      }
    }
    // Felge
    WB.add('rimMat', new THREE.TorusGeometry(rimR, L.rim, 8, low ? 20 : 36).rotateY(Math.PI / 2));
    // Speichen + Nabe
    const spokes = low ? 6 : 18;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const off = (i % 2 ? 1 : -1) * 0.025;
      WB.tube('metal', v3(off, 0, 0), v3(0, Math.cos(a) * rimR, Math.sin(a) * rimR), 0.0035, 0.0035, 4);
    }
    WB.add('metal', new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10).rotateZ(Math.PI / 2));
    if (!low) {
      // Bremsscheibe
      if (L.disc !== false) WB.add('metal', new THREE.CylinderGeometry(0.09, 0.09, 0.004, 20).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(-0.05, 0, 0));
      if (isRear) { // Kassette
        for (let i = 0; i < 5; i++) {
          const rad = 0.052 - i * 0.007;
          WB.add('metal', new THREE.CylinderGeometry(rad, rad, 0.008, 14).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(0.03 + i * 0.007, 0, 0));
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
  const crankG = new THREE.Group();
  crankG.position.copy(bb);
  const pedals = [];
  {
    const CB = new Bucket();
    CB.add('metal', new THREE.CylinderGeometry(0.09, 0.09, 0.006, 24).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(0.05, 0, 0));
    CB.tube('dark', v3(0.075, 0, 0), v3(0.075, 0.17, 0), 0.013, 0.01, 6);
    CB.tube('dark', v3(-0.075, 0, 0), v3(-0.075, -0.17, 0), 0.013, 0.01, 6);
    CB.flush(mats, crankG);
    for (const sx of [1, -1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.1), mats.dark);
      p.position.set(sx * 0.12, sx * 0.17, 0);
      crankG.add(p);
      pedals.push(p);
    }
  }
  group.add(crankG);

  // ----- Beine (animiert) -----
  // Oberschenkel: Shorts-Teil + Haut-Teil (Rennrad: eng bis zur Mitte, MTB: weit bis übers Knie), Wade mit Wölbung, Socke, Schuh
  const limb = (r1, r2, mat, seg = 10) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, 1, seg), mat); m.castShadow = true; return m; };
  const baggy = !roadKit;
  const cut = baggy ? 0.8 : 0.58; // Anteil des Oberschenkels, der von der Hose bedeckt ist
  const padded = def.cat === 'downhill';
  const legs = [-1, 1].map((sx) => {
    const sk = (r, d = 8) => new THREE.Mesh(new THREE.SphereGeometry(r, d, Math.max(6, d - 2)), mats.skin);
    const l = {
      sx,
      thighA: limb(baggy ? 0.105 : 0.092, baggy ? 0.102 : 0.076, mats.shorts, low ? 7 : 12),
      thighB: limb(baggy ? 0.066 : 0.07, 0.056, mats.skin, low ? 7 : 10),
      shin: limb(0.056, 0.036, mats.skin, low ? 7 : 10),
      sock: limb(0.04, 0.043, mats.sock, 8),
      knee: sk(0.062),
      calf: new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6).scale(0.95, 1.7, 1.05), mats.skin),
      pad: padded ? new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6).scale(1, 1.1, 0.8), mats.dark) : null,
      shoe: new THREE.Group(),
    };
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.022, 0.27), mats.sole);
    sole.position.y = -0.03;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.05, 0.2), mats.shoe);
    body.position.set(0, 0.0, 0.025);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6).scale(0.95, 0.6, 1.2), mats.shoe);
    toe.position.set(0, -0.003, -0.085);
    const ankle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.09), mats.shoe);
    ankle.position.set(0, 0.04, 0.07);
    l.shoe.add(sole, body, toe, ankle);
    [sole, body, toe, ankle].forEach((m) => { m.castShadow = true; });
    group.add(l.thighA, l.thighB, l.shin, l.sock, l.knee, l.shoe);
    if (!low) group.add(l.calf);
    if (l.pad) group.add(l.pad);
    return l;
  });

  const LEG = 0.5;
  const H = new THREE.Vector3(), Fo = new THREE.Vector3(), K = new THREE.Vector3(), P = new THREE.Vector3(), A = new THREE.Vector3();
  function place(m, a, b) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, _dir.divideScalar(len || 1));
    m.scale.set(1, len, 1);
  }
  function pose(crank) {
    crankG.rotation.x = -crank;
    pedals[0].rotation.x = crank;
    pedals[1].rotation.x = crank;
    legs.forEach((l, i) => {
      const a = crank + i * Math.PI;
      Fo.set(l.sx * 0.12, bb.y + Math.cos(a) * 0.17 + 0.04, bb.z - Math.sin(a) * 0.17);
      H.set(l.sx * 0.1, hip.y, hip.z);
      const dy = Fo.y - H.y, dz = Fo.z - H.z;
      const dist = Math.hypot(dy, dz) || 1;
      const D = Math.min(dist, LEG * 2 - 0.002);
      const half = D / 2;
      const hgt = Math.sqrt(Math.max(0, LEG * LEG - half * half));
      const ny = dy / dist, nz = dz / dist;
      K.set(H.x + l.sx * 0.02, H.y + ny * half - nz * hgt, H.z + nz * half + ny * hgt); // Knie zeigt nach vorn
      P.lerpVectors(H, K, cut);
      place(l.thighA, H, P);
      place(l.thighB, P, K);
      A.lerpVectors(K, Fo, 0.8);
      place(l.shin, K, A);
      place(l.sock, A, Fo);
      l.knee.position.copy(K);
      if (l.pad) l.pad.position.set(K.x, K.y, K.z - 0.035);
      // Wade: hinter dem Schienbein, im oberen Drittel
      A.lerpVectors(K, Fo, 0.3);
      l.calf.position.set(A.x, A.y, A.z + 0.022);
      _dir.subVectors(Fo, K).normalize();
      l.calf.quaternion.setFromUnitVectors(UP, _dir);
      l.shoe.position.set(Fo.x, Fo.y - 0.015, Fo.z - 0.03);
      l.shoe.rotation.x = Math.sin(a) * 0.12; // Fuß kippt leicht mit
    });
  }
  pose(0);

  // Startnummer am Lenker (von hinten lesbar)
  if (numTex) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.11), new THREE.MeshStandardMaterial({ map: numTex, transparent: true, roughness: 0.7 }));
    pl.position.copy(stemTop).add(v3(0, 0.065, -0.05));
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
