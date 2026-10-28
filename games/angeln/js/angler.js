import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS, rodById } from './data.js';

// Angler: echtes 3D-Menschenmodell (Ready Player Me, Skelett wie Mixamo) mit umfärbbarer Kleidung,
// Jacken/Westen als aufgeblasene Hüllen über dem Oberkörper, Hut/Stiefel/Schwimmweste als Foto-Modelle (Poly Haven, CC0).
// Die Arme greifen per Zwei-Knochen-IK an Rutengriff und Kurbel; die Rute selbst wird frei gestellt (Wurf, Drill).
// Blickrichtung des Anglers: +z. userData: rod, tip, rig (Pose-Zustand), update(dt) pro Frame.

const ASSET = new URL('../assets/models/', import.meta.url).href;
const loader = new GLTFLoader();
const cache = {};
let ready = null;

function load(name) {
  const once = () => new Promise((res, rej) => loader.load(ASSET + name + '.glb', (g) => res(g), undefined, rej));
  return once().catch(once).catch(() => { throw new Error('Modell konnte nicht geladen werden: ' + name); });
}

// Einmal beim Start laden; danach ist createAngler synchron.
export function preloadAngler() {
  if (!ready) {
    ready = Promise.all(['angler', 'fishermans_hat', 'rubber_boots', 'life_jacket'].map((n) => load(n).then((g) => { cache[n] = g; })))
      .then(() => prepareBase());
  }
  return ready;
}

// ---- Texturen entsättigen, damit Farben frei wählbar sind ----
function grayTexture(tex, mean = 0.62, killBright = false) {
  const img = tex.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const avg = sum / (px.length / 4);
  const k = (mean * 255) / avg;
  for (let i = 0; i < px.length; i += 4) {
    let l0 = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (killBright && l0 > avg * 1.8) l0 = avg; // Aufdruck (Logo) wegretuschieren
    const l = Math.min(255, l0 * k);
    px[i] = px[i + 1] = px[i + 2] = l;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = tex.flipY;
  t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  return t;
}

// Stoff-Normalmap (feines Gewebe) und Strick-Normalmap, prozedural
function fabricNormal(kind) {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const d = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let nx = 0;
      let ny = 0;
      if (kind === 'knit') {
        nx = Math.sin((x / N) * Math.PI * 64 + Math.sin((y / N) * Math.PI * 128) * 1.5) * 0.5;
        ny = Math.sin((y / N) * Math.PI * 128) * 0.35;
      } else {
        nx = Math.sin((x / N) * Math.PI * 128) * 0.18 + (Math.random() - 0.5) * 0.1;
        ny = Math.sin((y / N) * Math.PI * 128) * 0.18 + (Math.random() - 0.5) * 0.1;
      }
      const i = (y * N + x) * 4;
      d.data[i] = 128 + nx * 127; d.data[i + 1] = 128 + ny * 127; d.data[i + 2] = 255; d.data[i + 3] = 255;
    }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

const base = {};
function prepareBase() {
  const g = cache.angler.scene;
  const mesh = (n) => g.getObjectByName(n);
  base.top = mesh('Wolf3D_Outfit_Top');
  base.bottom = mesh('Wolf3D_Outfit_Bottom');
  base.body = mesh('Wolf3D_Body');
  base.grayBottom = grayTexture(base.bottom.material.map, 0.5);
  base.grayTop = grayTexture(base.top.material.map, 0.62, true);
  base.grayHair = grayTexture(mesh('Wolf3D_Hair').material.map, 0.5);
  base.graySkin = grayTexture(mesh('Wolf3D_Head').material.map, 0.6);
  base.grayBodySkin = grayTexture(base.body.material.map, 0.6);
  base.hatGray = grayTexture(cache.fishermans_hat.scene.getObjectByProperty('isMesh', true).material.map, 0.7);
  base.fabric = fabricNormal('fabric');
  base.knit = fabricNormal('knit');
  // Hüllen: Jacke = T-Shirt-Hülle + Ärmel aus den Armen des Körpers, Weste = T-Shirt-Hülle ohne Ärmel, Wathose = Hosen-Hülle
  const armOnly = (names) => names.every((n) => /Arm/.test(n) && !/Hand/.test(n));
  base.jacketGeo = shellGeometry(base.top, 0.014, null, 8);
  base.sleeveGeo = shellGeometry(base.body, 0.013, armOnly, 6);
  base.shirtSleeveGeo = shellGeometry(base.body, 0.008, armOnly, 4);
  base.vestGeo = shellGeometry(base.top, 0.026, (names) => !names.some((n) => /Arm/.test(n)), 10);
  base.waderGeo = shellGeometry(base.bottom, 0.014, null, 6);
}

// Kopiert eine Skinned-Geometrie, glättet sie (Knöpfe, Revers, Blume verschwinden) und schiebt sie entlang der Normalen nach außen.
// keep(boneNames, y) entscheidet pro Dreieck, ob es bleibt (Weste ohne Ärmel, keine Frackschöße).
function shellGeometry(src, amount, keep, smooth = 10) {
  const geo = src.geometry.clone();
  const pos = geo.attributes.position;
  const n = pos.count;
  // gleiche Positionen (UV-Nähte) zusammenfassen
  const id = new Int32Array(n);
  const map = new Map();
  const P = [];
  for (let i = 0; i < n; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let u = map.get(k);
    if (u === undefined) { u = P.length; map.set(k, u); P.push([pos.getX(i), pos.getY(i), pos.getZ(i)]); }
    id[i] = u;
  }
  const idx = geo.index.array;
  const nb = P.map(() => new Set());
  for (let t = 0; t < idx.length; t += 3) {
    const a = id[idx[t]]; const b = id[idx[t + 1]]; const c = id[idx[t + 2]];
    nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
  }
  // Taubin-Glättung (abwechselnd glätten und wieder aufblähen), damit die Hülle nicht schrumpft
  let cur = P;
  for (let it = 0; it < smooth * 2; it++) {
    const f = it % 2 ? -0.53 : 0.5;
    cur = cur.map((p, u) => {
      if (!nb[u].size) return p;
      let x = 0; let y = 0; let z = 0;
      for (const v of nb[u]) { x += cur[v][0]; y += cur[v][1]; z += cur[v][2]; }
      const k = 1 / nb[u].size;
      return [p[0] + (x * k - p[0]) * f, p[1] + (y * k - p[1]) * f, p[2] + (z * k - p[2]) * f];
    });
  }
  // Normalen der geglätteten Fläche
  const N = cur.map(() => [0, 0, 0]);
  for (let t = 0; t < idx.length; t += 3) {
    const a = cur[id[idx[t]]]; const b = cur[id[idx[t + 1]]]; const c = cur[id[idx[t + 2]]];
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    for (const v of [id[idx[t]], id[idx[t + 1]], id[idx[t + 2]]]) { N[v][0] += nx; N[v][1] += ny; N[v][2] += nz; }
  }
  for (let i = 0; i < n; i++) {
    const p = cur[id[i]];
    const q = N[id[i]];
    const l = Math.hypot(q[0], q[1], q[2]) || 1;
    pos.setXYZ(i, p[0] + (q[0] / l) * amount, p[1] + (q[1] / l) * amount, p[2] + (q[2] / l) * amount);
  }
  if (keep) {
    const bones = src.skeleton.bones.map((b) => b.name);
    const si = geo.attributes.skinIndex;
    const sw = geo.attributes.skinWeight;
    const comp = (attr, v, k) => [attr.getX, attr.getY, attr.getZ, attr.getW][k].call(attr, v);
    const main = (v) => {
      let best = 0;
      let w = -1;
      for (let k = 0; k < 4; k++) { const ww = comp(sw, v, k); if (ww > w) { w = ww; best = comp(si, v, k); } }
      return bones[best];
    };
    const out = [];
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]];
      if (keep(tri.map(main), Math.min(...tri.map((v) => P[id[v]][1])))) out.push(...tri);
    }
    geo.setIndex(out);
  }
  geo.computeVertexNormals();
  return geo;
}

