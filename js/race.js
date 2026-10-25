import * as THREE from 'three';
import { buildTrack } from './trackdata.js';
import { BikeSim } from './physics.js';
import { createBike } from './bikes.js';
import { buildTrackMesh, disposeObject } from './trackmesh.js';
import { starTimes } from './autopilot.js';
import { sfx } from './sfx.js';

const BIKE_SCALE = 1.25;
const STEP = 1 / 60;

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export class Race {
  constructor({ bike, color, map, input, hud, onFinish }) {
    this.bike = bike;
    this.map = map;
    this.input = input;
    this.hud = hud;
    this.onFinish = onFinish;

    this.track = buildTrack(map);
    this.sim = new BikeSim(this.track, bike);
    this.stars = starTimes(map, bike);

    const c = map.colors;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(c.sky);
    this.scene.fog = new THREE.Fog(c.fog, map.fogRange[0], map.fogRange[1]);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x667766, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(40, 80, 30);
    this.scene.add(sun);

    this.world = buildTrackMesh(this.track);
    this.scene.add(this.world.group);

    this.rider = createBike(bike, color);
    this.rider.group.scale.setScalar(BIKE_SCALE);
    this.rider.group.rotation.order = 'YXZ';
    this.scene.add(this.rider.group);

    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.blob.rotation.order = 'YXZ';
    this.blob.geometry.rotateX(-Math.PI / 2);
    this.scene.add(this.blob);

    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 500);
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();

    this.phase = 'countdown';
    this.countdown = 3.2;
    this.lastCount = 4;
    this.time = 0;
    this.finishTimer = 0;
    this.shake = 0;
    this.crank = 0;
    this.dist = 0;
    this.pitch = 0;
    this.fov = 65;
    this.hud.bar.style.left = '0%';
    this.syncVisuals(0, true);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    const { sim, input } = this;
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
      ctrl = { gas: input.gas, brake: input.brake, steer: input.steer };
      this.time += dt;
    } else {
      ctrl = { gas: false, brake: true, steer: 0 };
      this.finishTimer += dt;
      if (this.finishTimer > 2.5 && this.onFinish) {
        const cb = this.onFinish;
        this.onFinish = null;
        cb(this.finalTime);
      }
    }

    if (this.phase !== 'countdown') {
      const n = Math.max(1, Math.ceil(dt / STEP));
      for (let i = 0; i < n; i++) {
        const events = sim.step(dt / n, ctrl);
        for (const e of events) this.handleEvent(e);
        if (this.phase === 'race' && sim.finished) {
          this.phase = 'finished';
          this.finalTime = this.time;
          sfx.finish();
        }
      }
    }

    this.syncVisuals(dt, false);
    this.updateHud();
  }

  handleEvent(e) {
    switch (e.type) {
      case 'jump': sfx.jump(); break;
      case 'land':
        sfx.land(e.impact);
        this.shake = Math.max(this.shake, Math.min(0.5, e.impact * 0.03));
        break;
      case 'rock': {
        sfx.rock();
        this.shake = 0.6;
        const idx = this.track.rocks.indexOf(e.rock);
        if (idx >= 0) this.world.rockMeshes[idx].visible = false;
        break;
      }
      case 'pad': sfx.pad(); break;
      default:
    }
  }

  syncVisuals(dt, snap) {
    const { sim, track, rider, camera } = this;
    const p = track.pointAt(sim.s);
    const rx = Math.cos(p.theta), rz = Math.sin(p.theta);
    const slope = sim.slope;
    const ground = track.heightAt(sim.s);

    // Fahrrad
    rider.group.position.set(p.x + rx * sim.lat, sim.y, p.z + rz * sim.lat);
    const yaw = Math.atan2(sim.latV, Math.max(sim.v, 4));
    const targetPitch = sim.air ? Math.atan2(sim.vy, Math.max(sim.v, 4)) * 0.7 : Math.atan(slope);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * (sim.air ? 3 : 14));
    rider.group.rotation.set(this.pitch, -(p.theta + yaw), -(sim.latV / 7) * 0.45);
    this.dist += sim.v * dt;
    rider.spin(this.dist);
    this.crank += sim.v * dt * (this.input.gas && !sim.air ? 1.5 : 0.35);
    rider.pose(this.crank);

    // Schatten
    this.blob.position.set(p.x + rx * sim.lat, ground + 0.06, p.z + rz * sim.lat);
    this.blob.rotation.set(Math.atan(slope), -p.theta, 0);
    this.blob.scale.setScalar(1 / (1 + Math.max(0, sim.y - ground) * 0.35));

    // Kamera
    const camS = sim.s - 7.5;
    const cp = track.pointAt(camS);
    const crx = Math.cos(cp.theta), crz = Math.sin(cp.theta);
    const desired = new THREE.Vector3(
      cp.x + crx * sim.lat * 0.75,
      Math.max(sim.y + 3.1, track.heightAt(camS) + 2),
      cp.z + crz * sim.lat * 0.75,
    );
    const lp = track.pointAt(sim.s + 6);
    const look = new THREE.Vector3(lp.x + Math.cos(lp.theta) * sim.lat * 0.9, sim.y + 1.1, lp.z + Math.sin(lp.theta) * sim.lat * 0.9);
    const k = snap ? 1 : 1 - Math.exp(-dt * 8);
    this.camPos.lerp(desired, k);
    this.camLook.lerp(look, snap ? 1 : 1 - Math.exp(-dt * 10));
    camera.position.copy(this.camPos);
    if (this.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * this.shake;
      camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.8);
    }
    camera.lookAt(this.camLook);
    const targetFov = 62 + Math.min(14, sim.v * 0.55) + (sim.boost > 0 ? 8 : 0);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    if (Math.abs(camera.fov - this.fov) > 0.05) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
  }

  updateHud() {
    const { hud, sim, track } = this;
    const t = formatTime(this.phase === 'finished' ? this.finalTime : this.time);
    if (hud.time.textContent !== t) hud.time.textContent = t;
    const sp = `${Math.round(sim.v * 3.6)} km/h`;
    if (hud.speed.textContent !== sp) hud.speed.textContent = sp;
    hud.bar.style.left = `${Math.min(100, (sim.s / track.length) * 100).toFixed(1)}%`;
  }

  starsFor(time) {
    if (time <= this.stars.gold) return 3;
    if (time <= this.stars.silver) return 2;
    return 1;
  }

  dispose() {
    disposeObject(this.scene);
  }
}
