// Tie-Dye-Mathematik ohne Bilddateien: Jede Falttechnik bildet einen Punkt des flachen Stoffs (u, v ∈ 0..1)
// auf einen Punkt im gefalteten Bündel ab (bx, by ∈ 0..1). Gefärbt wird auf dem Bündel (Farbkarte N×N);
// beim Aufmachen holt sich jeder Stoffpunkt seine Farbe von dort. Gummibänder lassen weiße Linien zurück.

export const N = 160;
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const tri = (x) => Math.abs(fract(x) * 2 - 1);

// Bündelformen im Einheitsquadrat: Scheibe (Spirale), Rolle (Ringe, Streifen), Knäuel (Knautsch)
export const SHAPE = {
  disc: { r: 0.44 },
  bar: { x0: 0.05, x1: 0.95, y0: 0.33, y1: 0.67 },
  blob: { r: 0.42 },
};

// kind: Bündelform. gesture: wie gefaltet wird. centered: Mittelpunkt wählbar. need: Sterne zum Freischalten.
export const TECHNIQUES = [
  { id: 'spirale', name: 'Spirale', emoji: '🌀', kind: 'disc', gesture: 'twist', centered: true, need: 0, wish: 'mit Spirale' },
  { id: 'kreise', name: 'Kreise', emoji: '🎯', kind: 'bar', gesture: 'pull', centered: true, need: 0, wish: 'mit Kreisen' },
  { id: 'knautsch', name: 'Knautsch', emoji: '☁️', kind: 'blob', gesture: 'scrunch', need: 0, wish: 'im Knautsch-Look' },
  { id: 'streifen', name: 'Streifen', emoji: '🌈', kind: 'bar', gesture: 'fold', need: 2, wish: 'mit Streifen' },
  { id: 'herz', name: 'Herz', emoji: '💖', kind: 'bar', gesture: 'pull', centered: true, need: 5, wish: 'mit Herz' },
  { id: 'stern', name: 'Stern', emoji: '⭐', kind: 'bar', gesture: 'pull', centered: true, need: 9, wish: 'mit Stern' },
];
export const techById = (id) => TECHNIQUES.find((t) => t.id === id);

// ---------- Rauschen ----------
function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, y) => noise(x, y) * 0.5 + noise(x * 2.03 + 17.1, y * 2.03 + 3.7) * 0.3 + noise(x * 4.1 + 5.3, y * 4.1 + 31.9) * 0.2;

// ---------- Umrisse (Herz, Stern) als Radius je Winkel ----------
function radiusTable(pts) {
  const bins = new Float32Array(360);
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    for (let s = 0; s <= 24; s++) {
      const x = x0 + ((x1 - x0) * s) / 24, y = y0 + ((y1 - y0) * s) / 24;
      const b = Math.floor(fract(Math.atan2(y, x) / TAU) * 360) % 360;
      bins[b] = Math.max(bins[b], Math.hypot(x, y));
    }
  }
  for (let i = 0; i < 360; i++) if (!bins[i]) bins[i] = bins[(i + 359) % 360] || 1;
  return bins;
}
const lookup = (bins, ang) => bins[Math.floor(fract(ang / TAU) * 360) % 360];
// Spitze nach unten (Bildschirm-y zeigt nach unten)
const HEART = radiusTable(Array.from({ length: 200 }, (_, i) => {
  const t = (i / 200) * TAU;
  return [(16 * Math.sin(t) ** 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 - 0.15];
}));
const STAR = radiusTable(Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.48 : 1;
  return [Math.cos(a) * r, Math.sin(a) * r];
}));

