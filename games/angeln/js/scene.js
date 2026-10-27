import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAngler, rodLinePoints } from './angler.js';
import { loadTerrain, heightAt, coverAt, terrainGeometry, treeInstances, buildingMeshes, COVER } from './terrain.js';
import { TERRAIN } from './terrainmeta.js';
import { forest, reeds, tex } from './flora.js';
import { createFloat, createLure, createBoat, dropTexture } from './tackle.js';

// 3D-Angelplatz: echtes Gelände (Höhendaten + OSM-Landnutzung), Foto-Himmel je Tageszeit (HDRI),
// spiegelndes Wasser, Bäume, Gebäude, Steg/Felsen/Boot und der Angler.
// Spielkoordinaten wie in terrain.js: Wasser bei y = 0, Angler am Ursprung, Blick nach +z, +x = links.

const ASSETS = new URL('../assets/', import.meta.url).href;
const TIMES = ['morning', 'noon', 'evening', 'night'];
const LIGHT = {
  morning: { sun: 0xffd2a0, sunI: 2.4, exposure: 0.95, fog: 0xc8ccd0, fogD: 0.00011 },
  noon: { sun: 0xfff6e8, sunI: 3.2, exposure: 0.9, fog: 0xb8cce0, fogD: 0.00008 },
  evening: { sun: 0xffb070, sunI: 2.0, exposure: 0.95, fog: 0xd0c0b0, fogD: 0.0001 },
  night: { sun: 0x9fb8ff, sunI: 0.45, exposure: 0.55, fog: 0x18222e, fogD: 0.00012 },
};

const rgbe = new RGBELoader();
const gltf = new GLTFLoader();
// Laden mit einem zweiten Versuch (langsames WLAN, Service Worker) und klarer Fehlermeldung
function retry(fn, url) {
  return fn().catch(() => fn()).catch(() => { throw new Error('Datei konnte nicht geladen werden: ' + url); });
}
const loadTex = (url) => retry(() => new Promise((res, rej) => new THREE.TextureLoader().load(url, res, undefined, rej)), url);
const loadHdr = (url) => retry(() => new Promise((res, rej) => rgbe.load(url, res, undefined, rej)), url);
const loadGlb = (name) => retry(() => new Promise((res, rej) => gltf.load(ASSETS + 'models/' + name + '.glb', (g) => res(g.scene), undefined, rej)), name);
let skyMeta = null;
const glbCache = {};
const glb = (name) => (glbCache[name] ||= loadGlb(name));

