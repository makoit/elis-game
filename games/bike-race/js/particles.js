import * as THREE from '../../../vendor/three.module.js';

// Kleines Partikelsystem (Staub, Kies, Wasser, Boost-Funken) als ein Points-Objekt mit festem Pool.
export class Particles {
  constructor(max) {
    this.max = max;
    this.next = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); // Restlebensdauer
    this.maxLife = new Float32Array(max).fill(1);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.alpha0 = new Float32Array(max);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 500 } },
      vertexShader: /* glsl */`
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float scale; varying float vA; varying vec3 vC;
        void main() {
          vA = alpha; vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying float vA; varying vec3 vC;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.35, 1.0, d)) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.tmp = new THREE.Color();
  }

  // o: x,y,z, vx,vy,vz, color (hex), size, life, alpha, grow (Größenzuwachs/s), drag, gravity
  emit(o) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx; this.vel[i * 3 + 1] = o.vy; this.vel[i * 3 + 2] = o.vz;
    this.tmp.set(o.color);
    this.col[i * 3] = this.tmp.r; this.col[i * 3 + 1] = this.tmp.g; this.col[i * 3 + 2] = this.tmp.b;
    this.size0[i] = o.size;
    this.size[i] = o.size;
    this.life[i] = this.maxLife[i] = o.life;
    this.alpha[i] = o.alpha ?? 0.5;
    this.alpha0[i] = this.alpha[i];
    this.grow[i] = o.grow ?? 0;
    this.drag[i] = o.drag ?? 1.5;
    this.grav[i] = o.gravity ?? 0;
  }

  update(dt, camera, viewH) {
    const { pos, vel, life, size, alpha } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { alpha[i] = 0; continue; }
      life[i] -= dt;
      const k = Math.max(0, life[i] / this.maxLife[i]);
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      vel[i * 3] *= dr; vel[i * 3 + 1] = vel[i * 3 + 1] * dr - this.grav[i] * dt; vel[i * 3 + 2] *= dr;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      size[i] = this.size0[i] + this.grow[i] * (1 - k);
      alpha[i] = this.alpha0[i] * Math.min(1, k * 2.5) * Math.min(1, (1 - k) * 8 + 0.2);
    }
    this.mat.uniforms.scale.value = viewH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    for (const a of ['position', 'color', 'size', 'alpha']) this.geo.attributes[a].needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// Reifenspuren: Ringpuffer aus Quads, die mit der Position des Hinterrads mitwachsen.
export class SkidMarks {
  constructor(max = 400) {
    this.max = max;
    this.i = 0;
    this.pos = new Float32Array(max * 12); // 4 Ecken × 3
    this.alpha = new Float32Array(max * 4);
    const idx = [];
    for (let q = 0; q < max; q++) idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.05, 0.04, 0.04, vA); }',
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.last = null;
  }

  // x,z: Mitte des Hinterrads, y: Bodenhöhe, dx,dz: Fahrtrichtung (normiert), strength 0..1 (0 = absetzen)
  add(x, y, z, dx, dz, strength) {
    if (strength <= 0) { this.last = null; return; }
    const w = 0.07;
    const nx = -dz * w, nz = dx * w;
    const cur = [x, y, z, nx, nz];
    if (this.last) {
      const l = this.last;
      if (Math.hypot(x - l[0], z - l[2]) < 0.25) return;
      const q = this.i * 12, a = this.i * 4;
      const p = this.pos;
      p[q] = l[0] + l[3]; p[q + 1] = l[1] + 0.03; p[q + 2] = l[2] + l[4];
      p[q + 3] = l[0] - l[3]; p[q + 4] = l[1] + 0.03; p[q + 5] = l[2] - l[4];
      p[q + 6] = x + nx; p[q + 7] = y + 0.03; p[q + 8] = z + nz;
      p[q + 9] = x - nx; p[q + 10] = y + 0.03; p[q + 11] = z - nz;
      this.alpha.fill(0.45 * strength, a, a + 4);
      this.i = (this.i + 1) % this.max;
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.alpha.needsUpdate = true;
    }
    this.last = cur;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}