// ---------- Falten: Stoffpunkt (u, v) → Bündelpunkt (out[0], out[1]) ----------
// box: Rahmen des Kleidungsstücks [x0, y0, x1, y1] – Streifen und Knautsch füllen nur diesen Bereich.
export function makeMapper(techId, cx, cy, box = [0, 0, 1, 1]) {
  const [x0, y0, x1, y1] = box;
  const { bar, disc, blob } = SHAPE;
  const toBar = (k, t, out) => {
    out[0] = bar.x0 + clamp(k) * (bar.x1 - bar.x0);
    out[1] = bar.y0 + (0.08 + 0.84 * t) * (bar.y1 - bar.y0);
  };
  // Hochgezogen: Abstand zum Mittelpunkt (in Kreis-, Herz- oder Sternform) wird zur Position entlang der Rolle
  const rings = (shape, scale) => (u, v, out) => {
    const dx = u - cx, dy = v - cy, ang = Math.atan2(dy, dx);
    const R = shape ? lookup(shape, ang) * scale : scale;
    const n = fbm(u * 6, v * 6) - 0.5;
    toBar(Math.hypot(dx, dy) / R + n * 0.08 + Math.sin(ang * 9) * 0.006, tri((ang / TAU) * 3 + n * 0.3), out);
  };
  switch (techId) {
    case 'spirale': return (u, v, out) => {
      const dx = u - cx, dy = v - cy, r = Math.hypot(dx, dy), n = fbm(u * 5, v * 5) - 0.5;
      const a = Math.atan2(dy, dx) + (r * 1.8 + n * 0.1) * TAU, rr = clamp(r * 1.35 + n * 0.06) * disc.r;
      out[0] = 0.5 + Math.cos(a) * rr;
      out[1] = 0.5 + Math.sin(a) * rr;
    };
    case 'kreise': return rings(null, 0.62);
    case 'herz': return rings(HEART, 0.55);
    case 'stern': return rings(STAR, 0.62);
    case 'streifen': return (u, v, out) => {
      u = (u - x0) / (x1 - x0);
      v = (v - y0) / (y1 - y0);
      const n = fbm(u * 4, v * 4) - 0.5;
      toBar(0.02 + v * 0.96 + n * 0.05 + Math.sin(u * TAU * 1.5) * 0.012, tri(u * 2.5 + n * 0.2), out);
    };
    default: return (u, v, out) => { // Knautsch: doppelt verwirbelt, dann ins runde Knäuel gelegt
      u = (u - x0) / (x1 - x0);
      v = (v - y0) / (y1 - y0);
      const wx = fbm(u * 2.2, v * 2.2) - 0.5, wy = fbm(u * 2.2 + 9.2, v * 2.2 + 4.1) - 0.5;
      const s = u + wx * 0.6 + (fbm((u + wx) * 6, (v + wy) * 6) - 0.5) * 0.18;
      const t = v + wy * 0.6 + (fbm((u + wx) * 6 + 3, (v + wy) * 6 + 8) - 0.5) * 0.18;
      const a = clamp(s) * 2 - 1, b = clamp(t) * 2 - 1;
      out[0] = 0.5 + a * Math.sqrt(1 - (b * b) / 2) * blob.r * 0.94;
      out[1] = 0.5 + b * Math.sqrt(1 - (a * a) / 2) * blob.r * 0.94;
    };
  }
}

// ---------- Gummibänder ----------
// Scheibe: Band als Durchmesser im Winkel b. Rolle/Knäuel: senkrechte Linie bei x = b.
export function bandDist(kind, b, x, y) {
  return kind === 'disc' ? Math.abs((x - 0.5) * Math.sin(b) - (y - 0.5) * Math.cos(b)) : Math.abs(x - b);
}
// Abschnitt zwischen den Bändern (Farbe bleibt beim Malen im angefangenen Abschnitt)
export function segmentAt(kind, bands, x, y) {
  if (!bands.length) return 0;
  let s = 0;
  if (kind !== 'disc') { for (const b of bands) if (x > b) s++; return s; }
  const a = fract(Math.atan2(y - 0.5, x - 0.5) / TAU);
  for (const b of bands) { const f = fract(b / TAU); if (a > f) s++; if (a > fract(f + 0.5)) s++; }
  return s % (bands.length * 2);
}
export function segmentMap(kind, bands) {
  const m = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) m[y * N + x] = segmentAt(kind, bands, (x + 0.5) / N, (y + 0.5) / N);
  return m;
}

