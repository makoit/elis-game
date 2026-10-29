import * as THREE from '../../../vendor/three.module.js';
import { clone as cloneSkinned } from '../../../vendor/addons/utils/SkeletonUtils.js';
import { assets } from './assets.js';

// Fahrer aus einem echten 3D-Menschenmodell (Ready Player Me, Skelett wie Mixamo; dasselbe wie der Angler im Angelspiel).
// Kleidung wird umgefärbt bzw. als Hülle darübergelegt: Trikot (Muster aus der Garage, ohne Naht auf den Körper projiziert),
// lange Ärmel, Handschuhe, Rad-/Baggy-Shorts oder Motorradhose mit Stiefeln. Helm, Brille und Haare unter dem Helm
// baut bikes.js wie bisher, aber an der Kopfposition des Modells (headM).
// Oberkörper und Arme werden einmal beim Bauen gestellt (Rumpfneigung, Zwei-Knochen-IK an den Lenker);
// pro Frame bewegen sich nur die Beine (IK an Pedale bzw. Fußrasten).
// Koordinaten wie bikes.js: y oben, vorn = −z, Meter. Das Modell selbst blickt nach +z und wird um 180° gedreht.

const LEG_LEN = 0.93; // Oberschenkel + Unterschenkel des gebauten Fahrers (bikes.js: LT + LS) – darauf ist die Rahmengeometrie abgestimmt

let base = null;

export const riderReady = () => !!assets.rider;

