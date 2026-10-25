import * as THREE from 'three';
import { createBike, BIKE_COLORS } from './bikes.js';
import { disposeObject } from './trackmesh.js';

// Schaufenster für die Fahrradauswahl: das Rad dreht sich auf einer Scheibe.
export class Showroom {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x24324f);
    this.scene.fog = new THREE.Fog(0x24324f, 8, 22);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445577, 1.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 1.2);
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

  setBike(def, color = def.color) {
    if (this.model) { this.turntable.remove(this.model.group); disposeObject(this.model.group); }
    this.model = createBike(def, color);
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

export { BIKE_COLORS };
