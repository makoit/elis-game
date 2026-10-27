import * as THREE from 'three';
import { createAngler } from './angler.js';

// 3D-Angelplatz: Himmel, Wasser (Shader mit Wellen/Strömung), Ufer oder Boot, Landschaft je Gewässer, Angler.
// Koordinaten: Angler steht bei (0, y, 0) und schaut nach +z aufs Wasser. Wasseroberfläche bei y = 0.

const SKIES = [
  { top: 0x6aa8e8, horizon: 0xffd2a0, sun: 0xffc080, sunI: 2.2, amb: 0.75, fog: 0xd8c0a8, el: 0.12, az: -0.6, name: 'Morgen' },
  { top: 0x3a8ae0, horizon: 0xcfe6ff, sun: 0xfff4e0, sunI: 3.0, amb: 0.95, fog: 0xc8dcf0, el: 0.9, az: 0.3, name: 'Mittag' },
  { top: 0x4a5aa8, horizon: 0xff9a5a, sun: 0xff8a40, sunI: 2.0, amb: 0.65, fog: 0xe0a080, el: 0.1, az: 0.7, name: 'Abend' },
  { top: 0x070d22, horizon: 0x1a2a50, sun: 0x9ab4ff, sunI: 0.55, amb: 0.32, fog: 0x0c1428, el: 0.6, az: -0.3, name: 'Nacht' },
];

function skyDome(sky) {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(sky.top) }, horizon: { value: new THREE.Color(sky.horizon) },
      sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color(sky.sun) }, night: { value: sky.name === 'Nacht' ? 1 : 0 },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 top, horizon, sunDir, sunCol; uniform float night; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){
        float y = max(vP.y, 0.0);
        vec3 c = mix(horizon, top, pow(y, 0.55));
        float s = max(dot(vP, sunDir), 0.0);
        c += sunCol * (pow(s, 600.0) * (night > 0.5 ? 0.9 : 3.0) + pow(s, 12.0) * 0.25);
        if (night > 0.5) { vec3 q = floor(vP * 260.0); float st = step(0.9965, h(q)) * smoothstep(0.05, 0.3, vP.y); c += vec3(st); }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

function waterMaterial(sc, sky) {
  return new THREE.ShaderMaterial({
    transparent: true, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      t: { value: 0 }, shallow: { value: new THREE.Color(sc.water) }, deep: { value: new THREE.Color(sc.deep) },
      skyC: { value: new THREE.Color(sky.horizon) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(sky.sun) },
      flow: { value: sc.flow || 0 }, waves: { value: sc.waves || 1 }, dark: { value: sky.name === 'Nacht' ? 0.35 : 1 },
      ripples: { value: [new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0)] },
    }]),
    vertexShader: `
      uniform float t, waves; varying vec3 vW; varying float vH;
      #include <fog_pars_vertex>
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        float d = clamp(length(w.xz) / 40.0, 0.0, 1.0);
        float h = (sin(w.x*0.35 + t*1.3) * 0.06 + sin(w.z*0.5 - t*1.7) * 0.05 + sin((w.x+w.z)*0.9 + t*2.3)*0.02) * waves * (0.4 + d);
        w.y += h; vW = w.xyz; vH = h;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float t, flow, waves, dark; uniform vec3 shallow, deep, skyC, sunDir, sunCol; uniform vec4 ripples[4];
      varying vec3 vW; varying float vH;
      #include <fog_pars_fragment>
      float n(vec2 p){ return sin(p.x)*sin(p.y); }
      void main(){
        vec2 p = vW.xz; p.y -= t * flow * 1.4;
        float nx = n(p*0.8 + t*0.6) * 0.5 + n(p*2.1 - t*0.9) * 0.3 + n(p*5.3 + vec2(t*1.4, -t)) * 0.15;
        float nz = n(p.yx*0.9 - t*0.5) * 0.5 + n(p.yx*2.4 + t*0.8) * 0.3 + n(p.yx*4.7 - vec2(t, t*1.3)) * 0.15;
        for (int i = 0; i < 4; i++) {
          vec4 r = ripples[i]; float age = t - r.z;
          if (age > 0.0 && age < 3.0) { float d = distance(vW.xz, r.xy); float ring = sin((d - age*2.2)*9.0) * exp(-abs(d - age*2.2)*2.5) * (1.0 - age/3.0) * r.w;
            nx += ring * (vW.x - r.x) / max(d, 0.01); nz += ring * (vW.z - r.y) / max(d, 0.01); }
        }
        vec3 N = normalize(vec3(nx*0.18*waves, 1.0, nz*0.18*waves));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        float dist = clamp(length(vW.xz) / 120.0, 0.0, 1.0);
        vec3 base = mix(shallow, deep, smoothstep(0.0, 1.0, dist + 0.2));
        vec3 c = mix(base, skyC, 0.15 + fres * 0.6);
        vec3 H = normalize(sunDir + V);
        c += sunCol * pow(max(dot(N, H), 0.0), 180.0) * 2.5;
        c += vec3(0.9) * smoothstep(0.08, 0.14, vH) * 0.15 * waves;
        if (flow > 0.0) c += vec3(0.8) * smoothstep(0.82, 1.0, n(vec2(p.x*1.7, p.y*0.6))) * 0.12 * flow;
        c *= dark;
        gl_FragColor = vec4(c, 0.93);
        #include <fog_fragment>
      }`,
  });
}

