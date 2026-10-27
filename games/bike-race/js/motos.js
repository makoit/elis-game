import * as THREE from 'three';
import { UP, v3, _m, _q, _one, prof, loft, line, spline, Bucket, canvasTex, hex } from './geom.js';

// Prozedurale Motorräder (Dirt Bike, Enduro, Naked Bike, Supersportler). Wie beim Fahrrad werden alle statischen
// Teile je Material in einem Bucket gesammelt; nur die Räder drehen sich. Der Fahrer kommt aus bikes.js
// (Sitzposition, Griffe und Fußrasten liefert buildMoto als Ankerpunkte).
// Koordinaten: y oben, vorn = -z, Raddachse entlang x. Einheit Meter.

// Maße je Bauform: wb Radstand, rake Lenkkopfwinkel, fork Gabellänge (Achse → obere Gabelbrücke), seat Sitzpunkt (y, z),
// grip Griff relativ zur oberen Gabelbrücke, peg Fußraste, pivot Schwingenlager (y, z ab Hinterachse), tank Tankmitte
export const MOTO_GEOM = {
  superbike: { wb: 1.4, rake: 0.42, fork: 0.74, seat: [0.84, 0.2], grip: v3(0.33, -0.03, 0.09), peg: v3(0.17, 0.4, 0.24), pivot: [0.1, -0.58], tank: [0.96, -0.14] },
  naked: { wb: 1.42, rake: 0.44, fork: 0.74, seat: [0.82, 0.19], grip: v3(0.4, 0.11, 0.12), peg: v3(0.17, 0.37, 0.17), pivot: [0.1, -0.58], tank: [0.97, -0.14] },
  enduro: { wb: 1.52, rake: 0.47, fork: 0.86, seat: [0.88, 0.14], grip: v3(0.44, 0.14, 0.1), peg: v3(0.17, 0.4, 0.12), pivot: [0.12, -0.6], tank: [1.0, -0.2] },
  dirt: { wb: 1.48, rake: 0.47, fork: 0.94, seat: [0.96, 0.08], grip: v3(0.41, 0.12, 0.06), peg: v3(0.17, 0.43, 0.08), pivot: [0.13, -0.58], tank: [1.03, -0.24] },
};
// Körperhaltung (wie POSES in bikes.js): Supersportler geduckt, Enduro aufrecht, Motocross Ellbogen hoch
export const MOTO_POSES = {
  superbike: { reach: 0.42, curv: 0.07, pole: v3(1, -0.2, 0.5), pitch: -0.3, neck: 0.7, hip: v3(0, 0, 0.02) },
  naked: { reach: 0.5, curv: 0.04, pole: v3(1, -0.45, 0.4), pitch: -0.05, neck: 0.4, hip: v3(0, 0, 0.0) },
  enduro: { reach: 0.53, curv: 0.03, pole: v3(1, -0.4, 0.35), pitch: 0.04, neck: 0.3, hip: v3(0, 0, -0.02) },
  dirt: { reach: 0.48, curv: 0.04, pole: v3(1, 0.05, 0.3), pitch: 0.05, neck: 0.42, hip: v3(0, 0.02, -0.06) },
};

const TANK_P = [ // s entlang des Tanks (von vorn): halbe Breite, halbe Höhe, Versatz nach oben
  [0, 0.02, 0.03, 0.0], [0.04, 0.1, 0.09, 0.01], [0.12, 0.15, 0.12, 0.02], [0.26, 0.155, 0.12, 0.015],
  [0.38, 0.13, 0.1, 0.0], [0.46, 0.09, 0.07, -0.02], [0.5, 0.0, 0.03, -0.03],
];
const SEAT_P = [ // Sitzbank
  [0, 0.0, 0.01, 0], [0.03, 0.1, 0.035, 0.0], [0.1, 0.13, 0.045, 0.004], [0.25, 0.135, 0.05, 0.008], [0.36, 0.11, 0.045, 0.006], [0.42, 0.0, 0.02, 0.0],
];

// Seitenblech/Verkleidungsteil aus einem Umriss (z, y) – gespiegelt auf beiden Seiten im Abstand x
function panel(B, key, pts, x, th = 0.016) {
  const sh = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? sh.lineTo(-z, y) : sh.moveTo(-z, y)));
  for (const sx of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 4 }).rotateY(Math.PI / 2);
    g.translate(sx > 0 ? x - th / 2 : -x - th / 2, 0, 0);
    B.put(key, g);
  }
}