function skinnedShell(src, geo, material) {
  const m = new THREE.SkinnedMesh(geo, material);
  m.bind(src.skeleton, src.bindMatrix);
  m.castShadow = true;
  m.frustumCulled = false;
  src.parent.add(m);
  return m;
}

// ---------- Rute & Rolle ----------
const ROD_SPECS = {
  pose: { len: 4.0, butt: 0.013, tip: 0.0018, blank: 0x1d2a22, grip: 'cork', guides: 9, reel: 'spin', reelSize: 0.8 },
  ul: { len: 2.1, butt: 0.0095, tip: 0.0012, blank: 0xb08a2a, grip: 'cork', guides: 7, reel: 'spin', reelSize: 0.7 },
  feeder: { len: 3.6, butt: 0.012, tip: 0.002, blank: 0x1a2a4a, grip: 'eva', guides: 10, reel: 'spin', reelSize: 0.95, tipColor: 0xff3a1a },
  hecht: { len: 2.7, butt: 0.013, tip: 0.0024, blank: 0x14171c, grip: 'eva', guides: 8, reel: 'spin', reelSize: 1.0 },
  fliege: { len: 2.9, butt: 0.0095, tip: 0.0012, blank: 0x5a2a1a, grip: 'cork', guides: 9, reel: 'fly', reelSize: 0.9 },
  brandung: { len: 4.2, butt: 0.016, tip: 0.0025, blank: 0xe8e8e2, grip: 'shrink', guides: 7, reel: 'spin', reelSize: 1.3 },
  karpfen: { len: 3.6, butt: 0.015, tip: 0.0028, blank: 0x2a3326, grip: 'shrink', guides: 6, reel: 'spin', reelSize: 1.25 },
  waller: { len: 2.6, butt: 0.02, tip: 0.0045, blank: 0x3a1414, grip: 'eva', guides: 6, reel: 'spin', reelSize: 1.45 },
  meerspinn: { len: 2.4, butt: 0.016, tip: 0.0035, blank: 0x1a6a7a, grip: 'eva', guides: 7, reel: 'spin', reelSize: 1.3 },
  hochsee: { len: 1.9, butt: 0.024, tip: 0.006, blank: 0x18244a, grip: 'shrink', guides: 6, reel: 'spin', reelSize: 1.7 },
};