// --- kleine Bausteine ---
const M = (color, rough = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function tree(kind, rnd) {
  const g = new THREE.Group();
  const s = 0.8 + rnd() * 0.6;
  if (kind === 'spruce') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 2, 6), M(0x4a3020));
    trunk.position.y = 1; g.add(trunk);
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(2.2 - i * 0.45, 2.6, 8), M(0x1e3a22 + i * 0x020502));
      c.position.y = 2.2 + i * 1.5; g.add(c);
    }
  } else if (kind === 'poplar') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 3, 6), M(0x6a5a4a));
    trunk.position.y = 1.5; g.add(trunk);
    const c = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), M(0x5a7a2a));
    c.scale.y = 4.2; c.position.y = 7.5; g.add(c);
  } else if (kind === 'olive') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 1.8, 6), M(0x5a4a3a));
    trunk.position.y = 0.9; trunk.rotation.z = (rnd() - 0.5) * 0.4; g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), M(0x7a8a5a));
      c.position.set((rnd() - 0.5) * 1.6, 2.2 + rnd() * 0.6, (rnd() - 0.5) * 1.6); g.add(c);
    }
  } else {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 2.4, 6), M(0x5a4030));
    trunk.position.y = 1.2; g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + rnd() * 0.6, 1), M(0x3f6a2a + Math.floor(rnd() * 3) * 0x050800));
      c.position.set((rnd() - 0.5) * 1.5, 3.2 + rnd() * 1.2, (rnd() - 0.5) * 1.5); g.add(c);
    }
  }
  g.scale.setScalar(s);
  g.rotation.y = rnd() * 6.28;
  return g;
}

