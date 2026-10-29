import * as THREE from '../../../vendor/three.module.js';
import { mergeGeometries } from '../../../vendor/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './trackdata.js';

// Zuschauer am Streckenrand: kleine Gruppen, die jubeln (hüpfen, Arme hoch) – lauter und wilder, wenn der Fahrer vorbeikommt.
// Drei instanzierte Meshes teilen sich dieselben Matrizen: Shirts (Farbe pro Person), Haut (Hautton pro Person), Rest (Hose, Haare).

const SHIRTS = [0xe5352b, 0xff8a1f, 0xffd400, 0x2fae4d, 0x1fb5c9, 0x1f6fe5, 0x8e44ad, 0xff4f9a, 0xf2f2f2, 0x2d2d33];
const SKINS = [0xf3d2b5, 0xe9b996, 0xd29a74, 0xa86f4c, 0x7a4b30, 0x5a3624];

const paint = (geo, color) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
};
const tube = (a, b, r1, r2, color, seg = 7) => {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return paint(g, color);
};
const ball = (p, r, sx, sy, sz, color, seg = 8) => paint(new THREE.SphereGeometry(r, seg, 6).scale(sx, sy, sz).translate(p.x, p.y, p.z), color);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function personParts() {
  const shirt = mergeGeometries([
    tube(V(0, 0.82, 0), V(0, 1.38, 0), 0.2, 0.25, 0xffffff, 8), // Oberkörper
    tube(V(0.25, 1.32, 0), V(0.36, 1.72, 0.04), 0.07, 0.065, 0xffffff, 6), // Arme hoch
    tube(V(-0.25, 1.32, 0), V(-0.36, 1.72, 0.04), 0.07, 0.065, 0xffffff, 6),
  ]);
  const skin = mergeGeometries([
    ball(V(0, 1.58, 0.01), 0.125, 1, 1.1, 1, 0xffffff, 8), // Kopf
    tube(V(0, 1.4, 0), V(0, 1.5, 0), 0.05, 0.05, 0xffffff, 6), // Hals
    ball(V(0.37, 1.78, 0.04), 0.06, 1, 1, 1, 0xffffff, 6), // Hände
    ball(V(-0.37, 1.78, 0.04), 0.06, 1, 1, 1, 0xffffff, 6),
  ]);
  const rest = mergeGeometries([
    tube(V(0.1, 0, 0), V(0.1, 0.85, 0), 0.085, 0.1, 0x2a3350, 6), // Beine
    tube(V(-0.1, 0, 0), V(-0.1, 0.85, 0), 0.085, 0.1, 0x2a3350, 6),
    ball(V(0, 1.64, -0.015), 0.13, 1.02, 0.8, 1.05, 0x2b1d14, 8), // Haare
  ]);
  return { shirt, skin, rest };
}