const mat = (color, rough, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const MAT = {
  chrome: () => mat(0xd8dce2, 0.18, 1),
  darkMetal: () => mat(0x2a2d33, 0.3, 0.9),
  gold: () => mat(0xc9a24a, 0.25, 1),
};

function corkTexture() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#b8915e'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 2500; i++) {
    const l = Math.random();
    g.fillStyle = l < 0.5 ? `rgba(90,60,30,${0.15 + Math.random() * 0.3})` : `rgba(230,200,150,${0.1 + Math.random() * 0.2})`;
    g.beginPath(); g.ellipse(Math.random() * N, Math.random() * N, 0.5 + Math.random() * 2.5, 0.5 + Math.random() * 1.5, Math.random() * 3, 0, 7); g.fill();
  }
  for (let y = 0; y < N; y += 32) { g.fillStyle = 'rgba(60,40,20,0.35)'; g.fillRect(0, y, N, 1); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
let corkTex = null;

function spinningReel(scale, color = 0x23262c) {
  const g = new THREE.Group();
  const body = mat(color, 0.35, 0.6);
  const accent = mat(0xb0b6c0, 0.2, 1);
  const s = scale;
  // Fuß (am Rollenhalter), Stiel, Getriebegehäuse
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.012 * s, 0.006 * s, 0.07 * s), body);
  g.add(foot);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.01 * s, 0.05 * s, 0.018 * s), body);
  stem.position.y = -0.028 * s; g.add(stem);
  const housing = new THREE.Mesh(new THREE.SphereGeometry(0.03 * s, 20, 14), body);
  housing.scale.set(0.75, 1, 1.05);
  housing.position.set(0, -0.07 * s, -0.008 * s); g.add(housing);
  // Rotor + Spule, Achse entlang +z (Richtung Rutenspitze)
  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.026 * s, 0.03 * s, 0.03 * s, 24), body);
  rotor.rotation.x = Math.PI / 2; rotor.position.set(0, -0.07 * s, 0.035 * s); g.add(rotor);
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.024 * s, 0.024 * s, 0.026 * s, 28), accent);
  spool.rotation.x = Math.PI / 2; spool.position.set(0, -0.07 * s, 0.062 * s); g.add(spool);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.021 * s, 0.021 * s, 0.02 * s, 28), mat(0xe8e2b0, 0.5));
  line.rotation.x = Math.PI / 2; line.position.set(0, -0.07 * s, 0.062 * s); g.add(line);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.025 * s, 0.0025 * s, 8, 28), accent);
  lip.position.set(0, -0.07 * s, 0.076 * s); g.add(lip);
  // Schnurfangbügel
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.03 * s, 0.0016 * s, 6, 28, Math.PI), MAT.chrome());
  bail.rotation.set(0, Math.PI / 2, 0); bail.position.set(0, -0.07 * s, 0.045 * s); g.add(bail);
  // Kurbel links (Angler kurbelt mit links): Welle entlang x
  const crank = new THREE.Group();
  crank.position.set(0.028 * s, -0.07 * s, -0.008 * s);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.003 * s, 0.003 * s, 0.02 * s, 8), body);
  shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.01 * s; crank.add(shaft);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004 * s, 0.055 * s, 0.008 * s), body);
  arm.position.set(0.02 * s, -0.025 * s, 0); crank.add(arm);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * s, 0.009 * s, 0.022 * s, 14), mat(0x15171a, 0.6));
  knob.rotation.z = Math.PI / 2; knob.position.set(0.032 * s, -0.05 * s, 0); crank.add(knob);
  const knobPoint = new THREE.Object3D();
  knobPoint.position.set(0.034 * s, -0.05 * s, 0); crank.add(knobPoint);
  g.add(crank);
  const spoolPoint = new THREE.Object3D();
  spoolPoint.position.set(0, -0.07 * s, 0.07 * s); g.add(spoolPoint);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, crank, knobPoint, spoolPoint };
}

function flyReel(scale) {
  const g = new THREE.Group();
  const s = scale;
  const body = mat(0x6a6e74, 0.25, 1);
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.045 * s, 0.028 * s, 32), body);
  frame.rotation.z = Math.PI / 2; frame.position.y = -0.052 * s; g.add(frame);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.038 * s, 0.038 * s, 0.022 * s, 32), mat(0xd8c048, 0.6));
  line.rotation.z = Math.PI / 2; line.position.y = -0.052 * s; g.add(line);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.01 * s, 0.01 * s, 0.06 * s), body);
  g.add(foot);
  const crank = new THREE.Group();
  crank.position.set(0.016 * s, -0.052 * s, 0);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.005 * s, 0.005 * s, 0.018 * s, 10), mat(0x2a1a10, 0.5));
  knob.rotation.z = Math.PI / 2; knob.position.set(0.01 * s, -0.03 * s, 0); crank.add(knob);
  const knobPoint = new THREE.Object3D(); knobPoint.position.set(0.012 * s, -0.03 * s, 0); crank.add(knobPoint);
  g.add(crank);
  const spoolPoint = new THREE.Object3D(); spoolPoint.position.set(0, -0.02 * s, 0.02 * s); g.add(spoolPoint);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, crank, knobPoint, spoolPoint };
}