// ---------- Farbkarte ----------
export const createDye = () => ({ r: new Float32Array(N * N), g: new Float32Array(N * N), b: new Float32Array(N * N), a: new Float32Array(N * N) });
export const cloneDye = (d) => ({ r: d.r.slice(), g: d.g.slice(), b: d.b.slice(), a: d.a.slice() });
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function hslToRgb(h, s, l) {
  const f = (n) => { const k = (n + h * 12) % 12; return 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
  return [f(0), f(8), f(4)];
}

// Farbtupfer bei (x, y) ∈ 0..1, nur im Abschnitt `s0`. Gibt die aufgetragene Menge zurück.
export function dab(dye, seg, s0, x, y, rad, rgb, k) {
  const px = x * N, py = y * N, r = rad * N;
  let sum = 0;
  for (let yy = Math.max(0, Math.floor(py - r)); yy <= Math.min(N - 1, Math.ceil(py + r)); yy++) {
    for (let xx = Math.max(0, Math.floor(px - r)); xx <= Math.min(N - 1, Math.ceil(px + r)); xx++) {
      const i = yy * N + xx;
      if (seg && seg[i] !== s0) continue;
      const d = Math.hypot(xx + 0.5 - px, yy + 0.5 - py) / r;
      if (d >= 1) continue;
      const w = k * (1 - d * d);
      const a = dye.a[i], na = a + w;
      dye.r[i] = (dye.r[i] * a + rgb[0] * w) / na;
      dye.g[i] = (dye.g[i] * a + rgb[1] * w) / na;
      dye.b[i] = (dye.b[i] * a + rgb[2] * w) / na;
      dye.a[i] = Math.min(na, 2);
      sum += w;
    }
  }
  return sum;
}

export const FABRIC = [252, 251, 247];
const cover = (a) => 1 - Math.exp(-a * 2.4);

// Nasse Farbe fürs Bündel (etwas dunkler als trocken)
export function dyeToImage(dye, img) {
  const d = img.data;
  for (let i = 0, o = 0; i < N * N; i++, o += 4) {
    const c = cover(dye.a[i]);
    d[o] = (FABRIC[0] + (dye.r[i] - FABRIC[0]) * c) * (1 - c * 0.08);
    d[o + 1] = (FABRIC[1] + (dye.g[i] - FABRIC[1]) * c) * (1 - c * 0.08);
    d[o + 2] = (FABRIC[2] + (dye.b[i] - FABRIC[2]) * c) * (1 - c * 0.08);
    d[o + 3] = 255;
  }
}

// Anteil des Bündels mit Farbe (0..1)
export function coverage(kind, dye) {
  let n = 0, hit = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const bx = (x + 0.5) / N, by = (y + 0.5) / N;
    const inside = kind === 'bar'
      ? bx > SHAPE.bar.x0 && bx < SHAPE.bar.x1 && by > SHAPE.bar.y0 && by < SHAPE.bar.y1
      : Math.hypot(bx - 0.5, by - 0.5) < SHAPE[kind].r * 0.95;
    if (!inside) continue;
    n++;
    if (dye.a[y * N + x] > 0.25) hit++;
  }
  return n ? hit / n : 0;
}

// Farbe läuft im Stoff ein wenig aus: Weichzeichnen (vormultipliziert, damit Weiß nicht grau wird)
function blurDye(dye, rad = 2) {
  const ch = [new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N), dye.a.slice()];
  for (let i = 0; i < N * N; i++) { ch[0][i] = dye.r[i] * dye.a[i]; ch[1][i] = dye.g[i] * dye.a[i]; ch[2][i] = dye.b[i] * dye.a[i]; }
  const tmp = new Float32Array(N * N);
  for (const c of ch) {
    for (const horiz of [true, false]) {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          let s = 0, n = 0;
          for (let k = -rad; k <= rad; k++) {
            const q = i + k;
            if (q < 0 || q >= N) continue;
            s += c[horiz ? j * N + q : q * N + j]; n++;
          }
          tmp[horiz ? j * N + i : i * N + j] = s / n;
        }
      }
      c.set(tmp);
    }
  }
  return ch;
}

