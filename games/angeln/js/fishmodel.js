import * as THREE from 'three';
import { FISH } from './data.js';

// Prozedurale 3D-Fische: Körper aus einer verformten Kugel mit Vertex-Farben (Rücken dunkel, Bauch hell, Punkte/Streifen),
// dazu Flossen als flache Formen. Länge des Modells = 1 (Kopf bei +x), mit fish.scale.setScalar(m) auf echte Länge bringen.

// Körperprofil je Form: Radius über t (0 = Schwanz, 1 = Kopf), Höhe/Breite, Kopfspitze
const SHAPES = {
  salmon: { h: 0.115, w: 0.06, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.8) * (0.35 + 0.65 * Math.min(1, t * 1.8)) },
  perch: { h: 0.15, w: 0.065, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.75) * (0.3 + 0.7 * Math.min(1, t * 1.6)), hump: 0.25 },
  pike: { h: 0.08, w: 0.06, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.6) * (0.45 + 0.55 * Math.min(1, t * 2)), snout: 0.5 },
  carp: { h: 0.17, w: 0.08, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.95)), 0.7) * (0.3 + 0.7 * Math.min(1, t * 1.5)), hump: 0.35 },
  flat: { h: 0.36, w: 0.025, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.95)), 0.55) * (0.2 + 0.8 * Math.min(1, t * 2.2)) },
  eel: { h: 0.045, w: 0.04, prof: (t) => 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (t < 0.15 ? t / 0.15 : 1) },
  catfish: { h: 0.085, w: 0.085, prof: (t) => (0.25 + 0.75 * Math.pow(t, 0.6)) * Math.pow(Math.sin(Math.PI * Math.min(0.98, 0.3 + t * 0.7)), 0.4), flatHead: true },
  grayling: { h: 0.12, w: 0.055, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.8) * (0.35 + 0.65 * Math.min(1, t * 1.8)) },
  sturgeon: { h: 0.08, w: 0.08, prof: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.7) * (0.35 + 0.65 * Math.min(1, t * 1.6)), snout: 0.9 },
};

const hash = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