// Rute entlang +y (Griffende bei y=0). joints: biegbare Abschnitte; guides: Ringe (für die Schnurführung).
export function createRod(rodId) {
  const spec = ROD_SPECS[rodId] || ROD_SPECS.pose;
  const def = rodById(rodId);
  const g = new THREE.Group();
  if (!corkTex) corkTex = corkTexture();
  const L = spec.len;
  const gripLen = Math.min(0.55, L * 0.17);
  const seatY = gripLen * 0.62;
  // Griff
  const gripMat = spec.grip === 'cork'
    ? new THREE.MeshStandardMaterial({ map: corkTex, roughness: 0.85 })
    : spec.grip === 'eva' ? mat(0x1a1a1c, 0.9) : mat(0x2a2a2e, 0.55);
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(spec.butt * 1.9, spec.butt * 2.0, seatY - 0.04, 20), gripMat);
  lower.position.y = (seatY - 0.04) / 2; g.add(lower);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(spec.butt * 2.05, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0x111111, 0.4));
  g.add(cap);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(spec.butt * 1.5, spec.butt * 1.5, 0.11, 20), MAT.darkMetal());
  seat.position.y = seatY + 0.015; g.add(seat);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(spec.butt * 1.55, spec.butt * 1.75, gripLen - seatY + 0.02, 20), gripMat);
  upper.position.y = seatY + 0.07 + (gripLen - seatY) / 2; g.add(upper);
  const wind = new THREE.Mesh(new THREE.CylinderGeometry(spec.butt * 1.12, spec.butt * 1.12, 0.03, 16), MAT.gold());
  wind.position.y = gripLen + 0.1; g.add(wind);

  // Blank in biegbaren Segmenten (glänzendes Carbon)
  const blank = new THREE.MeshPhysicalMaterial({ color: spec.blank, roughness: 0.28, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12 });
  const segs = 8;
  const segLen = (L - gripLen) / segs;
  let parent = g;
  const joints = [];
  const guides = [];
  const j0 = new THREE.Group();
  j0.position.y = gripLen;
  g.add(j0);
  parent = j0;
  for (let i = 0; i < segs; i++) {
    const r0 = spec.butt + (spec.tip - spec.butt) * (i / segs);
    const r1 = spec.butt + (spec.tip - spec.butt) * ((i + 1) / segs);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, segLen, 10), i === segs - 1 && spec.tipColor ? mat(spec.tipColor, 0.4) : blank);
    seg.position.y = segLen / 2;
    seg.castShadow = true;
    const j = i === 0 ? j0 : new THREE.Group();
    if (i > 0) { j.position.y = segLen; parent.add(j); }
    j.add(seg);
    joints.push(j);
    parent = j;
  }
  // Ringe: Abstände wachsen zur Spitze hin enger; Größe nimmt ab
  const totalBlank = L - gripLen;
  for (let k = 0; k < spec.guides; k++) {
    const u = 0.08 + 0.9 * Math.pow((k + 1) / spec.guides, 1.35);
    const along = u * totalBlank;
    const si = Math.min(segs - 1, Math.floor(along / segLen));
    const local = along - si * segLen;
    const size = (0.024 - 0.018 * (k / spec.guides)) * (spec.reel === 'fly' ? 0.6 : 1) * (spec.butt / 0.013 * 0.6 + 0.4);
    const guide = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.5, size * 0.09, 6, 16), MAT.chrome());
    ring.position.set(0, 0, -size * 0.85);
    guide.add(ring);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.04, size * 0.04, size * 0.85, 4), MAT.chrome());
    leg.rotation.x = Math.PI / 2; leg.position.z = -size * 0.42;
    guide.add(leg);
    guide.position.y = local;
    joints[si].add(guide);
    const p = new THREE.Object3D();
    p.position.set(0, local, -size * 0.85);
    joints[si].add(p);
    guides.push(p);
  }
  const tip = new THREE.Object3D();
  tip.position.y = segLen;
  parent.add(tip);
  guides.push(tip);

  // Rolle hängt unter dem Rollenhalter (Ringe zeigen nach -z, also hängt die Rolle auf -z)
  const reel = spec.reel === 'fly' ? flyReel(spec.reelSize) : spinningReel(spec.reelSize, def.id === 'brandung' ? 0x2a4a7a : 0x23262c);
  // Rollenfuß parallel zur Rute, Rolle hängt auf der Ringseite (−z), Spule zeigt zur Spitze, Kurbel links vom Angler
  reel.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
  reel.group.position.set(0, seatY + 0.015, -spec.butt * 1.5);
  g.add(reel.group);

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { tip, joints, guides, crank: reel.group.children.includes(reel.crank) ? reel.crank : reel.crank, knob: reel.knobPoint, spool: reel.spoolPoint, len: L, seatY, gripLen };
  return g;
}

