import * as THREE from '../../../vendor/three.module.js';
import { MAPS } from './maps.js';

// Himmelskuppel mit Farbverlauf und Sonne + daraus abgeleitete Umgebungsreflexion (PBR-Glanz auf Rahmen etc.)

export function createSky({ top, horizon, ground = 0x667766, sunDir = new THREE.Vector3(0.5, 0.45, -0.6) }) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(top) },
      horizon: { value: new THREE.Color(horizon) },
      ground: { value: new THREE.Color(ground) },
      sun: { value: sunDir.clone().normalize() },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sun;
      varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55));
        c = mix(c, ground, smoothstep(0.0, -0.25, h));
        float s = max(dot(normalize(vDir), sun), 0.0);
        c += vec3(1.0, 0.93, 0.78) * (pow(s, 600.0) * 2.0 + pow(s, 24.0) * 0.28);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 16), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

export function createEnvMap(renderer, skyOpts) {
  return envFromScene(renderer, createSky(skyOpts));
}

function envFromScene(renderer, mesh) {
  const s = new THREE.Scene();
  s.add(mesh);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, 0.1, 1000);
  pm.dispose();
  s.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return rt.texture;
}

// Himmelsfoto (Poly Haven, equirektangular) als Kuppel. Das Foto wird um die Hochachse gedreht, sodass seine Sonne
// in Richtung des Sonnenlichts der Strecke steht (sunDir) – Schatten, Glanzlichter und Foto passen zusammen.
// sky: { bg, hdr, meta } aus assets.loadSky
function photoOffset(sky, sunDir) {
  const photoAz = (sky.meta.u - 0.5) * Math.PI * 2; // three.js: u = atan(z, x) / 2π + 0.5
  return Math.atan2(sunDir.z, sunDir.x) - photoAz;
}
function photoDome(tex, offset, radius = 450) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { tSky: { value: tex }, uOff: { value: offset } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tSky; uniform float uOff;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float u = fract((atan(d.z, d.x) - uOff) / 6.2831853 + 0.5);
        float v = asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5;
        gl_FragColor = vec4(texture2D(tSky, vec2(u, v)).rgb, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}
export const createPhotoSky = (sky, sunDir) => photoDome(sky.bg, photoOffset(sky, sunDir));
export const createPhotoEnvMap = (renderer, sky, sunDir) => envFromScene(renderer, photoDome(sky.hdr, photoOffset(sky, sunDir), 100));

// ---------------------------------------------------------------------------------------------
// Ferne Landschaft: mehrere Silhouetten-Ringe hintereinander (Tiefe), je weiter weg desto heller und
// blasser (Luftperspektive), unten im Dunst. Profil je Strecke (Alpen, Hügel, Tafelberge, Küste …).
// ---------------------------------------------------------------------------------------------
const lrng = (seed) => { let s = (seed * 9301 + 7) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const fract = (x) => x - Math.floor(x);
const hash1 = (n) => fract(Math.sin(n * 127.1) * 43758.5453);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// periodische Summe von Sinuswellen (ganzzahlige Frequenzen → nahtlos rundum)
function waves(rnd, terms) {
  const t = terms.map(([f, amp]) => ({ f, amp, ph: rnd() * 6.283 }));
  return (a) => t.reduce((h, w) => h + w.amp * Math.sin(a * w.f + w.ph), 0);
}

const PROFILES = {
  // Hochgebirge: zackige Grate (umgekehrte Beträge)
  alps: (rnd, sc = 1) => {
    const t = [[5, 1], [11, 0.55], [23, 0.3], [47, 0.14]].map(([f, amp]) => ({ f, amp, ph: rnd() * 6.283 }));
    const env = waves(rnd, [[2, 0.5], [3, 0.3]]);
    return (a) => sc * Math.max(4, (28 + 26 * env(a)) * t.reduce((h, w) => h + w.amp * (1 - Math.abs(Math.sin(a * w.f + w.ph))), 0));
  },
  hills: (rnd, sc = 1) => { const w = waves(rnd, [[3, 1], [7, 0.55], [13, 0.3], [29, 0.12]]); return (a) => sc * Math.max(2, 14 + 9 * w(a)); },
  mesa: (rnd, sc = 1) => {
    const w = waves(rnd, [[4, 1], [9, 0.6], [19, 0.35]]), d = waves(rnd, [[61, 0.6], [127, 0.4]]);
    return (a) => { const x = w(a); return sc * (6 + 30 * smooth(0.1, 0.22, x) + 16 * smooth(0.75, 0.85, x) + 1.5 * d(a)); };
  },
  coast: (rnd, sc = 1) => { const w = waves(rnd, [[2, 1], [5, 0.6], [11, 0.3], [31, 0.1]]); return (a) => sc * Math.max(-2, 4 + 18 * w(a)); },
};
// kleine Unebenheiten der Baumkronen bzw. einzelne Zypressen auf dem Kamm
const treeline = (a, k) => k * (0.6 * Math.abs(Math.sin(a * 181)) + 0.5 * Math.abs(Math.sin(a * 347 + 1)) + 0.35 * Math.abs(Math.sin(a * 709 + 2)));

const SCENERY = {
  wiese: [{ p: 'alps', r: 440, sc: 1.6, snow: 0.62, haze: 0.62 }, { p: 'hills', r: 400, sc: 1.6, haze: 0.42, fields: true }, { p: 'hills', r: 350, sc: 1.1, haze: 0.25, trees: 1.6 }],
  kueste: [{ p: 'coast', r: 440, sc: 1.4, haze: 0.6 }, { p: 'coast', r: 395, sc: 1.1, haze: 0.38, trees: 0.8 }],
  wald: [{ p: 'alps', r: 440, sc: 1.3, snow: 0.75, haze: 0.6 }, { p: 'hills', r: 395, sc: 2.0, haze: 0.4, trees: 2.2 }, { p: 'hills', r: 345, sc: 1.3, haze: 0.22, trees: 2.6 }],
  canyon: [{ p: 'mesa', r: 440, sc: 1.6, haze: 0.55 }, { p: 'mesa', r: 395, sc: 1.2, haze: 0.35 }, { p: 'mesa', r: 345, sc: 0.8, haze: 0.18 }],
  bikepark: [{ p: 'alps', r: 440, sc: 1.2, haze: 0.55 }, { p: 'hills', r: 395, sc: 1.5, haze: 0.35, trees: 2.0 }, { p: 'hills', r: 345, sc: 1.0, haze: 0.2, trees: 2.4 }],
  pumptrack: [{ p: 'hills', r: 430, sc: 1.6, haze: 0.45 }, { p: 'hills', r: 370, sc: 1.0, haze: 0.25, trees: 2.0 }],
  gardasee: [{ p: 'alps', r: 440, sc: 1.8, snow: 0.82, haze: 0.6 }, { p: 'hills', r: 398, sc: 2.1, haze: 0.42, trees: 1.4 }, { p: 'hills', r: 352, sc: 1.15, haze: 0.26, trees: 1.6, cypress: true }],
  weinberg: [{ p: 'alps', r: 440, sc: 1.0, haze: 0.66 }, { p: 'hills', r: 400, sc: 1.5, haze: 0.42, rows: true }, { p: 'hills', r: 350, sc: 1.05, haze: 0.24, rows: true, cypress: true }],
};

export function createMountains(color, seed = 1) {
  const map = MAPS.find((m) => m.seed === seed);
  const layers = (map && SCENERY[map.id]) || [{ p: 'alps', r: 440, sc: 1, haze: 0.5 }, { p: 'hills', r: 380, sc: 1, haze: 0.25 }];
  const base = new THREE.Color(color);
  const fog = new THREE.Color(map ? map.colors.fog : color);
  const sky = new THREE.Color(map ? map.colors.sky : color);
  const grass = new THREE.Color(map ? map.colors.grass : color);
  const group = new THREE.Group();
  const rnd = lrng(seed);
  layers.forEach((L, li) => {
    const prof = PROFILES[L.p](rnd, L.sc);
    const segs = L.trees || L.rows || L.cypress ? 720 : 256;
    const geo = new THREE.CylinderGeometry(L.r, L.r, 1, segs, 1, true);
    const pos = geo.attributes.position;
    // Farbe der Schicht: nah = satter/dunkler (Geländefarbe), fern = Richtung Dunst/Himmel
    const near = base.clone().lerp(grass.clone().multiplyScalar(0.6), 0.5);
    const far = fog.clone().lerp(sky, 0.35);
    const top = near.clone().lerp(far, L.haze);
    const bottom = fog.clone().lerp(top, 0.25);
    const snow = new THREE.Color(0xffffff).lerp(far, 0.35);
    const cols = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    let hmax = 1;
    const hs = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      let h = prof(a);
      if (L.trees) h += treeline(a, L.trees);
      if (L.cypress && hash1(Math.round(a * 120)) > 0.93) h += 2.5 + 3 * hash1(Math.round(a * 120) + 3); // einzelne Zypressen
      hs[i] = h;
      hmax = Math.max(hmax, h);
    }
    for (let i = 0; i < pos.count; i++) {
      const isTop = pos.getY(i) > 0;
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const h = hs[i];
      if (isTop) {
        pos.setY(i, h);
        c.copy(top);
        if (L.snow && h > hmax * L.snow) c.lerp(snow, Math.min(1, (h - hmax * L.snow) / (hmax * 0.12)) * 0.8);
        if (L.fields) c.multiplyScalar(0.88 + 0.24 * hash1(Math.floor(a * 30)));
        if (L.rows) c.multiplyScalar(Math.round(a * 720 / 6.283) % 2 ? 0.86 : 1.06);
        if (L.trees) c.multiplyScalar(0.92 + 0.12 * hash1(Math.round(a * 400)));
      } else {
        pos.setY(i, -40);
        c.copy(bottom);
      }
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    // Dunst im Tal: Unterkante sitzt knapp unter dem Horizont, darüber Verlauf zur Bergfarbe
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.BackSide }));
    mesh.frustumCulled = false;
    mesh.renderOrder = -9;
    group.add(mesh);
  });
  // Küste: Meer bis zum Horizont
  if (map && map.id === 'kueste') {
    const sea = new THREE.RingGeometry(150, 445, 96, 1).rotateX(-Math.PI / 2).translate(0, 12, 0);
    const sp = sea.attributes.position;
    const cols = new Float32Array(sp.count * 3);
    const deep = new THREE.Color(0x2f78a8), c = new THREE.Color();
    for (let i = 0; i < sp.count; i++) {
      const d = Math.hypot(sp.getX(i), sp.getZ(i));
      c.copy(deep).lerp(fog, smooth(150, 445, d) * 0.85);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    sea.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = new THREE.Mesh(sea, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    m.frustumCulled = false;
    group.add(m);
  }
  return group;
}

// Wolken: Cumulus aus vielen weichen Bällchen mit flacher, grauer Unterseite, dazu flache Schleierwolken
function cloudTexture(seed, kind) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const rnd = lrng(seed);
  if (kind === 'stratus') {
    for (let i = 0; i < 14; i++) {
      const x = 30 + rnd() * 196, y = 50 + rnd() * 30, rx = 40 + rnd() * 60, ry = 6 + rnd() * 10;
      g.save(); g.translate(x, y); g.scale(rx / ry, 1);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, ry);
      grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, ry, 0, 7); g.fill(); g.restore();
    }
  } else {
    const base = 96;
    for (let i = 0; i < 34; i++) {
      const u = rnd();
      const x = 40 + u * 176;
      const dome = Math.sin(u * Math.PI); // in der Mitte höher
      const r = 12 + rnd() * 18 + dome * 10;
      const y = base - r * 0.5 - rnd() * dome * 34;
      const grd = g.createRadialGradient(x - r * 0.2, y - r * 0.3, r * 0.1, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.6, 'rgba(250,250,252,0.85)');
      grd.addColorStop(1, 'rgba(240,242,248,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    // flache Unterseite + Schattierung (oben hell, unten grau)
    g.globalCompositeOperation = 'destination-out';
    const cut = g.createLinearGradient(0, base - 6, 0, base + 10);
    cut.addColorStop(0, 'rgba(0,0,0,0)'); cut.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = cut; g.fillRect(0, base - 6, 256, 40);
    g.globalCompositeOperation = 'source-atop';
    const sh = g.createLinearGradient(0, 20, 0, base);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.55, 'rgba(200,205,215,0.2)'); sh.addColorStop(1, 'rgba(140,148,165,0.6)');
    g.fillStyle = sh; g.fillRect(0, 0, 256, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const CLOUD_TINT = { bikepark: [0xffc2a8, 0.85], canyon: [0xfff0e0, 0.8], weinberg: [0xfff2dc, 0.85], pumptrack: [0x56608a, 0.35] };

export function createClouds(count = 14, seed = 1) {
  const map = MAPS.find((m) => m.seed === seed);
  const [tint, op] = (map && CLOUD_TINT[map.id]) || [0xffffff, 0.9];
  const texs = [cloudTexture(seed, 'c'), cloudTexture(seed + 1, 'c'), cloudTexture(seed + 2, 'c'), cloudTexture(seed + 3, 'stratus')];
  const group = new THREE.Group();
  const rnd = lrng(seed * 7 + 3);
  const n = count + Math.round(count * 0.5);
  for (let i = 0; i < n; i++) {
    const stratus = i >= count;
    const a = rnd() * Math.PI * 2;
    const el = stratus ? 0.2 + rnd() * 0.5 : 0.08 + rnd() * 0.35;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texs[stratus ? 3 : i % 3], color: tint, fog: false, transparent: true, opacity: op * (stratus ? 0.6 + rnd() * 0.3 : 0.75 + rnd() * 0.25), depthWrite: false }));
    const d = 380;
    sp.position.set(Math.cos(a) * d * Math.cos(el), Math.sin(el) * d, Math.sin(a) * d * Math.cos(el));
    const k = (0.55 + el * 1.4) * (0.8 + rnd() * 0.5); // nahe am Horizont kleiner (weiter weg)
    sp.scale.set((stratus ? 260 : 150) * k, (stratus ? 50 : 75) * k, 1);
    sp.material.rotation = (rnd() - 0.5) * 0.06;
    sp.renderOrder = -8;
    group.add(sp);
  }
  return group;
}

// Sternenhimmel (Nacht-Strecken)
export function createStars(seed = 1, count = 500) {
  let s = seed * 3571;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, el = 0.12 + rnd() * 1.4;
    pos[i * 3] = Math.cos(a) * Math.cos(el) * 430; pos[i * 3 + 1] = Math.sin(el) * 430; pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * 430;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
  pts.frustumCulled = false;
  return pts;
}
