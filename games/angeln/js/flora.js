import * as THREE from '../../../vendor/three.module.js';
import { mergeGeometries } from '../../../vendor/addons/utils/BufferGeometryUtils.js';

// Pflanzen aus Foto-Laubkarten (Poly-Haven-Blatt-/Nadeltexturen, zu Zweigkarten zusammengesetzt in tools/foliage.py):
// Bäume werden einmal je Art als Geometrie gebaut (Stamm + viele Karten) und dann instanziert gezeichnet.

const TEX = new URL('../assets/textures/', import.meta.url).href;
const tl = new THREE.TextureLoader();
const texCache = {};
export function tex(name, { srgb = true, repeat = 1 } = {}) {
  const key = name + srgb + repeat;
  if (!texCache[key]) {
    const t = tl.load(TEX + name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache[key] = t;
  }
  return texCache[key];
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Karte: Rechteck, dessen Ansatz (u=0) am Ursprung liegt, nach +x ausgerichtet
function card(w, h, anchorLeft = true) {
  const g = new THREE.PlaneGeometry(w, h);
  if (anchorLeft) g.translate(w / 2, 0, 0);
  return g;
}

function trunk(h, r0, r1, bend = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 7, 4, true);
  g.translate(0, h / 2, 0);
  if (bend) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / h; p.setX(i, p.getX(i) + Math.sin(y * Math.PI) * bend); }
  }
  return g;
}

// Fichte/Tanne: Stamm + Etagen von hängenden Zweigkarten
function conifer(r, height) {
  const leaves = [];
  const whorls = Math.round(height * 1.1);
  for (let w = 0; w < whorls; w++) {
    const t = w / whorls;
    const y = height * (0.18 + t * 0.8);
    const len = (1 - t) * height * 0.3 + 0.35;
    const n = Math.max(3, Math.round(7 - t * 3));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.8 + w;
      const g = card(len, len * 0.5);
      g.rotateX(r() * 0.6 - 0.3 + Math.PI / 2 * 0.15);
      g.rotateZ(-(0.25 + t * 0.15 + r() * 0.15)); // Zweige hängen etwas
      g.rotateY(a);
      g.translate(0, y, 0);
      leaves.push(g);
    }
  }
  // Spitze
  const top = card(0.6, 1.2, false); top.translate(0, height + 0.3, 0); leaves.push(top);
  const top2 = top.clone(); top2.rotateY(Math.PI / 2); leaves.push(top2);
  return { trunk: trunk(height, height * 0.018, height * 0.004), leaves: mergeGeometries(leaves) };
}

// Laubbaum: Stamm mit Ästen, Krone aus Büschelkarten in einem Ellipsoid
function broadleaf(r, height, crownW, crownH, slim = false) {
  const leaves = [];
  const n = slim ? 46 : 70;
  const cy = height - crownH * 0.5;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const u = Math.pow(r(), 0.6);
    const y = cy + (r() - 0.5) * crownH * 0.9;
    const rad = crownW * 0.5 * u * Math.sqrt(Math.max(0.05, 1 - Math.pow((y - cy) / (crownH * 0.5), 2)));
    const s = (slim ? 1.3 : 1.8) * (0.8 + r() * 0.5);
    const g = card(s, s, false);
    g.rotateZ((r() - 0.5) * 0.8);
    g.rotateX((r() - 0.5) * 0.9);
    g.rotateY(a + Math.PI / 2 + (r() - 0.5));
    g.translate(Math.cos(a) * rad, y, Math.sin(a) * rad);
    leaves.push(g);
  }
  const parts = [trunk(height * 0.65, height * 0.03, height * 0.014, height * 0.02)];
  for (let i = 0; i < 4; i++) {
    const b = trunk(crownW * 0.45, height * 0.012, height * 0.004);
    b.rotateZ(0.7 + r() * 0.4);
    b.rotateY(r() * Math.PI * 2);
    b.translate(0, height * (0.45 + r() * 0.2), 0);
    parts.push(b);
  }
  return { trunk: mergeGeometries(parts), leaves: mergeGeometries(leaves) };
}

// Weinstock: niedrige Laubreihe am Pfahl
function vine(r) {
  const leaves = [];
  for (let i = 0; i < 6; i++) {
    const g = card(0.9, 0.9, false);
    g.rotateY(r() * Math.PI);
    g.translate((r() - 0.5) * 0.8, 0.9 + r() * 0.5, (r() - 0.5) * 0.3);
    leaves.push(g);
  }
  return { trunk: trunk(1.6, 0.03, 0.03), leaves: mergeGeometries(leaves) };
}