// Rute biegen (0 = gerade, 1 = stark krumm); side neigt die Biegung seitlich
export function bendRod(rod, amount, side = 0) {
  const n = rod.userData.joints.length;
  rod.userData.joints.forEach((j, i) => {
    const k = Math.pow((i + 1) / n, 1.6) * amount;
    j.rotation.x = -k * 0.42; // Ringe zeigen nach -z: Biegung Richtung Ringseite (nach unten/vorn)
    j.rotation.z = -side * k * 0.25;
  });
}

// Weltpunkte der Schnur von der Spule durch alle Ringe bis zur Spitze
export function rodLinePoints(rod, out = []) {
  const ud = rod.userData;
  const pts = [ud.spool, ...ud.guides];
  pts.forEach((p, i) => { out[i] = out[i] || new THREE.Vector3(); p.getWorldPosition(out[i]); });
  out.length = pts.length;
  return out;
}

// ---------- IK ----------
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

function aimBone(bone, childWorld, targetWorld) {
  const bp = bone.getWorldPosition(new THREE.Vector3());
  const from = childWorld.clone().sub(bp).normalize();
  const to = targetWorld.clone().sub(bp).normalize();
  _q.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(_q2);
  const world = _q.multiply(_q2);
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(pq.multiply(world));
  bone.updateMatrixWorld(true);
}

function solveArm(upper, fore, hand, target, pole) {
  upper.updateMatrixWorld(true);
  const a = upper.getWorldPosition(_a.clone());
  const b = fore.getWorldPosition(_b.clone());
  const c = hand.getWorldPosition(_c.clone());
  const l1 = a.distanceTo(b);
  const l2 = b.distanceTo(c);
  const toT = target.clone().sub(a);
  const d = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, toT.length()));
  const dir = toT.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const p = pole.clone().sub(a);
  p.sub(dir.clone().multiplyScalar(p.dot(dir))).normalize();
  const elbow = a.clone().add(dir.clone().multiplyScalar(l1 * cosA)).add(p.multiplyScalar(l1 * sinA));
  aimBone(upper, b, elbow);
  const c2 = hand.getWorldPosition(new THREE.Vector3());
  aimBone(fore, c2, a.clone().add(dir.multiplyScalar(d)));
}

// Finger um den Griff schließen (Mixamo-Skelett: Beugung um die lokale x-Achse)
function curlFingers(bones, side, amount) {
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) {
    for (let k = 1; k <= 3; k++) {
      const b = bones[`${side}Hand${f}${k}`];
      if (b) b.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), amount * (k === 1 ? 1.1 : 1.25)));
    }
  }
  const t = bones[`${side}HandThumb1`];
  if (t) t.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, side === 'Right' ? 1 : -1), amount * 0.5));
}