// ---------- Gelände-Material: Splat aus Foto-Texturen nach Landnutzung, Hangneigung und Höhe ----------
function terrainMaterial() {
  const T = (n, srgb = true) => tex(n, { srgb });
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const uniforms = {
    tGrass: { value: T('grass_diff.jpg') }, tMeadow: { value: T('meadow_diff.jpg') }, tForest: { value: T('forest_diff.jpg') },
    tRock: { value: T('rock_diff.jpg') }, tCliff: { value: T('cliff_diff.jpg') }, tSand: { value: T('sand_diff.jpg') },
    tPebble: { value: T('pebbles_diff.jpg') }, tVine: { value: T('vineyard_diff.jpg') }, tFarm: { value: T('farmland_diff.jpg') },
    tMud: { value: T('mud_diff.jpg') }, tSnow: { value: T('snow_diff.jpg') },
    nGrass: { value: T('grass_nor.jpg', false) }, nRock: { value: T('rock_nor.jpg', false) },
  };
  if (location.search.includes('tdbg')) m.defines = { TERRAIN_DEBUG: 1 }; // Landnutzung als Farben anzeigen
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aCover; attribute vec4 aCover2;
        varying vec4 vCover; varying vec4 vCover2; varying vec3 vWPos; varying vec3 vWNor;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vCover = aCover; vCover2 = aCover2;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNor = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass, tMeadow, tForest, tRock, tCliff, tSand, tPebble, tVine, tFarm, tMud, tSnow, nGrass, nRock;
        varying vec4 vCover; varying vec4 vCover2; varying vec3 vWPos; varying vec3 vWNor;
        // Zwei Maßstäbe mischen gegen sichtbare Kachelung; mit Entfernung gröber
        vec3 tri(sampler2D t, vec2 p, float d) {
          vec3 a = texture2D(t, p * 0.25).rgb;
          vec3 b = texture2D(t, p * 0.031 + 0.37).rgb;
          vec3 avg = texture2D(t, vec2(0.5), 14.0).rgb; // kleinste Mipmap = Durchschnittsfarbe, gegen Moiré in der Ferne
          return mix(mix(a, b, smoothstep(30.0, 160.0, d) * 0.85 + 0.15), avg, smoothstep(250.0, 1500.0, d));
        }
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `
        float dist = length(vWPos - cameraPosition);
        vec2 P = vWPos.xz;
        float slope = 1.0 - clamp(vWNor.y, 0.0, 1.0);
        float macro = vnoise(P * 0.004) * 0.6 + vnoise(P * 0.02) * 0.4;
        float wForest = vCover.x, wRock = vCover.y, wSand = vCover.z, wVine = vCover.w;
        float wTown = vCover2.x, wFarm = vCover2.y, wWet = vCover2.z, wMeadow = vCover2.w;
        // steile Hänge werden Fels, Uferlinie Kies, hohe Lagen Schnee
        float steep = smoothstep(0.38, 0.62, slope);
        wRock = max(wRock, steep);
        float shore = 1.0 - smoothstep(0.4, 2.2, vWPos.y);
        float under = 1.0 - smoothstep(-0.6, -0.05, vWPos.y);
        // Wiese grüner tönen; Wald aus der Ferne = dunkles Kronendach statt Waldboden
        vec3 grass = mix(tri(tGrass, P, dist), tri(tMeadow, P, dist) * vec3(0.8, 0.95, 0.6), macro * 0.7);
        grass *= mix(vec3(1.0), vec3(0.7, 0.92, 0.55), smoothstep(60.0, 600.0, dist));
        vec3 canopy = vec3(0.075, 0.11, 0.05) * (0.75 + macro * 0.6 + vnoise(P * 0.15) * 0.3);
        vec3 forestCol = mix(tri(tForest, P, dist) * 0.8, canopy, smoothstep(25.0, 120.0, dist));
        vec3 col = grass * (wMeadow + 0.15);
        col += forestCol * wForest;
        col += tri(tVine, P, dist) * wVine;
        col += tri(tFarm, P, dist) * wFarm;
        col += tri(tMud, P, dist) * wWet;
        col += mix(tri(tPebble, P, dist), vec3(0.55, 0.53, 0.5), 0.3) * wTown;
        col += tri(tSand, P, dist) * wSand;
        float wsum = wMeadow + 0.15 + wForest + wVine + wFarm + wWet + wTown + wSand;
        col /= max(wsum, 0.001);
        vec2 rp = abs(vWNor.x) > abs(vWNor.z) ? vWPos.zy : vWPos.xy;
        vec3 rock = mix(tri(tRock, rp, dist), tri(tCliff, P, dist), 0.35 + macro * 0.3);
        col = mix(col, rock, clamp(wRock, 0.0, 1.0));
        col = mix(col, tri(tPebble, P * 1.5, dist), shore * (1.0 - wSand * 0.5) * 0.85);
        float snow = smoothstep(1650.0, 1900.0, vWPos.y + macro * 150.0) * (1.0 - steep * 0.6);
        col = mix(col, tri(tSnow, P, dist) * 1.1, snow);
        col *= 0.82 + macro * 0.3;
        col = mix(col, col * vec3(0.7, 0.75, 0.7), under);
        diffuseColor.rgb *= col;
        #ifdef TERRAIN_DEBUG
          diffuseColor.rgb = vec3(wForest + wVine, wRock, wMeadow + wFarm * 0.5) + vec3(wTown);
        #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float nd = 1.0 - smoothstep(10.0, 60.0, length(vWPos - cameraPosition));
          if (nd > 0.0) {
            float st = smoothstep(0.38, 0.62, 1.0 - clamp(vWNor.y, 0.0, 1.0));
            vec3 dn = mix(texture2D(nGrass, vWPos.xz * 0.25).xyz, texture2D(nRock, vWPos.xz * 0.25).xyz, st) * 2.0 - 1.0;
            normal = normalize(normal + (viewMatrix * vec4(dn.x, 0.0, dn.y, 0.0)).xyz * 0.6 * nd);
          }
        }`);
  };
  return m;
}