// Bergkette als Silhouette in Entfernung `dist`, Bogen von a0..a1 (Radiant um den Angler, 0 = +z).
// Kein Szenen-Nebel (wäre zu grau) – stattdessen Dunst Richtung Horizontfarbe `haze`.
function ridge(dist, height, color, a0, a1, rnd, rough = 1, snow = false, haze = 0xc8dcf0, light = 1) {
  const segs = 90;
  const pos = [];
  const idx = [];
  const cols = [];
  const hz = new THREE.Color(haze);
  const k = Math.min(0.65, dist / 1300);
  const base = new THREE.Color(color).multiplyScalar(light).lerp(hz, k);
  const mid = base.clone().offsetHSL(0, -0.05, 0.04);
  const white = new THREE.Color(0xf4f6fa).multiplyScalar(light).lerp(hz, k * 0.6);
  let ph = rnd() * 10;
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (a1 - a0) * (i / segs);
    const x = Math.sin(a) * dist;
    const z = Math.cos(a) * dist;
    const u = i * 0.21 + ph;
    const h = height * Math.max(0.12, 0.6 + (0.28 * Math.sin(u) + 0.16 * Math.sin(u * 2.7 + 1) + 0.08 * Math.sin(u * 6.1)) * rough);
    const snowLine = snow && h > height * 0.72 ? h * 0.82 : h;
    pos.push(x, -2, z, x, snowLine, z, x, h, z);
    cols.push(base.r, base.g, base.b, mid.r, mid.g, mid.b);
    const top = snow && h > height * 0.72 ? white : mid;
    cols.push(top.r, top.g, top.b);
    if (i < segs) {
      const b = i * 3;
      idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setIndex(idx);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
}

function landmark(kind, sc) {
  const g = new THREE.Group();
  const stone = M(0xc8b89a);
  if (kind === 'castle') {
    // Scaliger-Burg (Malcesine/Torri): Turm mit Schwalbenschwanz-Zinnen
    const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 22, 5), stone);
    tower.position.y = 11; g.add(tower);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(18, 9, 3), stone);
    wall.position.set(8, 4.5, 0); g.add(wall);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 3.2), stone);
      m.position.set(1 + i * 3, 9.8, 0); g.add(m);
    }
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 1), stone); m.position.set(-2 + (i % 2) * 4, 22.8, -2 + Math.floor(i / 2) * 4); g.add(m); }
    for (let i = 0; i < 6; i++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(6, 7 + (i % 3) * 2, 6), M([0xf2c48a, 0xe89a6a, 0xf4e2b8, 0xd88a6a][i % 4]));
      h.position.set(-12 - i * 6, 3.5, 2 + (i % 2) * 4); g.add(h);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.4, 4), M(0xa8482a));
      roof.position.set(h.position.x, h.geometry.parameters.height + 1.2, h.position.z); roof.rotation.y = Math.PI / 4; g.add(roof);
    }
  } else if (kind === 'lighthouse' || kind === 'lindau') {
    // Leuchtturm; in Lindau dazu der Löwe auf der Mole
    const lt = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.6, 30, 12), M(0xe8e0d0));
    lt.position.y = 15; g.add(lt);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3, 12), M(0x2a5a3a));
    top.position.y = 31.5; g.add(top);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    lamp.position.y = 34; g.add(lamp);
    g.userData.lamp = lamp;
    if (kind === 'lindau') {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 4), M(0xb8b0a0));
    ped.position.set(-40, 3, 0); g.add(ped);
    const lion = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4.5), M(0xd0c4a0)); body.position.y = 1.5; lion.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), M(0xd0c4a0)); head.position.set(0, 4, 1.6); lion.add(head);
    lion.position.set(-40, 6, 0); lion.rotation.y = Math.PI; g.add(lion);
    const mole = new THREE.Mesh(new THREE.BoxGeometry(56, 2, 6), M(0x9a9488));
    mole.position.set(-20, 0.5, 0); g.add(mole);
    }
  } else if (kind === 'church') {
    // Stift Dürnstein: blau-weißer Barockturm
    const t = new THREE.Mesh(new THREE.BoxGeometry(5, 26, 5), M(0x8ab0d8));
    t.position.y = 13; g.add(t);
    const w = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3, 5.2), M(0xf4f4f0));
    for (const y of [8, 17]) { const ww = w.clone(); ww.position.y = y; g.add(ww); }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0x8ab0d8));
    dome.position.y = 26; g.add(dome);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.8, 6, 8), M(0xd8b04a, 0.3, { metalness: 0.7 }));
    spire.position.y = 31; g.add(spire);
    const stift = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 10), M(0xf0e8d8));
    stift.position.set(-18, 5, 3); g.add(stift);
    const ruin = new THREE.Mesh(new THREE.BoxGeometry(6, 9, 6), M(0x8a8478));
    ruin.position.set(30, 48, 60); g.add(ruin);
  } else if (kind === 'bridge') {
    // Fehmarnsundbrücke: Netzwerkbogen ("Kleiderbügel")
    const steel = M(0xd84a2a, 0.5, { metalness: 0.3 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(300, 3, 14), M(0xb8b8b0));
    deck.position.y = 23; g.add(deck);
    for (const x of [-150, -100, 100, 150]) { const p = new THREE.Mesh(new THREE.BoxGeometry(5, 23, 10), M(0xc8c8c0)); p.position.set(x, 11.5, 0); g.add(p); }
    const pts = [];
    for (let i = 0; i <= 30; i++) { const u = i / 30; pts.push(new THREE.Vector3(-124 + u * 248, 24 + Math.sin(u * Math.PI) * 45, 0)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    for (const z of [-5, 5]) { const arch = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 1.4, 6), steel); arch.position.z = z; g.add(arch); }
    const hangerMat = new THREE.LineBasicMaterial({ color: 0xd84a2a });
    const hp = [];
    for (let i = 1; i < 30; i++) {
      const top = curve.getPoint(i / 30);
      const off = (i % 2 ? 1 : -1) * 14;
      for (const z of [-5, 5]) hp.push(top.x, top.y, z, top.x + off, 24.5, z);
    }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    g.add(new THREE.LineSegments(hg, hangerMat));
  } else if (kind === 'poplars') {
    // Raddampfer im Hafen von Boretto
    const hull = new THREE.Mesh(new THREE.BoxGeometry(24, 3, 7), M(0xf4f0e8));
    hull.position.y = 1; g.add(hull);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 6), M(0xe8e0d0));
    cab.position.y = 4; g.add(cab);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 7), M(0xb83a2a));
    roof.position.y = 5.7; g.add(roof);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 1.5, 16), M(0xb83a2a));
    wheel.rotation.x = Math.PI / 2; wheel.position.set(-12.5, 2, 0); g.add(wheel);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 4, 8), M(0x222222));
    chimney.position.set(4, 7.5, 0); g.add(chimney);
  } else if (kind === 'cabin') {
    // Rote Fischerhütte am Lachsfluss
    const h = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 6), M(0x9a2a1a));
    h.position.y = 2.25; g.add(h);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.2, 3, 4), M(0x3a5a2a));
    roof.position.y = 6; roof.rotation.y = Math.PI / 4; roof.scale.z = 0.8; g.add(roof);
    for (const x of [-2, 2]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), M(0xf8f8f0)); w.position.set(x, 2.6, 3.01); g.add(w); }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function boat(color = 0xf2f2ee) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-1.1, -2.4); shape.lineTo(1.1, -2.4); shape.quadraticCurveTo(1.25, 1.2, 0, 2.8); shape.quadraticCurveTo(-1.25, 1.2, -1.1, -2.4);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }), M(color, 0.5));
  hull.rotation.x = -Math.PI / 2; hull.position.y = -0.45;
  g.add(hull);
  const inner = new THREE.Mesh(new THREE.ShapeGeometry(shape), M(0x8a6a4a));
  inner.rotation.x = -Math.PI / 2; inner.position.y = 0.2; inner.scale.set(0.88, 0.9, 1);
  g.add(inner);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 4.6), M(0x1a6fd1));
  stripe.position.set(0, 0.1, 0); g.add(stripe);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.4), M(0xa07a4a));
  bench.position.set(0, 0.55, -0.6); g.add(bench);
  const motor = new THREE.Group();
  const m1 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.5), M(0x222428, 0.4));
  m1.position.y = 0.7; motor.add(m1);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), M(0x2a2c30));
  shaft.position.y = 0.0; motor.add(shaft);
  motor.position.set(0, 0, -2.6); g.add(motor);
  // Echolot-Bildschirm
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.05), M(0x111111));
  screen.position.set(-0.7, 0.75, 1.6); screen.rotation.x = -0.4; g.add(screen);
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.18), new THREE.MeshBasicMaterial({ color: 0x2a8acf }));
  disp.position.set(-0.7, 0.76, 1.627); disp.rotation.x = -0.4; g.add(disp);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function shoreGround(sc, rnd, river) {
  const g = new THREE.Group();
  const kind = sc.shore;
  const col = { rocks: 0x9a9080, meadow: 0x5a8a3a, stones: 0x8a8678, beach: 0xe0cfa0, sand: 0xc8b48a }[kind] || 0x6a8a4a;
  // Ufer-Plateau hinter dem Angler, Böschung zum Wasser
  const geo = new THREE.PlaneGeometry(260, 60, 80, 24);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const c0 = new THREE.Color(col);
  const grass = new THREE.Color(sc.hillColor);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) - 26; // Kante zum Wasser bei z ≈ 4
    let y = 0.9 + Math.sin(x * 0.12) * 0.3 + (rnd() - 0.5) * 0.15;
    if (z > -2) y -= (z + 2) * 0.9;
    if (z < -12) y += (-12 - z) * 0.08;
    pos.setXYZ(i, x, y, z);
    const k = z > -4 ? 0 : Math.min(1, (-4 - z) / 6);
    const c = c0.clone().lerp(kind === 'beach' || kind === 'sand' ? c0 : grass, k);
    c.offsetHSL(0, 0, (rnd() - 0.5) * 0.06);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  ground.receiveShadow = true;
  g.add(ground);
  // Steine an der Kante
  if (kind === 'rocks' || kind === 'stones') {
    const rm = M(kind === 'rocks' ? 0xa89c88 : 0x8a8a80);
    for (let i = 0; i < 70; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + rnd() * 0.9, 0), rm);
      r.position.set((rnd() - 0.5) * 120, -0.2 + rnd() * 0.4, 1 + rnd() * 3.5);
      r.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      r.castShadow = true; r.receiveShadow = true;
      g.add(r);
    }
  }
  // Schilf
  if (kind === 'meadow' || kind === 'sand') {
    const reed = new THREE.MeshStandardMaterial({ color: 0x8a9a4a, roughness: 0.9, side: THREE.DoubleSide });
    for (let c = 0; c < 9; c++) {
      const cx = (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 30);
      for (let i = 0; i < 26; i++) {
        const h = 1.4 + rnd() * 1.2;
        const b = new THREE.Mesh(new THREE.PlaneGeometry(0.06, h), reed);
        b.position.set(cx + (rnd() - 0.5) * 3, h / 2 - 0.3, 3 + rnd() * 2.5);
        b.rotation.set((rnd() - 0.5) * 0.3, rnd() * 3, (rnd() - 0.5) * 0.3);
        g.add(b);
        if (rnd() < 0.2) { const k = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.25, 3, 6), M(0x5a3a1a)); k.position.set(b.position.x, h - 0.2, b.position.z); g.add(k); }
      }
    }
  }
  // Bäume hinter dem Ufer
  if (sc.trees !== 'none') {
    for (let i = 0; i < 26; i++) {
      const t = tree(sc.trees, rnd);
      const x = (rnd() - 0.5) * 160;
      if (Math.abs(x) < 6) continue;
      t.position.set(x, 1, -8 - rnd() * 22);
      g.add(t);
    }
  }
  // Steg / Mole aus Holz für Flüsse & Seen
  if (!river && kind !== 'beach') {
    const plank = M(0x8a6a48);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 7), plank);
    deck.position.set(0, 0.75, 2.5); deck.castShadow = true; deck.receiveShadow = true; g.add(deck);
    for (const [x, z] of [[-1, 0.5], [1, 0.5], [-1, 5.5], [1, 5.5]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), plank);
      p.position.set(x, -0.6, z); g.add(p);
    }
  }
  if (kind === 'beach') {
    // Mole aus Steinen ins Meer
    const mole = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 14), M(0x9a968a));
    mole.position.set(0, 0.3, 4); mole.receiveShadow = true; g.add(mole);
  }
  // Angelzubehör: Eimer, Kescher, Kiste
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.4, 12, 1, true), M(0x2a6ad1, 0.5, { side: THREE.DoubleSide }));
  bucket.position.set(0.9, 1.0, 0.6); g.add(bucket);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.35), M(0x3a7a3a, 0.5));
  box.position.set(-0.9, 0.95, 0.2); box.castShadow = true; g.add(box);
  return g;
}