// ---------- Angler zusammenbauen ----------
export function createAngler(look, rodId, opts = {}) {
  const root = new THREE.Group();
  const model = cloneSkinned(cache.angler.scene);
  root.add(model);
  const bones = {};
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.material = o.material.clone(); }
  });
  const meshes = {};
  model.traverse((o) => { if (o.isMesh) meshes[o.name] = o; });

  // Haut: entsättigte Hauttextur in der gewählten Farbe
  const skin = new THREE.Color(SKIN_TONES[look.skin] ?? SKIN_TONES[1]);
  if (meshes.Wolf3D_Head) { meshes.Wolf3D_Head.material.map = base.graySkin; meshes.Wolf3D_Head.material.color.copy(skin); }
  if (meshes.Wolf3D_Body) { meshes.Wolf3D_Body.material.map = base.grayBodySkin; meshes.Wolf3D_Body.material.color.copy(skin); }
  // Haare
  if (meshes.Wolf3D_Hair) {
    meshes.Wolf3D_Hair.visible = look.hair !== 'bald' && look.hat !== 'beanie';
    meshes.Wolf3D_Hair.material.map = base.grayHair;
    meshes.Wolf3D_Hair.material.color.set(HAIR_COLORS[look.hairColor] ?? 0x3a2a1a).multiplyScalar(1.8);
  }

  // Hose: Jeans/Cargo als umgefärbter Stoff, Wathose als Gummi-Hülle
  const pantsColor = new THREE.Color(OUTFIT_COLORS[look.pantsColor] ?? 0x2a2e36);
  const bottom = meshes.Wolf3D_Outfit_Bottom;
  bottom.material.map = base.grayBottom;
  bottom.material.color.copy(look.pants === 'jeans' ? new THREE.Color(0x4a6a9a) : pantsColor).multiplyScalar(1.5);
  if (look.pants === 'wader') {
    skinnedShell(bottom, base.waderGeo, new THREE.MeshPhysicalMaterial({ color: 0x3a4a30, roughness: 0.42, clearcoat: 0.4, normalMap: base.fabric, normalScale: new THREE.Vector2(0.3, 0.3) }));
  }

  // Oberteil
  const topColor = new THREE.Color(OUTFIT_COLORS[look.topColor] ?? 0x3d5a2a);
  const shirtColor = new THREE.Color(OUTFIT_COLORS[look.shirtColor] ?? 0x2a2e36);
  const top = meshes.Wolf3D_Outfit_Top;
  top.material.map = base.grayTop;
  top.material.color.copy(look.top === 'tshirt' ? topColor : shirtColor).multiplyScalar(1.3);
  const fabricMat = {
    rain: () => new THREE.MeshPhysicalMaterial({ color: topColor, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.4, normalMap: base.fabric, normalScale: new THREE.Vector2(0.25, 0.25) }),
    softshell: () => new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.75, normalMap: base.fabric, normalScale: new THREE.Vector2(0.4, 0.4) }),
    hoodie: () => new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.95, normalMap: base.knit, normalScale: new THREE.Vector2(0.35, 0.35) }),
    fleece: () => new THREE.MeshStandardMaterial({ color: topColor, roughness: 1, normalMap: base.knit, normalScale: new THREE.Vector2(0.6, 0.6) }),
  };
  if (fabricMat[look.top]) {
    const m = fabricMat[look.top]();
    skinnedShell(top, base.jacketGeo, m);
    skinnedShell(meshes.Wolf3D_Body, base.sleeveGeo, m);
  } else if (look.top === 'vest') {
    // langärmeliges Shirt + Weste
    skinnedShell(meshes.Wolf3D_Body, base.shirtSleeveGeo, top.material);
    skinnedShell(top, base.vestGeo, new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.85, normalMap: base.fabric, normalScale: new THREE.Vector2(0.7, 0.7) }));
  }

  // Schuhe -> Gummistiefel
  const bootsOn = look.pants === 'wader'; // Gummistiefel gehören zur Wathose
  if (!bootsOn && meshes.Wolf3D_Outfit_Footwear) meshes.Wolf3D_Outfit_Footwear.material.color.set(0x8a7a66); // Turnschuhe -> Wanderschuh-Ton
  if (bootsOn && meshes.Wolf3D_Outfit_Footwear) meshes.Wolf3D_Outfit_Footwear.visible = false;

  // Hut
  let hat = null;
  if (look.hat === 'bucket') {
    hat = cache.fishermans_hat.scene.clone(true);
    hat.traverse((o) => {
      if (o.isMesh) { o.material = o.material.clone(); o.material.map = base.hatGray; o.material.color.set(OUTFIT_COLORS[look.hatColor] ?? 0xd8d0b8).multiplyScalar(1.4); o.castShadow = true; }
    });
  } else if (look.hat === 'cap') {
    hat = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: OUTFIT_COLORS[look.hatColor] ?? 0x2a4f9a, roughness: 0.9, normalMap: base.fabric });
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cm);
    crown.scale.set(1, 0.85, 1.08); hat.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.008, 24, 1, false, -Math.PI / 2, Math.PI), cm);
    brim.position.set(0, 0.005, 0.085); brim.scale.z = 1.25; brim.rotation.x = 0.12; hat.add(brim);
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), cm); btn.position.y = 0.09; hat.add(btn);
  } else if (look.hat === 'beanie') {
    hat = new THREE.Group();
    const bm = new THREE.MeshStandardMaterial({ color: OUTFIT_COLORS[look.hatColor] ?? 0xd9264a, roughness: 1, normalMap: base.knit, normalScale: new THREE.Vector2(0.8, 0.8) });
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.108, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), bm);
    crown.scale.set(1, 1.05, 1.08); hat.add(crown);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 10, 28), bm);
    cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.005; cuff.scale.set(1, 1.08, 1); hat.add(cuff);
  }
  if (hat) {
    hat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    hat.name = 'hat';
    bones.Head.add(hat);
    hat.userData.kind = look.hat;
  }
  // Sonnenbrille (polarisiert)
  if (look.glasses) {
    const gl = new THREE.Group();
    const lens = new THREE.MeshPhysicalMaterial({ color: 0x1a2a2a, roughness: 0.05, metalness: 0.4, clearcoat: 1, transparent: true, opacity: 0.88 });
    const frame = mat(0x111111, 0.4);
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), lens);
      l.rotation.x = Math.PI / 2; l.scale.set(1.15, 0.6, 0.75); l.position.set(s * 0.032, 0, 0); gl.add(l);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.1), frame); arm.position.set(s * 0.068, 0.004, -0.05); gl.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.005), frame); bridge.position.y = 0.012; gl.add(bridge);
    gl.name = 'glasses';
    bones.Head.add(gl);
  }
  // Schwimmweste (auf dem Boot Pflicht)
  if (opts.lifeJacket) {
    const lj = cache.life_jacket.scene.clone(true);
    lj.name = 'lifejacket';
    lj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    bones.Spine2.add(lj);
  }
  let boots = null;
  if (bootsOn) {
    boots = [cache.rubber_boots.scene.getObjectByName('rubber_boots_l').clone(true), cache.rubber_boots.scene.getObjectByName('rubber_boots_r').clone(true)];
    boots.forEach((b) => {
      b.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (look.pants === 'wader') { o.material = o.material.clone(); o.material.color.set(0x8a9a80); } } });
      root.add(b);
    });
  }

  // Rute
  const rod = createRod(rodId);
  root.add(rod);

  const rig = {
    bones, model, rod, hat, boots, root,
    rest: Object.fromEntries(Object.entries(bones).map(([n, b]) => [n, b.quaternion.clone()])),
    cast: 0, // -1 ausgeholt .. 0 Ruhe .. 1 nach vorn
    reel: 0, // Kurbelwinkel
    reeling: false,
    rodPitch: 0.75, // Rute über der Waagerechten (rad)
    rodYaw: 0,
    lookAt: null, // Weltpunkt, zu dem der Kopf schaut
    hold: 1, // 1 = Rute halten, 0 = Fisch zeigen
    fishHold: null,
  };
  root.userData = { rod, tip: rod.userData.tip, rig, update: (dt) => updateRig(rig, dt) };
  updateRig(rig, 0);
  placeAccessories(rig);
  return root;
}

