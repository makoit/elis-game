import * as THREE from 'three';
import { SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS, rodById } from './data.js';

// Angler-Figur (stilisiert, ~1,75 m) mit Rute in der rechten Hand.
// Blickrichtung +z. userData: arm (Wurf-Gelenk), rod, tip (Rutenspitze, Object3D), reel (Kurbel).

const mat = (color, rough = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
const cap = (r, h, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 6, 12), m);

export function createRod(rodId) {
  const def = rodById(rodId);
  const g = new THREE.Group();
  const len = def.id === 'brandung' ? 4.2 : def.id === 'pose' ? 4 : def.id === 'fliege' ? 2.9 : def.id === 'waller' ? 2.6 : def.id === 'ul' ? 2.1 : 2.7;
  const thick = def.id === 'waller' ? 1.6 : def.id === 'ul' || def.id === 'fliege' ? 0.75 : 1;
  const blank = mat(def.color, 0.3, { metalness: 0.4 });
  // Rute als leicht gebogene, dünner werdende Röhre (Gelenke für Biegung im Drill)
  const segs = 6;
  let parent = g;
  const joints = [];
  for (let i = 0; i < segs; i++) {
    const r0 = (0.016 - i * 0.0022) * thick;
    const r1 = (0.016 - (i + 1) * 0.0022) * thick;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.002, r1), Math.max(0.003, r0), len / segs, 8), blank);
    seg.position.y = len / segs / 2;
    const j = new THREE.Group();
    j.add(seg);
    if (i > 0) j.position.y = len / segs;
    parent.add(j);
    joints.push(j);
    // Ringe
    if (i > 0) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012 * thick, 0.002, 4, 10), mat(0xc8ccd2, 0.2, { metalness: 0.9 }));
      ring.position.set(0, 0.02, 0.02);
      j.add(ring);
    }
    parent = j;
  }
  const tip = new THREE.Object3D();
  tip.position.y = len / segs;
  parent.add(tip);
  // Griff (Kork) + Rolle
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * thick, 0.02 * thick, 0.45, 10), mat(def.id === 'karpfen' || def.id === 'waller' ? 0x1a1a1a : 0xc8a06a, 0.9));
  grip.position.y = -0.1;
  g.add(grip);
  const reel = new THREE.Group();
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * thick, 0.045 * thick, 0.05, 16), mat(0x2a2e36, 0.3, { metalness: 0.7 }));
  spool.rotation.z = Math.PI / 2;
  reel.add(spool);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.038 * thick, 0.038 * thick, 0.052, 16), mat(0xe8e0a0, 0.6));
  line.rotation.z = Math.PI / 2;
  reel.add(line);
  const crank = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.07, 0.01), mat(0xb0b4bc, 0.3, { metalness: 0.8 }));
  arm.position.y = 0.035;
  crank.add(arm);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.025, 8), mat(0x1a1a1a));
  knob.rotation.z = Math.PI / 2; knob.position.set(0.012, 0.07, 0);
  crank.add(knob);
  crank.position.x = -0.035;
  reel.add(crank);
  reel.position.set(0, 0.05, 0.07);
  g.add(reel);
  g.userData = { tip, joints, crank, len };
  return g;
}

// Rute biegen (0 = gerade, 1 = stark krumm), Richtung: Spitze zieht nach +z/x
export function bendRod(rod, amount, side = 0) {
  const n = rod.userData.joints.length;
  rod.userData.joints.forEach((j, i) => {
    const k = (i / n) * amount;
    j.rotation.x = k * 0.32;
    j.rotation.z = -side * k * 0.2;
  });
}

function hair(style, color, hatOn) {
  const g = new THREE.Group();
  const m = mat(color, 0.85);
  if (style === 'bald') return g;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.118, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m);
  top.position.y = 0.015;
  top.rotation.x = -0.25;
  g.add(top);
  if (style === 'long' || style === 'pony') {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.2, style === 'long' ? 0.24 : 0.1, 0.06), m);
    back.position.set(0, -0.08, -0.08);
    g.add(back);
    if (style === 'pony' && !hatOn) {
      const tail = cap(0.03, 0.14, m);
      tail.position.set(0, -0.08, -0.15); tail.rotation.x = 0.5;
      g.add(tail);
    }
  }
  if (style === 'curly') {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), m);
      b.position.set(Math.cos(a) * 0.1, 0.03 + (i % 2) * 0.04, Math.sin(a) * 0.1 - 0.02);
      g.add(b);
    }
  }
  return g;
}

