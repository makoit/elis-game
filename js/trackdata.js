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

export function buildTrack(map) {
  const rng = mulberry32(map.seed);
  const halfW = map.width / 2;
  const end = map.length + RUNOUT;
  const n = Math.ceil((end - START) / DS) + 1;
  const xs = new Float32Array(n);
  const zs = new Float32Array(n);
  const th = new Float32Array(n);

  const curvePh = map.curves.map(() => rng() * TAU);
  const hillPh = map.hills.map(() => rng() * TAU);

  const heading = (s) => {
    if (s <= 0) return 0;
    let a = 0;
    map.curves.forEach((c, i) => { a += c.a * Math.sin((TAU * s) / c.wl + curvePh[i]); });
    return smooth(s / 60) * a;
  };

  xs[0] = 0; zs[0] = -START;
  for (let i = 0; i < n; i++) {
    th[i] = heading(START + i * DS);
    if (i > 0) {
      xs[i] = xs[i - 1] + Math.sin(th[i - 1]) * DS;
      zs[i] = zs[i - 1] - Math.cos(th[i - 1]) * DS;
    }
  }

  function pointAt(s, out = {}) {
    const u = (s - START) / DS;
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
  const rampShape = (r) => {
    const lu = (P * r.h) / r.lip;
    const down = r.down || 0.18;
    let after;
    if (r.type === 'double') {
      const h2 = r.h2 || r.h * 0.9;
      const lm = h2 / 0.7;
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
      const lm = h2 / 0.7;
      const ld = h2 / down;
      if (d < r.gap) return 0;
      if (d < r.gap + lm) return h2 * ((d - r.gap) / lm);
      return d < r.gap + lm + ld ? h2 * (1 - (d - r.gap - lm) / ld) : 0;
    }
    return 0;
  }

  function rampAt(s) {
    let y = 0;
    for (const r of map.ramps) y += rampHeight(r, s);
    for (const w of map.whoops || []) {
      const d = s - w.s;
      if (d > 0 && d < w.n * w.wl) y += w.amp * 0.5 * (1 - Math.cos((TAU * d) / w.wl));
    }
    return y;
  }

  function terrainAt(s) {
    const f = smooth(s / 40);
    let y = map.trend * Math.max(s, 0);
    map.hills.forEach((h, i) => { y += f * h.a * Math.sin((TAU * s) / h.wl + hillPh[i]); });
    return y;
  }

  // Krümmung (rad/m, positiv = Rechtskurve) und Querneigung der Kurven
  const curvAt = (s) => (pointAt(s + 1).theta - pointAt(s - 1).theta) / 2;
  const bankAt = (s) => Math.max(-0.25, Math.min(0.25, curvAt(s) * 10));

  const heightAt = (s) => terrainAt(s) + rampAt(s);
  const slopeAt = (s) => (heightAt(s + 0.25) - heightAt(s - 0.25)) / 0.5;

  // Höhe des seitlichen Walls (Böschung) neben der Strecke
  const bankH = (lat) => {
    const a = Math.abs(lat) - halfW - 3;
    return a > 0 ? Math.pow(a, 1.3) * 0.25 : 0;
  };

  const spans = [...map.ramps.map(rampSpan), ...(map.whoops || []).map((w) => [w.s, w.s + w.n * w.wl])];
  const inRampZone = (s, before = 8, after = 16) => spans.some(([a, b]) => s > a - before && s < b + after);

  // Hindernisse und Boost-Felder
  const rocks = [];
  if (map.rocks > 0) {
    const gap = 1 / map.rocks;
    let s = 70;
    while (s < map.length - 40) {
      s += gap * (0.5 + rng());
      if (inRampZone(s)) continue;
      const lat1 = (rng() * 2 - 1) * (halfW - 1.2);
      rocks.push({ s, lat: lat1, r: 0.9, hit: false });
      if (rng() < 0.3) {
        const lat2 = lat1 + (lat1 > 0 ? -1 : 1) * (2.6 + rng() * 2);
        if (Math.abs(lat2) < halfW - 1) rocks.push({ s: s + (rng() - 0.5) * 2, lat: lat2, r: 0.9, hit: false });
      }
    }
  }

  const pads = [];
  for (const r of map.ramps) pads.push({ s: rampSpan(r)[0] - 16, lat: 0, used: false });
  if (map.pads > 0) {
    const gap = 1 / map.pads;
    let s = 60;
    while (s < map.length - 40) {
      s += gap * (0.6 + rng() * 0.8);
      if (inRampZone(s, 14, 10)) continue;
      pads.push({ s, lat: (rng() * 2 - 1) * (halfW - 2), used: false });
    }
  }
  pads.sort((a, b) => a.s - b.s);

  return {
    map, halfW, length: map.length, end,
    pointAt, heightAt, terrainAt, rampAt, slopeAt, bankH, curvAt, bankAt, rampSpan,
    rocks, pads,
  };
}
