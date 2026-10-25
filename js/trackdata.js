// Reine Streckenmathematik (ohne Three.js): Pfad, Höhenprofil, Hindernisse.
// Die Strecke wird über die Distanz "s" entlang der Mittellinie beschrieben.
// Fahrtrichtung bei Winkel theta: (sin t, -cos t), rechts: (cos t, sin t).

export const START = -20; // Strecke beginnt 20 m vor der Startlinie
export const DS = 0.5; // Abtastabstand
export const RUNOUT = 80; // Auslauf hinter dem Ziel

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const TAU = Math.PI * 2;

// Hindernis-Arten (Seitenbreite hw, Höhe h bis zu der man darüber springen kann, Tempoverlust slow).
//  'rock' Felsen | 'log' Baumstamm quer | 'bale' Strohballen | 'cone' Leitkegel
export const OBSTACLES = {
  rock: { hw: 0.9, h: 0.9, slow: 0.45 },
  log: { hw: 1.8, h: 0.5, slow: 0.35 },
  bale: { hw: 0.8, h: 0.85, slow: 0.5 },
  cone: { hw: 0.4, h: 0.7, slow: 0.08 },
};
// Flächen, durch die man hindurchfährt (drag = Verzögerung m/s², grip = Seitenführung)
export const PATCHES = {
  puddle: { r: [1.8, 2.8], len: [5, 8], drag: 5, grip: 0.55 },
  mud: { r: [2.2, 3.2], len: [8, 14], drag: 7, grip: 0.7 },
  sand: { r: [2.4, 3.4], len: [10, 16], drag: 8.5, grip: 0.5 },
};

// Winkel-Differenz in (-pi, pi]
const angDiff = (d) => d - TAU * Math.round(d / TAU);