function hat(id, color) {
  const g = new THREE.Group();
  const m = mat(color, 0.8);
  if (id === 'cap') {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
    c.position.y = 0.03; g.add(c);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), m);
    brim.position.set(0, 0.035, 0.08); brim.scale.z = 1.2; g.add(brim);
  } else if (id === 'bucket') {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.125, 0.11, 16), m);
    c.position.y = 0.08; g.add(c);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.015, 20), m);
    brim.position.y = 0.03; brim.rotation.x = 0.06; g.add(brim);
  } else if (id === 'beanie') {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m);
    c.position.y = 0.02; c.scale.y = 1.15; g.add(c);
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), mat(0xffffff));
    bob.position.y = 0.17; g.add(bob);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.025, 6, 20), m);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.03; g.add(rim);
  } else if (id === 'straw') {
    const sm = mat(0xe8cf8a, 0.95);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 16), sm);
    c.position.y = 0.08; g.add(c);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.012, 24), sm);
    brim.position.y = 0.03; g.add(brim);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.113, 0.118, 0.03, 16), m);
    band.position.y = 0.05; g.add(band);
  } else if (id === 'captain') {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.08, 16), mat(0xf4f4f4));
    c.position.y = 0.09; g.add(c);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.122, 0.035, 16), mat(0x1a2440));
    band.position.y = 0.05; g.add(band);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 16, 1, false, -Math.PI / 2, Math.PI), mat(0x111111, 0.2));
    brim.position.set(0, 0.035, 0.08); g.add(brim);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.02, 10), mat(0xffd23a, 0.3, { metalness: 0.8 }));
    badge.position.set(0, 0.06, 0.125); g.add(badge);
  }
  return g;
}