// ---------- einmalige Vorbereitung (geteilt von allen Fahrern) ----------
function grayTexture(tex, mean = 0.62, killBright = false) {
  const img = tex.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const avg = sum / (px.length / 4);
  const k = (mean * 255) / avg;
  for (let i = 0; i < px.length; i += 4) {
    let l0 = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (killBright && l0 > avg * 1.8) l0 = avg; // Aufdruck wegretuschieren
    px[i] = px[i + 1] = px[i + 2] = Math.min(255, l0 * k);
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = tex.flipY;
  t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  return t;
}

// feines Gewebe als Normalmap
function fabricNormal() {
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const d = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const nx = Math.sin((x / N) * Math.PI * 64) * 0.16 + (Math.random() - 0.5) * 0.08;
      const ny = Math.sin((y / N) * Math.PI * 64) * 0.16 + (Math.random() - 0.5) * 0.08;
      const i = (y * N + x) * 4;
      d.data[i] = 128 + nx * 127; d.data[i + 1] = 128 + ny * 127; d.data[i + 2] = 255; d.data[i + 3] = 255;
    }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

const comp = (attr, v, k) => [attr.getX, attr.getY, attr.getZ, attr.getW][k].call(attr, v);
// Haupt-Knochen je Vertex (für Auswahl von Dreiecken nach Körperteil)
function mainBones(mesh) {
  const names = mesh.skeleton.bones.map((b) => b.name);
  const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const out = [];
  for (let v = 0; v < si.count; v++) {
    let best = 0, w = -1;
    for (let k = 0; k < 4; k++) { const ww = comp(sw, v, k); if (ww > w) { w = ww; best = comp(si, v, k); } }
    out.push(names[best]);
  }
  return out;
}

// Kopie einer Skinned-Geometrie: nur Dreiecke, für die keep(Knochen[3], y[3]) gilt; geglättet (Taubin) und entlang der Normalen
// um amount(y) verschoben (Hülle: Ärmel, Handschuhe, weite Shorts; negativ = enger). group(y) teilt in Material-Gruppen.
function shell(src, { keep = null, amount = () => 0, smooth = 0, group = null }) {
  const geo = src.geometry.clone();
  const pos = geo.attributes.position;
  const n = pos.count;
  const bonesOf = mainBones(src);
  const id = new Int32Array(n), P = [], map = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let u = map.get(k);
    if (u === undefined) { u = P.length; map.set(k, u); P.push([pos.getX(i), pos.getY(i), pos.getZ(i)]); }
    id[i] = u;
  }
  const idx = geo.index.array;
  let cur = P;
  if (smooth) {
    const nb = P.map(() => new Set());
    for (let t = 0; t < idx.length; t += 3) {
      const a = id[idx[t]], b = id[idx[t + 1]], c = id[idx[t + 2]];
      nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
    }
    for (let it = 0; it < smooth * 2; it++) {
      const f = it % 2 ? -0.53 : 0.5;
      cur = cur.map((p, u) => {
        if (!nb[u].size) return p;
        let x = 0, y = 0, z = 0;
        for (const v of nb[u]) { x += cur[v][0]; y += cur[v][1]; z += cur[v][2]; }
        const k = 1 / nb[u].size;
        return [p[0] + (x * k - p[0]) * f, p[1] + (y * k - p[1]) * f, p[2] + (z * k - p[2]) * f];
      });
    }
  }
  const N = cur.map(() => [0, 0, 0]);
  for (let t = 0; t < idx.length; t += 3) {
    const a = cur[id[idx[t]]], b = cur[id[idx[t + 1]]], c = cur[id[idx[t + 2]]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [id[idx[t]], id[idx[t + 1]], id[idx[t + 2]]]) { N[v][0] += nx; N[v][1] += ny; N[v][2] += nz; }
  }
  for (let i = 0; i < n; i++) {
    const p = cur[id[i]], q = N[id[i]], l = Math.hypot(q[0], q[1], q[2]) || 1, a = amount(P[id[i]][1]);
    pos.setXYZ(i, p[0] + (q[0] / l) * a, p[1] + (q[1] / l) * a, p[2] + (q[2] / l) * a);
  }
  const tris = [];
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    const ys = tri.map((v) => P[id[v]][1]);
    if (!keep || keep(tri.map((v) => bonesOf[v]), ys)) tris.push({ tri, g: group ? group((ys[0] + ys[1] + ys[2]) / 3) : 0 });
  }
  tris.sort((a, b) => a.g - b.g);
  geo.setIndex(tris.flatMap((t) => t.tri));
  geo.clearGroups();
  if (group) {
    let start = 0;
    for (let i = 1; i <= tris.length; i++) {
      if (i === tris.length || tris[i].g !== tris[start].g) { geo.addGroup(start * 3, (i - start) * 3, tris[start].g); start = i; }
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function prepare() {
  if (base) return base;
  const scene = assets.rider.scene;
  scene.updateMatrixWorld(true);
  const mesh = (n) => scene.getObjectByName(n);
  const bone = (n) => scene.getObjectByName(n);
  const wp = (n) => bone(n).getWorldPosition(new THREE.Vector3());
  const body = mesh('Wolf3D_Body'), top = mesh('Wolf3D_Outfit_Top'), bottom = mesh('Wolf3D_Outfit_Bottom'), head = mesh('Wolf3D_Head');
  const isArm = (b) => /Arm/.test(b) && !/Hand/.test(b);
  const isHand = (b) => /Hand/.test(b);
  const isLeg = (b) => /Leg|Foot|Toe/.test(b);
  const knee = wp('LeftLeg').y, ankle = wp('LeftFoot').y;
  const thigh = wp('LeftUpLeg').distanceTo(wp('LeftLeg')), shin = wp('LeftLeg').distanceTo(wp('LeftFoot'));
  // Kopf: Mittelpunkt und Tiefe des Schädels (Stirnhöhe) für die Helm-Anpassung
  const hp = head.geometry.attributes.position;
  let topY = -1e9, zMin = 1e9, zMax = -1e9;
  for (let i = 0; i < hp.count; i++) topY = Math.max(topY, hp.getY(i));
  for (let i = 0; i < hp.count; i++) {
    const y = hp.getY(i);
    if (y > topY - 0.1 && y < topY - 0.06 && Math.abs(hp.getX(i)) < 0.03) { zMin = Math.min(zMin, hp.getZ(i)); zMax = Math.max(zMax, hp.getZ(i)); }
  }
  const headK = (zMax - zMin) / 0.196; // Kopftiefe des gebauten Kopfes (HEAD_P) bei y = 0.04
  // Rücken (für die Startnummer)
  const tp = top.geometry.attributes.position;
  let backZ = 0;
  for (let i = 0; i < tp.count; i++) if (Math.abs(tp.getX(i)) < 0.04 && Math.abs(tp.getY(i) - 1.3) < 0.04) backZ = Math.min(backZ, tp.getZ(i));
  const shoulder = wp('LeftArm');
  scene.traverse((x) => { if (x.isMesh) { x.geometry.userData.shared = true; if (x.material.map) x.material.map.userData.shared = true; } });
  base = {
    scale: LEG_LEN / (thigh + shin),
    hips: wp('Hips'),
    footH: wp('LeftFoot').y - wp('LeftToeBase').y,
    footL: wp('LeftToeBase').z - wp('LeftFoot').z,
    toeH: wp('LeftToeBase').y,
    head: { center: new THREE.Vector3(0, topY - 0.126 * headK, (zMin + zMax) / 2), k: headK, restQ: bone('Head').getWorldQuaternion(new THREE.Quaternion()) },
    headBoneInv: bone('Head').matrixWorld.clone().invert(),
    back: new THREE.Vector3(0, 1.3, backZ - 0.006),
    jersey: { sh: shoulder, top: wp('Neck').y - 0.02, hem: 0.98, arm: shoulder.distanceTo(wp('LeftHand')) },
    grayTop: grayTexture(top.material.map, 0.62, true),
    grayBottom: grayTexture(bottom.material.map, 0.5),
    graySkin: grayTexture(head.material.map, 0.6),
    grayBody: grayTexture(body.material.map, 0.6),
    grayShoe: grayTexture(mesh('Wolf3D_Outfit_Footwear').material.map, 0.55),
    fabric: fabricNormal(),
    bodyGeo: shell(body, { keep: (b) => !b.some(isLeg) }), // Beine stecken in der Hose bzw. kommen aus der Hosen-Hülle
    sleeveGeo: shell(body, { keep: (b) => b.every(isArm), amount: () => 0.007, smooth: 4 }),
    gloveGeo: shell(body, { keep: (b) => b.some(isHand), amount: () => 0.0035, smooth: 1 }),
    bottoms: {},
    knee, ankle,
    bottomSrc: bottom,
  };
  for (const k of ['grayTop', 'grayBottom', 'graySkin', 'grayBody', 'grayShoe', 'fabric']) base[k].userData.shared = true;
  for (const k of ['bodyGeo', 'sleeveGeo', 'gloveGeo']) base[k].userData.shared = true;
  return base;
}

// Hose als Material-Gruppen: 0 = Stoff (Shorts/Hose), 1 = Haut, 2 = Socke bzw. Stiefel
function bottomGeo(kind) {
  if (base.bottoms[kind]) return base.bottoms[kind];
  const { knee, ankle } = base;
  const V = {
    road: { cut: knee + 0.1, sock: ankle + 0.12, cloth: -0.004, skin: -0.012 }, // enge Radhose knapp über dem Knie
    baggy: { cut: knee - 0.04, sock: ankle + 0.1, cloth: 0.005, skin: -0.012 }, // weite Shorts bis übers Knie
    moto: { cut: -1, sock: ankle + 0.25, cloth: 0.004, boot: 0.012 }, // lange Hose + hohe Stiefel
  }[kind];
  const grp = (y) => (y > V.cut ? 0 : y > V.sock ? 1 : 2);
  // Bund unter dem Trikot nach innen ziehen, sonst schaut er zackig unter dem Saum hervor
  const amt = (y) => { const g = grp(y); return y > base.jersey.hem - 0.05 ? -0.012 : g === 0 ? V.cloth : g === 1 ? V.skin : (V.boot ?? -0.006); };
  base.bottoms[kind] = shell(base.bottomSrc, { amount: amt, smooth: 3, group: grp });
  base.bottoms[kind].userData.shared = true;
  return base.bottoms[kind];
}

// Trikot-Muster aus der Garage (Textur-Layout wie der gebaute Fahrer, siehe bikes.js jerseyTex) per Zylinderprojektion
// aus der Bind-Pose: Rumpf rundherum (u 0..0.5, Rückenmitte = 0), Ärmel entlang des Arms (u 0.5..1).
function jerseyMaterial(tex, kitRough) {
  const J = base.jersey;
  tex.generateMipmaps = false; // atan-Projektion: ohne Mipmaps keine Naht an der Rückenmitte
  tex.minFilter = THREE.LinearFilter;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: kitRough, metalness: 0, normalMap: base.fabric, normalScale: new THREE.Vector2(0.35, 0.35) });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSh = { value: J.sh };
    sh.uniforms.uTop = { value: J.top };
    sh.uniforms.uHem = { value: J.hem };
    sh.uniforms.uArm = { value: J.arm };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind; uniform vec3 uSh; uniform float uTop, uHem, uArm;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec2 juv;
          if (abs(vBind.x) < uSh.x + 0.02) {
            float phi = atan(-vBind.x, -vBind.z);
            juv = vec2(fract(phi / 6.2831853) * 0.5, 1.0 - clamp((uTop - vBind.y) / (uTop - uHem), 0.01, 0.99));
          } else {
            vec3 d = vBind - vec3(sign(vBind.x) * uSh.x, uSh.y, uSh.z);
            float along = clamp(length(d) / uArm, 0.0, 1.0);
            float ang = atan(d.z, d.y);
            juv = vec2((vBind.x > 0.0 ? 0.502 : 0.752) + fract(ang / 6.2831853) * 0.246, 1.0 - (0.015 + along * 0.97));
          }
          diffuseColor *= texture2D(map, juv);
        #endif`);
  };
  m.customProgramCacheKey = () => 'jersey';
  return m;
}