export class FishingScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2500);
    this.t = 0;
    this.rippleIdx = 0;
  }

  build(water, spot, look, rodId, timeIdx) {
    this.dispose();
    const sc = water.scene;
    const sky = SKIES[timeIdx] || SKIES[1];
    const rnd = mulberry(spot.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const s = this.scene;
    const river = water.kind === 'fluss';
    this.sc = sc;
    this.boatMode = !!spot.boat;
    this.flow = river ? sc.flow : 0;
    s.fog = new THREE.Fog(sky.fog, 120, 820);
    s.background = new THREE.Color(sky.fog);

    const sunDir = new THREE.Vector3(Math.sin(sky.az), sky.el, Math.cos(sky.az)).normalize();
    const dome = skyDome(sky);
    dome.material.uniforms.sunDir.value.copy(sunDir);
    s.add(dome);
    this.dome = dome;
    s.add(new THREE.HemisphereLight(sky.top, sc.hillColor, sky.amb));
    const sun = new THREE.DirectionalLight(sky.sun, sky.sunI);
    sun.position.copy(sunDir).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 150 });
    s.add(sun);
    if (timeIdx === 3) {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf4f0d8, fog: false }));
      moon.position.copy(sunDir).multiplyScalar(800); s.add(moon);
      this.lantern = new THREE.PointLight(0xffc070, 6, 14, 1.6);
      this.lantern.position.set(0.8, 1.6, 0.8);
      s.add(this.lantern);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd890 }));
      lamp.position.copy(this.lantern.position); s.add(lamp);
    }

    // Wasser
    this.waterMat = waterMaterial(sc, sky);
    this.waterMat.uniforms.sunDir.value.copy(sunDir);
    const wGeo = new THREE.PlaneGeometry(1600, 1600, 160, 160);
    wGeo.rotateX(-Math.PI / 2);
    const wm = new THREE.Mesh(wGeo, this.waterMat);
    s.add(wm);
    // Grund (sichtbar durch leichte Transparenz)
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), M(new THREE.Color(sc.deep).multiplyScalar(0.6)));
    bed.rotation.x = -Math.PI / 2; bed.position.y = -6; s.add(bed);

    // Landschaft
    const far = new THREE.Group();
    const R = (d, h, c, a0, a1, r, ro, sn) => ridge(d, h, c, a0, a1, r, ro, sn, sky.fog, Math.min(1, sky.amb / 0.95));
    if (river) {
      // gegenüberliegendes Ufer in ~70–110 m und Hügel dahinter
      const width = water.id === 'gaula' ? 55 : water.id === 'po' ? 140 : 110;
      this.riverWidth = width;
      const bank = new THREE.Mesh(new THREE.BoxGeometry(1600, 3, 300), M(sc.hillColor));
      bank.position.set(0, 0, width + 150); bank.receiveShadow = true; far.add(bank);
      for (let i = 0; i < 60; i++) {
        const t = tree(sc.trees, rnd); t.position.set((rnd() - 0.5) * 500, 1.5, width + 5 + rnd() * 40); t.scale.multiplyScalar(1.6); far.add(t);
      }
      if (sc.hills === 'vineyard') {
        far.add(R(width + 160, 70, sc.hillColor, -1.2, 1.2, rnd, 0.7));
        // Weinberg-Terrassen als Streifen
        for (let r = 0; r < 14; r++) {
          const row = new THREE.Mesh(new THREE.BoxGeometry(400, 0.6, 1.2), M(0x4a6a2a));
          row.position.set(0, 4 + r * 4.5, width + 50 + r * 6); far.add(row);
        }
      } else if (sc.hills === 'forest') {
        far.add(R(width + 150, 70, 0x23402a, -1.4, 1.4, rnd, 0.9));
        far.add(R(650, 170, 0x5a6a7a, -1.5, 1.5, rnd, 1, true));
      } else {
        far.add(R(700, 30, 0x7a9a5a, -1.4, 1.4, rnd, 0.4));
      }
    } else {
      this.riverWidth = 0;
      if (sc.hills === 'alps') {
        far.add(R(520, 120, sc.hillColor, -1.0, 1.0, rnd, 1));
        far.add(R(780, 230, 0x6a7a8a, -1.3, 1.3, rnd, 1, true));
        far.add(R(380, 110, 0x3e5a3e, 0.9, 1.6, rnd, 1));
        far.add(R(380, 110, 0x3e5a3e, -1.6, -0.9, rnd, 1));
      } else if (sc.hills === 'hills') {
        far.add(R(600, 50, sc.hillColor, -1.2, 1.2, rnd, 0.6));
        far.add(R(850, 150, 0xa8b8cc, -0.6, 0.9, rnd, 1, true));
      } else {
        far.add(R(700, 18, sc.hillColor, -1.0, 1.0, rnd, 0.4));
      }
    }
    s.add(far);

    // Wahrzeichen
    const lmKind = spot.landmark || sc.landmark;
    const lm = landmark(lmKind, sc);
    if (lmKind === 'bridge') { lm.position.set(-60, 0, 260); lm.rotation.y = 0.25; }
    else if (lmKind === 'castle') { lm.position.set(spot.boat ? 140 : -70, 0, spot.boat ? 300 : 90); lm.rotation.y = 0.6; }
    else if (lmKind === 'lighthouse' || lmKind === 'lindau') { lm.position.set(70, 0, 140); lm.rotation.y = -0.4; }
    else if (lmKind === 'church') { lm.position.set(-60, 2, (this.riverWidth || 100) + 25); lm.rotation.y = Math.PI; }
    else if (lmKind === 'poplars') { lm.position.set(-40, 0, 30); lm.rotation.y = 0.2; }
    else if (lmKind === 'cabin') { lm.position.set(25, 1, -14); lm.rotation.y = 0.5; }
    s.add(lm);
    this.landmark = lm;

    // Segelboote auf Seen/Meer
    this.sailboats = [];
    if (!river) {
      for (let i = 0; i < 4; i++) {
        const sb = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 5), M(0xffffff));
        sb.add(hull);
        const sail = new THREE.Mesh(new THREE.ConeGeometry(1.8, 7, 3), M([0xffffff, 0xff7a3a, 0x3a8ad1, 0xffd23a][i], 0.6, { side: THREE.DoubleSide }));
        sail.scale.z = 0.08; sail.position.y = 4; sb.add(sail);
        sb.position.set((rnd() - 0.5) * 500, 0.3, 150 + rnd() * 300);
        sb.userData.v = 0.6 + rnd();
        s.add(sb);
        this.sailboats.push(sb);
      }
    }

    // Angler: Ufer oder Boot
    this.angler = createAngler(look, rodId);
    if (spot.boat) {
      this.boat = boat();
      this.boat.position.set(0, 0, 0);
      s.add(this.boat);
      this.angler.position.set(0, 0.2, 0.6);
      this.boat.add(this.angler);
      this.standY = 0.2;
    } else {
      this.boat = null;
      this.shore = shoreGround(sc, rnd, river);
      this.shore.position.z = -4;
      s.add(this.shore);
      this.angler.position.set(0, 0.82, 0);
      s.add(this.angler);
    }

    // Schnur, Pose/Köder, Zielkreis
    this.lineGeo = new THREE.BufferGeometry();
    this.linePts = new Float32Array(3 * 40);
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePts, 3));
    this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({ color: timeIdx === 3 ? 0xffffc0 : 0xf4f4e8, transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false;
    s.add(this.line);

    this.float = new THREE.Group();
    const fBody = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), M(0xffffff, 0.4));
    fBody.scale.y = 1.6; this.float.add(fBody);
    const fTop = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0xff3a1a, emissive: timeIdx === 3 ? 0xff5a2a : 0x000000, emissiveIntensity: 1.2 }));
    fTop.position.y = 0.2; this.float.add(fTop);
    this.float.visible = false;
    s.add(this.float);

    this.lure = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M(0xd0d4da, 0.2, { metalness: 0.8 }));
    this.lure.visible = false;
    s.add(this.lure);

    this.aim = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 32), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8, depthWrite: false }));
    this.aim.rotation.x = -Math.PI / 2;
    this.aim.position.y = 0.06;
    s.add(this.aim);

    // Schatten des Fisches im Drill
    this.shadowFish = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    this.shadowFish.rotation.x = -Math.PI / 2; this.shadowFish.scale.set(0.3, 1, 1);
    this.shadowFish.visible = false;
    s.add(this.shadowFish);

    // Spritzer-Partikel
    const pg = new THREE.BufferGeometry();
    this.splashPos = new Float32Array(3 * 80);
    this.splashVel = new Float32Array(3 * 80);
    this.splashLife = new Float32Array(80);
    pg.setAttribute('position', new THREE.BufferAttribute(this.splashPos, 3));
    this.splash = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.85 }));
    this.splash.frustumCulled = false;
    s.add(this.splash);

    this.camYaw = 0;
    this.camMode = 'aim';
    this.camTarget = new THREE.Vector3(0, 0, 20);
    this.camPos = new THREE.Vector3(0, 3.5, -5);
    this.camera.position.copy(this.camPos);
  }

  ripple(x, z, strength = 1) {
    const r = this.waterMat.uniforms.ripples.value[this.rippleIdx++ % 4];
    r.set(x, z, this.t, strength);
  }

  splashAt(x, z, n = 30, power = 1) {
    let k = 0;
    for (let i = 0; i < 80 && k < n; i++) {
      if (this.splashLife[i] > 0) continue;
      this.splashLife[i] = 0.6 + Math.random() * 0.5;
      this.splashPos.set([x, 0.05, z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const sp = (0.5 + Math.random() * 1.5) * power;
      this.splashVel.set([Math.cos(a) * sp, (2 + Math.random() * 3) * power, Math.sin(a) * sp], i * 3);
      k++;
    }
    this.ripple(x, z, power);
  }

  // Rutenspitze in Weltkoordinaten
  tipWorld(v = new THREE.Vector3()) {
    this.angler.userData.tip.getWorldPosition(v);
    return v;
  }

  // Schnur von der Spitze zum Endpunkt; sag = Durchhang (0 straff .. 1 locker)
  setLine(end, sag = 0.3, visible = true) {
    this.line.visible = visible;
    if (!visible) return;
    const a = this.tipWorld();
    const n = 40;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = a.x + (end.x - a.x) * u;
      const z = a.z + (end.z - a.z) * u;
      let y = a.y + (end.y - a.y) * u;
      const d = Math.hypot(end.x - a.x, end.z - a.z);
      y -= Math.sin(u * Math.PI) * sag * Math.min(4, d * 0.08);
      if (u > 0.05 && y < 0.02 && end.y <= 0.05) y = Math.max(y, end.y + (0.02 - end.y) * (1 - u));
      this.linePts.set([x, y, z], i * 3);
    }
    this.lineGeo.attributes.position.needsUpdate = true;
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    this.waterMat.uniforms.t.value = t;
    if (this.boat) {
      this.boat.rotation.z = Math.sin(t * 0.9) * 0.025 * (this.sc.waves || 1);
      this.boat.rotation.x = Math.sin(t * 0.7 + 1) * 0.02 * (this.sc.waves || 1);
      this.boat.position.y = Math.sin(t * 1.1) * 0.05;
    }
    for (const sb of this.sailboats) { sb.position.x += sb.userData.v * dt; if (sb.position.x > 300) sb.position.x = -300; sb.rotation.z = Math.sin(t + sb.position.z) * 0.05; }
    if (this.landmark.userData.lamp) this.landmark.userData.lamp.visible = Math.sin(t * 2) > -0.2;
    // Spritzer
    for (let i = 0; i < 80; i++) {
      if (this.splashLife[i] <= 0) { this.splashPos[i * 3 + 1] = -50; continue; }
      this.splashLife[i] -= dt;
      this.splashVel[i * 3 + 1] -= 9.8 * dt;
      for (let k = 0; k < 3; k++) this.splashPos[i * 3 + k] += this.splashVel[i * 3 + k] * dt;
    }
    this.splash.geometry.attributes.position.needsUpdate = true;

    // Kamera: hinter dem Angler, folgt dem Zielpunkt
    const tgt = this.camTarget;
    const back = this.camMode === 'fight' ? 4.2 : this.camMode === 'catch' ? 2.3 : 5.2;
    const height = this.camMode === 'catch' ? 1.6 : 3.0;
    const dir = new THREE.Vector3(tgt.x, 0, tgt.z).normalize();
    const base = this.boat ? this.boat.position : new THREE.Vector3(0, 0.8, 0);
    const want = this.camMode === 'catch'
      ? new THREE.Vector3(base.x + 2.4, base.y + height, base.z + 2.8)
      : new THREE.Vector3(base.x - dir.x * back + 0.9, base.y + height, base.z - dir.z * back);
    const look = this.camMode === 'catch' ? new THREE.Vector3(base.x + 1.25, base.y + 1.25, base.z + 0.9) : tgt.clone().multiplyScalar(0.6).setY(0);
    const cut = this.camMode === 'catch' && this._lastMode !== 'catch'; // Schnitt aufs Fangfoto statt Kamerafahrt
    this._lastMode = this.camMode;
    if (!this._look || cut) { this._look = look.clone(); this.camPos.copy(want); }
    this.camPos.lerp(want, 1 - Math.exp(-dt * 3));
    this.camera.position.copy(this.camPos);
    this._look.lerp(look, 1 - Math.exp(-dt * 4));
    this.camera.lookAt(this._look);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    this.scene.clear();
    this._look = null;
  }
}