// Billiges Wasser (Grafik „niedrig“ und Garage): spiegelt nur den Himmel (Umgebungs-Map), Normalmap wandert
function cheapWater(color, normals, repeat = 40) {
  normals.repeat.set(repeat, repeat);
  return new THREE.MeshStandardMaterial({ color, roughness: 0.06, metalness: 0, normalMap: normals, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.3 });
}

export class FishingScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 30000);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.t = 0;
    this.quality = 'high';
  }

  async loadSky(timeIdx) {
    if (!skyMeta) skyMeta = await fetch(ASSETS + 'sky/sky.json').then((r) => r.json());
    const key = TIMES[timeIdx] || 'noon';
    const [bg, hdr] = await Promise.all([loadTex(ASSETS + `sky/${key}.jpg`), loadHdr(ASSETS + `sky/${key}.hdr`)]);
    bg.mapping = THREE.EquirectangularReflectionMapping;
    bg.colorSpace = THREE.SRGBColorSpace;
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const env = this.pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    const m = skyMeta[key];
    // Equirect wie three.js: u = atan(z, x) / 2π + 0.5, v (Bild von oben) = 0.5 − Höhe/π
    const az = (m.u - 0.5) * Math.PI * 2;
    const el = Math.max(0.12, (0.5 - m.v) * Math.PI);
    return { key, bg, env, sunDir: new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize() };
  }

  // Baut den Platz (async: Texturen, Gelände, Modelle laden). progress(text) für die Ladeanzeige.
  async build(water, spot, look, rodId, timeIdx, progress = () => {}) {
    this.dispose();
    const s = this.scene;
    const sc = water.scene;
    const river = water.kind === 'fluss';
    this.sc = sc;
    this.boatMode = !!spot.boat;
    this.flow = river ? sc.flow : 0;
    this.riverWidth = 0;
    this.night = timeIdx === 3;

    progress('Himmel …');
    const sky = await this.loadSky(timeIdx);
    const L = LIGHT[sky.key];
    s.background = sky.bg;
    s.backgroundIntensity = this.night ? 0.55 : 1;
    s.environment = sky.env;
    this.renderer.toneMappingExposure = L.exposure;
    s.fog = new THREE.FogExp2(L.fog, L.fogD);
    this.sunDir = sky.sunDir;

    s.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a5a3a, this.night ? 0.12 : 0.35));
    const sun = new THREE.DirectionalLight(L.sun, L.sunI);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 220 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    s.add(sun, sun.target);
    this.sun = sun;

    // ---- Gelände ----
    progress('Gelände …');
    this.terrain = null;
    if (TERRAIN[spot.id]) {
      try { this.terrain = await loadTerrain(spot.id, ASSETS + 'terrain/'); } catch (e) { console.warn('Gelände fehlt', e); }
    }
    if (this.terrain) {
      const t = this.terrain;
      const tmat = terrainMaterial();
      const near = new THREE.Mesh(terrainGeometry(t.near), tmat);
      near.receiveShadow = true;
      const far = new THREE.Mesh(terrainGeometry(t.far, { holeSize: t.near.size * 0.98, sink: 4 }), tmat);
      s.add(near, far);
      if (river) this.riverWidth = this.measureRiver();
    } else if (!spot.boat) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), new THREE.MeshStandardMaterial({ color: 0x6a8a4a }));
      g.rotation.x = -Math.PI / 2; g.position.set(0, 0.5, -100); s.add(g);
    }

    // ---- Wasser ----
    progress('Wasser …');
    const normals = await loadTex(ASSETS + 'textures/waternormals.jpg');
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    const wGeo = new THREE.PlaneGeometry(40000, 40000);
    const waterColor = new THREE.Color(sc.deep).multiplyScalar(0.7);
    if (this.quality === 'low') {
      this.water = new THREE.Mesh(wGeo, cheapWater(waterColor, normals, 2000));
    } else {
      this.water = new Water(wGeo, {
        textureWidth: this.quality === 'high' ? 1024 : 512, textureHeight: this.quality === 'high' ? 1024 : 512,
        waterNormals: normals, sunDirection: sky.sunDir.clone(), sunColor: L.sun, waterColor,
        distortionScale: sc.waves ? 3.2 : river ? 1.6 : 2.2, fog: true,
      });
      this.water.material.uniforms.size.value = river ? 3 : 2.2;
    }
    this.water.rotation.x = -Math.PI / 2;
    s.add(this.water);

    // ---- Pflanzen und Orte ----
    progress('Bäume …');
    this.addVegetation(water);
    if (this.terrain) {
      const pal = water.id === 'gaula' ? { walls: [0x9a2a1a, 0xe8e0d0, 0xc8a040, 0x5a6a7a], roofs: [0x3a3a3a, 0x2a3a2a] } : {};
      s.add(buildingMeshes(this.terrain, pal));
    }

    // ---- Standplatz: Ufer (Steg/Felsen) oder Boot ----
    progress('Angler …');
    this.base = new THREE.Vector3(0, 0, 0);
    this.angler = createAngler(look, rodId, { lifeJacket: !!spot.boat });
    if (spot.boat) {
      this.boat = createBoat();
      s.add(this.boat);
      this.boat.add(this.angler);
      this.angler.position.set(0, this.boat.userData.deckY, 0.4);
      this.base.set(0, 0, 0.4);
    } else {
      this.boat = null;
      await this.addShoreProps(sc);
      this.angler.position.copy(this.base);
      s.add(this.angler);
    }

    // ---- Schnur, Pose, Köder, Zielkreis, Spritzer, Ringe ----
    this.lineGeo = new THREE.BufferGeometry();
    this.linePts = new Float32Array(3 * 64);
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePts, 3));
    this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({ color: this.night ? 0xe8f0a0 : 0xf2f0dc, transparent: true, opacity: 0.75 }));
    this.line.frustumCulled = false;
    s.add(this.line);
    this.float = createFloat(this.night);
    this.float.scale.setScalar(2.5); // auf Entfernung sichtbar halten
    this.float.visible = false;
    s.add(this.float);
    this.lure = new THREE.Group();
    this.lure.visible = false;
    s.add(this.lure);
    this.aim = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 48), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    this.aim.rotation.x = -Math.PI / 2;
    this.aim.renderOrder = 2;
    s.add(this.aim);
    this.shadowFish = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0x041018, transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadowFish.rotation.x = -Math.PI / 2;
    this.shadowFish.visible = false;
    s.add(this.shadowFish);
    const N = 160;
    this.splashPos = new Float32Array(N * 3);
    this.splashVel = new Float32Array(N * 3);
    this.splashLife = new Float32Array(N);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.splashPos, 3));
    this.splash = new THREE.Points(pg, new THREE.PointsMaterial({ map: dropTexture(), size: 0.09, transparent: true, depthWrite: false, color: 0xeef6ff }));
    this.splash.frustumCulled = false;
    s.add(this.splash);
    this.rings = [];
    for (let i = 0; i < 8; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.visible = false; r.userData.age = 9;
      s.add(r); this.rings.push(r);
    }
    this.ringIdx = 0;
    this._linePts = [];

    this.camMode = 'aim';
    this.camTarget = new THREE.Vector3(0, 0, 25);
    this.camPos = new THREE.Vector3();
    this._look = null;
    this.update(0);
    progress('');
  }

  // Breite des Flusses vor dem Angler (für die Wurfweite)
  measureRiver() {
    let z = 4;
    while (z < 600 && heightAt(this.terrain, 0, z) < 0.05) z += 2;
    return z;
  }

  addVegetation(water) {
    const t = this.terrain;
    if (!t) return;
    const s = this.scene;
    const species = {
      garda: { forest: ['cypress', 'oak'], orchard: 'olive', town: 'cypress' },
      bodensee: { forest: ['oak', 'spruce'], orchard: 'oak', town: 'oak' },
      donau: { forest: ['oak', 'birch'], orchard: 'oak', town: 'oak' },
      ostsee: { forest: ['oak', 'birch'], orchard: 'oak', town: 'birch' },
      po: { forest: ['poplar', 'poplar'], orchard: 'poplar', town: 'poplar' },
      gaula: { forest: ['spruce', 'birch'], orchard: 'birch', town: 'birch' },
    }[water.id] || { forest: ['oak', 'spruce'], orchard: 'oak', town: 'oak' };
    const q = this.quality === 'low' ? 0.4 : this.quality === 'mid' ? 0.7 : 1;
    const ft = treeInstances(t, 'forest', Math.round(2600 * q));
    s.add(forest(species.forest[0], ft.filter((_, i) => i % 3 !== 0)), forest(species.forest[1], ft.filter((_, i) => i % 3 === 0)));
    s.add(forest(species.orchard, treeInstances(t, 'orchard', Math.round(600 * q))));
    s.add(forest(species.town, treeInstances(t, 'town', Math.round(400 * q))));
    s.add(forest('vine', treeInstances(t, 'vineyard', Math.round(2500 * q), { far: false })));
    // Schilf entlang des Ufers (Feuchtgebiet/Wiese, flaches Wasser)
    const list = [];
    for (let x = -150; x <= 150; x += 2.2) {
      for (let z = -40; z <= 160; z += 2.2) {
        if (Math.hypot(x, z) < 8) continue;
        const h = heightAt(t, x, z);
        const c = coverAt(t, x, z);
        if (h > -0.6 && h < 0.35 && (c.cover === COVER.WETLAND || c.cover === COVER.MEADOW) && Math.sin(x * 12.9 + z * 78.2) > 0.1) {
          list.push({ x: x + Math.sin(z * 3.1), y: Math.max(h, -0.5), z: z + Math.cos(x * 2.3), s: 0.8 + Math.abs(Math.sin(x * 7 + z * 3)) * 0.4, rot: x * 3 + z });
        }
      }
    }
    this.reeds = reeds(list);
    s.add(this.reeds);
  }

  async addShoreProps(sc) {
    const s = this.scene;
    const t = this.terrain;
    const h0 = t ? heightAt(t, 0, 0) : 0.8;
    // Holzsteg an flachen Schilf-/Sandufern, sonst Uferfelsen
    // Kein festes Land unter dem Standplatz (Gelände fehlt / Uferlinie ungenau)? Dann immer auf einen Steg stellen.
    const dry = t && h0 > 0.25 && heightAt(t, 0, -3) > 0.25;
    if (sc.shore === 'meadow' || sc.shore === 'sand' || !dry) {
      const pier = (await glb('modular_wooden_pier')).clone(true);
      pier.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const box = new THREE.Box3().setFromObject(pier);
      const deckY = 1.0;
      pier.position.set(-(box.min.x + box.max.x) / 2, deckY - box.max.y + 0.05, -box.min.z - 4);
      s.add(pier);
      this.pier = pier;
      this.base.set(0, deckY, 9);
    } else {
      this.base.set(0, Math.max(0.4, h0), 0);
      const rocks = await glb('rock_moss_set_01');
      const parts = [];
      rocks.traverse((o) => { if (o.isMesh) parts.push(o); });
      const r = (i) => Math.abs(Math.sin(i * 91.7));
      for (let i = 0; i < 24; i++) {
        const x = (r(i) - 0.5) * 36;
        const z = 0.8 + r(i + 7) * 6;
        if (Math.abs(x) < 1.4 && z < 3) continue;
        const p = parts[i % parts.length].clone();
        p.scale.setScalar(0.25 + r(i + 3) * 0.35);
        p.position.set(x, Math.max(t ? heightAt(t, x, z) : 0, -0.6) - 0.1, z);
        p.rotation.set(r(i + 1) * 0.4, r(i + 2) * 6, 0);
        p.castShadow = true; p.receiveShadow = true;
        s.add(p);
      }
    }
    const [bucket, stool] = await Promise.all([glb('wooden_bucket_01'), glb('folding_wooden_stool')]);
    const b = bucket.clone(true); b.position.set(this.base.x + 0.8, this.base.y, this.base.z - 0.5); b.rotation.y = 0.4;
    const st = stool.clone(true); st.position.set(this.base.x - 0.9, this.base.y, this.base.z - 0.9); st.rotation.y = 2.4;
    for (const o of [b, st]) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); s.add(o); }
    if (this.night) {
      const lantern = (await glb('Lantern_01')).clone(true);
      lantern.position.set(this.base.x + 0.6, this.base.y, this.base.z - 1.0);
      const l = new THREE.PointLight(0xffb060, 3, 9, 2);
      l.position.set(this.base.x + 0.6, this.base.y + 0.3, this.base.z - 1.0);
      s.add(lantern, l);
    }
  }

  ripple(x, z, strength = 1) {
    const r = this.rings[this.ringIdx++ % this.rings.length];
    r.position.set(x, 0.03, z);
    r.userData.age = 0;
    r.userData.strength = strength;
    r.visible = true;
  }

  splashAt(x, z, n = 30, power = 1) {
    let k = 0;
    for (let i = 0; i < this.splashLife.length && k < n; i++) {
      if (this.splashLife[i] > 0) continue;
      this.splashLife[i] = 0.5 + Math.random() * 0.6;
      this.splashPos.set([x + (Math.random() - 0.5) * 0.2, 0.05, z + (Math.random() - 0.5) * 0.2], i * 3);
      const a = Math.random() * Math.PI * 2;
      const sp = (0.4 + Math.random() * 1.2) * power;
      this.splashVel.set([Math.cos(a) * sp, (1.5 + Math.random() * 2.5) * power, Math.sin(a) * sp], i * 3);
      k++;
    }
    this.ripple(x, z, power);
  }

  tipWorld(v = new THREE.Vector3()) {
    this.angler.userData.tip.getWorldPosition(v);
    return v;
  }

  // Schnur: Spule -> Ringe -> Spitze -> Endpunkt (mit Durchhang)
  setLine(end, sag = 0.3, visible = true) {
    this.line.visible = visible && this.angler.userData.rod.visible;
    if (!this.line.visible) return;
    const guide = rodLinePoints(this.angler.userData.rod, this._linePts);
    let n = 0;
    for (const p of guide) this.linePts.set([p.x, p.y, p.z], 3 * n++);
    const a = guide[guide.length - 1];
    const rest = 64 - n;
    const d = Math.hypot(end.x - a.x, end.z - a.z);
    for (let i = 1; i <= rest; i++) {
      const u = i / rest;
      let y = a.y + (end.y - a.y) * u - Math.sin(u * Math.PI) * sag * Math.min(5, d * 0.08);
      if (end.y <= 0.05) y = Math.max(y, Math.min(0.02, end.y));
      this.linePts.set([a.x + (end.x - a.x) * u, y, a.z + (end.z - a.z) * u], 3 * n++);
    }
    this.lineGeo.attributes.position.needsUpdate = true;
  }

  setLure(bait) {
    this.lure.clear();
    const m = createLure(bait);
    m.scale.setScalar(1.6);
    this.lure.add(m);
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const wm = this.water.material;
    if (wm.uniforms?.time) wm.uniforms.time.value += dt * (this.flow ? 0.6 + this.flow * 0.4 : 0.55);
    else if (wm.normalMap) { wm.normalMap.offset.x += dt * 0.004; wm.normalMap.offset.y += dt * (0.003 + this.flow * 0.01); }
    if (this.boat) {
      const w = this.sc.waves || 1;
      this.boat.rotation.z = Math.sin(t * 0.9) * 0.02 * w;
      this.boat.rotation.x = Math.sin(t * 0.7 + 1) * 0.015 * w;
      this.boat.position.y = Math.sin(t * 1.1) * 0.04 * w;
    }
    for (let i = 0; i < this.splashLife.length; i++) {
      if (this.splashLife[i] <= 0) { this.splashPos[i * 3 + 1] = -50; continue; }
      this.splashLife[i] -= dt;
      this.splashVel[i * 3 + 1] -= 9.8 * dt;
      for (let k = 0; k < 3; k++) this.splashPos[i * 3 + k] += this.splashVel[i * 3 + k] * dt;
    }
    this.splash.geometry.attributes.position.needsUpdate = true;
    for (const r of this.rings) {
      if (!r.visible) continue;
      r.userData.age += dt;
      const a = r.userData.age;
      r.scale.setScalar(0.15 + a * 1.4 * (0.6 + r.userData.strength * 0.5));
      r.material.opacity = Math.max(0, 0.45 * (1 - a / 2.2)) * Math.min(1, r.userData.strength + 0.3);
      if (a > 2.2) r.visible = false;
    }
    this.angler.userData.update(dt);

    // Schatten-Kamera folgt dem Angler
    const base = this.anglerWorld();
    this.sun.target.position.copy(base);
    this.sun.position.copy(base).addScaledVector(this.sunDir, 80);

    // Kamera: über die Schulter (hinten links), Fangfoto von vorn
    const yaw = this.angler.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
    let want;
    let look;
    if (this.camMode === 'catch') {
      want = base.clone().addScaledVector(fwd, 2.4).addScaledVector(left, -0.5).add(new THREE.Vector3(0, 1.45, 0));
      look = base.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(fwd, 0.3);
    } else {
      const back = this.camMode === 'fight' ? 3.0 : 3.4;
      want = base.clone().addScaledVector(fwd, -back).addScaledVector(left, 1.5).add(new THREE.Vector3(0, 2.5, 0));
      look = this.camTarget.clone().setY(Math.min(0, this.camTarget.y)).lerp(base.clone().add(new THREE.Vector3(0, 1, 0)), 0.35);
    }
    const cut = this.camMode !== this._lastMode && (this.camMode === 'catch' || this._lastMode === 'catch');
    this._lastMode = this.camMode;
    if (!this._look || cut) { this._look = look.clone(); this.camPos.copy(want); }
    this.camPos.lerp(want, 1 - Math.exp(-dt * 3));
    this._look.lerp(look, 1 - Math.exp(-dt * 4));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this._look);
  }

  anglerWorld(v = new THREE.Vector3()) {
    return this.angler.getWorldPosition(v);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      else if (o.geometry && !o.isSkinnedMesh) o.geometry.dispose();
    });
    if (this.scene.environment) this.scene.environment.dispose();
    this.scene.clear();
    this.scene.environment = null;
    this._look = null;
  }
}

