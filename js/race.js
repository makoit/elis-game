import * as THREE from 'three';
import { buildTrack, mulberry32 } from './trackdata.js';
import { BikeSim } from './physics.js';
import { createBike } from './bikes.js';
import { buildTrackMesh, disposeObject } from './trackmesh.js';
import { createSky, createEnvMap, createMountains, createClouds, createStars } from './env.js';
import { createCrowd } from './crowd.js';
import { music } from './music.js';
import { starTimes } from './autopilot.js';
import { AIDriver, PERFECT } from './ai.js';
import { resolveBike, randomConfig } from './bikedata.js';
import { sfx } from './sfx.js';

const BIKE_SCALE = 1.3;
const STEP = 1 / 60;
const AI_NAMES = ['Luca', 'Mia', 'Ben', 'Emma', 'Noah', 'Lina', 'Finn', 'Ella', 'Jonas', 'Nele'];
const envCache = new Map();

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export class Race {
  // opts: renderer, bikeDef, map, input, hud, quality, mode ('solo' | 'vs'), level (AI), onFinish
  constructor(o) {
    Object.assign(this, { renderer: o.renderer, map: o.map, input: o.input, hud: o.hud, onFinish: o.onFinish, quality: o.quality, mode: o.mode });
    const map = o.map;
    const c = map.colors;
    const light = { sun: 0xfff0dd, sunI: 2.0, hemi: 0.9, env: 0.9, dir: [0.5, 0.75, 0.45], ...(map.light || {}) };
    const SUN_DIR = this.sunDir = new THREE.Vector3(...light.dir).normalize();

    this.laps = map.loop ? Math.max(1, o.laps || map.laps?.def || 1) : 1;
    this.track = buildTrack(map, this.laps);
    this.stars = starTimes(map, o.bikeDef, this.laps);
    this.lapTimes = [];
    this.lapStart = 0;

    // ---- Szene ----
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(c.fog, map.fogRange[0], map.fogRange[1]);
    const skyOpts = { top: c.sky, horizon: c.fog, ground: c.grass, sunDir: SUN_DIR };
    if (!envCache.has(map.id)) envCache.set(map.id, createEnvMap(o.renderer, skyOpts));
    this.scene.environment = envCache.get(map.id);
    this.scene.environmentIntensity = light.env;
    this.sky = createSky(skyOpts);
    this.mountains = createMountains(new THREE.Color(c.fog).lerp(new THREE.Color(c.grass), 0.35).getHex(), map.seed);
    this.clouds = createClouds(12, map.seed);
    this.scene.add(this.sky, this.mountains, this.clouds);
    if (map.stars) { this.stars3d = createStars(map.seed); this.scene.add(this.stars3d); }
    this.scene.add(new THREE.HemisphereLight(new THREE.Color(c.sky).lerp(new THREE.Color(0xffffff), 0.65), new THREE.Color(c.grass).lerp(new THREE.Color(0x888888), 0.5), light.hemi));
    this.sun = new THREE.DirectionalLight(light.sun, light.sunI);
    this.scene.add(this.sun, this.sun.target);
    this.shadows = o.quality !== 'low';
    if (this.shadows) {
      this.sun.castShadow = true;
      const sm = o.quality === 'high' ? 2048 : 1024;
      this.sun.shadow.mapSize.set(sm, sm);
      const cam = this.sun.shadow.camera;
      cam.left = cam.bottom = -28; cam.right = cam.top = 28; cam.near = 1; cam.far = 160;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.05;
    }

    this.world = buildTrackMesh(this.track, o.quality);
    this.scene.add(this.world.group);
    this.crowd = createCrowd(this.track, o.quality);
    this.scene.add(this.crowd.group);

    // ---- Fahrer ----
    const hw = this.track.halfW;
    const aiCount = o.mode === 'vs' ? 3 : 0;
    const spacing = Math.min(1.1, hw * 0.4);
    const lanes = [-1.5, -0.5, 0.5, 1.5].map((f) => f * spacing);
    const order = [0, 1, 2, 3].slice(0, aiCount + 1);
    const playerLane = order.length > 1 ? 2 : 1.5;
    this.riders = [];
    const rng = mulberry32(Date.now() & 0xffff);
    const addRider = (def, isPlayer, lane, name, driver) => {
      const sim = new BikeSim(this.track, def);
      sim.lat = lane;
      if (isPlayer) sim.assist = o.input.assist ? 1 : 0;
      const model = createBike(def, { lod: isPlayer ? undefined : 'low', shadows: this.shadows });
      model.group.scale.setScalar(BIKE_SCALE);
      model.group.rotation.order = 'YXZ';
      this.scene.add(model.group);
      let blob = null;
      if (!this.shadows) {
        blob = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false }));
        blob.rotation.order = 'YXZ';
        this.scene.add(blob);
      }
      const r = { def, isPlayer, name, sim, model, blob, driver, pitch: 0, crank: 0, dist: 0, finishTime: null };
      this.riders.push(r);
      return r;
    };
    this.player = addRider(o.bikeDef, true, order.length > 1 ? lanes[playerLane] : 0, 'Du', o.bot ? new AIDriver(PERFECT, rng, this.track, 0) : null); // bot: Autopilot (Test)
    const names = [...AI_NAMES].sort(() => rng() - 0.5);
    for (let i = 0; i < aiCount; i++) {
      const lane = lanes[[0, 1, 3][i]];
      const def = resolveBike({ ...randomConfig(rng), ...{} });
      addRider(def, false, lane, names[i], new AIDriver(o.level, rng, this.track, lane * 0.6));
    }
    this.finishOrder = [];

    // ---- Kamera ----
    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 600);
    this.scene.add(this.camera);
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.fov = 65;
    this.shake = 0;
    this.makeSpeedLines();
    this.makeMinimap();

    this.phase = 'countdown';
    this.countdown = 3.2;
    this.lastCount = 4;
    this.time = 0; // Rennzeit des Spielers (läuft bis zum Ziel)
    this.clock = 0; // läuft nach dem Start immer weiter (für Zielzeiten der Gegner)
    this.finishTimer = 0;
    this.hud.bar.style.left = '0%';
    this.hud.place.classList.toggle('hidden', this.mode !== 'vs');
    this.hud.lap.classList.toggle('hidden', this.laps < 2);
    this.hud.lapText.textContent = `1/${this.laps}`;
    this.hud.banner.classList.remove('show');
    music.play(map.id, true);
    this.hud.minimap.classList.toggle('hidden', false);
    this.syncVisuals(0, true);
  }

  makeSpeedLines() {
    const n = 36;
    const pos = new Float32Array(n * 6);
    this.lines = [];
    for (let i = 0; i < n; i++) this.lines.push(this.resetLine({}, true));
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false });
    this.lineMesh = new THREE.LineSegments(this.lineGeo, this.lineMat);
    this.lineMesh.frustumCulled = false;
    this.lineMesh.renderOrder = 999;
    this.camera.add(this.lineMesh);
  }

  resetLine(l, anywhere) {
    const a = Math.random() * Math.PI * 2;
    const rad = 1.2 + Math.random() * 3;
    l.x = Math.cos(a) * rad * 1.6; l.y = Math.sin(a) * rad;
    l.z = anywhere ? -Math.random() * 14 - 2 : -16;
    return l;
  }

  updateSpeedLines(dt, v) {
    const k = Math.max(0, (v - 20) / 25);
    this.lineMat.opacity = Math.min(0.5, k * 0.5);
    const arr = this.lineGeo.attributes.position.array;
    const len = 0.5 + k * 3;
    this.lines.forEach((l, i) => {
      l.z += (v * 0.9 + 10) * dt;
      if (l.z > -1.5) this.resetLine(l, false);
      arr[i * 6] = l.x; arr[i * 6 + 1] = l.y; arr[i * 6 + 2] = l.z;
      arr[i * 6 + 3] = l.x; arr[i * 6 + 4] = l.y; arr[i * 6 + 5] = l.z - len;
    });
    this.lineGeo.attributes.position.needsUpdate = true;
  }

  makeMinimap() {
    const cv = this.hud.minimap;
    const size = cv.width;
    const pts = [];
    for (let s = 0; s <= this.track.lapLength; s += 15) { const p = this.track.pointAt(s); pts.push([p.x, p.z]); }
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const span = Math.max(maxX - minX, maxZ - minZ) || 1;
    const pad = 10;
    this.mmMap = (x, z) => [pad + ((x - minX) / span) * (size - pad * 2) + ((size - pad * 2) - ((maxX - minX) / span) * (size - pad * 2)) / 2,
      pad + ((z - minZ) / span) * (size - pad * 2) + ((size - pad * 2) - ((maxZ - minZ) / span) * (size - pad * 2)) / 2];
    this.mmBase = document.createElement('canvas');
    this.mmBase.width = this.mmBase.height = size;
    const g = this.mmBase.getContext('2d');
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 8;
    g.beginPath(); pts.forEach((p, i) => { const [x, y] = this.mmMap(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4; g.stroke();
    this.mmTimer = 0;
  }

  drawMinimap() {
    const cv = this.hud.minimap;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(this.mmBase, 0, 0);
    [...this.riders].reverse().forEach((r) => {
      const p = this.track.pointAt(r.sim.s);
      const [x, y] = this.mmMap(p.x, p.z);
      g.fillStyle = r.isPlayer ? '#ffc400' : '#' + r.def.colors.frame.toString(16).padStart(6, '0');
      g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, r.isPlayer ? 6 : 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
    });
  }

  // Hochformat (Handy): größerer vertikaler Blickwinkel, damit die Strecke nicht zum Schlauch wird
  aspectFov() {
    const a = innerWidth / innerHeight;
    return a >= 1.3 ? 1 : 1 + Math.min(0.6, (1.3 - a) * 0.75);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  rankOf(r) {
    // Platz nach Zieleinlauf, sonst nach Fortschritt
    const fin = this.finishOrder.indexOf(r);
    if (fin >= 0) return fin + 1;
    let ahead = this.finishOrder.length;
    for (const o of this.riders) if (this.finishOrder.indexOf(o) < 0 && o !== r && o.sim.s > r.sim.s) ahead++;
    return ahead + 1;
  }

  update(dt) {
    const input = this.input;
    let ctrl = { gas: false, brake: true, steer: 0 };

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n < this.lastCount && n >= 1 && n <= 3) {
        this.lastCount = n;
        this.hud.countdown.textContent = String(n);
        this.hud.countdown.classList.add('show');
        sfx.beep();
      }
      if (this.countdown <= 0) {
        this.phase = 'race';
        this.hud.countdown.textContent = 'LOS!';
        sfx.go();
        setTimeout(() => this.hud.countdown.classList.remove('show'), 700);
      }
    } else if (this.phase === 'race') {
      input.tick(dt);
      ctrl = { gas: input.gas, brake: input.brake, steer: input.steer };
      this.time += dt;
    } else {
      this.finishTimer += dt;
      if (this.finishTimer > 2.8 && this.onFinish) this.complete();
    }

    if (this.phase !== 'countdown') {
      this.clock += dt;
      const n = Math.max(1, Math.ceil(dt / STEP));
      for (let i = 0; i < n; i++) {
        const h = dt / n;
        for (const r of this.riders) {
          let c;
          if (r.isPlayer) c = this.phase !== 'race' ? { gas: false, brake: true, steer: 0 } : r.driver ? r.driver.control(r.sim, h) : ctrl;
          else c = r.sim.finished ? { gas: false, brake: true, steer: 0 } : r.driver.control(r.sim, h, this.player.sim.s);
          const events = r.sim.step(h, c);
          if (r.isPlayer) for (const e of events) this.handleEvent(e);
          if (r.sim.finished && r.finishTime === null) {
            r.finishTime = this.clock;
            this.finishOrder.push(r);
            if (r.isPlayer) {
              this.phase = 'finished';
              this.finalTime = this.clock;
              this.finalPlace = this.finishOrder.length;
              this.crowd.excite = 1;
              sfx.finish();
            }
          }
        }
      }
    }

    this.syncVisuals(dt, false);
    this.updateHud(dt);
  }

  complete() {
    const cb = this.onFinish;
    this.onFinish = null;
    // Endwertung: erst Zieleinlauf, dann nach Fortschritt
    const rest = this.riders.filter((r) => this.finishOrder.indexOf(r) < 0).sort((a, b) => b.sim.s - a.sim.s);
    const ranking = [...this.finishOrder, ...rest].map((r) => ({ name: r.name, def: r.def, isPlayer: r.isPlayer, time: r.finishTime }));
    this.lapTimes.push(this.finalTime - this.lapStart);
    cb({ time: this.finalTime, place: this.finalPlace, total: this.riders.length, ranking, laps: this.laps, lapTimes: this.lapTimes });
  }

  handleEvent(e) {
    switch (e.type) {
      case 'jump': sfx.jump(); break;
      case 'land':
        sfx.land(e.impact);
        this.shake = Math.max(this.shake, Math.min(0.5, e.impact * 0.03));
        break;
      case 'rock': {
        const k = e.rock.kind;
        (sfx[k] || sfx.rock)();
        this.shake = k === 'cone' ? 0.15 : 0.6;
        const idx = this.track.rocks.indexOf(e.rock);
        if (idx >= 0 && k !== 'log') this.world.rockMeshes[idx].visible = false; // Baumstämme bleiben liegen
        break;
      }
      case 'patch': (e.patch.kind === 'puddle' ? sfx.splash : sfx.mud)(); this.shake = Math.max(this.shake, 0.12); break;
      case 'pad': sfx.pad(); this.flash('BOOST!'); break;
      case 'lap': {
        sfx.lap();
        this.lapTimes.push(this.time - this.lapStart);
        this.lapStart = this.time;
        this.world.rockMeshes.forEach((m) => { m.visible = true; }); // neue Runde: Hindernisse stehen wieder
        this.hud.lapText.textContent = `${e.lap + 1}/${this.laps}`;
        this.flash(e.lap + 1 === this.laps ? 'LETZTE RUNDE!' : `RUNDE ${e.lap + 1}`);
        break;
      }
      default:
    }
  }

  flash(text) {
    const b = this.hud.banner;
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth; // Animation neu starten
    b.classList.add('show');
  }

  syncVisuals(dt, snap) {
    const { track, camera } = this;
    for (const r of this.riders) {
      const { sim, model } = r;
      const p = track.pointAt(sim.s);
      const rx = Math.cos(p.theta), rz = Math.sin(p.theta);
      const bank = track.bankAt(sim.s);
      const bankY = -sim.lat * Math.tan(bank);
      const ground = track.heightAt(sim.s) + bankY;
      model.group.position.set(p.x + rx * sim.lat, sim.y + bankY, p.z + rz * sim.lat);
      const yaw = Math.atan2(sim.latV, Math.max(sim.v, 4));
      const targetPitch = sim.air ? Math.atan2(sim.vy, Math.max(sim.v, 4)) * 0.7 : Math.atan(sim.slope);
      r.pitch += (targetPitch - r.pitch) * Math.min(1, dt * (sim.air ? 3 : 14));
      model.group.rotation.set(r.pitch, -(p.theta + yaw), -(sim.latV / 11) * 0.5 - bank);
      r.dist += sim.v * dt;
      model.spin(r.dist);
      r.crank += sim.v * dt * (r.isPlayer ? (this.input.gas && !sim.air ? 1.3 : 0.35) : 1.3);
      model.pose(r.crank);
      if (r.blob) {
        r.blob.position.set(p.x + rx * sim.lat, ground + 0.06, p.z + rz * sim.lat);
        r.blob.rotation.set(Math.atan(sim.slope), -p.theta, 0);
        r.blob.scale.setScalar(1 / (1 + Math.max(0, sim.y + bankY - ground) * 0.35));
      }
    }

    const sim = this.player.sim;
    const pp = this.player.model.group.position;
    if (this.shadows) {
      this.sun.position.copy(pp).addScaledVector(this.sunDir, 70);
      this.sun.target.position.copy(pp);
      this.sun.target.updateMatrixWorld();
    }

    // Kamera
    const dist = 5.2 + sim.v * 0.055 + (this.aspectFov() - 1) * 2.5;
    const camS = sim.s - dist;
    const cp = track.pointAt(camS);
    const crx = Math.cos(cp.theta), crz = Math.sin(cp.theta);
    const desired = new THREE.Vector3(
      cp.x + crx * sim.lat * 0.75,
      Math.max(sim.y + 2.2, track.heightAt(camS) + 1.7),
      cp.z + crz * sim.lat * 0.75,
    );
    const lp = track.pointAt(sim.s + 8);
    const look = new THREE.Vector3(lp.x + Math.cos(lp.theta) * sim.lat * 0.9, sim.y + 1.2, lp.z + Math.sin(lp.theta) * sim.lat * 0.9);
    this.camPos.lerp(desired, snap ? 1 : 1 - Math.exp(-dt * 9));
    this.camLook.lerp(look, snap ? 1 : 1 - Math.exp(-dt * 11));
    camera.position.copy(this.camPos);
    if (this.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * this.shake;
      camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.8);
    }
    camera.lookAt(this.camLook);
    const targetFov = (62 + Math.min(22, sim.v * 0.55) + (sim.boost > 0 ? 10 : 0)) * this.aspectFov();
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    if (Math.abs(camera.fov - this.fov) > 0.05) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();

    // Himmel & Horizont folgen der Kamera
    for (const o of [this.sky, this.mountains, this.clouds, this.stars3d]) {
      if (!o) continue; o.position.x = camera.position.x; o.position.z = camera.position.z; }
    this.mountains.position.y = camera.position.y - 20;
    this.updateSpeedLines(dt, sim.v);
  }

  updateHud(dt) {
    const { hud } = this;
    const sim = this.player.sim;
    const t = formatTime(this.phase === 'finished' ? this.finalTime : this.time);
    if (hud.time.textContent !== t) hud.time.textContent = t;
    const sp = `${Math.round(sim.v * 3.6)}`;
    if (hud.speed.textContent !== sp) hud.speed.textContent = sp;
    const pct = `${Math.min(100, (sim.s / this.track.length) * 100).toFixed(1)}%`;
    hud.bar.style.left = pct;
    hud.bar.parentElement.style.setProperty('--p', pct);
    hud.speedbar.style.width = `${Math.min(100, (sim.v / 40) * 100).toFixed(0)}%`;
    if (this.mode === 'vs') {
      const pl = `${this.rankOf(this.player)}/${this.riders.length}`;
      if (hud.placeText.textContent !== pl) hud.placeText.textContent = pl;
    }
    this.mmTimer -= dt;
    if (this.mmTimer <= 0) { this.mmTimer = 0.1; this.drawMinimap(); }
    sfx.wind(sim.v);
    const cheer = this.crowd.update(dt, sim.s, sim.v);
    sfx.crowd(cheer * 0.9 + this.crowd.excite * 0.5);
    music.setIntensity(Math.min(1, sim.v / 30));
    document.body.style.setProperty('--speed', Math.min(1, Math.max(0, (sim.v - 14) / 22)).toFixed(2));
  }

  starsFor(time) {
    if (time <= this.stars.gold) return 3;
    if (time <= this.stars.silver) return 2;
    return 1;
  }

  dispose() {
    sfx.windOff();
    sfx.crowd(0);
    document.body.style.setProperty('--speed', '0');
    this.camera.remove(this.lineMesh);
    const keepEnv = this.scene.environment;
    this.scene.environment = null;
    disposeObject(this.scene);
    this.scene.environment = keepEnv;
  }
}
