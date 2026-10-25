import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Prozedurales, detailliertes Fahrradmodell. Alle statischen Teile werden je Material zu EINEM Mesh
// zusammengefasst (wenige Draw-Calls, wichtig fürs Tablet). Nur Räder, Kurbel und Beine bewegen sich.
// Koordinaten: y oben, vorn = -z, Raddachse entlang x. Einheit Meter.

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);
const _dir = new THREE.Vector3();

// ---------- Sammler für statische Geometrie ----------
class Bucket {
  constructor() { this.lists = new Map(); }
  add(key, geo, matrix) {
    const g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!this.lists.has(key)) this.lists.set(key, []);
    this.lists.get(key).push(g);
  }
  // konisches Rohr von a nach b
  tube(key, a, b, r1, r2 = r1, seg = 10) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-5) return;
    _q.setFromUnitVectors(UP, _dir.divideScalar(len));
    _m.compose(v3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), _q, _one);
    this.add(key, new THREE.CylinderGeometry(r2, r1, len, seg, 1), _m);
  }
  ball(key, p, r, sx = 1, sy = 1, sz = 1, seg = 12) {
    _m.compose(p, _q.identity(), v3(sx, sy, sz));
    this.add(key, new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), _m);
  }
  box(key, p, w, h, d, rotX = 0) {
    _q.setFromAxisAngle(v3(1, 0, 0), rotX);
    _m.compose(p, _q, _one);
    this.add(key, new THREE.BoxGeometry(w, h, d), _m);
  }
  curve(key, pts, r, seg = 24) {
    const c = new THREE.CatmullRomCurve3(pts);
    this.add(key, new THREE.TubeGeometry(c, seg, r, 8, false));
  }
  flush(materials, group) {
    for (const [key, list] of this.lists) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, materials[key]);
      mesh.castShadow = true;
      group.add(mesh);
    }
  }
}

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// ---------- Geometrie-Sätze je Rahmenstil ----------
const FRAMES = {
  mtb: { wb: 1.22, bbY: 0.31, bbZ: 0.07, st: v3(0, 0.80, 0.27), hb: v3(0, 0.74, -0.52), ht: v3(0, 0.89, -0.55), saddleY: 0.99, saddleZ: 0.3, stem: v3(0, 0.06, -0.06), shoulderY: 0.46, shoulderZ: -0.06 },
  dh: { wb: 1.3, bbY: 0.32, bbZ: 0.08, st: v3(0, 0.78, 0.3), hb: v3(0, 0.76, -0.58), ht: v3(0, 0.93, -0.62), saddleY: 0.92, saddleZ: 0.36, stem: v3(0, 0.06, -0.06), shoulderY: 0.48, shoulderZ: -0.05 },
  road: { wb: 1.14, bbY: 0.27, bbZ: 0.04, st: v3(0, 0.79, 0.21), hb: v3(0, 0.66, -0.42), ht: v3(0, 0.79, -0.4), saddleY: 0.96, saddleZ: 0.2, stem: v3(0, 0.03, -0.1), shoulderY: 0.34, shoulderZ: -0.2 },
};