// Schilfhalme
function reedClump(r) {
  const blades = [];
  for (let i = 0; i < 14; i++) {
    const h = 1.2 + r() * 1.2;
    const g = new THREE.PlaneGeometry(0.035, h, 1, 4);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position;
    const lean = (r() - 0.5) * 0.5;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k) / h; p.setX(k, p.getX(k) + y * y * lean); }
    g.rotateY(r() * Math.PI);
    g.translate((r() - 0.5) * 0.7, 0, (r() - 0.5) * 0.7);
    blades.push(g);
    if (r() < 0.35) { // Rohrkolben
      const c = new THREE.CylinderGeometry(0.03, 0.03, 0.22, 5);
      c.translate(g.attributes.position.getX(g.attributes.position.count - 1), h - 0.1, g.attributes.position.getZ(g.attributes.position.count - 1));
      blades.push(c);
    }
  }
  return mergeGeometries(blades);
}

const SPECIES = {
  spruce: { make: (r) => conifer(r, 18), card: 'conifer_card.png', tint: 0x9ab08a, bark: 0x6a5a4a },
  fir: { make: (r) => conifer(r, 14), card: 'conifer_card.png', tint: 0x8fae80, bark: 0x6a5a4a },
  oak: { make: (r) => broadleaf(r, 14, 9, 8), card: 'leaf_card.png', tint: 0x9cb37a, bark: 0x7a6a5a },
  birch: { make: (r) => broadleaf(r, 13, 5, 7, true), card: 'leaf_card.png', tint: 0xb8c88a, bark: 0xe8e4dc },
  poplar: { make: (r) => broadleaf(r, 24, 4.5, 16, true), card: 'leaf_card.png', tint: 0x9ab07a, bark: 0x9a9488 },
  cypress: { make: (r) => broadleaf(r, 15, 2.6, 12, true), card: 'conifer_card.png', tint: 0x6f8a5a, bark: 0x5a4a3a },
  olive: { make: (r) => broadleaf(r, 6, 6, 3.6), card: 'leaf_card.png', tint: 0xa8b48c, bark: 0x6a5e50 },
  vine: { make: (r) => vine(r), card: 'leaf_card.png', tint: 0xa0b86a, bark: 0x5a4a3a },
};

const built = {};
function species(name) {
  if (!built[name]) {
    const sp = SPECIES[name];
    const r = rng(name.length * 977 + 13);
    const geo = sp.make(r);
    const leafMat = new THREE.MeshStandardMaterial({
      map: tex(sp.card), color: sp.tint, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85,
    });
    const barkMat = new THREE.MeshStandardMaterial({ map: tex('bark_diff.jpg'), normalMap: tex('bark_nor.jpg', { srgb: false }), color: sp.bark, roughness: 0.95 });
    built[name] = { geo, leafMat, barkMat };
  }
  return built[name];
}

// Instanzierte Bäume: list = [{x, y, z, s, rot}] -> Group mit 2 InstancedMeshes (Stamm, Laub)
export function forest(name, list) {
  const g = new THREE.Group();
  if (!list.length) return g;
  const sp = species(name);
  const trunkM = new THREE.InstancedMesh(sp.geo.trunk, sp.barkMat, list.length);
  const leafM = new THREE.InstancedMesh(sp.geo.leaves, sp.leafMat, list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  list.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
    m.compose(new THREE.Vector3(t.x, t.y - 0.2, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + (i % 7) * 0.03), t.s));
    trunkM.setMatrixAt(i, m);
    leafM.setMatrixAt(i, m);
    c.setHSL(0.25 + ((i * 37) % 10) * 0.004, 0.25, 0.42 + ((i * 53) % 10) * 0.012);
    leafM.setColorAt(i, c.multiplyScalar(2.2));
  });
  for (const im of [trunkM, leafM]) { im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; }
  g.add(trunkM, leafM);
  return g;
}

// Schilfgürtel am Ufer
export function reeds(list) {
  const g = new THREE.Group();
  if (!list.length) return g;
  const geo = reedClump(rng(7));
  const mat = new THREE.MeshStandardMaterial({ color: 0x8e9a5a, roughness: 0.9, side: THREE.DoubleSide });
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4();
  list.forEach((t, i) => {
    m.compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot), new THREE.Vector3(t.s, t.s, t.s));
    im.setMatrixAt(i, m);
  });
  im.castShadow = true;
  im.frustumCulled = false;
  g.add(im);
  g.userData.sway = im;
  return g;
}
