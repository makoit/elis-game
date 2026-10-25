import * as THREE from 'three';
import { buildTrack, mulberry32 } from './trackdata.js';
import { BikeSim, collideRiders, SPEED_SCALE, G } from './physics.js';
import { createBike } from './bikes.js';
import { buildTrackMesh, disposeObject } from './trackmesh.js';
import { createSky, createEnvMap, createMountains, createClouds, createStars } from './env.js';
import { createCrowd } from './crowd.js';
import { music } from './music.js';
import { starTimes } from './autopilot.js';
import { AIDriver, PERFECT } from './ai.js';
import { resolveBike, randomConfig } from './bikedata.js';
import { sfx } from './sfx.js';
import { PostFX } from './postfx.js';
import { Particles, SkidMarks } from './particles.js';

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
      const half = Math.abs(model.wheels[0].position.z) * BIKE_SCALE; // halber Radstand (Welt)
      const r = { def, isPlayer, name, sim, model, blob, driver, half, pitch: 0, wheelie: 0, lean: 0, t: 0, cad: 0, crank: 0, dist: 0, finishTime: null };
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
    this.post = o.quality === 'high' ? new PostFX(o.renderer, this.scene, this.camera) : null;
    this.fx = o.quality === 'low' ? null : new Particles(o.quality === 'high' ? 700 : 260);
    if (this.fx) this.scene.add(this.fx.points);
    this.skid = o.quality === 'low' ? null : new SkidMarks(o.quality === 'high' ? 500 : 250);
    if (this.skid) this.scene.add(this.skid.mesh);
    this.dustAcc = new Map();
    this.debris = []; // umgestoßene Kegel, wackelnde Hindernisse
    this.squash = 0;
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
    if (this.post) this.post.resize();
  }

  render(dt) {
    if (this.post) this.post.render(dt, this.player.sim.v * 2, this.player.sim.boost > 0);
    else this.renderer.render(this.scene, this.camera);
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
      ctrl = { gas: input.gas, brake: input.brake, steer: input.steer, wheelie: input.wheelie };
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
        // Rempler zwischen Fahrern
        for (let a = 0; a < this.riders.length; a++) {
          for (let b = a + 1; b < this.riders.length; b++) {
            const A = this.riders[a], B = this.riders[b];
            const hit = collideRiders(A.sim, B.sim);
            if (hit > 0 && (A.isPlayer || B.isPlayer)) this.onBump(hit, A.isPlayer ? B : A);
          }
        }
      }
    }
    this.updateDebris(dt);

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
        sfx.land(e.impact * 1.8);
        this.shake = Math.max(this.shake, Math.min(0.55, e.impact * 0.05));
        this.burst('dust', 6 + e.impact * 2.5);
        this.squash = Math.min(0.12, e.impact * 0.012); // Federung taucht ein
        if (e.impact > 9) { this.hit(0.35); this.vibrate(40); }
        break;
      case 'rock': {
        const k = e.rock.kind;
        (sfx[k] || sfx.rock)();
        const idx = this.track.rocks.indexOf(e.rock);
        const mesh = idx >= 0 ? this.world.rockMeshes[idx] : null;
        if (k === 'cone') {
          this.shake = Math.max(this.shake, 0.15);
          if (mesh) this.launch(mesh, 1);
          this.vibrate(20);
        } else if (k === 'log') {
          this.shake = Math.max(this.shake, e.lift ? 0.2 : 0.45);
          this.burst('dust', 10);
          if (!e.lift) { this.hit(0.4); this.vibrate(60); this.flash('HOPPLA!'); } else this.flash('DRÜBER!');
        } else {
          this.shake = 0.7;
          this.burst('rock', 22);
          this.hit(0.8);
          this.vibrate([90, 40, 60]);
          this.flash(k === 'bale' ? 'STROHBALLEN!' : 'AUTSCH!');
          if (mesh) this.wobble(mesh); // Hindernis wackelt
        }
        break;
      }
      case 'wheelie':
        if (e.time >= 1.5) { sfx.pad(); this.flash(`WHEELIE ${e.time.toFixed(1)} s · BOOST!`); }
        else this.flash(`WHEELIE ${e.time.toFixed(1)} s`);
        break;
      case 'wheelieStart': sfx.jump(); break;
      case 'patch': (e.patch.kind === 'puddle' ? sfx.splash : sfx.mud)(); this.shake = Math.max(this.shake, 0.12); this.burst(e.patch.kind === 'puddle' ? 'water' : 'mud', 26); break;
      case 'pad': sfx.pad(); this.flash('BOOST!'); break;
      case 'lap': {
        sfx.lap();
        this.lapTimes.push(this.time - this.lapStart);
        this.lapStart = this.time;
        this.world.rockMeshes.forEach((m) => this.resetDebris(m)); // neue Runde: Hindernisse stehen wieder
        this.hud.lapText.textContent = `${e.lap + 1}/${this.laps}`;
        this.flash(e.lap + 1 === this.laps ? 'LETZTE RUNDE!' : `RUNDE ${e.lap + 1}`);
        break;
      }
      default:
    }
  }

  // Rempler mit einem anderen Fahrer
  onBump(impact, other) {
    sfx.bump(impact);
    this.shake = Math.max(this.shake, Math.min(0.5, 0.15 + impact * 0.06));
    this.hit(Math.min(0.6, 0.2 + impact * 0.06));
    this.vibrate(Math.round(30 + impact * 10));
    if (impact > 3) this.flash(`RUMMS! ${other.name}`);
    this.burst('dust', 8);
  }

  // roter Rand / Erschütterung bei Aufprall
  hit(k) {
    if (!this.hitEl) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;transition:opacity .35s ease-out;' +
        'box-shadow:inset 0 0 120px 40px rgba(255,40,30,.75);';
      document.body.appendChild(el);
      this.hitEl = el;
    }
    const el = this.hitEl;
    el.style.transition = 'none';
    el.style.opacity = String(Math.min(1, k));
    void el.offsetWidth;
    el.style.transition = 'opacity .45s ease-out';
    el.style.opacity = '0';
  }

  vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* egal */ } }

  // Kegel fliegt weg (einfache Wurfbahn)
  launch(mesh, k) {
    this.remember(mesh);
    const sim = this.player.sim;
    const p = this.track.pointAt(sim.s);
    const fx = Math.sin(p.theta), fz = -Math.cos(p.theta);
    const side = (Math.random() - 0.5) * 4;
    this.debris.push({
      mesh, t: 0, vx: fx * (sim.v * 0.9 + 2) * k + Math.cos(p.theta) * side, vy: 3.5 + Math.random() * 2, vz: fz * (sim.v * 0.9 + 2) * k + Math.sin(p.theta) * side,
      rx: (Math.random() - 0.5) * 14, rz: (Math.random() - 0.5) * 14, ground: mesh.position.y,
    });
  }

  // Fels/Strohballen wackelt kurz
  wobble(mesh) { this.remember(mesh); this.debris.push({ mesh, t: 0, wobble: true }); }

  remember(mesh) {
    if (!mesh.userData.home) mesh.userData.home = { p: mesh.position.clone(), r: mesh.rotation.clone(), s: mesh.scale.clone() };
  }

  resetDebris(mesh) {
    const h = mesh.userData.home;
    if (h) { mesh.position.copy(h.p); mesh.rotation.copy(h.r); mesh.scale.copy(h.s); }
    mesh.visible = true;
    this.debris = this.debris.filter((d) => d.mesh !== mesh);
  }

  updateDebris(dt) {
    for (const d of this.debris) {
      d.t += dt;
      const m = d.mesh;
      if (d.wobble) {
        const h = m.userData.home;
        const k = Math.max(0, 1 - d.t / 0.6);
        m.rotation.z = h.r.z + Math.sin(d.t * 40) * 0.08 * k;
        m.scale.set(h.s.x * (1 + 0.06 * k), h.s.y * (1 - 0.08 * k), h.s.z * (1 + 0.06 * k));
        continue;
      }
      d.vy -= 9.81 * dt;
      m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt;
      m.rotation.x += d.rx * dt; m.rotation.z += d.rz * dt;
      if (m.position.y < d.ground && d.vy < 0) { // aufs Gras fallen und liegen bleiben
        m.position.y = d.ground; d.vy *= -0.3; d.vx *= 0.5; d.vz *= 0.5; d.rx *= 0.4; d.rz *= 0.4;
        if (Math.abs(d.vy) < 0.5) { d.vy = 0; d.vx = d.vz = d.rx = d.rz = 0; }
      }
    }
    this.debris = this.debris.filter((d) => d.t < 3);
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
    this.squash = Math.max(0, (this.squash || 0) - dt * 0.5);
    for (const r of this.riders) {
      const { sim, model } = r;
      const p = track.pointAt(sim.s);
      const rx = Math.cos(p.theta), rz = Math.sin(p.theta);
      const bank = track.bankAt(sim.s);
      const bankY = -sim.lat * Math.tan(bank);
      const ground = track.heightAt(sim.s) + bankY;
      // Höhe und Neigung aus den beiden Radaufstandspunkten → Räder liegen auf Rampen und Kuppen auf
      const half = r.half;
      let y = sim.y + bankY, targetPitch;
      if (sim.air) targetPitch = Math.atan2(sim.vy, Math.max(sim.v, 3)) * 0.7;
      else {
        const hf = track.heightAt(sim.s + half), hr = track.heightAt(sim.s - half);
        targetPitch = Math.atan2(hf - hr, 2 * half);
        y = (hf + hr) / 2 + bankY;
      }
      r.pitch += (targetPitch - r.pitch) * Math.min(1, dt * (sim.air ? 3 : 20));
      r.wheelie += (sim.wheelie - r.wheelie) * Math.min(1, dt * 12);
      // Wheelie: Drehpunkt ist die Hinterachse
      const w = r.wheelie;
      const fwx = Math.sin(p.theta), fwz = -Math.cos(p.theta);
      const back = half * (1 - Math.cos(w));
      const squash = r.isPlayer ? (this.squash || 0) : 0;
      model.group.position.set(p.x + rx * sim.lat - fwx * back, y + half * Math.sin(w) - squash, p.z + rz * sim.lat - fwz * back);
      const yaw = Math.atan2(sim.latV, Math.max(sim.v, 4));
      // Schräglage in der Kurve (tan φ = v²·κ / g) + Lenkbewegung, Wackeln nach Aufprall
      const curveLean = sim.air ? 0 : -Math.atan(sim.kappa * sim.v * sim.v / G) * 0.85;
      const targetLean = curveLean - (sim.latV / 11) * 0.45;
      r.lean += (targetLean - r.lean) * Math.min(1, dt * 6);
      r.t += dt;
      const wob = sim.stumble > 0 ? Math.sin(r.t * 26) * 0.16 * Math.min(1, sim.stumble / 0.4) : 0;
      model.group.rotation.set(r.pitch + w, -(p.theta + yaw), r.lean - bank + wob);
      r.dist += sim.v * dt;
      model.spin(r.dist);
      // Trittfrequenz: realistisch 60–100 U/min dank Gangschaltung; ohne Treten stehen die Pedale waagerecht
      const pedaling = sim.power > 0.04 && !sim.air;
      if (pedaling) {
        const rpm = Math.min(98, 58 + sim.v * 2.4 + sim.power * 10);
        r.cad += (rpm * Math.PI / 30 - r.cad) * Math.min(1, dt * 3);
        r.crank += r.cad * dt;
      } else {
        r.cad *= Math.max(0, 1 - dt * 4);
        const level = Math.round((r.crank - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
        r.crank += r.cad * dt + (level - r.crank) * Math.min(1, dt * 3);
      }
      model.pose(r.crank);
      if (this.fx && !snap) this.emitFx(r, dt, p, model.group.position);
      if (this.skid && r.isPlayer) this.updateSkid(r, p, ground, rx, rz);
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
    const feelV = sim.v / SPEED_SCALE; // Tempo-Gefühl auf der alten (arcade) Skala, für Kamera/FOV/Speedlines
    const dist = 5.0 + feelV * 0.05 + (this.aspectFov() - 1) * 2.5;
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
    const targetFov = (62 + Math.min(22, feelV * 0.55) + (sim.boost > 0 ? 10 : 0)) * this.aspectFov();
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    if (Math.abs(camera.fov - this.fov) > 0.05) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();

    // Himmel & Horizont folgen der Kamera
    for (const o of [this.sky, this.mountains, this.clouds, this.stars3d]) {
      if (!o) continue; o.position.x = camera.position.x; o.position.z = camera.position.z; }
    this.mountains.position.y = camera.position.y - 20;
    this.updateSpeedLines(dt, feelV);
    if (this.fx) this.fx.update(dt, camera, this.renderer.getDrawingBufferSize(this.fbSize || (this.fbSize = new THREE.Vector2())).y);
  }

  // Reifenspur auf der Piste beim Rutschen oder Bremsen
  updateSkid(r, p, ground, rx, rz) {
    const { sim } = r;
    const braking = this.phase === 'race' && this.input.brake && sim.v > 5;
    const k = sim.air || sim.offroad ? 0 : Math.max(braking ? 0.8 : 0, sim.slide > 0.05 ? 0.4 + sim.slide * 0.6 : 0, sim.stumble > 0.2 ? 0.6 : 0);
    const dx = Math.sin(p.theta), dz = -Math.cos(p.theta); // Fahrtrichtung
    const back = 1.1;
    this.skid.add(p.x + rx * sim.lat - dx * back, ground, p.z + rz * sim.lat - dz * back, dx, dz, k);
  }

  // Staub / Kies hinter dem Hinterrad, Boost-Funken
  emitFx(r, dt, p, pos) {
    const { sim } = r;
    if (sim.air || sim.v < 3) return;
    const c = this.map.colors;
    const asphalt = this.map.surface === 'asphalt';
    const off = sim.offroad;
    // Dichte: Gegner sparsamer, Spieler voll
    let rate = 0;
    if (off) rate = 18 + sim.v * 4.4;
    else if (!asphalt) rate = 2 + sim.v * 1.1 + sim.slide * 30;
    else if (sim.slide > 0.05) rate = 12;
    if (!r.isPlayer) rate *= 0.4;
    const t = this.track.pointAt(sim.s + 1);
    let fx = t.x - p.x, fz = t.z - p.z;
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    let acc = (this.dustAcc.get(r) || 0) + rate * dt;
    const col = off ? new THREE.Color(c.grass).lerp(new THREE.Color(0xc9b48a), 0.55).getHex() : (asphalt ? 0xbdbdbd : new THREE.Color(c.road).lerp(new THREE.Color(0xffffff), 0.3).getHex());
    while (acc >= 1) {
      acc -= 1;
      const back = 0.9 * 1.3;
      this.fx.emit({
        x: pos.x - fx * back + (Math.random() - 0.5) * 0.3, y: pos.y + 0.15, z: pos.z - fz * back + (Math.random() - 0.5) * 0.3,
        vx: -fx * sim.v * 0.2 + (Math.random() - 0.5) * 1.6, vy: 0.5 + Math.random() * 1.2, vz: -fz * sim.v * 0.2 + (Math.random() - 0.5) * 1.6,
        color: col, size: 0.3 + Math.random() * 0.2, grow: 1.1 + Math.random() * 0.8, life: 0.6 + Math.random() * 0.5, alpha: off ? 0.45 : 0.2, drag: 2.2, gravity: -0.3,
      });
    }
    this.dustAcc.set(r, acc);
    if (r.isPlayer && sim.boost > 0) {
      for (let i = 0; i < 2; i++) {
        this.fx.emit({
          x: pos.x - fx * 1.2, y: pos.y + 0.5 + Math.random() * 0.4, z: pos.z - fz * 1.2,
          vx: -fx * 4 + (Math.random() - 0.5) * 3, vy: (Math.random() - 0.3) * 2, vz: -fz * 4 + (Math.random() - 0.5) * 3,
          color: Math.random() < 0.5 ? 0xffb347 : 0xfff0a0, size: 0.14 + Math.random() * 0.1, grow: -0.08, life: 0.35 + Math.random() * 0.25, alpha: 0.95, drag: 3, gravity: 0,
        });
      }
    }
  }

  // Einmaliger Ausbruch (Landung, Pfütze, Matsch, Hindernis)
  burst(kind, amount) {
    if (!this.fx) return;
    const r = this.player;
    const pos = r.model.group.position;
    const colors = { dust: this.map.surface === 'asphalt' ? 0xcfcfcf : 0xc9b48a, mud: 0x6b4a2b, water: 0xbfe6ff, rock: 0xb0a090 };
    const water = kind === 'water';
    const n = Math.min(40, Math.round(amount));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * (water ? 5 : 3.5);
      this.fx.emit({
        x: pos.x + Math.cos(a) * 0.3, y: pos.y + 0.2, z: pos.z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * sp, vy: (water ? 3 : 1.2) + Math.random() * 2.5, vz: Math.sin(a) * sp,
        color: colors[kind] ?? colors.dust, size: water ? 0.18 : 0.4 + Math.random() * 0.3, grow: water ? 0 : 1.6, life: 0.6 + Math.random() * 0.6,
        alpha: water ? 0.8 : 0.55, drag: water ? 0.4 : 2.5, gravity: water ? 14 : 0,
      });
    }
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
    hud.speedbar.style.width = `${Math.min(100, (sim.v / 20) * 100).toFixed(0)}%`;
    if (this.mode === 'vs') {
      const pl = `${this.rankOf(this.player)}/${this.riders.length}`;
      if (hud.placeText.textContent !== pl) hud.placeText.textContent = pl;
    }
    this.mmTimer -= dt;
    if (this.mmTimer <= 0) { this.mmTimer = 0.1; this.drawMinimap(); }
    const fv = sim.v / SPEED_SCALE; // auf die alte Skala, für die Ton/Publikum abgestimmt sind
    sfx.wind(fv);
    const cheer = this.crowd.update(dt, sim.s, fv);
    sfx.crowd(cheer * 0.9 + this.crowd.excite * 0.5);
    music.setIntensity(Math.min(1, fv / 30));
    document.body.style.setProperty('--speed', Math.min(1, Math.max(0, (fv - 14) / 22)).toFixed(2));
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
    if (this.post) this.post.dispose();
    if (this.fx) this.fx.dispose();
    if (this.skid) this.skid.dispose();
    const keepEnv = this.scene.environment;
    this.scene.environment = null;
    disposeObject(this.scene);
    this.scene.environment = keepEnv;
  }
}