// ---------- IK-Helfer ----------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

// Knochen so drehen, dass childWorld (ein Punkt, der am Knochen hängt) in Richtung targetWorld zeigt
function aimBone(bone, childWorld, targetWorld) {
  const bp = bone.getWorldPosition(_p);
  const from = _a.copy(childWorld).sub(bp).normalize();
  const to = _b.copy(targetWorld).sub(bp).normalize();
  _q.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(_q2);
  _q.multiply(_q2);
  bone.parent.getWorldQuaternion(_q3).invert();
  bone.quaternion.copy(_q3.multiply(_q));
  bone.updateMatrixWorld(true);
}

// Zwei-Knochen-IK: upper → mid → end, end landet auf target, Gelenk zeigt Richtung pole
function solve2(upper, mid, end, target, pole) {
  upper.updateMatrixWorld(true);
  const a = upper.getWorldPosition(new THREE.Vector3());
  const b = mid.getWorldPosition(new THREE.Vector3());
  const c = end.getWorldPosition(new THREE.Vector3());
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const toT = target.clone().sub(a);
  const d = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, toT.length()));
  const dir = toT.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const p = pole.clone().sub(a);
  p.sub(dir.clone().multiplyScalar(p.dot(dir))).normalize();
  const elbow = a.clone().addScaledVector(dir, l1 * cosA).addScaledVector(p, l1 * sinA);
  aimBone(upper, b, elbow);
  aimBone(mid, end.getWorldPosition(new THREE.Vector3()), a.clone().addScaledVector(dir, d));
}

