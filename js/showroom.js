import * as THREE from 'three';
import { createBike } from './bikes.js';
import { createSky, createEnvMap } from './env.js';
import { disposeObject } from './trackmesh.js';

// Schaufenster für die Fahrradauswahl: das Rad dreht sich auf einer Scheibe.
export class Showroom {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x24324f);
    this.scene.fog = new THREE.Fog(0x24324f, 9, 24);
    const sky = { top: 0x2a4a86, horizon: 0xcfe3ff, ground: 0x20283f, sunDir: new THREE.Vector3(0.6, 0.5, 0.7) };
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
      new THREE.MeshStandardMaterial({ color: 0x3b4d7a, roughness: 0.6 }),
    );
    disc.position.y = -0.05;
    this.scene.add(disc);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshStandardMaterial({ color: 0x1b2640, roughness: 1 }));
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
    const aspect = innerWidth / innerHeight;
    this.camera.aspect = aspect;
    // Hochformat: weiter weg, Rad mittig; Querformat: Rad rechts neben dem Statistik-Panel
    const wide = aspect > 1.2;
    this.camera.position.set(0, 1.5, wide ? 4.8 : 6.5);
    this.turntable.position.set(wide ? 0.9 : 0, 0, 0);
    this.camera.lookAt(wide ? 0.9 : 0, 0.75, 0);
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    this.turntable.rotation.y = this.t * 0.6 + 0.6;
    if (this.model) { this.model.spin(this.t * 2); this.model.pose(this.t * 4); }
  }
}