// Kleines Schaufenster für Garage & Fang (Angler bzw. Fisch auf Drehbühne)
export class Showcase {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b2a3a);
    this.scene.fog = new THREE.Fog(0x0b2a3a, 8, 22);
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 100);
    this.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x2a4a3a, 1.1));
    const key = new THREE.DirectionalLight(0xfff2dd, 2.4);
    key.position.set(3, 5, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8ad8ff, 1.4);
    rim.position.set(-4, 3, -3); this.scene.add(rim);
    // Holzsteg als Bühne
    const deck = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 3.4), M(i % 2 ? 0x8a6a48 : 0x7a5a3a));
      p.position.set(-1.45 + i * 0.36, -0.04, 0); p.receiveShadow = true; deck.add(p);
    }
    this.scene.add(deck);
    const water = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshStandardMaterial({ color: 0x1a6a8a, roughness: 0.15, metalness: 0.2 }));
    water.rotation.x = -Math.PI / 2; water.position.y = -0.3; this.scene.add(water);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.spin = 0;
    this.mode = 'angler';
  }

  setObject(obj, mode = 'angler') {
    this.holder.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.holder.clear();
    this.holder.add(obj);
    this.mode = mode;
  }

  update(dt) {
    this.spin += dt * 0.5;
    this.holder.rotation.y = this.mode === 'angler' ? Math.sin(this.spin) * 0.6 + 0.3 : this.spin;
    const wide = innerWidth / innerHeight > 1.2;
    if (this.mode === 'angler') {
      this.camera.position.set(wide ? 1.0 : 0, 1.2, 4.4);
      this.camera.lookAt(wide ? 1.0 : 0, 1.0, 0);
      this.holder.position.x = 0;
    } else {
      this.camera.position.set(0, 0.5, 2.2);
      this.camera.lookAt(0, 0.45, 0);
    }
  }

  render() { this.renderer.render(this.scene, this.camera); }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
}
