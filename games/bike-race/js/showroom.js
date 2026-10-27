import * as THREE from 'three';
import { createBike } from './bikes.js';
import { createSky, createEnvMap } from './env.js';
import { disposeObject } from './trackmesh.js';

// Schaufenster für die Fahrradauswahl: das Rad dreht sich auf einer Scheibe.
export class Showroom {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b16);
    this.scene.fog = new THREE.Fog(0x070b16, 8, 26);
    const sky = { top: 0x1a2a55, horizon: 0xcfe3ff, ground: 0x10162a, sunDir: new THREE.Vector3(0.6, 0.5, 0.7) };
    this.scene.environment = createEnvMap(renderer, sky);
    this.scene.environmentIntensity = 1.0;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445577, 0.6));
    const key = new THREE.DirectionalLight(0xfff2dd, 2.4);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 1.4);
    rim.position.set(-4, 3, -3);
    this.scene.add(rim);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.7, 0.1, 40),
      new THREE.MeshStandardMaterial({ color: 0x1c2542, roughness: 0.4, metalness: 0.4 }),
    );
    disc.position.y = -0.05;
    this.scene.add(disc);
    // Neonringe wie in einer Tuning-Garage
    for (const [r, c, w] of [[1.72, 0xffb000, 0.035], [2.5, 0x19d3ff, 0.02], [3.4, 0xffb000, 0.012]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, w, 8, 96), new THREE.MeshBasicMaterial({ color: c }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.1;
      this.scene.add(ring);
    }
    const glow = new THREE.PointLight(0xffa000, 8, 7);
    glow.position.set(0, 0.4, 0);
    this.scene.add(glow);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshStandardMaterial({ color: 0x0c1220, roughness: 0.55, metalness: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.11;
    this.scene.add(floor);

    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);
    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 60);
    this.t = 0;
    this.resize();
  }

  setBike(def) {
    if (this.model) { this.turntable.remove(this.model.group); disposeObject(this.model.group); }
    this.model = createBike(def, { shadows: false });
    this.turntable.add(this.model.group);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const aspect = w / h;
    this.camera.aspect = aspect;
    const portrait = aspect < 1;
    if (portrait) {
      // Handy hochkant: Rad im oberen Bereich, Garage-Panel darunter (Bild nach oben verschoben)
      this.camera.position.set(0, 1.4, 8.2);
      this.camera.lookAt(0, 0.8, 0);
      this.camera.setViewOffset(w, h, 0, h * 0.27, w, h);
    } else {
      // Querformat: Rad mittig im freien Bereich rechts neben dem Garage-Panel (Breite wie in style.css)
      const panelPx = (h <= 470 ? Math.min(500, w * 0.54) : w <= 900 ? Math.min(470, w * 0.56) : Math.min(470, w * 0.5)) + 18;
      this.camera.position.set(0, 1.5, h <= 470 ? 5.4 : 5.0);
      this.camera.lookAt(0, 0.75, 0);
      this.camera.setViewOffset(w, h, -panelPx / 2, 0, w, h);
    }
    this.turntable.position.set(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    this.turntable.rotation.y = this.t * 0.6 + 0.6;
    if (this.model) { this.model.spin(this.t * 2); this.model.pose(this.t * 4); }
  }
}