// Baut die Strecke. Bei map.loop ist sie ein geschlossener Rundkurs (Länge = Rundenlänge, `laps` Runden),
// sonst eine Strecke von A nach B.
export function buildTrack(map, laps = 1) {
  const rng = mulberry32(map.seed);
  const halfW = map.width / 2;
  const loop = !!map.loop;
  const L = map.length;
  laps = loop ? Math.max(1, laps | 0) : 1;
  const length = L * laps;
  const end = length + RUNOUT;
  const gStart = loop ? 0 : START; // Geometrie-Bereich (bei Rundkursen genau eine Runde)
  const gEnd = loop ? L : end;
  const n = loop ? Math.round(L / DS) + 1 : Math.ceil((end - START) / DS) + 1;
  const step = loop ? L / (n - 1) : DS;
  const xs = new Float32Array(n);
  const zs = new Float32Array(n);
  const th = new Float32Array(n);
  const wrap = loop ? (s) => ((s % L) + L) % L : (s) => s;

  // Wellenlängen so anpassen, dass die Kurven/Hügel eine ganze Zahl an Perioden pro Runde haben (nahtloser Rundkurs)
  const snap = (wl) => (loop ? L / Math.max(1, Math.round(L / wl)) : wl);
  const curves = map.curves.map((c) => ({ a: c.a, wl: snap(c.wl) }));
  const hills = map.hills.map((h) => ({ a: h.a, wl: snap(h.wl) }));
  const curvePh = curves.map(() => rng() * TAU);
  const hillPh = hills.map(() => rng() * TAU);
  const turnDir = map.dir === -1 ? -1 : 1;

  const heading = (s) => {
    let a = 0;
    if (loop) {
      curves.forEach((c, i) => { a += c.a * Math.sin((TAU * s) / c.wl + curvePh[i]); });
      return turnDir * ((TAU * s) / L) * (map.turn ?? 1) + a;
    }
    if (s <= 0) return 0;
    curves.forEach((c, i) => { a += c.a * Math.sin((TAU * s) / c.wl + curvePh[i]); });
    return smooth(s / 60) * a;
  };

  xs[0] = 0; zs[0] = loop ? 0 : -START;
  for (let i = 0; i < n; i++) {
    th[i] = heading(gStart + i * step);
    if (i > 0) {
      xs[i] = xs[i - 1] + Math.sin(th[i - 1]) * step;
      zs[i] = zs[i - 1] - Math.cos(th[i - 1]) * step;
    }
  }
  if (loop) {
    // Lücke zwischen Ende und Anfang gleichmäßig auf die Runde verteilen → exakt geschlossen
    const gx = xs[n - 1] - xs[0], gz = zs[n - 1] - zs[0];
    for (let i = 0; i < n; i++) { xs[i] -= (gx * i) / (n - 1); zs[i] -= (gz * i) / (n - 1); }
    xs[n - 1] = xs[0]; zs[n - 1] = zs[0];
    // Richtung aus der korrigierten Linie neu bestimmen (stetig fortgesetzt)
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let ang = Math.atan2(xs[i1] - xs[i0], -(zs[i1] - zs[i0]));
      if (i === 0) ang = Math.atan2(xs[1] - xs[n - 2], -(zs[1] - zs[n - 2]));
      if (i > 0) ang = prev + angDiff(ang - prev);
      th[i] = prev = ang;
    }
  }

  function pointAt(s, out = {}) {
    s = wrap(s);
    const u = (s - gStart) / step;
    const i = Math.min(n - 2, Math.max(0, Math.floor(u)));
    const f = Math.min(1, Math.max(0, u - i));
    out.x = xs[i] + (xs[i + 1] - xs[i]) * f;
    out.z = zs[i] + (zs[i + 1] - zs[i]) * f;
    out.theta = th[i] + (th[i + 1] - th[i]) * f;
    return out;
  }

  // Schanzen: "lip" = Steigung an der Abflugkante, die Auffahrt ist nach oben gebogen (wie ein echter Kicker).
  //  kicker: Rampe, danach sanfter Abhang | table: Rampe, flache Platte (top), dann Abhang
  //  double: Rampe, Lücke (gap), Landehügel (h2) mit langem Abhang
  const P = 1.5;
  const LAND_FACE = 0.45; // Steigung der Landehügel-Vorderseite (flacher = Zu-kurz-Springen tut weniger weh)
  const rampShape = (r) => {
    const lu = (P * r.h) / r.lip;
    const down = r.down || 0.18;
    let after;
    if (r.type === 'double') {
      const h2 = r.h2 || r.h * 0.9;
      const lm = h2 / LAND_FACE;
      after = r.gap + lm + h2 / down;
    } else if (r.type === 'table') after = r.top + r.h / down;
    else after = r.h / down;
    return { lu, after, down };
  };
  const rampSpan = (r) => { const sh = rampShape(r); return [r.s - sh.lu, r.s + sh.after]; };

  function rampHeight(r, s) {
    const { lu, down } = rampShape(r);
    const d = s - r.s;
    if (d <= -lu) return 0;
    if (d <= 0) return r.h * Math.pow(1 + d / lu, P);
    if (r.type === 'kicker') return d < r.h / down ? r.h * (1 - d / (r.h / down)) : 0;
    if (r.type === 'table') {
      if (d <= r.top) return r.h;
      const ld = r.h / down;
      return d < r.top + ld ? r.h * (1 - (d - r.top) / ld) : 0;
    }
    if (r.type === 'double') {
      const h2 = r.h2 || r.h * 0.9;
      const lm = h2 / LAND_FACE;
      const ld = h2 / down;
      if (d < r.gap) return 0;
      if (d < r.gap + lm) return h2 * ((d - r.gap) / lm);
      return d < r.gap + lm + ld ? h2 * (1 - (d - r.gap - lm) / ld) : 0;
    }
    return 0;
  }

  function rampAt(s) {
    s = wrap(s);
    let y = 0;
    for (const r of map.ramps) y += rampHeight(r, s);
    for (const w of map.whoops || []) {
      const d = s - w.s;
      if (d > 0 && d < w.n * w.wl) y += w.amp * 0.5 * (1 - Math.cos((TAU * d) / w.wl));
    }
    return y;
  }

  function terrainAt(s) {
    s = wrap(s);
    const f = loop ? 1 : smooth(s / 40);
    let y = loop ? 0 : map.trend * Math.max(s, 0);
    hills.forEach((h, i) => { y += f * h.a * Math.sin((TAU * s) / h.wl + hillPh[i]); });
    return y;
  }

  // Krümmung (rad/m, positiv = Rechtskurve) und Querneigung der Kurven (bei Anliegern deutlich stärker)
  const curvAt = (s) => angDiff(pointAt(s + 1).theta - pointAt(s - 1).theta) / 2;
  const bankMax = map.berm ? 0.5 : 0.25;
  const bankAt = (s) => Math.max(-bankMax, Math.min(bankMax, curvAt(s) * (map.berm ? 18 : 10)));

  const heightAt = (s) => { s = wrap(s); return terrainAt(s) + rampAt(s); };
  const slopeAt = (s) => (heightAt(s + 0.25) - heightAt(s - 0.25)) / 0.5;

  // Höhe des seitlichen Walls (Böschung) neben der Strecke
  const bankH = (lat) => {
    const a = Math.abs(lat) - halfW - 3;
    return a > 0 ? Math.pow(a, 1.3) * 0.25 * (map.wall ?? 1) : 0;
  };

  const spans = [...map.ramps.map(rampSpan), ...(map.whoops || []).map((w) => [w.s, w.s + w.n * w.wl])];
  const inRampZone = (s, before = 8, after = 16) => spans.some(([a, b]) => s > a - before && s < b + after);

  // Hindernisse (rocks = alle festen Hindernisse), Flächen (patches) und Boost-Felder
  const rocks = [];
  const patches = [];
  const lo = 70, hi = L - 40;
  const ob = map.obst || {};
  const addRock = (kind, s, lat, extra = {}) => rocks.push({ kind, s, lat, hit: false, ...OBSTACLES[kind], len: 0, ...extra });
  for (const kind of Object.keys(OBSTACLES)) {
    if (!(ob[kind] > 0)) continue;
    const gap = 1 / ob[kind];
    let s = lo;
    while (s < hi) {
      s += gap * (0.5 + rng());
      if (s >= hi || inRampZone(s)) continue;
      const lat1 = (rng() * 2 - 1) * (halfW - 1.2);
      const extra = kind === 'log' ? { hw: Math.min(halfW * 0.42, 1.2 + rng() * 1.2) } : {};
      addRock(kind, s, kind === 'log' ? clampLat(lat1, extra.hw) : lat1, extra);
      if (kind === 'rock' && rng() < 0.3) {
        const lat2 = lat1 + (lat1 > 0 ? -1 : 1) * (2.6 + rng() * 2);
        if (Math.abs(lat2) < halfW - 1) addRock('rock', s + (rng() - 0.5) * 2, lat2);
      }
    }
  }
  function clampLat(lat, hw) { return Math.max(-(halfW - hw), Math.min(halfW - hw, lat)); }
  // Slalom: Leitkegel abwechselnd links/rechts
  for (const sl of map.slaloms || []) {
    for (let i = 0; i < sl.n; i++) addRock('cone', sl.s + i * sl.gap, (i % 2 ? 1 : -1) * Math.min(halfW - 1, sl.amp ?? halfW * 0.45));
  }
  for (const kind of Object.keys(PATCHES)) {
    if (!(ob[kind] > 0)) continue;
    const P = PATCHES[kind];
    const gap = 1 / ob[kind];
    let s = lo;
    while (s < hi) {
      s += gap * (0.5 + rng());
      if (s >= hi || inRampZone(s, 10, 12)) continue;
      const len = P.len[0] + rng() * (P.len[1] - P.len[0]);
      const r = Math.min(halfW - 0.5, P.r[0] + rng() * (P.r[1] - P.r[0]));
      patches.push({ kind, s, lat: (rng() * 2 - 1) * (halfW - r * 0.6), r, len, drag: P.drag, grip: P.grip });
    }
  }
  rocks.sort((p, q) => p.s - q.s);

  const pads = [];
  for (const r of map.ramps) pads.push({ s: rampSpan(r)[0] - 16, lat: 0, used: false });
  if (map.pads > 0) {
    const gap = 1 / map.pads;
    let s = 60;
    while (s < hi) {
      s += gap * (0.6 + rng() * 0.8);
      if (s >= hi || inRampZone(s, 14, 10)) continue;
      pads.push({ s, lat: (rng() * 2 - 1) * (halfW - 1.4), used: false });
    }
  }
  pads.sort((a, b) => a.s - b.s);

  return {
    map, halfW, loop, laps, lapLength: L, length, end, wrap, step,
    meshFrom: gStart, meshTo: gEnd, bankMax, inRampZone,
    pointAt, heightAt, terrainAt, rampAt, slopeAt, bankH, curvAt, bankAt, rampSpan,
    rocks, pads, patches,
  };
}