function bodyGeometry(sh, look) {
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cBody = new THREE.Color(look.body);
  const cBack = new THREE.Color(look.back);
  const cBelly = new THREE.Color(look.belly);
  const cSpot = look.spots != null ? new THREE.Color(look.spots) : null;
  const cBars = look.bars != null ? new THREE.Color(look.bars) : null;
  const cScale = look.scales != null ? new THREE.Color(look.scales) : null;
  const c = new THREE.Color();
  const slim = look.slim ? 0.82 : 1;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const t = (x + 1) / 2; // 0 Schwanz .. 1 Kopf
    let p = Math.max(0.04, sh.prof(t));
    if (sh.snout && t > 0.8) p *= 1 - ((t - 0.8) / 0.2) * sh.snout * 0.5;
    let yy = y * sh.h * p * slim;
    const zz = z * sh.w * p;
    if (sh.hump && y > 0) yy *= 1 + sh.hump * Math.sin(Math.PI * Math.min(1, t * 1.3));
    if (sh.flatHead && y > 0 && t > 0.6) yy *= 1 - (t - 0.6) * 0.9;
    if (look.nose && t > 0.9 && y > -0.2) x += (t - 0.9) * 0.4; // stumpfe Nase der Nase
    pos.setXYZ(i, x * 0.5, yy, zz);

    // Farbe: Rücken -> Flanke -> Bauch
    const v = y; // -1 Bauch .. 1 Rücken
    if (v > 0.25) c.copy(cBody).lerp(cBack, Math.min(1, (v - 0.25) / 0.6));
    else c.copy(cBody).lerp(cBelly, Math.min(1, (0.25 - v) / 0.7));
    if (cBars && v > -0.4) {
      const bar = Math.sin(t * Math.PI * 14);
      if (bar > 0.55 && t > 0.2 && t < 0.85) c.lerp(cBars, 0.65);
    }
    if (cSpot && v > -0.45) {
      const n = hash(Math.floor(t * 40), Math.floor((v + 1) * 9), z > 0 ? 1 : 2);
      if (n > (look.shape === 'pike' ? 0.62 : 0.8)) c.lerp(cSpot, look.shape === 'flat' ? 0.95 : 0.8);
    }
    if (cScale) {
      const sx = Math.sin(t * 90 + (v * 12)) * Math.sin(v * 30 - t * 20);
      if (sx > 0.7) c.lerp(cScale, 0.35);
    }
    if (look.shape === 'salmon' || look.shape === 'grayling') c.offsetHSL(0, 0, (v + 1) * 0.02);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function finShape(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

export function createFish(fishId) {
  const f = FISH[fishId];
  const look = f.look;
  const sh = SHAPES[look.shape] || SHAPES.salmon;
  const g = new THREE.Group();
  g.name = 'fish-' + fishId;

  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.25 });
  const body = new THREE.Mesh(bodyGeometry(sh, look), bodyMat);
  body.castShadow = true;
  g.add(body);

  const finMat = new THREE.MeshStandardMaterial({
    color: look.fin, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.88,
  });
  const H = sh.h * (look.slim ? 0.82 : 1);

  // Schwanzflosse
  const tailH = look.shape === 'eel' ? H * 1.2 : look.shape === 'flat' ? H * 0.5 : H * 1.25;
  const tail = new THREE.Mesh(
    look.shape === 'sturgeon'
      ? finShape([[0, 0], [-0.16, tailH * 1.3], [-0.12, 0], [-0.1, -tailH * 0.5]])
      : finShape([[0.02, 0], [-0.12, tailH], [-0.08, 0], [-0.12, -tailH]]),
    finMat,
  );
  tail.position.x = -0.48;
  g.add(tail);
  g.userData.tail = tail;

  // Rückenflosse(n)
  if (look.shape === 'eel') {
    const pts = [];
    for (let i = 0; i <= 20; i++) pts.push([0.15 - i * 0.032, H * 0.6 + Math.sin(i / 20 * Math.PI) * H * 0.35]);
    for (let i = 20; i >= 0; i--) pts.push([0.15 - i * 0.032, H * 0.55]);
    g.add(new THREE.Mesh(finShape(pts), finMat));
  } else if (look.shape === 'grayling') {
    const d = new THREE.Mesh(finShape([[0.2, H * 0.85], [0.12, H * 2.4], [-0.15, H * 2.0], [-0.2, H * 0.7]]), finMat.clone());
    d.material.color.set(look.fin); d.material.emissive = new THREE.Color(0x3a1a5a);
    g.add(d);
  } else if (look.shape === 'perch') {
    // zwei Rückenflossen, die vordere stachelig mit dunklem Fleck
    const spikes = [[0.24, H * 0.95]];
    for (let i = 0; i < 7; i++) spikes.push([0.22 - i * 0.03, H * (1.8 - (i % 2) * 0.35)]);
    spikes.push([0.0, H * 1.0]);
    g.add(new THREE.Mesh(finShape(spikes), finMat));
    g.add(new THREE.Mesh(finShape([[-0.02, H * 1.0], [-0.06, H * 1.6], [-0.2, H * 1.3], [-0.24, H * 0.75]]), finMat));
  } else if (look.shape === 'pike') {
    g.add(new THREE.Mesh(finShape([[-0.18, H * 0.85], [-0.24, H * 1.55], [-0.38, H * 0.9]]), finMat));
  } else if (look.shape === 'catfish') {
    g.add(new THREE.Mesh(finShape([[0.18, H * 0.9], [0.14, H * 1.4], [0.1, H * 0.9]]), finMat));
  } else if (look.shape === 'flat') {
    // Saumflossen rundherum
    const pts = [];
    for (let i = 0; i <= 24; i++) { const a = 0.15 + (i / 24) * 0.7; pts.push([0.42 - a * 0.85, H * Math.sin(Math.PI * a) * 1.12]); }
    g.add(new THREE.Mesh(finShape(pts.concat(pts.slice().reverse().map(([x, y]) => [x, y * 0.6]))), finMat));
    const pb = pts.map(([x, y]) => [x, -y]);
    g.add(new THREE.Mesh(finShape(pb.concat(pb.slice().reverse().map(([x, y]) => [x, y * 0.6]))), finMat));
  } else {
    g.add(new THREE.Mesh(finShape([[0.12, H * 0.9], [0.05, H * 1.75], [-0.1, H * 1.4], [-0.12, H * 0.85]]), finMat));
    if (look.shape === 'salmon') g.add(new THREE.Mesh(finShape([[-0.3, H * 0.6], [-0.33, H * 0.95], [-0.37, H * 0.55]]), finMat)); // Fettflosse
  }

  // Brust- und Bauchflossen
  if (look.shape !== 'flat') {
    for (const side of [1, -1]) {
      const pec = new THREE.Mesh(finShape([[0, 0], [-0.1, -H * 0.5], [-0.05, -H * 0.1]]), finMat);
      pec.position.set(0.28, -H * 0.35, side * sh.w * 0.75);
      pec.rotation.y = side * 0.5;
      g.add(pec);
    }
    g.add(new THREE.Mesh(finShape([[-0.05, -H * 0.8], [-0.12, -H * 1.35], [-0.2, -H * 0.7]]), finMat));
  }

  // Augen
  const eyeMat = new THREE.MeshStandardMaterial({ color: look.eye || 0xf0d070, roughness: 0.2, metalness: 0.3 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05 });
  const eyeR = look.shape === 'catfish' ? 0.008 : look.shape === 'eel' ? 0.01 : look.shape === 'zander' ? 0.02 : 0.016;
  const eyeX = look.shape === 'pike' || look.shape === 'sturgeon' ? 0.4 : 0.42;
  for (const side of look.shape === 'flat' ? [1] : [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR * (look.shape === 'flat' ? 1.4 : 1), 12, 8), eyeMat);
    const ey = look.shape === 'flat' ? 0.06 : H * 0.28;
    const ez = look.shape === 'flat' ? sh.w * 0.6 : side * sh.w * 0.55;
    eye.position.set(eyeX, ey, ez);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.6, 10, 6), pupilMat);
    pupil.position.set(eyeX + eyeR * 0.15, ey, ez + Math.sign(ez || 1) * eyeR * 0.55);
    g.add(pupil);
    if (look.shape === 'flat') {
      const e2 = eye.clone(); e2.position.set(eyeX - 0.06, ey + 0.05, ez); g.add(e2);
      const p2 = pupil.clone(); p2.position.set(eyeX - 0.06 + eyeR * 0.15, ey + 0.05, ez + eyeR * 0.55); g.add(p2);
    }
  }

  // Barteln (Wels, Karpfen, Stör)
  if (look.shape === 'catfish' || fishId === 'karpfen' || look.shape === 'sturgeon') {
    const barbMat = new THREE.MeshStandardMaterial({ color: look.back, roughness: 0.7 });
    const n = look.shape === 'catfish' ? 2 : look.shape === 'sturgeon' ? 4 : 2;
    const len = look.shape === 'catfish' ? 0.22 : 0.04;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.47, -H * 0.1, side * 0.02),
        new THREE.Vector3(0.47 + len * 0.3, -H * 0.3, side * (0.03 + len * 0.3)),
        new THREE.Vector3(0.47 + len * 0.2, -H * 0.8, side * (0.04 + len * 0.7)),
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.004, 4), barbMat));
    }
  }
  // Knochenplatten (Stör)
  if (look.shape === 'sturgeon') {
    const plateMat = new THREE.MeshStandardMaterial({ color: look.plates, roughness: 0.5 });
    for (let i = 0; i < 12; i++) {
      const t = 0.15 + i * 0.06;
      const p = sh.prof(t);
      for (const [yy, zz] of [[H * p * 0.98, 0], [0, sh.w * p], [0, -sh.w * p]]) {
        const pl = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.016, 5), plateMat);
        pl.position.set(t - 0.5, yy, zz);
        if (zz) pl.rotation.x = Math.sign(zz) * Math.PI / 2;
        g.add(pl);
      }
    }
  }
  // Saibling: weiße Flossensäume
  if (look.finEdge) {
    const edge = new THREE.MeshBasicMaterial({ color: look.finEdge, side: THREE.DoubleSide });
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(finShape([[0.28, -H * 0.36], [0.27, -H * 0.42], [0.2, -H * 0.84], [0.19, -H * 0.78]]), edge);
      m.position.z = side * sh.w * 0.8;
      g.add(m);
    }
  }
  return g;
}

// Schwimmbewegung (Schwanzschlag) – im Loop aufrufen
export function animateFish(fish, t, speed = 1) {
  const tail = fish.userData.tail;
  if (tail) tail.rotation.y = Math.sin(t * 9 * speed) * 0.45;
  fish.children[0].rotation.y = Math.sin(t * 9 * speed + 1) * 0.06;
}