// Finger um den Griff schließen (Mixamo-Skelett: Beugung um die lokale x-Achse)
function curlFingers(B, side, amount) {
  const ax = new THREE.Vector3(1, 0, 0);
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) {
    for (let k = 1; k <= 3; k++) {
      const b = B[`${side}Hand${f}${k}`];
      if (b) b.quaternion.multiply(_q.setFromAxisAngle(ax, amount * (k === 1 ? 1.0 : 1.3)));
    }
  }
  const t = B[`${side}HandThumb2`];
  if (t) t.quaternion.multiply(_q.setFromAxisAngle(ax, amount * 0.4));
}

// ---------- Fahrer bauen ----------
// o: group (Fahrzeug, noch am Ursprung), hip (Hüftgelenk-Mitte), grips [links, rechts] (Griffmitte), gripR, reachK (Schulter→Handgelenk
//    als Anteil der Armlänge), lean (Startwert Rumpfneigung), pelvis (Beckenkippung), pole (Ellbogen-Richtung, rechts), pitch (Kopf),
//    kneeOut (Knie seitlich), jerseyTex, numTex, kind ('road' | 'baggy' | 'moto'), longSleeve, colors {skin, shorts, shoes, glove, boot}
export function buildRider(o) {
  prepare();
  const s = base.scale;
  const root = new THREE.Group();
  root.rotation.y = Math.PI;
  root.scale.setScalar(s);
  const model = cloneSkinned(assets.rider.scene);
  root.add(model);
  o.group.add(root);
  const B = {};
  const meshes = {};
  model.traverse((x) => { if (x.isBone) B[x.name] = x; if (x.isMesh) meshes[x.name] = x; });
  const rest = Object.fromEntries(Object.entries(B).map(([n, b]) => [n, b.quaternion.clone()]));
  // Hüfte auf den Sattel
  root.position.copy(o.hip).sub(base.hips.clone().multiplyScalar(s).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
  o.group.updateMatrixWorld(true);

  // ---- Kleidung ----
  const std = (p) => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, ...p });
  const skinC = new THREE.Color(o.colors.skin);
  const skinMat = std({ map: base.grayBody, color: skinC.clone().multiplyScalar(1.15), roughness: 0.6 });
  const headMat = std({ map: base.graySkin, color: skinC.clone().multiplyScalar(1.15), roughness: 0.55 });
  const bind = (geo, mat, ref) => {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.bind(ref.skeleton, ref.bindMatrix);
    ref.parent.add(m);
    return m;
  };
  meshes.Wolf3D_Head.material = headMat;
  meshes.Wolf3D_Hair.visible = false; // Helm (Haare unter dem Helm baut bikes.js)
  const body = meshes.Wolf3D_Body;
  body.geometry = base.bodyGeo;
  body.material = skinMat;
  const jersey = jerseyMaterial(o.jerseyTex, o.kind === 'moto' ? 0.55 : 0.72);
  meshes.Wolf3D_Outfit_Top.material = jersey;
  if (o.longSleeve) bind(base.sleeveGeo, jersey, body);
  bind(base.gloveGeo, std({ color: o.colors.glove, roughness: 0.8 }), body);
  const bottom = meshes.Wolf3D_Outfit_Bottom;
  bottom.geometry = bottomGeo(o.kind);
  const cloth = std({ map: base.grayBottom, color: new THREE.Color(o.colors.shorts).multiplyScalar(1.6), normalMap: base.fabric, normalScale: new THREE.Vector2(0.3, 0.3), roughness: o.kind === 'moto' ? 0.5 : 0.75 });
  const lower = o.kind === 'moto' ? std({ color: o.colors.boot, roughness: 0.45 }) : std({ color: 0xf2f2f2, roughness: 0.9 });
  bottom.material = [cloth, skinMat, lower];
  const shoes = meshes.Wolf3D_Outfit_Footwear;
  shoes.material = std({ map: base.grayShoe, color: new THREE.Color(o.kind === 'moto' ? o.colors.boot : o.colors.shoes).multiplyScalar(1.4), roughness: 0.55 });
  model.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.frustumCulled = false; } });
  // Startnummer auf dem Rücken (hängt am Rumpf-Knochen)
  if (o.numTex) {
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.15 / s, 0.112 / s), new THREE.MeshStandardMaterial({ map: o.numTex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    num.position.copy(base.back);
    num.rotation.y = Math.PI;
    model.add(num);
    root.updateMatrixWorld(true);
    B.Spine2.attach(num);
  }

  // ---- Grundhaltung: Becken kippen, Rumpf neigen, bis die Hände bequem den Lenker erreichen ----
  const W = (v) => o.group.localToWorld(v.clone());
  const restHeadQ = B.Head.getWorldQuaternion(new THREE.Quaternion());
  const restNeckQ = B.Neck.getWorldQuaternion(new THREE.Quaternion());
  const groupQ = o.group.getWorldQuaternion(new THREE.Quaternion());
  B.Hips.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), o.pelvis));
  root.updateMatrixWorld(true);
  const armLen = B.LeftArm.getWorldPosition(new THREE.Vector3()).distanceTo(B.LeftForeArm.getWorldPosition(new THREE.Vector3()))
    + B.LeftForeArm.getWorldPosition(new THREE.Vector3()).distanceTo(B.LeftHand.getWorldPosition(new THREE.Vector3()));
  // Handgelenk-Ziele: etwas hinter und über der Griffmitte (Hand liegt auf dem Griff)
  const wrists = o.grips.map((g) => {
    const back = new THREE.Vector3(0, 0, 1);
    return g.clone().addScaledVector(back, 0.07).add(new THREE.Vector3(0, o.gripR + 0.025, 0));
  });
  const wristsW = wrists.map(W);
  const sp = ['Spine', 'Spine1', 'Spine2'];
  const lean = (th) => {
    for (const n of sp) B[n].quaternion.copy(rest[n]);
    B.Spine.updateMatrixWorld(true);
    const dir = new THREE.Vector3(0, Math.cos(th), -Math.sin(th)).applyQuaternion(groupQ);
    const spW = B.Spine.getWorldPosition(new THREE.Vector3());
    aimBone(B.Spine, B.Neck.getWorldPosition(new THREE.Vector3()), spW.add(dir));
    // Rundrücken: obere Wirbel etwas weiter nach vorn
    B.Spine1.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), o.curve));
    B.Spine2.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), o.curve * 0.5));
    B.Spine.updateMatrixWorld(true);
    return ['LeftArm', 'RightArm'].reduce((acc, n, i) => acc + B[n].getWorldPosition(new THREE.Vector3()).distanceTo(wristsW[i]), 0) / 2;
  };
  const want = armLen * o.reachK;
  let best = 0.5, bestErr = 1e9;
  for (let th = 0.05; th < 1.5; th += 0.02) {
    const e = Math.abs(lean(th) - want);
    if (e < bestErr) { bestErr = e; best = th; }
  }
  lean(best);

  // ---- Kopf: nach vorn schauen (gegen die Rumpfneigung aufgerichtet) ----
  const headWant = groupQ.clone().multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -o.pitch)).multiply(groupQ.clone().invert()).multiply(restHeadQ);
  const neckNow = B.Neck.getWorldQuaternion(new THREE.Quaternion());
  const setWorldQ = (bone, q) => { bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)); bone.updateMatrixWorld(true); };
  const neckWant = headWant.clone().multiply(restHeadQ.clone().invert()).multiply(restNeckQ);
  setWorldQ(B.Neck, neckNow.clone().slerp(neckWant, 0.5));
  setWorldQ(B.Head, headWant);

  // ---- Arme an den Lenker, Hände um den Griff ----
  ['Left', 'Right'].forEach((side, i) => {
    const sx = i ? 1 : -1; // Fahrzeug-x: rechts = +x
    const sh = B[side + 'Arm'].getWorldPosition(new THREE.Vector3());
    const pole = sh.clone().add(new THREE.Vector3(sx * o.pole.x, o.pole.y, o.pole.z).applyQuaternion(groupQ));
    solve2(B[side + 'Arm'], B[side + 'ForeArm'], B[side + 'Hand'], wristsW[i], pole);
    // Finger zeigen über den Griff nach vorn-unten, Daumen nach innen
    const hand = B[side + 'Hand'];
    const gW = W(o.grips[i]);
    const fingerT = gW.clone().add(new THREE.Vector3(0, -0.01, -0.03).applyQuaternion(groupQ));
    aimBone(hand, B[side + 'HandMiddle1'].getWorldPosition(new THREE.Vector3()), fingerT);
    const hp = hand.getWorldPosition(new THREE.Vector3());
    const F = fingerT.clone().sub(hp).normalize();
    const thumb = B[side + 'HandThumb1'].getWorldPosition(new THREE.Vector3()).sub(hp);
    thumb.addScaledVector(F, -thumb.dot(F)).normalize();
    const wantT = new THREE.Vector3(-sx, 0.6, 0).applyQuaternion(groupQ);
    wantT.addScaledVector(F, -wantT.dot(F)).normalize();
    const ang = Math.atan2(new THREE.Vector3().crossVectors(thumb, wantT).dot(F), thumb.dot(wantT));
    _q.setFromAxisAngle(F, ang);
    setWorldQ(hand, _q.clone().multiply(hand.getWorldQuaternion(new THREE.Quaternion())));
    curlFingers(B, side, 1.05);
  });
  root.updateMatrixWorld(true);

  // ---- Kopfrahmen für Helm/Brille/Haare (Gruppen-Koordinaten, y oben, Gesicht −z) ----
  const hc = base.head.center.clone().applyMatrix4(base.headBoneInv); // Kopfmitte im Kopfknochen
  const centerW = B.Head.localToWorld(hc);
  const delta = B.Head.getWorldQuaternion(new THREE.Quaternion()).multiply(restHeadQ.clone().invert());
  const gInv = o.group.matrixWorld.clone().invert();
  const headM = new THREE.Matrix4().compose(centerW.applyMatrix4(gInv), groupQ.clone().invert().multiply(delta).multiply(groupQ), new THREE.Vector3().setScalar(1.06 * base.head.k * s));

  // ---- Beine (pro Frame) ----
  const legBones = ['UpLeg', 'Leg', 'Foot', 'ToeBase'];
  for (const sd of ['Left', 'Right']) B[sd + 'Foot'].scale.setScalar(0.9);
  const fh = base.footH * s * 0.9, fl = base.footL * s * 0.9, toeH = base.toeH * s * 0.9;
  // Fußballen auf (x, py, pz) (Pedalachse bzw. Fußraste), Fußneigung fp (Spitze unten < 0)
  function placeLeg(sx, x, py, pz, fp) {
    const side = sx < 0 ? 'Left' : 'Right';
    for (const n of legBones) B[side + n].quaternion.copy(rest[side + n]);
    const c = Math.cos(fp), si = Math.sin(fp);
    const ball = _t.set(x, py + toeH * 0.7, pz);
    const ankle = new THREE.Vector3(x, ball.y + fh * c - fl * si, pz + fh * si + fl * c);
    const hipW = B[side + 'UpLeg'].getWorldPosition(new THREE.Vector3());
    const pole = hipW.clone().add(new THREE.Vector3(sx * o.kneeOut, 0.3, -1).applyQuaternion(o.group.getWorldQuaternion(_q2)));
    const ballW = W(ball);
    solve2(B[side + 'UpLeg'], B[side + 'Leg'], B[side + 'Foot'], W(ankle), pole);
    aimBone(B[side + 'Foot'], B[side + 'ToeBase'].getWorldPosition(new THREE.Vector3()), ballW);
  }
  return { root, headM, placeLeg, update() { o.group.updateWorldMatrix(true, false); root.updateMatrixWorld(true); } };
}