export function createAngler(look, rodId) {
  const g = new THREE.Group();
  const skin = mat(SKIN_TONES[look.skin] ?? SKIN_TONES[1], 0.6);
  const topC = OUTFIT_COLORS[look.topColor] ?? OUTFIT_COLORS[0];
  const shirtC = OUTFIT_COLORS[look.shirtColor] ?? OUTFIT_COLORS[8];
  const pantsC = OUTFIT_COLORS[look.pantsColor] ?? OUTFIT_COLORS[7];
  const top = mat(topC, look.top === 'rain' ? 0.35 : 0.8);
  const shirt = mat(shirtC, 0.8);
  const pants = mat(look.pants === 'wader' ? 0x3a4a2e : pantsC, look.pants === 'wader' ? 0.45 : 0.85);
  const boots = mat(look.pants === 'wader' ? 0x3a4a2e : 0x3a2a1a, 0.6);

  // Beine
  const legs = new THREE.Group();
  for (const side of [-1, 1]) {
    const leg = cap(0.07, 0.62, look.pants === 'shorts' ? skin : pants);
    leg.position.set(side * 0.1, 0.46, 0);
    legs.add(leg);
    if (look.pants === 'shorts') {
      const short = cap(0.08, 0.2, mat(pantsC, 0.85));
      short.position.set(side * 0.1, 0.72, 0); legs.add(short);
    }
    if (look.pants === 'cargo') {
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.1), mat(new THREE.Color(pantsC).multiplyScalar(0.8)));
      pocket.position.set(side * 0.17, 0.55, 0); legs.add(pocket);
    }
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.26), boots);
    boot.position.set(side * 0.1, 0.06, 0.04);
    legs.add(boot);
  }
  g.add(legs);
  if (look.pants === 'wader') {
    const bib = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.2), pants);
    bib.position.set(0, 0.95, 0); g.add(bib);
  }

  // Oberkörper
  const torso = new THREE.Group();
  torso.position.y = 0.95;
  const chest = cap(0.17, 0.32, look.top === 'shirt' ? shirt : top);
  chest.position.y = 0.25;
  chest.scale.z = 0.75;
  torso.add(chest);
  if (look.top === 'vest') {
    const under = cap(0.165, 0.3, shirt);
    under.position.y = 0.26; under.scale.set(0.98, 1, 0.74); torso.add(under);
    chest.scale.set(1.04, 0.92, 0.8);
    for (const [x, y] of [[-0.08, 0.2], [0.08, 0.2], [-0.08, 0.33], [0.08, 0.33]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.03), mat(new THREE.Color(topC).multiplyScalar(0.75)));
      p.position.set(x, y, 0.14); torso.add(p);
    }
  }
  if (look.top === 'flannel') {
    const tex = flannelTexture(topC);
    chest.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  }
  if (look.top === 'hoodie') {
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.05, 8, 16), top);
    hood.position.set(0, 0.48, -0.06); hood.rotation.x = Math.PI / 2.4; torso.add(hood);
  }
  if (look.top === 'rain') {
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.42, 0.01), mat(0x222222));
    zip.position.set(0, 0.25, 0.135); torso.add(zip);
  }
  g.add(torso);

  // Kopf
  const head = new THREE.Group();
  head.position.y = 1.62;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 14), skin);
  face.scale.set(1, 1.08, 1);
  head.add(face);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), skin);
  nose.position.set(0, -0.01, 0.112); head.add(nose);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), mat(0x1a1a1a, 0.2));
    eye.position.set(side * 0.042, 0.025, 0.1); head.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), skin);
    ear.position.set(side * 0.115, 0, 0); ear.scale.z = 0.6; head.add(ear);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 4, 10, Math.PI), mat(0x8a3a3a));
  mouth.position.set(0, -0.045, 0.1); mouth.rotation.z = Math.PI; head.add(mouth);
  const hatOn = look.hat !== 'none';
  head.add(hair(look.hair, HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0], hatOn));
  if (look.beard) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.4), mat(HAIR_COLORS[look.hairColor] ?? 0x3a2a1a, 0.9));
    b.position.set(0, -0.005, 0.02); b.scale.set(1.05, 1.1, 1); head.add(b);
  }
  if (look.glasses) {
    const gm = mat(0x111111, 0.1, { metalness: 0.5 });
    for (const side of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.032, 14), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.05, metalness: 0.6 }));
      l.position.set(side * 0.045, 0.025, 0.118); head.add(l);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.01), gm);
    bridge.position.set(0, 0.04, 0.115); head.add(bridge);
  }
  if (hatOn) {
    const h = hat(look.hat, OUTFIT_COLORS[look.hatColor] ?? OUTFIT_COLORS[0]);
    h.position.y = 0.05;
    head.add(h);
  }
  g.add(head);

  // Arme: rechter Arm hält die Rute (Gelenk an der Schulter), linker an der Kurbel
  const sleeve = look.top === 'shirt' || look.top === 'vest' ? (look.top === 'vest' ? shirt : shirt) : top;
  const armR = new THREE.Group();
  armR.position.set(0.22, 1.42, 0);
  const upperR = cap(0.05, 0.24, sleeve);
  upperR.position.y = -0.15; armR.add(upperR);
  const foreR = new THREE.Group();
  foreR.position.y = -0.3;
  foreR.rotation.x = -1.2;
  const lowerR = cap(0.045, 0.22, look.top === 'shirt' ? skin : sleeve);
  lowerR.position.y = -0.13; foreR.add(lowerR);
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin);
  handR.position.y = -0.28; foreR.add(handR);
  armR.add(foreR);
  armR.rotation.x = -0.35;
  g.add(armR);

  const rod = createRod(rodId);
  rod.position.y = -0.28;
  rod.rotation.x = 2.2; // Rute schräg nach vorn oben
  foreR.add(rod);

  const armL = new THREE.Group();
  armL.position.set(-0.22, 1.42, 0);
  const upperL = cap(0.05, 0.24, sleeve);
  upperL.position.y = -0.15; armL.add(upperL);
  const foreL = new THREE.Group();
  foreL.position.y = -0.3; foreL.rotation.x = -1.4;
  const lowerL = cap(0.045, 0.22, look.top === 'shirt' ? skin : sleeve);
  lowerL.position.y = -0.13; foreL.add(lowerL);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin);
  handL.position.y = -0.28; foreL.add(handL);
  armL.add(foreL);
  armL.rotation.set(-0.45, 0, -0.35);
  g.add(armL);

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { armR, foreR, armL, rod, tip: rod.userData.tip, head, torso };
  return g;
}

function flannelTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const base = new THREE.Color(color);
  x.fillStyle = '#' + base.getHexString(); x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 64; i += 16) { x.fillRect(i, 0, 6, 64); x.fillRect(0, i, 64, 6); }
  x.fillStyle = 'rgba(255,255,255,0.15)';
  for (let i = 8; i < 64; i += 16) { x.fillRect(i, 0, 2, 64); x.fillRect(0, i, 64, 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Wurfbewegung: phase 0 = Ruhe, -1 = ausgeholt (Rute nach hinten), 1 = nach vorn geschwungen
export function poseCast(angler, phase) {
  const { armR, rod } = angler.userData;
  armR.rotation.x = -0.35 - Math.max(0, -phase) * 1.6 + Math.max(0, phase) * 0.4;
  rod.rotation.x = 2.2 - Math.max(0, -phase) * 1.3 + Math.max(0, phase) * 0.3;
}