export function buildMoto(B, def, mats, { low, group, numTex }) {
  const L = def.look;
  const type = L.moto;
  const G = MOTO_GEOM[type];
  const col = def.colors;
  const seg = low ? 6 : 12;
  const rF = L.wheelR, rR = L.wheelRR ?? L.wheelR;
  const R = v3(0, rR, G.wb / 2), Fw = v3(0, rF, -G.wb / 2);
  const sport = type === 'superbike', naked = type === 'naked', enduro = type === 'enduro', dirt = type === 'dirt';
  const offroad = enduro || dirt;
  const fairing = L.fairing || 'none';
  const mid = (a, b, t) => a.clone().lerp(b, t);

  // ----- Lenkkopf und Gabel -----
  const fDir = v3(0, Math.cos(G.rake), Math.sin(G.rake)); // von der Vorderachse zur oberen Gabelbrücke (nach oben/hinten)
  const H = Fw.clone().addScaledVector(fDir, G.fork); // obere Gabelbrücke
  const Hl = H.clone().addScaledVector(fDir, -0.16); // untere Gabelbrücke
  const usd = sport || dirt || (L.pipe === 'race'); // Upside-Down-Gabel (goldene Standrohre unten)
  const fw = offroad ? 0.1 : 0.095;
  for (const sx of [-1, 1]) {
    const top = H.clone().add(v3(sx * fw, 0.03, 0)), bot = Fw.clone().add(v3(sx * fw, 0, 0));
    const m1 = mid(top, bot, 0.5);
    if (usd) {
      B.tube('dark', top, m1, 0.03, 0.03, seg); // dickes Außenrohr oben
      B.tube('gold', m1, bot.clone().addScaledVector(fDir, 0.05), 0.022, 0.022, seg); // Gleitrohr unten
      B.tube('dark', bot.clone().addScaledVector(fDir, 0.08), bot, 0.03, 0.026, seg); // Achsfaust
    } else {
      B.tube('metal', top, m1, 0.022, 0.022, seg); // Standrohr (verchromt)
      B.tube(offroad ? 'dark' : 'engine', m1.clone().addScaledVector(fDir, 0.02), bot, 0.032, 0.03, seg); // Tauchrohr
    }
    if (offroad && !low) B.tube('accent', m1.clone().addScaledVector(fDir, -0.02), m1.clone().addScaledVector(fDir, -0.25), 0.036, 0.034, 8); // Gabelschützer
  }
  B.tube('metal', Fw.clone().add(v3(-fw - 0.03, 0, 0)), Fw.clone().add(v3(fw + 0.03, 0, 0)), 0.014, 0.014, 6); // Achse
  for (const p of [H, Hl]) B.box('dark', p.clone().add(v3(0, 0.0, 0.03)), fw * 2 + 0.09, 0.04, 0.11);
  B.tube('dark', Hl.clone().addScaledVector(fDir, -0.03), H.clone().addScaledVector(fDir, 0.03), 0.034, 0.034, seg); // Lenkkopf

  // ----- Rahmen und Schwinge -----
  const Pv = v3(0, rR + G.pivot[0], G.wb / 2 + G.pivot[1]); // Schwingenlager
  const frameKey = naked ? 'accent' : sport ? 'metal' : 'dark';
  const head = mid(H, Hl, 0.5);
  if (sport || naked) {
    for (const sx of [-1, 1]) {
      const a = head.clone().add(v3(sx * 0.06, 0, 0.03));
      const b = v3(sx * 0.15, Pv.y + 0.32, (head.z + Pv.z) * 0.5 - 0.05);
      const c = v3(sx * 0.13, Pv.y + 0.08, Pv.z - 0.03);
      if (naked) { // Gitterrohrrahmen: obere und untere Rohre + Diagonalen
        const a2 = head.clone().add(v3(sx * 0.05, -0.1, 0.02));
        const b2 = v3(sx * 0.14, Pv.y + 0.12, (head.z + Pv.z) * 0.5);
        B.curve(frameKey, [a, b, c.clone().add(v3(0, 0.1, 0))], 0.017, 16, 6);
        B.curve(frameKey, [a2, b2, c], 0.017, 16, 6);
        if (!low) for (let i = 1; i < 4; i++) {
          const t0 = i / 4, t1 = (i + 0.5) / 4;
          B.tube(frameKey, mid(a, c.clone().add(v3(0, 0.1, 0)), t0), mid(a2, c, t1), 0.012, 0.012, 5);
        }
        B.curve(frameKey, [c.clone().add(v3(0, 0.1, 0)), v3(sx * 0.1, G.seat[0] - 0.05, G.seat[1] + 0.05), v3(sx * 0.07, G.seat[0] + 0.02, G.seat[1] + 0.42)], 0.013, 12, 5); // Heckrahmen
      } else { // Brückenrahmen (Aluminium-Profil)
        B.curve(frameKey, [a, b, c], 0.042, low ? 8 : 16, low ? 6 : 8);
        B.curve('dark', [c.clone().add(v3(0, 0.05, 0)), v3(sx * 0.09, G.seat[0] - 0.08, G.seat[1] + 0.1), v3(sx * 0.06, G.seat[0] + 0.0, G.seat[1] + 0.45)], 0.014, 10, 5); // Heckrahmen
      }
    }
  } else { // Doppelschleifen-/Einrohrrahmen
    for (const sx of [-1, 1]) {
      const top = [head.clone().add(v3(sx * 0.03, 0.03, 0.03)), v3(sx * 0.1, G.tank[0] - 0.06, G.tank[1] + 0.05), v3(sx * 0.12, Pv.y + 0.2, Pv.z - 0.02)];
      B.curve(frameKey, top, 0.019, 14, 6);
      B.curve(frameKey, [Hl.clone().add(v3(sx * 0.02, -0.02, 0)), v3(sx * 0.07, 0.3, Hl.z + 0.18), v3(sx * 0.09, 0.23, Pv.z - 0.12), v3(sx * 0.11, Pv.y - 0.04, Pv.z)], 0.017, 16, 6);
      B.curve(frameKey, [v3(sx * 0.12, Pv.y + 0.18, Pv.z), v3(sx * 0.1, G.seat[0] - 0.06, G.seat[1] + 0.12), v3(sx * 0.06, G.seat[0] - 0.02, G.seat[1] + 0.5)], 0.013, 10, 5);
    }
  }
  // Schwinge
  const armKey = sport ? 'metal' : naked ? 'engine' : 'metal';
  for (const sx of [-1, 1]) {
    B.tubeF(armKey, Pv.clone().add(v3(sx * 0.11, 0, 0)), R.clone().add(v3(sx * 0.1, 0.0, 0)), sport ? 0.045 : 0.033, sport ? 0.03 : 0.026, seg, sport ? 0.55 : 0.7);
    if (!low) B.box('dark', R.clone().add(v3(sx * 0.1, 0, 0.0)), 0.03, 0.05, 0.06); // Kettenspanner
  }
  B.tube('dark', Pv.clone().add(v3(-0.14, 0, 0)), Pv.clone().add(v3(0.14, 0, 0)), 0.024, 0.024, 8); // Lagerachse
  B.tube('metal', R.clone().add(v3(-0.13, 0, 0)), R.clone().add(v3(0.13, 0, 0)), 0.015, 0.015, 6); // Hinterachse
  // Federbein (zentral)
  {
    const a = Pv.clone().add(v3(0, 0.05, -0.04)), b = v3(0, G.seat[0] - 0.12, Pv.z - 0.08 + (offroad ? 0.05 : 0));
    B.tube('dark', a, mid(a, b, 0.3), 0.022, 0.022, 8);
    B.tube(offroad ? 'gold' : 'accent', mid(a, b, 0.25), mid(a, b, 0.85), 0.033, 0.033, seg); // Feder
    B.tube('dark', mid(a, b, 0.85), b, 0.026, 0.026, 8);
  }

  // ----- Motor -----
  const eY = sport ? 0.45 : naked ? 0.44 : offroad ? 0.48 : 0.45;
  const eZ = (Hl.z + Pv.z) * 0.5 + 0.03;
  if (dirt) { // Einzylinder
    B.box('engine', v3(0, eY, eZ + 0.02), 0.22, 0.25, 0.34);
    B.box('engine', v3(0, eY + 0.22, eZ - 0.04), 0.14, 0.24, 0.16, -0.3);
    if (!low) for (let i = 0; i < 6; i++) B.box('metal', v3(0, eY + 0.14 + i * 0.035, eZ - 0.04 - i * 0.011), 0.2, 0.012, 0.2, -0.3); // Kühlrippen
    B.box('accent', v3(0.115, eY - 0.02, eZ + 0.04), 0.012, 0.13, 0.15); // Kupplungsdeckel
  } else {
    const wE = sport ? 0.4 : naked ? 0.38 : 0.34;
    B.box('engine', v3(0, eY - 0.02, eZ + 0.04), wE, 0.26, 0.4);
    if (enduro) { // Boxer-ähnlicher Twin: zwei Zylinder schräg nach vorn
      for (const sx of [-1, 1]) B.tube('engine', v3(sx * 0.12, eY + 0.12, eZ - 0.04), v3(sx * 0.13, eY + 0.3, eZ - 0.16), 0.07, 0.065, 10);
    } else {
      B.box('engine', v3(0, eY + 0.2, eZ - 0.06), wE * 0.92, 0.26, 0.22, -0.42); // Zylinderblock
      B.box(sport ? 'dark' : 'accent', v3(0, eY + 0.34, eZ - 0.12), wE * 0.86, 0.06, 0.2, -0.42); // Ventildeckel
    }
    for (const sx of [-1, 1]) if (!low) B.ell('metal', v3(sx * (wE / 2 + 0.01), eY, eZ + 0.08), 0.02, 0.09, 0.09, 0, 12); // Lichtmaschinen-/Kupplungsdeckel
    if (!sport || fairing !== 'full') { // Kühler vor dem Motor
      const rc = v3(0, eY + 0.25, Hl.z + 0.13);
      B.box('dark', rc, enduro ? 0.36 : 0.42, 0.3, 0.05, -0.25);
      if (!low) B.box('metal', rc.clone().add(v3(0, 0, -0.03)), enduro ? 0.34 : 0.4, 0.27, 0.01, -0.25);
    }
  }
  if (offroad) B.box('metal', v3(0, 0.25, eZ + 0.04), 0.24, 0.03, 0.42, 0.05); // Motorschutz

  // ----- Antrieb: Ritzel, Kette, Kettenrad -----
  const pin = v3(0.1, eY - 0.06, Pv.z - 0.07);
  if (!low) {
    const spR = 0.11 * (rR / 0.32);
    for (const dy of [0.045, -0.045]) B.tube('chain', pin.clone().add(v3(0, dy * 0.9, 0)), R.clone().add(v3(0.1, dy * (spR / 0.045), 0)), 0.006, 0.006, 4);
  }

  // ----- Tank -----
  {
    const tw = sport ? 1.0 : naked ? 1.05 : enduro ? 1.25 : 0.78;
    const tFront = v3(0, G.tank[0] + 0.03, G.tank[1] - 0.24), tBack = v3(0, G.tank[0] - 0.03, G.tank[1] + 0.26);
    const tc = line(tFront, tBack);
    B.put('frame', loft(tc, (s) => { const p = prof(TANK_P, s); return [p[0] * tw, p[1] * (dirt ? 0.8 : 1), p[2]]; }, { a: 0, b: 0.5, ref: UP, nT: low ? 8 : 18, nR: low ? 10 : 18, ex: 2.6 }));
    if (!low) B.ell('metal', v3(0, G.tank[0] + 0.14 * (dirt ? 0.8 : 1), G.tank[1] - 0.05), 0.04, 0.012, 0.04, 0, 10); // Tankdeckel
    if (dirt) { // Kühlerverkleidungen (Shrouds) seitlich
      panel(B, 'plastic', [[-0.36, 0.97], [-0.16, 1.0], [-0.04, 0.93], [-0.1, 0.76], [-0.3, 0.72], [-0.4, 0.84]].map(([z, y]) => [G.tank[1] + 0.15 + z, y - 1.0 + G.tank[0]]), 0.165);
    }
  }

  // ----- Sitzbank + Heck -----
  const seatF = v3(0, G.seat[0] + 0.01, G.seat[1] - (dirt ? 0.36 : 0.2)), seatB = v3(0, G.seat[0] + (sport ? 0.05 : 0.03), G.seat[1] + (dirt ? 0.42 : 0.24));
  B.put('saddle', loft(line(seatF, seatB), (s) => { const p = prof(SEAT_P, s * (0.42 / seatF.distanceTo(seatB))); return [p[0] * (dirt ? 0.85 : 1), p[1], p[2]]; }, { a: 0, b: seatF.distanceTo(seatB), ref: UP, nT: low ? 6 : 14, nR: low ? 8 : 14, ex: 3 }));
  if (sport || naked) { // spitzes Heck mit Rücklicht
    const t0 = v3(0, G.seat[0] - 0.02, G.seat[1] + 0.1), t1 = v3(0, G.seat[0] + (sport ? 0.17 : 0.12), G.seat[1] + 0.62);
    B.put('frame', loft(line(t0, t1), (s) => { const k = s / t0.distanceTo(t1); return [0.12 * (1 - k * 0.65), 0.09 * (1 - k * 0.55), -0.02]; }, { a: 0, b: t0.distanceTo(t1), ref: UP, nT: low ? 4 : 10, nR: low ? 8 : 12, ex: 3.2 }));
    B.box('lightR', t1.clone().add(v3(0, -0.01, 0.015)), 0.08, 0.03, 0.02);
  } else { // Offroad: langer hochgezogener Kotflügel
    const f0 = v3(0, G.seat[0] - 0.04, G.seat[1] + 0.25), f1 = v3(0, G.seat[0] + 0.06, G.seat[1] + 0.82);
    B.put(dirt ? 'plastic' : 'frame', loft(line(f0, f1), (s) => [0.1 - s * 0.03, 0.02, 0], { a: 0, b: f0.distanceTo(f1), ref: UP, nT: 6, nR: 8, ex: 4 }));
    B.box('lightR', f1.clone().add(v3(0, -0.03, -0.05)), 0.07, 0.03, 0.03);
    // Seitenteile unter der Sitzbank (Startnummernfelder beim Dirt Bike)
    panel(B, dirt ? 'plastic' : 'frame', [[0.04, -0.02], [0.4, 0.04], [0.4, -0.1], [0.1, -0.17]].map(([z, y]) => [G.seat[1] + z, G.seat[0] - 0.05 + y]), 0.13);
    if (enduro) { // Gepäckträger
      B.box('dark', v3(0, G.seat[0] + 0.02, G.seat[1] + 0.58), 0.26, 0.02, 0.3);
      for (const sx of [-1, 1]) B.tube('dark', v3(sx * 0.12, G.seat[0] + 0.02, G.seat[1] + 0.44), v3(sx * 0.1, G.seat[0] - 0.12, G.seat[1] + 0.22), 0.01, 0.01, 5);
    }
  }

  // ----- Kotflügel vorn -----
  if (offroad) {
    const a = Hl.clone().add(v3(0, dirt ? -0.12 : -0.1, -0.02));
    const fc = spline([a.clone().add(v3(0, -0.02, 0.18)), a.clone().add(v3(0, 0.0, -0.06)), a.clone().add(v3(0, -0.06, -0.36))]);
    B.put(dirt ? 'plastic' : 'frame', loft(fc, (s) => [0.075, 0.016, 0], { a: 0, b: fc.getLength(), ref: UP, nT: low ? 6 : 12, nR: 8, ex: 4 }));
  } else {
    const c0 = Fw.clone();
    const pts = [];
    for (let i = 0; i <= 8; i++) { const a = -0.25 + (i / 8) * 1.7; pts.push(v3(0, c0.y + Math.cos(a) * (rF + 0.035), c0.z - Math.sin(a) * (rF + 0.035))); }
    B.put('frame', loft(spline(pts), () => [0.07, 0.01, 0], { a: 0, b: spline(pts).getLength(), ref: v3(0, 1, 0), nT: low ? 6 : 14, nR: 8, ex: 4 }));
  }

  // ----- Auspuff -----
  {
    const loud = L.pipe === 'race';
    const ex0 = v3(0, eY + 0.18, eZ - 0.16);
    if (dirt || enduro) { // hochgelegter Krümmer zum Endtopf unter dem Heck (rechts)
      const pts = [ex0, v3(0.06, eY + 0.02, eZ - 0.24), v3(0.15, eY - 0.06, eZ - 0.02), v3(0.16, eY + 0.12, Pv.z + 0.02), v3(0.16, G.seat[0] - 0.15, G.seat[1] + 0.12)];
      B.curve('metal', pts, 0.024, low ? 10 : 24, 6);
      const m0 = v3(0.16, G.seat[0] - 0.15, G.seat[1] + 0.1), m1 = v3(0.15, G.seat[0] - 0.06, G.seat[1] + (loud ? 0.62 : 0.5));
      B.tube(loud ? 'metal' : 'dark', m0, m1, 0.055, 0.05, seg);
      B.tube('engine', m1, m1.clone().add(v3(0, 0.01, 0.03)), 0.035, 0.03, 8);
    } else {
      const n = sport ? 4 : 3;
      for (let i = 0; i < (low ? 1 : n); i++) { // Krümmerrohre unter dem Motor zusammengeführt
        const x = (i - (n - 1) / 2) * 0.07;
        B.curve('metal', [ex0.clone().add(v3(x, 0, 0)), v3(x, eY - 0.05, eZ - 0.28), v3(x * 0.5, 0.2, eZ - 0.05), v3(0.04, 0.2, eZ + 0.16)], 0.018, low ? 8 : 18, 6);
      }
      const m0 = v3(0.08, 0.22, eZ + 0.2);
      const m1 = sport ? v3(0.16, G.seat[0] - 0.24, G.seat[1] + 0.32) : v3(0.15, 0.36, Pv.z + (loud ? 0.3 : 0.18));
      B.tube('metal', m0, mid(m0, m1, 0.4), 0.032, 0.035, 8);
      B.tube(loud ? 'metal' : sport ? 'dark' : 'engine', mid(m0, m1, 0.4), m1, 0.055, 0.05, seg); // Endtopf
      B.tube('dark', m1, m1.clone().add(m1.clone().sub(m0).normalize().multiplyScalar(0.025)), 0.04, 0.035, 8);
    }
  }

  // ----- Fußrasten -----
  for (const sx of [-1, 1]) {
    B.tube(offroad ? 'metal' : 'dark', v3(sx * 0.11, G.peg.y, G.peg.z), v3(sx * (G.peg.x + 0.04), G.peg.y, G.peg.z), offroad ? 0.016 : 0.012, 0.012, 6);
    if (!low && !offroad) B.box('metal', v3(sx * 0.12, G.peg.y + 0.06, G.peg.z + 0.05), 0.012, 0.16, 0.08, 0.5); // Rastenanlage
  }

  // ----- Lenker / Cockpit -----
  const grip = H.clone().add(G.grip);
  const gripR = 0.017;
  let gripAxis;
  if (sport) { // Stummellenker an den Gabelholmen
    for (const sx of [-1, 1]) {
      const a = H.clone().add(v3(sx * fw, -0.03, 0.0)), b = v3(sx * grip.x, grip.y, grip.z);
      B.tube('dark', a, mid(a, b, 0.55), 0.014, 0.013, 8);
      B.tube('rubber', mid(a, b, 0.5), b.clone().add(b.clone().sub(a).normalize().multiplyScalar(0.03)), gripR, gripR, 10);
    }
    gripAxis = v3(grip.x - fw, grip.y - H.y + 0.03, grip.z - H.z).normalize();
  } else {
    const c = H.clone().add(v3(0, 0.05, 0.02));
    for (const sx of [-1, 1]) {
      const end = v3(sx * grip.x, grip.y, grip.z);
      B.curve('dark', [c, c.clone().add(v3(sx * 0.12, (grip.y - c.y) * 0.8, (grip.z - c.z) * 0.5)), end.clone().add(v3(-sx * 0.12, 0, 0)), end.clone().add(v3(sx * 0.03, 0, 0))], 0.012, 12, 6);
      B.tube('rubber', end.clone().add(v3(-sx * 0.11, 0, 0)), end.clone().add(v3(sx * 0.02, 0, 0)), gripR, gripR, 10);
      if (offroad && !low) B.curve('plastic', [end.clone().add(v3(-sx * 0.12, -0.02, -0.02)), end.clone().add(v3(-sx * 0.02, 0.0, -0.12)), end.clone().add(v3(sx * 0.03, -0.02, -0.02))], 0.022, 8, 6); // Handschutz
    }
    if (dirt && !low) B.box('dark', c.clone().add(v3(0, 0.04, -0.01)), 0.16, 0.04, 0.05); // Lenkerpolster
    gripAxis = v3(1, 0, 0);
  }
  if (!low) {
    for (const sx of [-1, 1]) {
      const lv = v3(sx * (grip.x - 0.13), grip.y + 0.01, grip.z - 0.02);
      B.ball('dark', lv, 0.016, 1, 1, 1.4, 8);
      B.curve('metal', [lv, lv.clone().add(v3(sx * 0.07, -0.01, -0.06)), lv.clone().add(v3(sx * 0.15, -0.015, -0.05))], 0.006, 6, 4); // Hebel
      if (!dirt) { // Spiegel
        const mb = sport ? v3(sx * 0.2, H.y + 0.16, H.z - 0.14) : lv.clone().add(v3(-sx * 0.02, 0.02, 0));
        const mt = sport ? mb.clone().add(v3(sx * 0.06, 0.02, 0.0)) : lv.clone().add(v3(sx * 0.07, 0.24, 0.02));
        B.tube('dark', mb, mt, 0.006, 0.006, 4);
        B.ell('dark', mt.clone().add(v3(sx * 0.03, 0.02, 0)), 0.06, 0.035, 0.015, 0, 10);
      }
    }
    B.box('dark', H.clone().add(v3(0, sport ? 0.1 : 0.12, sport ? -0.06 : 0.0)), 0.16, 0.08, 0.05, sport ? 0.9 : 0.5); // Display
  }

  // ----- Licht + Verkleidung -----
  const nose = H.clone().add(v3(0, -0.06, -0.22));
  if (fairing === 'full') {
    // Bugverkleidung als Loft (schmaler Schnabel vorn, breit zum Tank hin)
    const n0 = H.clone().add(v3(0, -0.1, -0.42)), n1 = H.clone().add(v3(0, -0.02, 0.08));
    const nl = n0.distanceTo(n1);
    B.put('frame', loft(line(n0, n1), (s) => { const k = s / nl; return [0.05 + 0.17 * Math.sqrt(k), 0.05 + 0.13 * Math.sqrt(k), -0.02 * k]; }, { a: 0, b: nl, ref: UP, nT: low ? 6 : 14, nR: low ? 10 : 18, ex: 2.4 }));
    for (const sx of [-1, 1]) B.ell('lightW', n0.clone().add(v3(sx * 0.08, 0.02, 0.1)), 0.05, 0.02, 0.06, -0.2, 10); // Scheinwerfer
    _q.setFromAxisAngle(v3(1, 0, 0), -0.95);
    _m.compose(H.clone().add(v3(0, 0.1, -0.12)), _q, _one);
    B.add('screen', new THREE.CylinderGeometry(0.15, 0.17, 0.3, 14, 1, true, Math.PI * 0.75, Math.PI * 0.5), _m); // Windschild
    // Seitenverkleidung (schwungvoller Umriss: vom Bug unter dem Tank zur Bauchschale) + Zierstreifen
    const zb = Pv.z - 0.06;
    panel(B, 'frame', [
      [H.z - 0.38, H.y - 0.2], [H.z - 0.33, 0.52], [H.z - 0.16, 0.32], [zb - 0.14, 0.25], [zb, 0.33], [zb - 0.1, 0.5],
      [H.z + 0.3, 0.66], [H.z + 0.08, 0.8], [H.z - 0.14, H.y - 0.06],
    ], 0.21);
    if (!low) panel(B, 'accent', [[H.z - 0.3, 0.5], [H.z - 0.14, 0.36], [zb - 0.16, 0.3], [zb - 0.12, 0.35], [H.z - 0.1, 0.42], [H.z - 0.24, 0.56]], 0.216, 0.008);
  } else if (fairing === 'half') {
    if (offroad) { // Schnabel + Scheinwerfermaske + Windschild
      B.put('frame', loft(line(nose.clone().add(v3(0, -0.12, -0.08)), nose.clone().add(v3(0, 0.08, 0.16))), (s) => [0.13 - s * 0.1, 0.1, 0], { a: 0, b: 0.32, ref: v3(0, 0, -1), nT: 6, nR: 12, ex: 2.6 }));
      for (const sx of [-1, 1]) B.ell('lightW', nose.clone().add(v3(sx * 0.05, -0.02, -0.08)), 0.045, 0.035, 0.02, 0, 10);
    } else {
      B.ell('frame', nose.clone().add(v3(0, 0.0, 0.05)), 0.15, 0.13, 0.12, 0, 14);
      B.ell('lightW', nose.clone().add(v3(0, 0.0, -0.06)), 0.08, 0.06, 0.03, 0, 12);
    }
    _q.setFromAxisAngle(v3(1, 0, 0), -0.5);
    _m.compose(nose.clone().add(v3(0, 0.24, 0.03)), _q, _one);
    B.add('screen', new THREE.CylinderGeometry(0.16, 0.14, 0.32, 12, 1, true, Math.PI * 0.75, Math.PI * 0.5), _m);
  } else if (dirt) { // Startnummerntafel statt Scheinwerfer
    _q.setFromAxisAngle(v3(1, 0, 0), -0.35);
    _m.compose(nose.clone().add(v3(0, 0.02, -0.02)), _q, _one);
    B.add('plastic', new THREE.BoxGeometry(0.26, 0.26, 0.02), _m);
  } else { // runder Scheinwerfer (Naked Bike)
    B.ell('dark', nose.clone().add(v3(0, 0.0, 0.03)), 0.1, 0.09, 0.08, 0, 14);
    B.ell('lightW', nose.clone().add(v3(0, 0.0, -0.04)), 0.085, 0.075, 0.03, 0, 14);
    if (!low) B.box('dark', nose.clone().add(v3(0, 0.12, 0.02)), 0.16, 0.08, 0.02, -0.4); // kleines Windschild
  }

  // ----- Startnummer + Schriftzug (Abziehbilder) -----
  if (numTex) {
    const nm = new THREE.MeshStandardMaterial({ map: numTex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    const add = (w, h, pos, rx, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), nm); m.position.copy(pos); m.rotation.set(rx, ry, 0, 'YXZ'); group.add(m); };
    if (dirt && fairing === 'none') add(0.22, 0.17, nose.clone().add(v3(0, 0.02, -0.035)), -0.35 + 0, Math.PI);
    else if (fairing === 'full') add(0.12, 0.09, H.clone().add(v3(0, -0.06, -0.47)), -0.45, Math.PI);
    for (const sx of [-1, 1]) {
      const p = offroad ? v3(sx * 0.14, G.seat[0] - 0.1, G.seat[1] + 0.22) : v3(sx * 0.115, G.seat[0] + (sport ? 0.07 : 0.05), G.seat[1] + 0.36);
      add(offroad ? 0.2 : 0.13, offroad ? 0.15 : 0.1, p, 0, sx * Math.PI / 2);
    }
  }
  if (!low) {
    const text = def.brandDef.name.toUpperCase();
    const textCol = col.accent === col.frame ? 0xffffff : col.accent;
    const mat = new THREE.MeshStandardMaterial({
      map: canvasTex(512, 96, (g, w, h) => {
        g.fillStyle = hex(textCol); g.font = `${def.brandDef.font} 70px "Trebuchet MS", "Segoe UI", sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
      }),
      transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const full = fairing === 'full';
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(full ? 0.42 : 0.26, full ? 0.08 : 0.05), mat);
      if (full) m.position.set(sx * 0.224, 0.6, H.z + 0.12);
      else { const tw = dirt ? 0.13 : 0.15 * (enduro ? 1.25 : 1); m.position.set(sx * (tw + 0.003), G.tank[0] + 0.02, G.tank[1] + 0.02); }
      m.rotation.y = sx * Math.PI / 2;
      if (full) m.rotation.z = 0;
      group.add(m);
    }
  }

  // ----- Räder -----
  const tireCfg = { sport: [0.06, 0.088], tour: [0.058, 0.08], knobby: [0.05, 0.065] }[L.tire] || [0.058, 0.08];
  function makeWheel(isRear) {
    const wg = new THREE.Group();
    const WB = new Bucket();
    const r = isRear ? rR : rF;
    const t = tireCfg[isRear ? 1 : 0];
    const rimR = r - t * 1.75;
    WB.add('rubber', new THREE.TorusGeometry(r - t, t, low ? 6 : 12, low ? 22 : 48).rotateY(Math.PI / 2).scale(isRear ? 1.05 : 1, 1, 1));
    if (L.tireWall !== 'black') for (const sx of [-1, 1]) WB.add('tire', new THREE.RingGeometry(rimR + 0.012, r - t * 0.7, low ? 22 : 48).rotateY(sx * Math.PI / 2), new THREE.Matrix4().makeTranslation(sx * t * 0.92, 0, 0));
    if (!low && L.tread === 'knobs') {
      const n = 36;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        for (const dx of [-0.5, 0, 0.5]) {
          const aa = a + (dx ? 0.05 : 0);
          _q.setFromAxisAngle(v3(1, 0, 0), aa);
          _m.compose(v3(dx * t * 1.2, Math.cos(aa) * (r - t * 0.1 * (dx ? 3 : 1)), Math.sin(aa) * (r - t * 0.1 * (dx ? 3 : 1))), _q, _one);
          WB.add('rubber', new THREE.BoxGeometry(t * 0.55, 0.018, 0.028), _m);
        }
      }
    } else if (!low && L.tread === 'fine') {
      const n = 40;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        for (const sx of [-1, 1]) {
          _q.setFromAxisAngle(v3(1, 0, 0), a);
          _m.compose(v3(sx * t * 0.45, Math.cos(a) * (r - t * 0.25), Math.sin(a) * (r - t * 0.25)), _q, _one);
          WB.add('dark', new THREE.BoxGeometry(0.012, 0.008, 0.04).rotateY(sx * 0.6), _m);
        }
      }
    }
    // Felge
    const hwR = t * 0.8;
    const rp = [[rimR + 0.01, -hwR], [rimR - 0.004, -hwR * 0.95], [rimR - 0.018, -hwR * 0.6], [rimR - 0.02, 0], [rimR - 0.018, hwR * 0.6], [rimR - 0.004, hwR * 0.95], [rimR + 0.01, hwR]].map(([x, y]) => new THREE.Vector2(x, y));
    WB.add('rimMat', new THREE.LatheGeometry(rp, low ? 20 : 40).rotateZ(-Math.PI / 2));
    const hubR = 0.05;
    WB.add('metal', new THREE.CylinderGeometry(hubR, hubR, isRear ? 0.18 : 0.14, low ? 8 : 14).rotateZ(Math.PI / 2));
    if (offroad) { // Drahtspeichen
      const n = low ? 8 : 32;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, sd = i % 2 ? 1 : -1;
        WB.tube('metal', v3(sd * 0.05, Math.cos(a + sd * 0.3) * hubR, Math.sin(a + sd * 0.3) * hubR), v3(sd * 0.01, Math.cos(a) * (rimR - 0.018), Math.sin(a) * (rimR - 0.018)), 0.0025, 0.0025, 3);
      }
    } else { // Gussfelge: Y-Speichen
      const n = sport ? 5 : 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const mid2 = v3(0, Math.cos(a) * (rimR * 0.55), Math.sin(a) * (rimR * 0.55));
        WB.tubeF('rimMat', v3(0, Math.cos(a) * hubR, Math.sin(a) * hubR), mid2, 0.016, 0.013, 6, 0.6);
        for (const d of [-0.2, 0.2]) WB.tubeF('rimMat', mid2, v3(0, Math.cos(a + d) * (rimR - 0.015), Math.sin(a + d) * (rimR - 0.015)), 0.012, 0.011, 6, 0.6);
      }
    }
    // Bremsscheiben
    const discs = isRear ? 1 : (L.discs ?? 2);
    const dR = isRear ? 0.11 : offroad ? 0.13 : 0.155;
    for (let k = 0; k < discs; k++) {
      const x = isRear ? -0.075 : (k === 0 ? -0.085 : 0.085);
      for (const sx of [-1, 1]) WB.add('metal', new THREE.RingGeometry(dR * 0.62, dR, low ? 16 : 32).rotateY(sx * Math.PI / 2), new THREE.Matrix4().makeTranslation(x + sx * 0.002, 0, 0));
      if (!low) WB.add('dark', new THREE.CylinderGeometry(dR * 0.6, dR * 0.6, 0.008, 12).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, 0, 0));
    }
    if (isRear && !low) { // Kettenrad
      const sr = 0.11 * (rR / 0.32);
      WB.add('dark', new THREE.CylinderGeometry(sr, sr, 0.008, 24).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(0.1, 0, 0));
    }
    WB.flush(mats, wg);
    return wg;
  }
  const wf = makeWheel(false); wf.position.copy(Fw);
  const wr = makeWheel(true); wr.position.copy(R);
  // Bremszangen (stehen still, gehören nicht zum Rad)
  const discsF = L.discs ?? 2;
  for (let k = 0; k < discsF; k++) {
    const x = k === 0 ? -0.085 : 0.085;
    const dR = offroad ? 0.13 : 0.155;
    B.box(L.radial ? 'gold' : 'dark', Fw.clone().add(v3(x * 1.05, dR * 0.55, dR * 0.62)), 0.035, 0.09, 0.05, 0.75);
  }
  B.box('dark', R.clone().add(v3(-0.08, -0.06, -0.08)), 0.03, 0.06, 0.05, -0.6);

  return {
    wheels: [wf, wr], wheelR: rF, wheelRR: rR,
    grip, gripAxis, gripR,
    seat: { y: G.seat[0], z: G.seat[1] },
    peg: G.peg.clone(),
  };
}
