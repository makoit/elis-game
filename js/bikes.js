import * as THREE from 'three';
import { BIKES, BIKE_COLORS } from './bikedata.js';
export { BIKES, BIKE_COLORS };

// ---------- Prozedurales Modell ----------
const UP = new THREE.Vector3(0, 1, 0);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const _d = new THREE.Vector3();

function tube(mat, r) {
  const m = new THREE.Mesh(CYL, mat);
  m.userData.r = r;
  return m;
}

function place(m, a, b) {
  _d.subVectors(b, a);
  const len = _d.length();
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, _d.divideScalar(len || 1));
  m.scale.set(m.userData.r, len, m.userData.r);
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function makeWheel(r, tire, rimMat, tireMat) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.TorusGeometry(r - tire, tire, 8, 24), tireMat);
  t.rotation.y = Math.PI / 2;
  g.add(t);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r - tire * 2, 0.012, 6, 24), rimMat);
  rim.rotation.y = Math.PI / 2;
  g.add(rim);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.008, (r - tire * 2) * 2, 0.008), rimMat);
    spoke.rotation.x = (i * Math.PI) / 4;
    g.add(spoke);
  }
  return g;
}

export function createBike(def, color = def.color) {
  const L = def.look;
  const g = new THREE.Group();
  const std = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.15, ...extra });
  const frameMat = std(color);
  const darkMat = std(0x222222, { roughness: 0.8 });
  const rimMat = std(0xcccccc, { metalness: 0.6 });
  const jerseyMat = std(def.jersey);
  const skinMat = std(0xf1c7a0);
  const helmetMat = std(def.helmet);
  const pantsMat = std(0x2b2f3a);

  const r = L.wheelR;
  const wheelBase = 0.56;
  const rear = v3(0, r, wheelBase);
  const front = v3(0, r, -wheelBase);
  const bb = v3(0, 0.3, 0.06);
  const seatTop = v3(0, L.road ? 0.96 : 0.92, 0.2);
  const headTop = v3(0, L.road ? 0.88 : 0.93, -0.4);
  const headBot = v3(0, L.road ? 0.74 : 0.78, -0.44);

  const wf = makeWheel(r, L.tire, rimMat, darkMat);
  wf.position.copy(front);
  const wr = makeWheel(r, L.tire, rimMat, darkMat);
  wr.position.copy(rear);
  g.add(wf, wr);

  const add = (mat, rad, a, b) => { const m = tube(mat, rad); place(m, a, b); g.add(m); return m; };
  add(frameMat, 0.022, bb, rear); // Kettenstrebe
  add(frameMat, 0.018, seatTop, rear); // Sitzstrebe
  add(frameMat, 0.026, bb, seatTop); // Sitzrohr
  add(frameMat, 0.026, seatTop.clone().setZ(0.18), headTop); // Oberrohr
  add(frameMat, 0.032, bb, headBot); // Unterrohr
  add(darkMat, L.fork, headBot, front); // Gabel
  if (L.shock) add(darkMat, 0.03, v3(0, 0.55, 0.14), v3(0, 0.36, 0.34)); // Dämpfer

  const stemTop = headTop.clone().add(v3(0, 0.09, -0.03));
  add(darkMat, 0.016, headTop, stemTop);
  add(darkMat, 0.014, stemTop.clone().setX(-0.27), stemTop.clone().setX(0.27)); // Lenker
  if (L.road) {
    for (const sx of [-1, 1]) {
      add(darkMat, 0.014, v3(sx * 0.21, stemTop.y, stemTop.z), v3(sx * 0.21, stemTop.y - 0.12, stemTop.z - 0.1));
    }
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.24), darkMat);
  seat.position.set(0, seatTop.y + 0.03, seatTop.z + 0.02);
  g.add(seat);

  // Fahrer
  const hip = v3(0, 0.99, 0.2);
  const shoulder = L.road ? v3(0, 1.26, -0.2) : v3(0, 1.38, -0.1);
  add(jerseyMat, 0.12, hip, shoulder);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), skinMat);
  head.position.copy(shoulder).add(v3(0, 0.15, -0.05));
  g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), helmetMat);
  helmet.position.copy(head.position).add(v3(0, 0.025, 0.015));
  g.add(helmet);
  const handY = stemTop.y, handZ = stemTop.z;
  for (const sx of [-1, 1]) {
    add(jerseyMat, 0.04, shoulder.clone().setX(sx * 0.19), v3(sx * (L.road ? 0.21 : 0.25), handY, handZ));
  }

  const legs = [-1, 1].map((sx) => ({
    sx,
    thigh: tube(pantsMat, 0.065),
    shin: tube(skinMat, 0.05),
    foot: new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.2), darkMat),
  }));
  legs.forEach((l) => g.add(l.thigh, l.shin, l.foot));

  const LEG = 0.46;
  const H = new THREE.Vector3(), F = new THREE.Vector3(), K = new THREE.Vector3();
  function pose(crank) {
    legs.forEach((l, i) => {
      const a = crank + i * Math.PI;
      F.set(l.sx * 0.12, bb.y + Math.cos(a) * 0.17, bb.z - Math.sin(a) * 0.17);
      H.set(l.sx * 0.1, hip.y, hip.z);
      const dy = F.y - H.y, dz = F.z - H.z;
      const D = Math.min(Math.hypot(dy, dz), LEG * 2 - 0.002);
      const half = D / 2;
      const hgt = Math.sqrt(LEG * LEG - half * half);
      const ny = dy / (Math.hypot(dy, dz) || 1), nz = dz / (Math.hypot(dy, dz) || 1);
      K.set(H.x, H.y + ny * half - nz * hgt, H.z + nz * half + ny * hgt); // Knie zeigt nach vorn
      place(l.thigh, H, K);
      place(l.shin, K, F);
      l.foot.position.copy(F).add(v3(0, -0.02, -0.04));
    });
  }
  pose(0);

  return {
    group: g,
    wheels: [wf, wr],
    wheelR: r,
    pose,
    spin(dist) { wf.rotation.x = wr.rotation.x = -dist / r; },
    setColor(c) { frameMat.color.setHex(c); },
  };
}