export function createBike(def, opts = {}) {
  const low = opts.lod === 'low';
  const F = FRAMES[def.look.frame] || FRAMES.mtb;
  const L = def.look;
  const col = def.colors;
  const r = L.wheelR;
  const group = new THREE.Group();

  // ----- Materialien -----
  const std = (color, rough = 0.5, metal = 0.1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const jerseyTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = hex(col.jersey); g.fillRect(0, 0, w, h);
    g.fillStyle = hex(col.accent === col.jersey ? 0xffffff : col.accent);
    g.fillRect(0, h * 0.42, w, h * 0.12);
    g.globalAlpha = 0.18; g.fillStyle = '#000';
    for (let i = 0; i < w; i += 8) g.fillRect(i, 0, 2, h);
  }, true);
  const mats = {
    frame: std(col.frame, 0.32, 0.35, { envMapIntensity: 1.2 }),
    accent: std(col.accent, 0.4, 0.2),
    dark: std(0x1a1a1d, 0.55, 0.3),
    rubber: std(0x111112, 0.95, 0),
    metal: std(0xc9ccd2, 0.28, 0.9),
    gold: std(L.fork === 'rigid' ? 0xc9ccd2 : 0xd4a537, 0.25, 0.9),
    saddle: std(0x151515, 0.8, 0),
    skin: std(0xe9b996, 0.7, 0),
    jersey: std(0xffffff, 0.75, 0, { map: jerseyTex }),
    shorts: std(0x20232b, 0.8, 0),
    helmet: std(col.helmet, 0.35, 0.1),
    shoe: std(0xf4f4f4, 0.6, 0),
    glass: std(0x0b0d12, 0.1, 0.8),
    rimMat: std(L.rim > 0.04 ? 0x15161a : 0x9ea2aa, 0.35, 0.7),
  };

  const B = new Bucket();
  const R = v3(0, r, F.wb / 2);
  const Fw = v3(0, r, -F.wb / 2);
  const bb = v3(0, F.bbY, F.bbZ);
  const seg = low ? 6 : 10;

  // ----- Rahmen -----
  const tt0 = F.st.clone().add(v3(0, -0.015, -0.02));
  const ttR = L.frame === 'road' ? 0.017 : 0.022;
  B.tube('frame', tt0, F.ht.clone().add(v3(0, -0.015, 0)), ttR, ttR * 1.25, seg); // Oberrohr
  B.tube('frame', bb, F.hb, 0.034, 0.03, seg); // Unterrohr (dick)
  B.tube('frame', bb, F.st, 0.022, 0.02, seg); // Sitzrohr
  B.tube('frame', F.hb, F.ht, 0.034, 0.034, seg); // Steuerrohr
  for (const sx of [-1, 1]) {
    B.tube('frame', bb.clone().add(v3(sx * 0.02, 0, 0)), R.clone().add(v3(sx * 0.06, 0, 0)), 0.02, 0.014, seg); // Kettenstrebe
    B.tube('frame', F.st.clone().add(v3(sx * 0.02, -0.03, 0.01)), R.clone().add(v3(sx * 0.06, 0.01, 0)), 0.015, 0.012, seg); // Sitzstrebe
  }
  B.ball('frame', bb, 0.04); // Tretlager

  // Hinterbau-Dämpfer (Fully)
  if (!L.hardtail) {
    B.tube('dark', v3(0, F.st.y - 0.2, F.st.z - 0.02), v3(0, F.bbY + 0.1, F.bbZ + 0.25), 0.026, 0.026, seg);
    B.tube('metal', v3(0, F.st.y - 0.17, F.st.z - 0.02), v3(0, F.st.y - 0.3, F.st.z + 0.0), 0.014, 0.014, seg);
    B.tube('accent', v3(0, F.bbY + 0.1, F.bbZ + 0.25), v3(0, F.bbY + 0.02, F.bbZ + 0.1), 0.02, 0.02, seg);
  }

  // ----- Gabel -----
  const crown = F.hb.clone().add(v3(0, -0.05, -0.012));
  B.tube('dark', F.hb, crown, 0.03, 0.03, seg);
  const dropout = Fw.clone();
  if (L.fork === 'rigid') {
    for (const sx of [-1, 1]) B.tube('frame', crown.clone().add(v3(sx * 0.05, 0, 0)), dropout.clone().add(v3(sx * 0.055, 0, 0)), 0.02, 0.012, seg);
  } else {
    const wide = L.fork === 'full' ? 0.07 : 0.06;
    const up = L.fork === 'full' ? 0.026 : 0.021;
    for (const sx of [-1, 1]) {
      const top = crown.clone().add(v3(sx * wide, 0.12, -0.03));
      const mid = crown.clone().lerp(dropout, 0.5).add(v3(sx * wide, 0, 0));
      B.tube('gold', top, mid, up, up, seg); // Standrohre
      B.tube('dark', mid, dropout.clone().add(v3(sx * 0.06, 0, 0)), up * 1.35, up * 1.05, seg); // Tauchrohre
    }
    B.box('dark', crown.clone().add(v3(0, 0.02, -0.01)), wide * 2 + 0.05, 0.045, 0.06);
    if (L.fork === 'full') B.box('dark', crown.clone().add(v3(0, 0.14, -0.03)), wide * 2 + 0.04, 0.035, 0.05);
  }

  // ----- Cockpit -----
  const stemTop = F.ht.clone().add(F.stem);
  B.tube('dark', F.ht.clone().add(v3(0, 0.02, 0)), stemTop, 0.02, 0.02, seg);
  let hand; // Position der Hände (rechts, x>0)
  if (L.bars === 'drop') {
    for (const sx of [-1, 1]) {
      const p = (x, y, z) => stemTop.clone().add(v3(sx * x, y, z));
      B.curve('dark', [p(0.03, 0, 0), p(0.12, 0, 0.0), p(0.205, 0, -0.01), p(0.215, 0, -0.1), p(0.215, -0.09, -0.17), p(0.215, -0.17, -0.13), p(0.215, -0.2, -0.04)], 0.012, 28);
      B.box('dark', p(0.215, 0.015, -0.085), 0.035, 0.05, 0.12);
    }
    hand = stemTop.clone().add(v3(0.215, 0.03, -0.09));
  } else {
    const riser = L.bars === 'riser';
    const half = riser ? 0.39 : 0.36;
    for (const sx of [-1, 1]) {
      const centre = stemTop.clone();
      const mid = centre.clone().add(v3(sx * 0.13, riser ? 0.05 : 0, riser ? 0.02 : 0));
      const end = centre.clone().add(v3(sx * half, riser ? 0.065 : 0, riser ? 0.06 : 0.04));
      B.tube('dark', centre, mid, 0.012, 0.012, seg);
      B.tube('dark', mid, end, 0.012, 0.012, seg);
      B.tube('rubber', centre.clone().add(v3(sx * (half - 0.1), riser ? 0.063 : 0, riser ? 0.058 : 0.04)), end, 0.019, 0.019, seg); // Griff
      B.tube('metal', centre.clone().add(v3(sx * (half - 0.14), riser ? 0.06 : 0.0, riser ? 0.04 : 0.03)), centre.clone().add(v3(sx * (half - 0.2), riser ? 0.045 : 0, riser ? -0.02 : -0.02)), 0.005, 0.005, 6); // Bremshebel
    }
    hand = end0(stemTop, half, riser);
  }
  function end0(c, half, riser) { return c.clone().add(v3(half - 0.04, riser ? 0.07 : 0.015, riser ? 0.06 : 0.04)); }
  B.ball('dark', stemTop, 0.03, 1.3, 0.8, 1);

  // ----- Sattel -----
  const saddle = v3(0, F.saddleY, F.saddleZ);
  B.tube('metal', F.st, saddle.clone().add(v3(0, -0.02, 0)), 0.014, 0.014, seg);
  B.box('saddle', saddle.clone().add(v3(0, 0.03, -0.06)), 0.07, 0.04, 0.16);
  B.ball('saddle', saddle.clone().add(v3(0, 0.032, 0.07)), 0.075, 1.0, 0.45, 1.25);

  // ----- Antrieb (statische Teile) -----
  const chainX = 0.055;
  if (!low) {
    const ringTop = v3(chainX, bb.y + 0.095, bb.z);
    const ringBot = v3(chainX, bb.y - 0.095, bb.z);
    const cogTop = v3(chainX, R.y + 0.045, R.z);
    const cogBot = v3(chainX, R.y - 0.045, R.z);
    B.tube('dark', ringTop, cogTop, 0.006, 0.006, 5);
    B.tube('dark', ringBot, cogBot.clone().add(v3(0, -0.05, 0.03)), 0.006, 0.006, 5);
    B.box('dark', cogBot.clone().add(v3(0.01, -0.06, 0.04)), 0.03, 0.09, 0.05); // Schaltwerk
    // Scheibenbremse-Sättel
    B.box('dark', Fw.clone().add(v3(-0.07, 0.07, -0.02)), 0.02, 0.045, 0.045);
    B.box('dark', R.clone().add(v3(-0.07, 0.07, -0.02)), 0.02, 0.045, 0.045);
  }

  // Trinkflasche (Rennrad/Gravel)
  if (L.frame === 'road' && !low) {
    const mid = bb.clone().lerp(F.hb, 0.5);
    B.tube('accent', mid.clone().add(v3(0, 0.02, 0.0)), mid.clone().add(v3(0, 0.15, -0.03)), 0.036, 0.034, seg);
  }

  // ----- Fahrer (statisch) -----
  const hip = v3(0, F.saddleY + 0.07, F.saddleZ - 0.08);
  const shoulder = v3(0, F.saddleY + F.shoulderY, F.shoulderZ);
  B.tube('shorts', hip.clone().add(v3(0, -0.02, 0.0)), hip.clone().lerp(shoulder, 0.3), 0.125, 0.12, 12);
  B.tube('jersey', hip.clone().lerp(shoulder, 0.25), shoulder.clone().add(v3(0, -0.04, 0)), 0.12, 0.155, 14);
  B.ball('jersey', shoulder.clone().add(v3(0, -0.03, 0)), 0.15, 1.15, 0.7, 0.9);
  const neck = shoulder.clone().add(v3(0, 0.06, -0.03));
  const head = shoulder.clone().add(v3(0, 0.16, -0.075));
  B.tube('skin', neck, head, 0.045, 0.045, 8);
  B.ball('skin', head, 0.098, 1, 1.05, 1.0);
  // Helm
  const helm = head.clone().add(v3(0, 0.025, 0.02));
  B.ball('helmet', helm, 0.125, 1.0, 0.82, 1.3, 14);
  if (!low) {
    for (const sx of [-1, 0, 1]) B.box('dark', helm.clone().add(v3(sx * 0.055, 0.085, -0.03)), 0.022, 0.012, 0.13);
    B.box('glass', head.clone().add(v3(0, 0.012, -0.085)), 0.17, 0.045, 0.03); // Sonnenbrille
  }
  if (def.cat === 'downhill') {
    B.ball('helmet', head.clone().add(v3(0, -0.04, -0.05)), 0.12, 1.0, 0.8, 1.0, 12); // Kinnbügel
    B.box('helmet', helm.clone().add(v3(0, 0.0, -0.12)), 0.2, 0.012, 0.09, -0.2); // Schirm
  } else if (L.frame === 'mtb') {
    B.box('helmet', helm.clone().add(v3(0, -0.0, -0.13)), 0.18, 0.01, 0.07, -0.15); // kleiner Schirm
  }

  // Arme (statisch, Hände am Lenker)
  for (const sx of [-1, 1]) {
    const sh = shoulder.clone().add(v3(sx * 0.19, -0.03, 0.0));
    const hd = v3(sx * hand.x, hand.y, hand.z);
    const el = sh.clone().lerp(hd, 0.5).add(v3(sx * 0.07, -0.06, 0.03));
    B.ball('jersey', sh, 0.065);
    B.tube('jersey', sh, el, 0.058, 0.046, 8);
    B.tube('skin', el, hd, 0.042, 0.032, 8);
    B.ball('dark', hd, 0.04, 1, 0.9, 1.2); // Handschuh
  }

  // ----- Dekor: Markenschriftzug -----
  if (!low) {
    const text = def.brandDef.name.toUpperCase();
    const textCol = col.accent === col.frame ? 0xffffff : col.accent;
    const decalMat = (label, fontCss) => new THREE.MeshStandardMaterial({
      map: canvasTex(512, 96, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = hex(textCol);
        g.font = `${fontCss} 72px "Trebuchet MS", "Segoe UI", sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(label, w / 2, h / 2 + 4);
      }),
      transparent: true, roughness: 0.4, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const decal = (label, a, b, rad, hgt, font) => {
      const mat = decalMat(label, font);
      const dir = b.clone().sub(a);
      const len = dir.length();
      dir.normalize();
      for (const sx of [-1, 1]) {
        const side = v3(sx, 0, 0);
        const yAxis = new THREE.Vector3().crossVectors(side, dir).normalize();
        const basis = new THREE.Matrix4().makeBasis(dir.clone().multiplyScalar(sx), yAxis.multiplyScalar(sx), side);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.62, hgt), mat);
        mesh.quaternion.setFromRotationMatrix(basis);
        mesh.position.copy(a).lerp(b, 0.5).add(v3(sx * (rad + 0.002), 0, 0));
        group.add(mesh);
      }
    };
    decal(text, bb.clone().lerp(F.hb, 0.12), bb.clone().lerp(F.hb, 0.95), 0.032, 0.062, def.brandDef.font);
    decal(def.cat === 'road' ? 'RACE' : def.cat.toUpperCase(), tt0, F.ht, 0.02, 0.026, '700');
  }

  B.flush(mats, group);

  // ----- Räder -----
  function makeWheel(isRear) {
    const wg = new THREE.Group();
    const WB = new Bucket();
    const tire = L.tire;
    const rimR = r - tire * 2 - 0.004;
    // Reifen (+ Stollen)
    WB.add('rubber', new THREE.TorusGeometry(r - tire, tire, low ? 6 : 10, low ? 20 : 36).rotateY(Math.PI / 2));
    if (!low && L.tread === 'knobs') {
      const n = 44;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        _q.setFromAxisAngle(v3(1, 0, 0), a);
        _m.compose(v3(0, Math.cos(a) * (r - tire * 0.1 + 0.004), Math.sin(a) * (r - tire * 0.1 + 0.004)), _q, _one);
        WB.add('rubber', new THREE.BoxGeometry(tire * 1.5, 0.014, 0.022), _m);
        _m.compose(v3(0, Math.cos(a + 0.07) * (r - tire * 0.1 + 0.004), Math.sin(a + 0.07) * (r - tire * 0.1 + 0.004)), _q.setFromAxisAngle(v3(1, 0, 0), a + 0.07), _one);
        WB.add('rubber', new THREE.BoxGeometry(tire * 0.9, 0.012, 0.02), _m);
      }
    }
    // Felge
    WB.add('rimMat', new THREE.TorusGeometry(rimR, L.rim, 8, low ? 20 : 36).rotateY(Math.PI / 2));
    // Speichen + Nabe
    const spokes = low ? 6 : 18;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const off = (i % 2 ? 1 : -1) * 0.025;
      WB.tube('metal', v3(off, 0, 0), v3(0, Math.cos(a) * rimR, Math.sin(a) * rimR), 0.0035, 0.0035, 4);
    }
    WB.add('metal', new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10).rotateZ(Math.PI / 2));
    if (!low) {
      // Bremsscheibe
      WB.add('metal', new THREE.CylinderGeometry(0.09, 0.09, 0.004, 20).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(-0.05, 0, 0));
      if (isRear) { // Kassette
        for (let i = 0; i < 5; i++) {
          const rad = 0.052 - i * 0.007;
          WB.add('metal', new THREE.CylinderGeometry(rad, rad, 0.008, 14).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(0.03 + i * 0.007, 0, 0));
        }
      }
    }
    WB.flush(mats, wg);
    return wg;
  }
  const wf = makeWheel(false);
  wf.position.copy(Fw);
  const wr = makeWheel(true);
  wr.position.copy(R);
  group.add(wf, wr);

  // ----- Kurbel (dreht mit) -----
  const crankG = new THREE.Group();
  crankG.position.copy(bb);
  const pedals = [];
  {
    const CB = new Bucket();
    CB.add('metal', new THREE.CylinderGeometry(0.09, 0.09, 0.006, 24).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(0.05, 0, 0));
    CB.tube('dark', v3(0.075, 0, 0), v3(0.075, 0.17, 0), 0.013, 0.01, 6);
    CB.tube('dark', v3(-0.075, 0, 0), v3(-0.075, -0.17, 0), 0.013, 0.01, 6);
    CB.flush(mats, crankG);
    for (const sx of [1, -1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.1), mats.dark);
      p.position.set(sx * 0.12, sx * 0.17, 0);
      crankG.add(p);
      pedals.push(p);
    }
  }
  group.add(crankG);

  // ----- Beine (animiert) -----
  const limb = (r1, r2, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, 1, 10), mat); m.castShadow = true; return m; };
  const legs = [-1, 1].map((sx) => {
    const l = {
      sx,
      thigh: limb(0.082, 0.062, mats.shorts),
      shin: limb(0.058, 0.04, mats.skin),
      knee: new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), mats.skin),
      shoe: new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.06, 0.26), mats.shoe),
    };
    l.shoe.castShadow = true;
    group.add(l.thigh, l.shin, l.knee, l.shoe);
    return l;
  });

  const LEG = 0.5;
  const H = new THREE.Vector3(), Fo = new THREE.Vector3(), K = new THREE.Vector3();
  function place(m, a, b) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, _dir.divideScalar(len || 1));
    m.scale.set(1, len, 1);
  }
  function pose(crank) {
    crankG.rotation.x = -crank;
    pedals[0].rotation.x = crank;
    pedals[1].rotation.x = crank;
    legs.forEach((l, i) => {
      const a = crank + i * Math.PI;
      Fo.set(l.sx * 0.12, bb.y + Math.cos(a) * 0.17 + 0.04, bb.z - Math.sin(a) * 0.17);
      H.set(l.sx * 0.1, hip.y, hip.z);
      const dy = Fo.y - H.y, dz = Fo.z - H.z;
      const dist = Math.hypot(dy, dz) || 1;
      const D = Math.min(dist, LEG * 2 - 0.002);
      const half = D / 2;
      const hgt = Math.sqrt(Math.max(0, LEG * LEG - half * half));
      const ny = dy / dist, nz = dz / dist;
      K.set(H.x + l.sx * 0.02, H.y + ny * half - nz * hgt, H.z + nz * half + ny * hgt); // Knie zeigt nach vorn
      place(l.thigh, H, K);
      place(l.shin, K, Fo);
      l.knee.position.copy(K);
      l.shoe.position.set(Fo.x, Fo.y - 0.03, Fo.z - 0.035);
    });
  }
  pose(0);

  if (opts.shadows === false) group.traverse((o) => { o.castShadow = false; });

  return {
    group,
    wheels: [wf, wr],
    wheelR: r,
    pose,
    spin(dist) { wf.rotation.x = wr.rotation.x = -dist / r; },
  };
}