export function createCrowd(track, quality = 'high') {
  const map = track.map;
  const rng = mulberry32(map.seed * 13 + 5);
  const hw = track.halfW;
  const L = track.lapLength;
  const group = new THREE.Group();
  const density = (map.crowd ?? 1) * (quality === 'low' ? 0.55 : 1);

  // Orte der Gruppen: gleichmäßig verteilt, plus großes Publikum an Start/Ziel
  const clusters = [];
  const addCluster = (s, side, n, spread) => clusters.push({ s, side, n, spread, jump: 0 });
  const count = Math.round((L / 100) * density);
  for (let i = 0; i < count; i++) {
    const s = 60 + ((i + 0.2 + rng() * 0.6) / count) * (L - 120);
    addCluster(s, rng() < 0.5 ? -1 : 1, 5 + Math.floor(rng() * 8), 5);
    if (rng() < 0.35) addCluster(s + 10 + rng() * 20, -1, 4 + Math.floor(rng() * 5), 4); // Gegenseite
  }
  const big = quality === 'low' ? 10 : 16;
  for (const sx of [-1, 1]) {
    addCluster(8, sx, big, 9);
    addCluster(track.loop ? L - 14 : track.length - 14, sx, big, 9);
  }
  if (!track.loop) { addCluster(track.length + 12, 1, 10, 6); addCluster(track.length + 20, -1, 10, 6); }

  // Positionen der Streckenteile (damit bei Rundkursen niemand auf einem anderen Streckenabschnitt steht)
  const p = {};
  const samples = [];
  for (let s = track.meshFrom; s < track.meshTo; s += 6) { track.pointAt(s, p); samples.push(p.x, p.z, s); }
  const nearOther = (x, z, s) => {
    const lim = (hw + 2) ** 2;
    for (let i = 0; i < samples.length; i += 3) {
      if (Math.abs(samples[i + 2] - s) < 30) continue;
      if ((samples[i] - x) ** 2 + (samples[i + 1] - z) ** 2 < lim) return true;
    }
    return false;
  };

  const people = [];
  for (const c of clusters) {
    c.people = [];
    for (let i = 0; i < c.n; i++) {
      const s = c.s + (rng() - 0.5) * 2 * c.spread;
      const lat = c.side * (hw + 1.7 + rng() * (c.spread > 6 ? 4 : 2.6));
      track.pointAt(s, p);
      const x = p.x + Math.cos(p.theta) * lat, z = p.z + Math.sin(p.theta) * lat;
      if (track.loop && nearOther(x, z, s)) continue;
      const kid = rng() < 0.2;
      const per = {
        s, x, z, cluster: c,
        y: track.terrainAt(s) + track.bankH(lat) + (track.rampAt(s) - lat * Math.tan(track.bankAt(s))) * Math.max(0, 1 - (Math.abs(lat) - hw - 1) / 3) - 0.02, // wie das Gelände-Mesh
        yaw: -p.theta + (c.side > 0 ? -Math.PI / 2 : Math.PI / 2) + (rng() - 0.5) * 0.8, // zur Strecke schauen
        scale: (kid ? 0.62 : 0.88) + rng() * 0.2,
        ph: rng() * 6.28, hz: 2.2 + rng() * 1.6,
        shirt: SHIRTS[Math.floor(rng() * SHIRTS.length)], skin: SKINS[Math.floor(rng() * SKINS.length)],
      };
      c.people.push(per);
      people.push(per);
    }
  }

  const parts = personParts();
  const mats = {
    shirt: new THREE.MeshLambertMaterial({ vertexColors: true }),
    skin: new THREE.MeshLambertMaterial({ vertexColors: true }),
    rest: new THREE.MeshLambertMaterial({ vertexColors: true }),
  };
  const meshes = ['shirt', 'skin', 'rest'].map((k) => {
    const im = new THREE.InstancedMesh(parts[k], mats[k], Math.max(1, people.length));
    im.frustumCulled = false;
    im.castShadow = false;
    group.add(im);
    return im;
  });
  const col = new THREE.Color();
  people.forEach((per, i) => {
    meshes[0].setColorAt(i, col.setHex(per.shirt));
    meshes[1].setColorAt(i, col.setHex(per.skin));
  });
  meshes[0].instanceColor.needsUpdate = meshes[1].instanceColor.needsUpdate = true;

  // Fähnchen-Girlande an Start/Ziel
  const flagCols = [0xe5352b, 0xffd400, 0x2fae4d, 0x1f6fe5, 0xff8a1f, 0xf2f2f2];
  const flagGeo = new THREE.PlaneGeometry(0.5, 0.7).translate(0, -0.35, 0);
  const flagMesh = new THREE.InstancedMesh(flagGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 80);
  {
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (const s0 of [track.loop ? L - 2 : -2, 2]) {
      for (let i = 0; i < 20 && k < 80; i++) {
        const lt = -hw - 1.3 + (i / 19) * (hw * 2 + 2.6);
        track.pointAt(s0, p);
        const y = track.heightAt(s0) + 6.2 + Math.sin((i / 19) * Math.PI) * -0.6 + 0.6;
        m4.makeRotationY(-p.theta + Math.PI / 2).setPosition(p.x + Math.cos(p.theta) * lt, y, p.z + Math.sin(p.theta) * lt);
        flagMesh.setMatrixAt(k, m4);
        flagMesh.setColorAt(k, col.setHex(flagCols[i % flagCols.length]));
        k++;
      }
    }
    flagMesh.count = k;
    flagMesh.frustumCulled = false;
    group.add(flagMesh);
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  let t = 0, frame = 0;
  const state = { cheer: 0, excite: 0, group };

  // Abstand (m) zwischen Fahrer und Gruppe entlang der Strecke (bei Rundkursen mit Umlauf)
  const delta = (cs, ps) => {
    let d = cs - ps;
    if (track.loop) d = ((d + L / 2) % L + L) % L - L / 2;
    return d;
  };

  state.update = (dt, playerS, speed) => {
    t += dt;
    frame++;
    if (quality === 'low' && frame % 2) return state.cheer;
    const ps = track.wrap(playerS);
    let cheer = 0;
    for (const c of clusters) {
      const d = delta(c.s, ps);
      // Reaktion beginnt 45 m vor der Gruppe und hält 20 m dahinter an
      const near = d > 0 ? Math.max(0, 1 - d / 45) : Math.max(0, 1 + d / 20);
      c.jump += ((near > 0.01 ? near : 0.0) - c.jump) * Math.min(1, dt * 4);
      if (c.people) cheer = Math.max(cheer, Math.min(1, c.jump) * (c.n > 12 ? 1.3 : 0.7));
    }
    state.cheer = Math.min(1, cheer);
    const wild = Math.max(state.excite, 0);
    for (let i = 0; i < people.length; i++) {
      const per = people[i];
      const c = per.cluster;
      const d = delta(per.s, ps);
      let lvl;
      if (d > 150 || d < -150) lvl = 0.0; else lvl = Math.max(c.jump, wild);
      const idle = 0.04;
      const hop = Math.abs(Math.sin(t * per.hz + per.ph));
      const y = per.y + hop * (idle + lvl * 0.42) * per.scale;
      const sway = Math.sin(t * per.hz * 0.5 + per.ph) * (0.04 + lvl * 0.16);
      q.setFromEuler(e.set(0, per.yaw, sway));
      sc.setScalar(per.scale * (1 + hop * lvl * 0.04));
      m4.compose(pos.set(per.x, y, per.z), q, sc);
      meshes[0].setMatrixAt(i, m4); meshes[1].setMatrixAt(i, m4); meshes[2].setMatrixAt(i, m4);
    }
    meshes.forEach((im) => { im.instanceMatrix.needsUpdate = true; });
    return state.cheer;
  };
  state.update(0, 0, 0);
  return state;
}
