import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// Fertige Assets: Himmelsfotos und Modelle von Poly Haven (CC0, tools/fetch_assets.py) und das Fahrer-Modell
// (Ready Player Me, liegt beim Angelspiel). Alles ist optional: fehlt etwas (offline, Ladefehler), nimmt das Spiel
// die prozeduralen Varianten (Farbverlauf-Himmel, gebauter Fahrer, Klötzchen-Felsen).

const BASE = new URL('../assets/', import.meta.url).href;
const RIDER_URL = new URL('../../angeln/assets/models/angler.glb', import.meta.url).href;
const PROPS = ['rock_a', 'rock_b', 'rock_moss', 'log', 'stump', 'tyre', 'wine_barrel', 'fern'];

const gltf = new GLTFLoader();
const rgbe = new RGBELoader();
// zweiter Versuch bei langsamem WLAN / Service Worker
const retry = (fn) => fn().catch(() => fn());
const loadGlb = (url) => retry(() => new Promise((res, rej) => gltf.load(url, res, undefined, rej)));

export const assets = { rider: null, props: {}, skyMeta: null };

// Geteilte Geometrien/Materialien: disposeObject() lässt sie stehen (userData.shared)
function markShared(mesh) {
  mesh.geometry.userData.shared = true;
  mesh.material.userData.shared = true;
  return mesh;
}

let modelsP = null;
export function preloadModels() {
  if (!modelsP) {
    const rider = loadGlb(RIDER_URL).then((g) => { assets.rider = g; }).catch((e) => console.warn('Fahrer-Modell fehlt', e));
    const props = Promise.all(PROPS.map((n) => loadGlb(BASE + 'models/' + n + '.glb')
      .then((g) => { assets.props[n] = prepareProp(g.scene); })
      .catch(() => console.warn('Modell fehlt', n))));
    modelsP = Promise.all([rider, props]);
  }
  return modelsP;
}

// Jedes Teil: Mittelpunkt unten auf den Ursprung, Maße in userData.size
function prepareProp(scene) {
  const parts = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const c = bb.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -bb.min.y, -c.z);
    geo.computeBoundingBox();
    const m = new THREE.Mesh(geo, o.material);
    m.userData.size = geo.boundingBox.getSize(new THREE.Vector3());
    parts.push(markShared(m));
  });
  return parts;
}

// Kopie eines Modells (Teil i bei Sets), skaliert auf die größte Ausdehnung `size` (m). null, wenn nicht geladen.
export function prop(name, i = 0, size = 0) {
  const parts = assets.props[name];
  if (!parts || !parts.length) return null;
  const src = parts[i % parts.length];
  const m = new THREE.Mesh(src.geometry, src.material);
  m.userData.size = src.userData.size;
  if (size) {
    const s = src.userData.size;
    m.scale.setScalar(size / Math.max(s.x, s.y, s.z));
  }
  return m;
}
export const propCount = (name) => (assets.props[name] || []).length;

// ---- Himmel je Strecke: Hintergrund-JPG + HDR fürs Umgebungslicht ----
const skyCache = new Map();
export function loadSky(id) {
  if (!skyCache.has(id)) {
    const meta = assets.skyMeta ? Promise.resolve(assets.skyMeta) : fetch(BASE + 'sky/sky.json').then((r) => r.json()).then((m) => (assets.skyMeta = m));
    skyCache.set(id, meta.then((m) => {
      if (!m[id]) return null;
      return Promise.all([
        retry(() => new Promise((res, rej) => new THREE.TextureLoader().load(BASE + `sky/${id}.jpg`, res, undefined, rej))),
        retry(() => new Promise((res, rej) => rgbe.load(BASE + `sky/${id}.hdr`, res, undefined, rej))),
      ]).then(([bg, hdr]) => {
        bg.colorSpace = THREE.SRGBColorSpace;
        bg.generateMipmaps = false; // Naht bei u = 0/1 ohne Mipmap-Sprung
        bg.minFilter = THREE.LinearFilter;
        return { bg, hdr, meta: m[id] };
      });
    }).catch((e) => { console.warn('Himmel fehlt', id, e); skyCache.delete(id); return null; }));
  }
  return skyCache.get(id);
}