// Das aufgemachte Kleidungsstück: Stoff-Textur (size×size) für das Feld 0..1 des Kleidungsstücks
export function renderFabric(techId, cx, cy, bands, dye, size = 400, box) {
  const kind = techById(techId).kind;
  const map = makeMapper(techId, cx, cy, box);
  const [pr, pg, pb, pa] = blurDye(dye);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const img = c.createImageData(size, size);
  const d = img.data;
  const out = [0, 0];
  for (let y = 0, o = 0; y < size; y++) {
    for (let x = 0; x < size; x++, o += 4) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      map(u, v, out);
      // Farbe aus dem Bündel holen (bilinear)
      const fx = clamp(out[0] * N - 0.5, 0, N - 1.001), fy = clamp(out[1] * N - 0.5, 0, N - 1.001);
      const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, i = iy * N + ix;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const a = pa[i] * w00 + pa[i + 1] * w10 + pa[i + N] * w01 + pa[i + N + 1] * w11;
      let r = FABRIC[0], g = FABRIC[1], b = FABRIC[2], cov = 0;
      if (a > 1e-4) {
        r = (pr[i] * w00 + pr[i + 1] * w10 + pr[i + N] * w01 + pr[i + N + 1] * w11) / a;
        g = (pg[i] * w00 + pg[i + 1] * w10 + pg[i + N] * w01 + pg[i + N + 1] * w11) / a;
        b = (pb[i] * w00 + pb[i + 1] * w10 + pb[i + N] * w01 + pb[i + N + 1] * w11) / a;
        cov = cover(a);
      }
      // Gummibänder: weiße, leicht ausgefranste Linien
      const n = noise(u * 40, v * 40);
      if (bands.length) {
        let bd = 1;
        for (const bb of bands) bd = Math.min(bd, bandDist(kind, bb, out[0], out[1]));
        const w = 0.011 + n * 0.009;
        cov *= smooth(w * 0.6, w * 1.6, bd) * (0.8 + 0.2 * smooth(w, w * 4, bd));
      }
      // Der Stoff saugt nicht überall gleich – beim Knautschen bleiben viele helle Stellen
      cov *= kind === 'blob' ? 0.35 + 0.65 * smooth(0.3, 0.55, fbm(u * 9 + 1, v * 9 + 2)) : 0.88 + 0.12 * n;
      const shade = 0.96 + 0.04 * noise(u * 90, v * 90);
      d[o] = (FABRIC[0] + (r - FABRIC[0]) * cov) * shade;
      d[o + 1] = (FABRIC[1] + (g - FABRIC[1]) * cov) * shade;
      d[o + 2] = (FABRIC[2] + (b - FABRIC[2]) * cov) * shade;
      d[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

// ---------- Vorschau (Technik-Karten, Kundenwünsche) ----------
export function previewBands(kind) {
  if (kind === 'disc') return [0, Math.PI / 3, (2 * Math.PI) / 3];
  if (kind === 'bar') return [1, 2, 3, 4].map((i) => SHAPE.bar.x0 + (i / 5) * (SHAPE.bar.x1 - SHAPE.bar.x0));
  return [];
}
export function previewDye(kind, hexes) {
  const dye = createDye(), cols = hexes.map(hexToRgb), n = cols.length;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const bx = (x + 0.5) / N, by = (y + 0.5) / N, i = y * N + x;
    let k;
    if (kind === 'disc') k = Math.floor(fract(Math.atan2(by - 0.5, bx - 0.5) / TAU) * 6);
    else if (kind === 'bar') k = Math.floor(clamp((bx - SHAPE.bar.x0) / (SHAPE.bar.x1 - SHAPE.bar.x0), 0, 0.999) * 5);
    else k = Math.floor(fbm(bx * 6 + 3, by * 6 + 1) * n * 2.2);
    const c = cols[k % n];
    dye.r[i] = c[0]; dye.g[i] = c[1]; dye.b[i] = c[2]; dye.a[i] = 1.4;
  }
  return dye;
}