// Garage-Schaufenster: Angler auf einem Holzsteg vor Himmelsfoto
export class Showcase {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x24324f);
    this.camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 2000);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.spin = 0;
    this.mode = 'angler';
    this.ready = this.init();
  }

  async init() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const [hdr, bg] = await Promise.all([loadHdr(ASSETS + 'sky/evening.hdr'), loadTex(ASSETS + 'sky/evening.jpg')]);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.environment = pm.fromEquirectangular(hdr).texture;
    bg.mapping = THREE.EquirectangularReflectionMapping;
    bg.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = bg;
    this.scene.backgroundBlurriness = 0.1;
    const key = new THREE.DirectionalLight(0xffe2c0, 2.4);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
    this.scene.add(key, new THREE.HemisphereLight(0xcfe0ff, 0x3a4a3a, 0.4));
    const planks = new THREE.MeshStandardMaterial({ map: tex('planks_diff.jpg', { repeat: 2 }), normalMap: tex('planks_nor.jpg', { srgb: false, repeat: 2 }), roughness: 0.85 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 6), planks);
    deck.position.y = -0.05;
    deck.receiveShadow = true;
    this.scene.add(deck);
    const normals = await loadTex(ASSETS + 'textures/waternormals.jpg');
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), cheapWater(0x0e3a4a, normals, 40));
    w.rotation.x = -Math.PI / 2;
    w.position.y = -0.6;
    this.scene.add(w);
    this.water = w;
  }

  setObject(obj, mode = 'angler') {
    this.holder.clear();
    this.holder.add(obj);
    this.mode = mode;
  }

  update(dt) {
    this.spin += dt * 0.4;
    const a = this.holder.children[0];
    if (a?.userData.update) a.userData.update(dt);
    this.holder.rotation.y = this.mode === 'angler' ? 0.5 + Math.sin(this.spin) * 0.5 : this.spin;
    if (this.water) this.water.material.normalMap.offset.x += dt * 0.01;
    const wide = innerWidth / innerHeight > 1.2;
    this.camera.position.set(wide ? 1.1 : 0, 1.35, 5.4);
    this.camera.lookAt(wide ? 1.1 : 0, 1.05, 0);
  }

  render() { this.renderer.render(this.scene, this.camera); }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
}
