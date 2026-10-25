import * as THREE from 'three';

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
  const s = new THREE.Scene();
  s.add(createSky(skyOpts));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, 0.1, 1000);
  pm.dispose();
  s.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return rt.texture;
}

// Ferne Berge als Silhouette am Horizont
export function createMountains(color, seed = 1) {
  const geo = new THREE.CylinderGeometry(420, 420, 1, 96, 1, true);
  const pos = geo.attributes.position;
  let s = seed * 9301;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const phases = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const h = 28 + 22 * Math.sin(a * 3 + phases[0]) + 14 * Math.sin(a * 7 + phases[1]) + 8 * Math.sin(a * 17 + phases[2]);
      pos.setY(i, Math.max(6, h));
    } else pos.setY(i, -40);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.BackSide }));
  mesh.frustumCulled = false;
  return mesh;
}

// weiche Wolken (Sprites)
export function createClouds(count = 14, seed = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const group = new THREE.Group();
  let s = seed * 7919;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const el = 0.18 + rnd() * 0.45;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, opacity: 0.55 + rnd() * 0.3, depthWrite: false }));
    const d = 380;
    sp.position.set(Math.cos(a) * d * Math.cos(el), Math.sin(el) * d, Math.sin(a) * d * Math.cos(el));
    sp.scale.set(120 + rnd() * 160, 40 + rnd() * 30, 1);
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
