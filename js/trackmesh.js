import * as THREE from 'three';
import { START, DS, mulberry32 } from './trackdata.js';

// Baut aus den Streckendaten die 3D-Welt: Gelände-Band, Dekoration, Felsen, Boost-Felder, Start/Ziel.

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

export function buildTrackMesh(track) {
  const { map, halfW, pointAt, terrainAt, rampAt, bankH } = track;
  const col = map.colors;
  const group = new THREE.Group();
  const rng = mulberry32(map.seed * 7 + 1);

  // ---- Gelände-Band entlang der Strecke ----
  const hw = halfW;
  const cross = [
    { lat: -40, t: 'g', drop: -40 }, { lat: -34, t: 'g' }, { lat: -20, t: 'g' }, { lat: -hw - 8, t: 'g' },
    { lat: -hw - 3, t: 'v' }, { lat: -hw, t: 'v' }, { lat: -hw, t: 'r' }, { lat: hw, t: 'r' },
    { lat: hw, t: 'v' }, { lat: hw + 3, t: 'v' }, { lat: hw + 8, t: 'g' }, { lat: 20, t: 'g' },
    { lat: 34, t: 'g' }, { lat: 40, t: 'g', drop: -40 },
  ];
  const m = cross.length;
  const rows = Math.ceil((track.end - START) / DS);
  const pos = new Float32Array(rows * m * 3);
  const colr = new Float32Array(rows * m * 3);
  const base = { g: new THREE.Color(col.grass), v: new THREE.Color(col.verge), r: new THREE.Color(col.road) };
  const rampCol = new THREE.Color(col.ramp);
  const tmp = new THREE.Color();
  const p = {};

  for (let i = 0; i < rows; i++) {
    const s = START + i * DS;
    pointAt(s, p);
    const rx = Math.cos(p.theta), rz = Math.sin(p.theta);
    const terr = terrainAt(s);
    const ramp = rampAt(s);
    const band = Math.floor(s / 6) % 2 ? 1 : 0.94;
    for (let j = 0; j < m; j++) {
      const c = cross[j];
      const a = Math.abs(c.lat);
      const fade = a <= hw + 1 ? 1 : Math.max(0, 1 - (a - hw - 1) / 3);
      const k = (i * m + j) * 3;
      pos[k] = p.x + rx * c.lat;
      pos[k + 2] = p.z + rz * c.lat;
      pos[k + 1] = terr + ramp * fade + bankH(c.lat) + (c.drop || 0);

      tmp.copy(base[c.t]);
      if (c.t === 'r' || c.t === 'v') {
        if (ramp > 0.02 && c.t === 'r') tmp.lerp(rampCol, 0.75);
        tmp.multiplyScalar(band);
      } else {
        tmp.multiplyScalar(0.9 + hash(i * 31 + j) * 0.2);
      }
      colr[k] = tmp.r; colr[k + 1] = tmp.g; colr[k + 2] = tmp.b;
    }
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j, b = a + 1, c = a + m, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));

  // ---- Dekoration (instanziert, damit es auf dem Tablet flott bleibt) ----
  const count = Math.round((track.end / 100) * map.trees);
  const decor = {
    round: [
      { geo: new THREE.CylinderGeometry(0.2, 0.28, 2, 6), color: 0x6b4a2b, y: 1 },
      { geo: new THREE.IcosahedronGeometry(1.7, 0), color: 0x3c9a4a, y: 3.2, vary: true },
    ],
    pine: [
      { geo: new THREE.CylinderGeometry(0.2, 0.3, 2, 6), color: 0x5a3d22, y: 1 },
      { geo: new THREE.ConeGeometry(1.8, 3.4, 7), color: 0x1f6b3a, y: 3.2, vary: true },
      { geo: new THREE.ConeGeometry(1.3, 2.6, 7), color: 0x267a42, y: 5.2, vary: true },
    ],
    palm: [
      { geo: new THREE.CylinderGeometry(0.15, 0.25, 5, 6), color: 0x8a6a3a, y: 2.5 },
      { geo: new THREE.ConeGeometry(2.2, 0.8, 7), color: 0x2f9a4a, y: 5.2, vary: true },
    ],
    cactus: [
      { geo: new THREE.CylinderGeometry(0.35, 0.4, 3.2, 7), color: 0x4a8a45, y: 1.6, vary: true },
      { geo: new THREE.SphereGeometry(0.34, 7, 5), color: 0x4a8a45, y: 3.2 },
    ],
  }[map.decor] || [];
  const side = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), mat4 = new THREE.Matrix4();
  const spots = [];
  for (let i = 0; i < count; i++) {
    const s = START + rng() * (track.end - START);
    const lat = (rng() < 0.5 ? -1 : 1) * (hw + 5 + rng() * 22);
    pointAt(s, p);
    spots.push({
      x: p.x + Math.cos(p.theta) * lat, z: p.z + Math.sin(p.theta) * lat,
      y: terrainAt(s) + bankH(lat), size: 0.8 + rng() * 0.9, rot: rng() * 6.28,
    });
  }
  for (const part of decor) {
    const mesh = new THREE.InstancedMesh(part.geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
    spots.forEach((sp, i) => {
      q.setFromAxisAngle(side.set(0, 1, 0), sp.rot);
      sc.setScalar(sp.size);
      mat4.compose(side.set(sp.x, sp.y + part.y * sp.size, sp.z), q, sc);
      mesh.setMatrixAt(i, mat4);
      tmp.setHex(part.color);
      if (part.vary) tmp.multiplyScalar(0.8 + hash(i * 7.3) * 0.4);
      mesh.setColorAt(i, tmp);
    });
    group.add(mesh);
  }

  // ---- Felsen ----
  const rockGeo = new THREE.DodecahedronGeometry(0.75, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: col.rock, flatShading: true });
  const rockMeshes = track.rocks.map((r) => {
    const mesh = new THREE.Mesh(rockGeo, rockMat);
    pointAt(r.s, p);
    const y = terrainAt(r.s) + rampAt(r.s);
    mesh.position.set(p.x + Math.cos(p.theta) * r.lat, y + 0.3, p.z + Math.sin(p.theta) * r.lat);
    mesh.scale.set(0.9 + hash(r.s) * 0.4, 0.8 + hash(r.s + 3) * 0.5, 0.9 + hash(r.s + 7) * 0.4);
    mesh.rotation.y = hash(r.s + 1) * 6;
    group.add(mesh);
    return mesh;
  });

  // ---- Boost-Felder ----
  const padTex = canvasTexture(64, 96, (g, w, h) => {
    g.fillStyle = '#1b2a49'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd400';
    for (let k = 0; k < 3; k++) {
      const y = 12 + k * 28;
      g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w - 8, y + 22); g.lineTo(w - 20, y + 22); g.lineTo(w / 2, y + 8);
      g.lineTo(20, y + 22); g.lineTo(8, y + 22); g.closePath(); g.fill();
    }
  });
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const padGeo = new THREE.PlaneGeometry(2.4, 3.6);
  const padMeshes = track.pads.map((pd) => {
    const holder = new THREE.Group();
    holder.rotation.order = 'YXZ';
    const mesh = new THREE.Mesh(padGeo, padMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.06;
    holder.add(mesh);
    pointAt(pd.s, p);
    holder.position.set(p.x + Math.cos(p.theta) * pd.lat, track.heightAt(pd.s), p.z + Math.sin(p.theta) * pd.lat);
    holder.rotation.y = -p.theta;
    holder.rotation.x = Math.atan(track.slopeAt(pd.s));
    group.add(holder);
    return holder;
  });

  // ---- Start- und Zielbogen ----
  function arch(s, label, checkered) {
    const tex = canvasTexture(512, 96, (g, w, h) => {
      g.fillStyle = checkered ? '#fff' : '#2fae4d'; g.fillRect(0, 0, w, h);
      if (checkered) {
        g.fillStyle = '#111';
        for (let y = 0; y < 4; y++) for (let x = 0; x < 32; x++) if ((x + y) % 2) g.fillRect(x * 16, y * 24, 16, 24);
        g.fillStyle = '#e5352b'; g.fillRect(96, 12, 320, 72);
      }
      g.fillStyle = '#fff'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, w / 2, h / 2 + 4);
    });
    const holder = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6.5, 0.4), postMat);
      post.position.set(sx * (hw + 1.2), 3.25, 0);
      holder.add(post);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2.4, 1.2, 0.2), new THREE.MeshBasicMaterial({ map: tex }));
    banner.position.y = 6.2;
    holder.add(banner);
    pointAt(s, p);
    holder.position.set(p.x, track.heightAt(s), p.z);
    holder.rotation.y = -p.theta;
    group.add(holder);
  }
  arch(0, 'START', false);
  arch(track.length, 'ZIEL', true);

  return { group, rockMeshes, padMeshes };
}

export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mt) => { if (mt.map) mt.map.dispose(); mt.dispose(); });
    }
  });
}
