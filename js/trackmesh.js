import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { START, mulberry32 } from './trackdata.js';

// Baut aus den Streckendaten die 3D-Welt: Gelände (in Abschnitten, damit Unsichtbares gespart wird),
// Straßenbelag mit Textur, Dekoration, Felsen, Boost-Felder, Start/Ziel.

const MESH_DS = 1.0; // Zeilenabstand des Geländes
const CHUNK = 120; // Meter pro Abschnitt

function canvasTexture(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

// kachelbares Wertrauschen (mehrere Oktaven) → Helligkeit 0..1
function noiseField(size, cells, seed) {
  const rnd = mulberry32(seed);
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => { // x,y in 0..1
    const gx = x * cells, gy = y * cells;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = sm(gx - x0), fy = sm(gy - y0);
    const g = (i, j) => grid[((j % cells) * cells) + (i % cells)];
    const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

function fractalTexture(size, base, contrast, seed, post) {
  return canvasTexture(size, size, (g, w, h) => {
    const n1 = noiseField(w, 8, seed), n2 = noiseField(w, 24, seed + 1), n3 = noiseField(w, 64, seed + 2);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w, v = y / h;
        let n = n1(u, v) * 0.5 + n2(u, v) * 0.3 + n3(u, v) * 0.2;
        n = (n - 0.5) * contrast + 0.5;
        const c = post ? post(n, u, v) : [n, n, n];
        const k = (y * w + x) * 4;
        img.data[k] = Math.max(0, Math.min(255, c[0] * 255 * base[0]));
        img.data[k + 1] = Math.max(0, Math.min(255, c[1] * 255 * base[1]));
        img.data[k + 2] = Math.max(0, Math.min(255, c[2] * 255 * base[2]));
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, true);
}

export function buildTrackMesh(track, quality = 'high') {
  const { map, halfW: hw, pointAt, terrainAt, rampAt, bankAt, bankH } = track;
  const col = map.colors;
  const group = new THREE.Group();
  const rng = mulberry32(map.seed * 7 + 1);
  const tex = quality === 'low' ? 256 : 512;

  // ---- Texturen ----
  const grassTex = fractalTexture(tex, [1.85, 1.85, 1.85], 0.55, map.seed, (n, u, v) => {
    const blade = hash(Math.floor(u * 400) * 7 + Math.floor(v * 400)) > 0.93 ? 0.06 : 0;
    return [n + blade, n + blade, n + blade * 0.5];
  });
  grassTex.repeat.set(1, 1);
  const road = new THREE.Color(col.road);
  const asphalt = map.surface === 'asphalt';
  const roadTex = canvasTexture(256, 512, (g, w, h) => {
    const n1 = noiseField(w, 16, map.seed + 9), n2 = noiseField(w, 64, map.seed + 10);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w, v = y / h;
        let n = 0.62 + (n1(u, v) - 0.5) * 0.35 + (n2(u, v) - 0.5) * 0.3;
        if (!asphalt) {
          // Reifenspuren
          const t1 = Math.exp(-Math.pow((u - 0.34) / 0.045, 2)), t2 = Math.exp(-Math.pow((u - 0.66) / 0.045, 2));
          n -= (t1 + t2) * 0.16;
          if (hash(x * 13 + y * 7) > 0.985) n += 0.25; // Kieselsteine
        }
        let r = road.r * n * 1.1, gg = road.g * n * 1.1, b = road.b * n * 1.1;
        if (asphalt) {
          const edge = u < 0.025 || u > 0.975;
          const dash = Math.abs(u - 0.5) < 0.008 && (v * 4) % 1 < 0.5;
          if (edge || dash) { r = 0.9; gg = 0.9; b = 0.88; }
        }
        const k = (y * w + x) * 4;
        // road.r etc. sind linear; Canvas erwartet sRGB
        const enc = (c) => Math.pow(Math.max(0, Math.min(1, c)), 1 / 2.2) * 255;
        img.data[k] = enc(r); img.data[k + 1] = enc(gg); img.data[k + 2] = enc(b); img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, true);

  const MatCls = quality === 'low' ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const terrainMat = new MatCls({ vertexColors: true, map: grassTex, ...(quality === 'low' ? {} : { roughness: 0.95, metalness: 0 }) });
  const roadMat = new MatCls({ vertexColors: true, map: roadTex, ...(quality === 'low' ? {} : { roughness: asphalt ? 0.8 : 0.98, metalness: 0 }) });

  // ---- Gelände-Band, in Abschnitten ----
  const cross = [
    { lat: -40, t: 'g', drop: -40 }, { lat: -34, t: 'g' }, { lat: -20, t: 'g' }, { lat: -hw - 8, t: 'g' },
    { lat: -hw - 3, t: 'v' }, { lat: -hw, t: 'v' }, { lat: -hw, t: 'r' }, { lat: hw, t: 'r' },
    { lat: hw, t: 'v' }, { lat: hw + 3, t: 'v' }, { lat: hw + 8, t: 'g' }, { lat: 20, t: 'g' },
    { lat: 34, t: 'g' }, { lat: 40, t: 'g', drop: -40 },
  ];
  const m = cross.length;
  const roadJ = cross.findIndex((c) => c.t === 'r');
  const base = { g: new THREE.Color(col.grass), v: new THREE.Color(col.verge) };
  const rampCol = new THREE.Color(col.ramp);
  const tmp = new THREE.Color();
  const p = {};
  const totalRows = Math.ceil((track.end - START) / MESH_DS);

  const chunks = [];
  const rowsPerChunk = Math.round(CHUNK / MESH_DS);
  for (let r0 = 0; r0 < totalRows - 1; r0 += rowsPerChunk) {
    const r1 = Math.min(totalRows - 1, r0 + rowsPerChunk);
    const nr = r1 - r0 + 1;
    const pos = new Float32Array(nr * m * 3);
    const colr = new Float32Array(nr * m * 3);
    const uvT = new Float32Array(nr * m * 2);
    const uvR = new Float32Array(nr * m * 2);
    for (let i = 0; i < nr; i++) {
      const s = START + (r0 + i) * MESH_DS;
      pointAt(s, p);
      const rx = Math.cos(p.theta), rz = Math.sin(p.theta);
      const terr = terrainAt(s);
      const ramp = rampAt(s);
      const bt = Math.tan(bankAt(s));
      const band = Math.floor(s / 8) % 2 ? 1 : 0.95;
      for (let j = 0; j < m; j++) {
        const c = cross[j];
        const a = Math.abs(c.lat);
        const fade = a <= hw + 1 ? 1 : Math.max(0, 1 - (a - hw - 1) / 3);
        const k = (i * m + j) * 3;
        const x = p.x + rx * c.lat, z = p.z + rz * c.lat;
        pos[k] = x;
        pos[k + 2] = z;
        pos[k + 1] = terr + ramp * fade + bankH(c.lat) - c.lat * bt * fade + (c.drop || 0);
        uvT[(i * m + j) * 2] = x * 0.12;
        uvT[(i * m + j) * 2 + 1] = z * 0.12;
        uvR[(i * m + j) * 2] = (c.lat + hw) / (2 * hw);
        uvR[(i * m + j) * 2 + 1] = s / 16;
        if (c.t === 'r') {
          tmp.setRGB(1, 1, 1);
          if (ramp > 0.03) tmp.lerp(rampCol, 0.55);
        } else {
          tmp.copy(base[c.t]);
          if (c.t === 'v') tmp.multiplyScalar(band); else tmp.multiplyScalar(0.88 + hash((r0 + i) * 31 + j) * 0.24);
        }
        colr[k] = tmp.r; colr[k + 1] = tmp.g; colr[k + 2] = tmp.b;
      }
    }
    const idxT = [], idxR = [];
    for (let i = 0; i < nr - 1; i++) {
      for (let j = 0; j < m - 1; j++) {
        const a = i * m + j, b = a + 1, c2 = a + m, d = c2 + 1;
        (j === roadJ ? idxR : idxT).push(a, b, c2, b, d, c2);
      }
    }
    const make = (idx, uv, mat) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    make(idxT, uvT, terrainMat);
    make(idxR, uvR, roadMat);
    chunks.push(r0);
  }

  // ---- Dekoration (instanziert) ----
  const count = Math.round((track.end / 100) * map.trees);
  const blob = (r, detail, seed, squash = 1) => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const pos = g.attributes.position;
    const rnd = mulberry32(seed);
    const cache = new Map();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!cache.has(key)) cache.set(key, 0.82 + rnd() * 0.36);
      const f = cache.get(key);
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * squash, pos.getZ(i) * f);
    }
    g.computeVertexNormals();
    return g;
  };
  const colored = (geo, hexColor, bottomDark = true) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    const c = new THREE.Color(hexColor);
    const arr = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) {
      const t = (g.attributes.position.getY(i) - min.y) / (max.y - min.y || 1);
      const k = bottomDark ? 0.55 + 0.6 * t : 1;
      arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const at = (geo, x, y, z) => geo.translate(x, y, z);
  const treeGeo = {
    round: () => mergeGeometries([
      colored(at(new THREE.CylinderGeometry(0.2, 0.3, 2.6, 7), 0, 1.3, 0), 0x5f4429, false),
      colored(at(blob(1.9, 1, 1, 0.9), 0, 3.6, 0), 0x3d9a48),
      colored(at(blob(1.3, 1, 2, 0.9), 1.1, 3.0, 0.4), 0x4aa84f),
      colored(at(blob(1.2, 1, 3, 0.9), -0.9, 3.3, -0.6), 0x36883f),
    ]),
    pine: () => mergeGeometries([
      colored(at(new THREE.CylinderGeometry(0.18, 0.3, 2, 7), 0, 1, 0), 0x56391f, false),
      colored(at(new THREE.ConeGeometry(2.0, 3.2, 9), 0, 3.0, 0), 0x1f6b3a),
      colored(at(new THREE.ConeGeometry(1.6, 2.8, 9), 0, 4.6, 0), 0x25773f),
      colored(at(new THREE.ConeGeometry(1.1, 2.4, 9), 0, 6.1, 0), 0x2c8548),
    ]),
    palm: () => mergeGeometries([
      colored(at(new THREE.CylinderGeometry(0.16, 0.28, 6, 7), 0, 3, 0), 0x8a6a3a, false),
      ...[0, 1, 2, 3, 4, 5].map((i) => {
        const g = new THREE.ConeGeometry(0.35, 3.2, 4).rotateZ(Math.PI / 2 + 0.5).translate(1.4, 0, 0).rotateY((i / 6) * Math.PI * 2).translate(0, 6, 0);
        return colored(g, 0x2f9a4a, false);
      }),
    ]),
    cactus: () => mergeGeometries([
      colored(at(new THREE.CylinderGeometry(0.38, 0.42, 3.4, 8), 0, 1.7, 0), 0x4a8a45),
      colored(at(new THREE.SphereGeometry(0.38, 8, 6), 0, 3.4, 0), 0x4a8a45, false),
      colored(at(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 7).rotateZ(Math.PI / 2), 0.7, 1.9, 0), 0x4a8a45),
      colored(at(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 7), 1.2, 2.4, 0), 0x4a8a45),
    ]),
  }[map.decor];
  if (treeGeo) {
    const spots = [];
    for (let i = 0; i < count; i++) {
      const s = START + rng() * (track.end - START);
      const lat = (rng() < 0.5 ? -1 : 1) * (hw + 5 + rng() * 24);
      pointAt(s, p);
      spots.push({ x: p.x + Math.cos(p.theta) * lat, z: p.z + Math.sin(p.theta) * lat, y: terrainAt(s) + bankH(lat) - 0.2, size: 0.8 + rng() * 0.9, rot: rng() * 6.28 });
    }
    const mesh = new THREE.InstancedMesh(treeGeo(), new THREE.MeshLambertMaterial({ vertexColors: true }), spots.length);
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(), mat4 = new THREE.Matrix4(), axis = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3();
    spots.forEach((sp, i) => {
      q.setFromAxisAngle(axis, sp.rot);
      sc.setScalar(sp.size);
      mat4.compose(pv.set(sp.x, sp.y, sp.z), q, sc);
      mesh.setMatrixAt(i, mat4);
      tmp.setScalar(0.8 + hash(i * 7.3) * 0.4);
      mesh.setColorAt(i, tmp);
    });
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // Büsche und Findlinge am Rand
  {
    const bushGeo = mergeGeometries([colored(at(blob(0.7, 1, 5, 0.7), 0, 0.4, 0), 0x4c9a4a), colored(at(blob(0.5, 1, 6, 0.7), 0.6, 0.3, 0.2), 0x3d8a40)]);
    const n = Math.round(count * 1.5);
    const mesh = new THREE.InstancedMesh(bushGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), n);
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(), mat4 = new THREE.Matrix4(), axis = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3();
    const rockish = map.decor === 'cactus';
    for (let i = 0; i < n; i++) {
      const s = START + rng() * (track.end - START);
      const lat = (rng() < 0.5 ? -1 : 1) * (hw + 3.5 + rng() * 12);
      pointAt(s, p);
      q.setFromAxisAngle(axis, rng() * 6);
      sc.setScalar(0.8 + rng());
      mat4.compose(pv.set(p.x + Math.cos(p.theta) * lat, terrainAt(s) + bankH(lat) - 0.1, p.z + Math.sin(p.theta) * lat), q, sc);
      mesh.setMatrixAt(i, mat4);
      tmp.set(rockish ? col.rock : 0xffffff).multiplyScalar(0.8 + rng() * 0.4);
      mesh.setColorAt(i, tmp);
    }
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // ---- Felsen (Hindernisse) ----
  const rockGeo = colored(blob(0.8, 1, 9, 0.8), 0xffffff);
  const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: col.rock });
  const rockMeshes = track.rocks.map((r) => {
    const mesh = new THREE.Mesh(rockGeo, rockMat);
    pointAt(r.s, p);
    const y = terrainAt(r.s) + rampAt(r.s) - (r.lat * Math.tan(bankAt(r.s)));
    mesh.position.set(p.x + Math.cos(p.theta) * r.lat, y + 0.25, p.z + Math.sin(p.theta) * r.lat);
    mesh.scale.set(1 + hash(r.s) * 0.5, 0.9 + hash(r.s + 3) * 0.6, 1 + hash(r.s + 7) * 0.5);
    mesh.rotation.y = hash(r.s + 1) * 6;
    mesh.castShadow = true;
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
  const padGeo = new THREE.PlaneGeometry(2.8, 4.2);
  const padMeshes = track.pads.map((pd) => {
    const holder = new THREE.Group();
    holder.rotation.order = 'YXZ';
    const mesh = new THREE.Mesh(padGeo, padMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.07;
    holder.add(mesh);
    pointAt(pd.s, p);
    holder.position.set(p.x + Math.cos(p.theta) * pd.lat, track.heightAt(pd.s) - pd.lat * Math.tan(bankAt(pd.s)), p.z + Math.sin(p.theta) * pd.lat);
    holder.rotation.set(Math.atan(track.slopeAt(pd.s)), -p.theta, -bankAt(pd.s));
    group.add(holder);
    return holder;
  });

  // ---- Start- und Zielbogen ----
  function arch(s, label, checkered) {
    const tex2 = canvasTexture(512, 96, (g, w, h) => {
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
    const postMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5, metalness: 0.4 });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), postMat);
      post.position.set(sx * (hw + 1.4), 3.5, 0);
      holder.add(post);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2.8, 1.5, 0.25), new THREE.MeshBasicMaterial({ map: tex2 }));
    banner.position.y = 6.6;
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