function placeAccessories(rig) {
  const { bones, hat, boots, root } = rig;
  root.updateMatrixWorld(true);
  if (hat) {
    // Hut sitzt auf dem Kopf: Kopfknochen-Ursprung ist im Nacken, oben drauf ~0.15 m
    const k = hat.userData.kind;
    hat.position.set(0, k === 'bucket' ? 0.135 : k === 'beanie' ? 0.105 : 0.12, k === 'bucket' ? 0.0 : 0.012);
    hat.rotation.set(0.08, 0, 0);
    if (k === 'bucket') hat.scale.setScalar(1.05);
  }
  const gl = bones.Head.getObjectByName('glasses');
  if (gl) gl.position.set(0, 0.075, 0.098);
  const lj = bones.Spine2.getObjectByName('lifejacket');
  if (lj) { lj.position.set(0, 0.0, 0.01); lj.scale.set(0.62, 0.62, 1.3); }
  if (boots) {
    // Stiefel an die Füße (nach der Grundpose), danach dem Fuß-Knochen untergeordnet
    ['Left', 'Right'].forEach((s, i) => {
      const foot = bones[`${s}Foot`];
      const toe = bones[`${s}ToeBase`];
      const fp = foot.getWorldPosition(new THREE.Vector3());
      const tp = toe.getWorldPosition(new THREE.Vector3());
      const dir = tp.clone().sub(fp).setY(0).normalize();
      const b = boots[i];
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(fp.x + dir.x * 0.03, 0, fp.z + dir.z * 0.03),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dir.x, dir.z)),
        new THREE.Vector3(1.15, 1.15, 1.15),
      );
      const inv = new THREE.Matrix4().copy(foot.matrixWorld).invert();
      m.premultiply(inv);
      m.decompose(b.position, b.quaternion, b.scale);
      foot.add(b);
    });
  }
}

