import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAngler, rodLinePoints } from './angler.js';
import { loadTerrain, heightAt, coverAt, terrainGeometry, treeInstances, buildingMeshes, COVER } from './terrain.js';
import { TERRAIN } from './terrainmeta.js';
import { forest, reeds, tex } from './flora.js';
import { createFloat, createLure, createBoat, createNet, dropTexture } from './tackle.js';

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
        float steep = smoothstep(0.55, 0.8, slope);
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
        float rl = dot(rock, vec3(0.3, 0.55, 0.15));
        rock = mix(rock, vec3(rl) * vec3(0.95, 0.95, 0.98), 0.75); // grauer Kalkstein statt Sand
        // Felsflächen mit Bewuchs (Büsche) – in der Ferne grün gesprenkelt
        rock = mix(rock, canopy * 1.3, smoothstep(0.45, 0.75, vnoise(P * 0.03)) * (1.0 - steep) * 0.7);
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
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.05, 30000);
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

    if (spot.id === 'sundbruecke' || spot.id === 'staberhuk' || spot.id === 'burgtiefe') this.addBridge(spot);

    // ---- Standplatz: Ufer (Steg/Felsen) oder Boot ----
    progress('Angler …');
    this.base = new THREE.Vector3(0, 0, 0);
    this.ledgeBox = null;
    this.moored = null;
    this.pier = null;
    this.angler = createAngler(look, rodId, { lifeJacket: !!spot.boat });
    if (spot.boat) {
      this.boat = createBoat();
      s.add(this.boat);
      this.boat.add(this.angler);
      this.angler.position.set(0, this.boat.userData.deckY, 0.4);
      this.base.set(0, 0, 0.4);
    } else {
      this.boat = null;
      await this.addShoreProps(sc, spot);
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
    this.aim = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 48), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, fog: false }));
    this.aim.rotation.x = -Math.PI / 2;
    this.aim.renderOrder = 5; // immer sichtbar (auch über spiegelndem Wasser)
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
    this.net = createNet();
    this.net.visible = false;
    s.add(this.net);

    this.camMode = 'aim';
    this.camTarget = new THREE.Vector3(0, 0, 25);
    this.camPos = new THREE.Vector3();
    this._look = null;
    this.update(0);
    progress('');
  }

  // Höhe genau so, wie das Dreiecksnetz sie zeichnet (Diagonale wie in terrainGeometry: a, a+n, a+1 / a+1, a+n, a+n+1)
  meshHeight(x, z) {
    const g = this.terrain.near;
    const fx = (x + g.size / 2) / g.cell;
    const fz = (z + g.size / 2) / g.cell;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const H = (ii, jj) => g.h[jj * g.n + ii];
    if (u + v <= 1) return H(i, j) + (H(i + 1, j) - H(i, j)) * u + (H(i, j + 1) - H(i, j)) * v;
    return H(i + 1, j + 1) + (H(i, j + 1) - H(i + 1, j + 1)) * (1 - u) + (H(i + 1, j) - H(i + 1, j + 1)) * (1 - v);
  }

  // Bodenhöhe (relativ zum Wasserspiegel); unter 0 = Wasser. Steg/Boot stehen über tiefem Wasser.
  groundAt(x, z) {
    if (this.moored) for (const b of this.moored) if (Math.abs(x - b.position.x) < 2.6 && Math.abs(z - b.position.z) < 1.2) return 0.5; // Boote im Hafen
    if (this.pier && Math.abs(x) < 1.3 && z > this.pier.from && z < this.pier.to) return 0.5;
    if (this.ledgeBox && Math.abs(x) < 1.7 && z > this.ledgeBox[0] && z < this.ledgeBox[1]) return this.base.y;
    if (this.terrain) return heightAt(this.terrain, x, z);
    if (this.boat) return -10;
    return z < (this.pier ? this.pier.from : 0) ? 0.5 : -3;
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

  async addShoreProps(sc, spot) {
    const s = this.scene;
    const t = this.terrain;
    const h0 = t ? heightAt(t, 0, 0) : 0.8;
    if (spot.harbour) return this.addHarbour();
    // Holzsteg an flachen Schilf-/Sandufern, sonst Uferfelsen
    // Kein festes Land unter dem Standplatz (Gelände fehlt / Uferlinie ungenau)? Dann immer auf einen Steg stellen.
    const dry = t && h0 > 0.25 && heightAt(t, 0, -3) > 0.25;
    if (sc.shore === 'meadow' || sc.shore === 'sand' || !dry) {
      // Holzsteg vom Ufer ins Wasser; Angler steht am Ende
      let land = 0;
      if (t) while (land > -30 && heightAt(t, 0, land) < 0.3) land -= 1; // Steg beginnt auf festem Boden
      const len = 12 - land;
      const deckY = 1.0;
      s.add(this.jetty(land, len, deckY));
      this.pier = { from: land, to: land + len };
      this.base.set(0, deckY, land + len - 1.2);
    } else {
      // bis an die Uferkante vorgehen (ca. 1 m vor dem Wasser), damit Kescher und Fisch zusammenpassen
      let z = 0;
      while (z < 15 && this.meshHeight(0, z + 1.2) > 0.3) z += 0.2;
      // Uferfels als Standplatte: oben flach auf Standhöhe, reicht nach hinten ins Gelände und vorn ins Wasser
      const top = Math.max(0.5, this.meshHeight(0, z), this.meshHeight(0, z - 1.5) + 0.1);
      this.base.set(0, top, z);
      s.add(this.ledge(top, z));
      this.ledgeBox = [z - 3, z + 1.3];
      const rocks = await glb('rock_moss_set_01');
      const parts = [];
      rocks.traverse((o) => { if (o.isMesh) parts.push(o); });
      const r = (i) => Math.abs(Math.sin(i * 91.7));
      for (let i = 0; i < 24; i++) {
        const x = (r(i) - 0.5) * 36;
        const z = this.base.z - 2 + r(i + 7) * 6;
        if (Math.abs(x) < 1.6 && Math.abs(z - this.base.z) < 2.5) continue;
        const hy = t ? heightAt(t, x, z) : 0;
        if (hy < 0.15) continue; // keine Felsen ins Wasser, damit der Fisch nicht hindurchschwimmt
        const p = parts[i % parts.length].clone();
        p.scale.setScalar(0.25 + r(i + 3) * 0.35);
        p.position.set(x, hy - 0.1, z);
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

  // echte Koordinate -> Spielkoordinate (Ursprung = Platz, +z = Blickrichtung, +x = links)
  toGame(spot, lat, lon) {
    const h = TERRAIN[spot.id]?.heading ?? 0;
    const dn = (lat - spot.lat) * 111320;
    const de = (lon - spot.lon) * 111320 * Math.cos((spot.lat * Math.PI) / 180);
    const right = de * Math.cos(h) - dn * Math.sin(h);
    return new THREE.Vector3(-right, 0, de * Math.sin(h) + dn * Math.cos(h));
  }

  // Fehmarnsundbrücke: Netzwerkbogen („Kleiderbügel“), 963 m lang, Bogen 248 m Spannweite, 45 m hoch
  addBridge(spot) {
    const a = this.toGame(spot, 54.3953, 11.1123); // Großenbroder Fähre
    const b = this.toGame(spot, 54.4071, 11.1226); // Fehmarn
    const g = new THREE.Group();
    const L = a.distanceTo(b);
    const steel = new THREE.MeshStandardMaterial({ color: 0xc8452a, roughness: 0.5, metalness: 0.3 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0xb8b6ae, roughness: 0.85 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(21, 2.5, L), concrete);
    deck.position.y = 23; g.add(deck);
    for (let z = -L / 2 + 30; z < L / 2 - 20; z += 60) {
      if (Math.abs(z) < 130) continue;
      const p = new THREE.Mesh(new THREE.BoxGeometry(6, 23, 4), concrete); p.position.set(0, 11.5, z); g.add(p);
    }
    const pts = [];
    for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push(new THREE.Vector3(0, 24 + Math.sin(u * Math.PI) * 45, -124 + u * 248)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    for (const x of [-9, 9]) { const arch = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 1.3, 8), steel); arch.position.x = x; g.add(arch); }
    // Hänger (Netzwerk) und Querriegel oben
    const hp = [];
    for (let i = 1; i < 40; i++) {
      const top = curve.getPoint(i / 40);
      for (const x of [-9, 9]) { hp.push(x, top.y, top.z, x, 24.5, top.z + (i % 2 ? 16 : -16)); }
    }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    g.add(new THREE.LineSegments(hg, new THREE.LineBasicMaterial({ color: 0xc8452a })));
    for (let i = 4; i < 37; i += 4) { const p = curve.getPoint(i / 40); const r = new THREE.Mesh(new THREE.BoxGeometry(18, 0.8, 0.8), steel); r.position.set(0, p.y, p.z); g.add(r); }
    g.position.copy(a).lerp(b, 0.5);
    g.lookAt(b.x, 0, b.z);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.scene.add(g);
  }

  // Holzsteg: Bohlen mit kleinen Fugen, Pfähle bis in den Grund, Querbalken
  jetty(z0, len, deckY) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: tex('planks_diff.jpg'), normalMap: tex('planks_nor.jpg', { srgb: false }), roughness: 0.85, color: 0xc8b8a0 });
    const dark = new THREE.MeshStandardMaterial({ map: tex('bark_diff.jpg'), color: 0x6a5a48, roughness: 0.9 });
    const W = 2.2;
    const planks = Math.floor(len / 0.32);
    const pg = new THREE.BoxGeometry(W, 0.06, 0.29);
    const deck = new THREE.InstancedMesh(pg, wood, planks);
    const m = new THREE.Matrix4();
    for (let i = 0; i < planks; i++) {
      m.makeRotationY((Math.sin(i * 7.1) * 0.01));
      m.setPosition(Math.sin(i * 3.3) * 0.03, deckY - 0.03 + Math.sin(i * 5.7) * 0.008, z0 + 0.16 + i * 0.32);
      deck.setMatrixAt(i, m);
    }
    deck.castShadow = true; deck.receiveShadow = true;
    g.add(deck);
    for (const x of [-W / 2 + 0.15, W / 2 - 0.15]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, len), dark);
      beam.position.set(x, deckY - 0.15, z0 + len / 2); g.add(beam);
    }
    for (let z = z0 + 0.3; z < z0 + len; z += 2.4) {
      for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) {
        const ground = this.terrain ? Math.min(heightAt(this.terrain, x, z), 0) : -2;
        const h = deckY - ground + 0.6;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, h, 10), dark);
        post.position.set(x, deckY - h / 2 + 0.05, z); post.castShadow = true; g.add(post);
      }
    }
    return g;
  }

  // Felsplatte unter dem Angler (unregelmäßiger Block mit Felstextur)
  ledge(top, z) {
    const g = new THREE.BoxGeometry(3.2, 3, 4.2, 10, 3, 12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const zz = p.getZ(i);
      const n = Math.sin(x * 3.1 + zz * 1.7) * 0.12 + Math.sin(x * 7.3 - zz * 5.1) * 0.05;
      if (y > 1.4) p.setY(i, 1.5 + (Math.abs(x) > 1.2 || Math.abs(zz) > 1.8 ? n - 0.12 : n * 0.25)); // Oberseite fast flach
      else { p.setX(i, x * (1 + n)); p.setZ(i, zz * (1 + n)); }
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      map: tex('rock_diff.jpg', { repeat: 2 }), normalMap: tex('rock_nor.jpg', { srgb: false, repeat: 2 }), color: 0xc8c0b0, roughness: 0.92,
    }));
    m.position.set(0, top - 1.5, z - 0.9);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // Hafen: Kaimauer aus Naturstein mit Pflaster, Poller, festgemachte Boote, Laternen
  async addHarbour() {
    const s = this.scene;
    const t = this.terrain;
    // Kaikante dort, wo vor dem Angler das Wasser beginnt
    let edge = 0;
    if (t) while (edge < 20 && heightAt(t, 0, edge + 0.5) > 0) edge += 0.25;
    const top = 1.25;
    const stone = new THREE.MeshStandardMaterial({ map: tex('rock_diff.jpg', { repeat: 6 }), normalMap: tex('rock_nor.jpg', { srgb: false, repeat: 6 }), color: 0xd8ccb4, roughness: 0.9 });
    const paving = new THREE.MeshStandardMaterial({ map: tex('pebbles_diff.jpg', { repeat: 10 }), color: 0xbfb5a2, roughness: 0.95 });
    const quay = new THREE.Mesh(new THREE.BoxGeometry(60, top + 4, 14), [stone, stone, paving, stone, stone, stone]);
    quay.position.set(0, (top - 4) / 2, edge - 7);
    quay.receiveShadow = true; quay.castShadow = true;
    s.add(quay);
    // Kantensteine
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(60, 0.18, 0.5), new THREE.MeshStandardMaterial({ map: tex('rock_diff.jpg', { repeat: 3 }), color: 0xe8e0d0, roughness: 0.8 }));
    kerb.position.set(0, top + 0.05, edge - 0.25); kerb.castShadow = true; kerb.receiveShadow = true;
    s.add(kerb);
    // Poller
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.6 });
    for (const x of [-12, -5, 6, 13]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.45, 12), iron);
      b.position.set(x, top + 0.3, edge - 0.6); b.castShadow = true; s.add(b);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), iron);
      cap.position.set(x, top + 0.55, edge - 0.6); cap.scale.y = 0.6; s.add(cap);
    }
    // festgemachte Boote (bunt, wie die Fischerboote im Hafen von Torri)
    const colors = [0x2a6ad1, 0xd8402a, 0x2a8a5a, 0xe8c23a, 0xf2f2ee];
    const spots = [[-9, 3.2, 0.15], [-15, 3.5, -0.1], [10, 3.0, 0.05], [16, 3.6, -0.15], [-4, 9, 1.4]];
    this.moored = [];
    spots.forEach(([x, dz, rot], i) => {
      const b = createBoat(colors[i % colors.length]);
      b.position.set(x, 0, edge + dz);
      b.rotation.y = Math.PI / 2 + rot;
      s.add(b);
      this.moored.push(b);
    });
    // Laternen auf der Kaimauer
    for (const x of [-18, -7, 12]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 8), iron);
      pole.position.set(x, top + 1.8, edge - 1.0); pole.castShadow = true; s.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffd080, emissiveIntensity: this.night ? 3 : 0.2 }));
      lamp.position.set(x, top + 3.7, edge - 1.0); s.add(lamp);
      if (this.night) { const l = new THREE.PointLight(0xffc070, 4, 16, 2); l.position.copy(lamp.position); s.add(l); }
    }
    this.base.set(0, top, edge - 0.9);
    const bucket = (await glb('wooden_bucket_01')).clone(true);
    bucket.position.set(0.8, top, edge - 1.5);
    bucket.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    s.add(bucket);
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
    if (this.moored) this.moored.forEach((b, i) => { b.position.y = Math.sin(t * 0.9 + i) * 0.03; b.rotation.z = Math.sin(t * 0.7 + i * 2) * 0.02; });
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
      // über die Schulter, Blick flach Richtung Horizont: Wasser unten, Ufer/Berge/Orte oben im Bild
      const back = this.camMode === 'fight' ? 3.2 : 3.8;
      want = base.clone().addScaledVector(fwd, -back).addScaledVector(left, 1.3).add(new THREE.Vector3(0, 2.1, 0));
      const tgt = this.camTarget.clone().setY(0);
      const ahead = base.clone().addScaledVector(fwd, 60).setY(base.y + 4);
      look = tgt.lerp(ahead, this.camMode === 'fight' ? 0.35 : 0.6);
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