// Pro Frame: Grundpose, Rute stellen, Arme per IK an Griff und Kurbel, Kopf zum Ziel.
function updateRig(rig, dt) {
  const { bones, rest, rod, root } = rig;
  for (const [n, q] of Object.entries(rest)) bones[n].quaternion.copy(q);
  const B = bones;
  const rotL = (b, x, y, z) => { if (B[b]) B[b].quaternion.multiply(_q.setFromEuler(new THREE.Euler(x, y, z))); };
  // Stand: leicht breitbeinig, Knie locker, Oberkörper minimal vorgebeugt
  rotL('LeftUpLeg', -0.05, 0, -0.07);
  rotL('RightUpLeg', -0.05, 0, 0.07);
  rotL('LeftLeg', 0.1, 0, 0);
  rotL('RightLeg', 0.1, 0, 0);
  rotL('LeftFoot', -0.05, 0, 0);
  rotL('RightFoot', -0.05, 0, 0);
  rotL('Spine', 0.06, 0, 0);
  rotL('Spine1', 0.04 + Math.max(0, -rig.cast) * -0.15 + Math.max(0, rig.cast) * 0.12, rig.cast * 0.12, 0);
  rotL('LeftShoulder', 0, 0, 0.05);
  rotL('RightShoulder', 0, 0, -0.05);
  root.updateMatrixWorld(true);

  // Fangfoto: Rute weglegen, Fisch mit beiden Händen vor die Brust halten (Kopf zeigt nach links vom Angler)
  rod.visible = !rig.fishHold;
  if (rig.fishHold) {
    const { fish, length } = rig.fishHold;
    const L = Math.min(1.6, length);
    const y = 1.22 - Math.max(0, L - 0.9) * 0.25;
    fish.position.copy(root.localToWorld(new THREE.Vector3(0.05, y, 0.42)));
    fish.quaternion.copy(root.getWorldQuaternion(new THREE.Quaternion()));
    solveArm(B.RightArm, B.RightForeArm, B.RightHand, root.localToWorld(new THREE.Vector3(-L * 0.32 + 0.05, y - 0.02, 0.4)), root.localToWorld(new THREE.Vector3(-0.8, 0.5, -0.2)));
    solveArm(B.LeftArm, B.LeftForeArm, B.LeftHand, root.localToWorld(new THREE.Vector3(L * 0.22 + 0.05, y - 0.05, 0.4)), root.localToWorld(new THREE.Vector3(0.8, 0.5, -0.2)));
    curlFingers(B, 'Right', 0.9);
    curlFingers(B, 'Left', 0.9);
    root.updateMatrixWorld(true);
    return;
  }

  // Rute: Griffposition im Körperraum (rechte Hand vor dem Bauch), Neigung je nach Wurfphase
  const back = Math.max(0, -rig.cast);
  const fwd = Math.max(0, rig.cast);
  const pitch = rig.hold ? rig.rodPitch + back * 1.15 - fwd * 0.45 : -0.6;
  const yaw = rig.rodYaw;
  const grip = new THREE.Vector3(-0.17 + back * 0.05, 1.02 + back * 0.32 - fwd * 0.05, 0.3 - back * 0.12 + fwd * 0.08);
  if (!rig.hold) grip.set(-0.3, 0.9, 0.1);
  // Rute zeigt in Richtung (yaw, pitch); Ringe nach unten (-z der Rute zeigt zum Boden)
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const qRod = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  // um die eigene Achse drehen, sodass die Ringe (−z lokal) nach unten zeigen
  const down = new THREE.Vector3(0, 0, -1).applyQuaternion(qRod);
  const wantDown = new THREE.Vector3(0, -1, 0).sub(dir.clone().multiplyScalar(-dir.y)).normalize();
  const twist = Math.atan2(new THREE.Vector3().crossVectors(down, wantDown).dot(dir), down.dot(wantDown));
  qRod.premultiply(_q.setFromAxisAngle(dir, twist));
  rod.quaternion.copy(qRod);
  // Griffpunkt der Hand liegt knapp über dem Rollenfuß
  const handOnRod = new THREE.Vector3(0, rod.userData.seatY + 0.02, 0).applyQuaternion(qRod);
  rod.position.copy(grip).sub(handOnRod);
  rod.updateMatrixWorld(true);

  // Kurbel drehen
  if (rig.reeling) rig.reel += dt * 11;
  rod.userData.crank.rotation.x = -rig.reel;
  rod.updateMatrixWorld(true);

  // Rechte Hand an den Griff (Ellbogen nach außen/unten)
  const gripW = root.localToWorld(grip.clone());
  const rPole = root.localToWorld(new THREE.Vector3(-0.6, 0.6, -0.3));
  solveArm(B.RightArm, B.RightForeArm, B.RightHand, gripW, rPole);
  orientHand(B.RightHand, rod, 'Right');
  curlFingers(B, 'Right', 0.95);

  // Linke Hand: an die Kurbel (beim Wurf an den Griff unterhalb)
  let leftT;
  if (back > 0.05 || fwd > 0.05 || !rig.hold) leftT = root.localToWorld(new THREE.Vector3(0, rod.userData.seatY - 0.2, 0).applyQuaternion(qRod).add(rod.position));
  else leftT = rod.userData.knob.getWorldPosition(new THREE.Vector3());
  const lPole = root.localToWorld(new THREE.Vector3(0.6, 0.4, -0.4));
  solveArm(B.LeftArm, B.LeftForeArm, B.LeftHand, leftT, lPole);
  curlFingers(B, 'Left', 0.8);

  // Kopf: zum Ziel (Köder/Fisch) blicken, begrenzt
  if (rig.lookAt && B.Head) {
    const hp = B.Head.getWorldPosition(new THREE.Vector3());
    const local = root.worldToLocal(rig.lookAt.clone()).sub(root.worldToLocal(hp.clone()));
    const yawH = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.7, 0.7);
    const pitchH = THREE.MathUtils.clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.3, 0.5);
    B.Neck.quaternion.multiply(_q.setFromEuler(new THREE.Euler(pitchH * 0.4, yawH * 0.4, 0)));
    B.Head.quaternion.multiply(_q.setFromEuler(new THREE.Euler(pitchH * 0.6, yawH * 0.6, 0)));
  }
  root.updateMatrixWorld(true);
}

// Handgelenk so drehen, dass die Handfläche den Griff umschließt (Finger quer zur Rute)
function orientHand(hand, rod, side) {
  hand.updateMatrixWorld(true);
  const rodDir = new THREE.Vector3(0, 1, 0).applyQuaternion(rod.quaternion);
  const rodDown = new THREE.Vector3(0, 0, -1).applyQuaternion(rod.quaternion);
  // Finger (lokal +y beim Mixamo-Skelett) zeigen quer, leicht nach unten um den Griff
  const fingers = new THREE.Vector3().crossVectors(rodDir, rodDown).multiplyScalar(side === 'Right' ? 1 : -1).add(rodDown.clone().multiplyScalar(0.6)).normalize();
  const palm = rodDir.clone(); // Daumenseite Richtung Spitze
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(fingers, palm).normalize(), fingers, palm.clone().sub(fingers.clone().multiplyScalar(palm.dot(fingers))).normalize());
  const wq = new THREE.Quaternion().setFromRotationMatrix(m);
  const pq = hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  hand.quaternion.copy(pq.multiply(wq));
  hand.updateMatrixWorld(true);
}

// Wurfbewegung: phase 0 = Ruhe, -1 = ausgeholt (Rute über der Schulter), 1 = nach vorn geschwungen
export function poseCast(angler, phase) {
  angler.userData.rig.cast = phase;
}
