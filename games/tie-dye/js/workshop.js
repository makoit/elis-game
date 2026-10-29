// Werkbank: eine Leinwand für alle vier Schritte – Falten, Binden, Färben, Aufmachen.
// Alles wird in einem Quadrat (ox, oy, S) gezeichnet: Kleidungsstück (400er-Feld) und Bündel (0..1) teilen es sich.
import {
  N, SHAPE, techById, segmentMap, segmentAt, bandDist, createDye, cloneDye, dab, dyeToImage, coverage,
  renderFabric, hexToRgb, hslToRgb,
} from './pattern.js';
import { drawGarment, RAINBOW } from './data.js';
import { sfx } from './sfx.js';

export const STEPS = [
  { id: 'fold', emoji: '🌀', name: 'Falten' },
  { id: 'bands', emoji: '🎀', name: 'Binden' },
  { id: 'dye', emoji: '🎨', name: 'Färben' },
  { id: 'open', emoji: '✂️', name: 'Aufmachen' },
];
const BAND_COLORS = ['#ff5fa2', '#ffc93f', '#4fd0ff', '#8be04e', '#b783ff', '#ff8a3d'];
const MAX_BANDS = { disc: 4, bar: 7, blob: 5 };
const FOLD_HINT = {
  twist: 'Dreh den Stoff im Kreis! 🌀',
  pull: 'Zieh den Stoff nach oben! ⬆️',
  scrunch: 'Knautsch den Stoff zusammen – reiben oder ganz oft tippen! ☁️',
  fold: 'Falte den Stoff – wisch hoch und runter! ↕️',
};
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const backOut = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

// fester Zufall, damit das Knäuel nicht flackert
function rng(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Umrisse der Bündel im Einheitsquadrat
const BUNDLE = {};
function bundlePath(kind) {
  if (BUNDLE[kind]) return BUNDLE[kind];
  const p = new Path2D();
  if (kind === 'disc') p.arc(0.5, 0.5, SHAPE.disc.r, 0, TAU);
  else if (kind === 'bar') {
    const { x0, x1, y0, y1 } = SHAPE.bar, r = (y1 - y0) * 0.42;
    p.moveTo(x0 + r, y0);
    p.lineTo(x1 - r, y0); p.arcTo(x1, y0, x1, y0 + r, r);
    p.lineTo(x1, y1 - r); p.arcTo(x1, y1, x1 - r, y1, r);
    p.lineTo(x0 + r, y1); p.arcTo(x0, y1, x0, y1 - r, r);
    p.lineTo(x0, y0 + r); p.arcTo(x0, y0, x0 + r, y0, r);
    p.closePath();
  } else {
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU;
      const r = SHAPE.blob.r * (1 + 0.05 * Math.sin(3 * a + 1) + 0.035 * Math.sin(5 * a + 2) + 0.025 * Math.sin(9 * a));
      if (i) p.lineTo(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r);
      else p.moveTo(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r);
    }
    p.closePath();
  }
  return (BUNDLE[kind] = p);
}

// Falten-Linien auf dem Bündel
const FOLDS = {};
function foldPath(kind, techId) {
  const key = kind + techId;
  if (FOLDS[key]) return FOLDS[key];
  const p = new Path2D();
  if (kind === 'disc') {
    for (let i = 0; i < 9; i++) {
      const a0 = (i / 9) * TAU;
      p.moveTo(0.5, 0.5);
      for (let s = 1; s <= 24; s++) {
        const r = (s / 24) * SHAPE.disc.r, a = a0 + (s / 24) * 2.4;
        p.lineTo(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r);
      }
    }
  } else if (kind === 'bar') {
    const { x0, x1, y0, y1 } = SHAPE.bar, h = y1 - y0;
    for (let k = 1; k < 6; k++) {
      const y = y0 + (k / 6) * h;
      p.moveTo(x0 + 0.02, y);
      for (let x = x0 + 0.02; x <= x1 - 0.02; x += 0.02) p.lineTo(x, y + Math.sin(x * 40 + k * 2) * 0.006);
    }
    if (techId !== 'streifen') { // hochgezogene Spitze links
      p.moveTo(x0 + 0.01, (y0 + y1) / 2);
      p.quadraticCurveTo(x0 + 0.06, y0 + h * 0.2, x0 + 0.14, y0 + h * 0.08);
      p.moveTo(x0 + 0.01, (y0 + y1) / 2);
      p.quadraticCurveTo(x0 + 0.06, y1 - h * 0.2, x0 + 0.14, y1 - h * 0.08);
    }
  } else {
    const rand = rng(7);
    for (let i = 0; i < 30; i++) {
      const a = rand() * TAU, d = Math.sqrt(rand()) * 0.34, r = 0.02 + rand() * 0.05, s = rand() * TAU;
      const cx = 0.5 + Math.cos(a) * d, cy = 0.5 + Math.sin(a) * d;
      p.moveTo(cx + Math.cos(s) * r, cy + Math.sin(s) * r);
      p.arc(cx, cy, r, s, s + 1.2 + rand() * 1.6);
    }
  }
  return (FOLDS[key] = p);
}

export function createWorkshop(cv, hooks) {
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, S = 1, ox = 0, oy = 0;
  let job = null;
  let blank = null;
  const dyeCv = document.createElement('canvas');
  dyeCv.width = dyeCv.height = N;
  const dctx = dyeCv.getContext('2d');
  const dimg = dctx.createImageData(N, N);
  let dyeDirty = true;
  let color = null;
  let hover = null; // letzter Fingerpunkt in Bildschirm-Pixeln
  let drag = null;
  let fx = [];
  let raf = 0, last = 0, time = 0, lastSquirt = 0;

  function resize() {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.min(W, H) * 0.94;
    ox = (W - S) / 2;
    oy = (H - S) / 2;
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
  addEventListener('resize', resize);

  // ---------- Ablauf ----------
  function start({ garment, tech }) {
    const t = techById(tech);
    blank ||= renderFabric('streifen', 0.5, 0.5, [], createDye(), 400);
    job = {
      g: garment, tech: t, kind: t.kind, cx: garment.center[0], cy: garment.center[1],
      step: 0, p: 0, spin: 1, folded: false, bands: [], pops: [], snipped: [], seg: null,
      dye: createDye(), undo: [], usage: {}, hue: 0, tex: null, open: -1, finished: false,
    };
    fx = [];
    drag = null;
    dyeDirty = true;
    resize();
    enter(0);
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  function enter(step) {
    job.step = step;
    if (step === 2) job.seg = segmentMap(job.kind, job.bands);
    report();
  }
  function report() {
    const s = job.step;
    let hint = '';
    if (s === 0) hint = FOLD_HINT[job.tech.gesture] + (job.tech.centered && job.p < 0.08 ? ' Den 📍 kannst du verschieben.' : '');
    if (s === 1) hint = job.bands.length ? `${job.bands.length} Gummi${job.bands.length > 1 ? 's' : ''} – noch mehr? Dann tippen! 🎀` : 'Tippe aufs Bündel für Gummibänder 🎀';
    if (s === 2) hint = 'Male mit Farbe aufs Bündel! 🎨';
    if (s === 3) hint = job.open >= 0 ? 'Tadaa! ✨' : job.bands.length ? 'Tippe auf die Gummis zum Aufschneiden ✂️' : 'Tippe aufs Bündel zum Aufmachen ✨';
    hooks.onStep(s, {
      hint,
      next: s === 1 || s === 2,
      nextLabel: s === 1 ? (job.bands.length ? 'Färben ▶' : 'Ohne Gummis ▶') : 'Aufmachen ▶',
      undo: (s === 1 && job.bands.length > 0) || (s === 2 && job.undo.length > 0),
      palette: s === 2,
    });
  }
  function next() {
    if (!job) return;
    if (job.step === 1) { sfx.tap(); enter(2); } else if (job.step === 2) {
      if (coverage(job.kind, job.dye) < 0.06) { sfx.nope(); hooks.toast('Erst ein bisschen Farbe drauf! 🎨'); return; }
      sfx.tap();
      enter(3);
    }
  }
  function undo() {
    if (!job) return;
    if (job.step === 1 && job.bands.length) { job.bands.pop(); job.pops.pop(); sfx.tap(); }
    if (job.step === 2 && job.undo.length) { job.dye = job.undo.pop(); dyeDirty = true; sfx.tap(); }
    report();
  }
  function setColor(c) { color = c; }

  // ---------- Eingabe ----------
  const toBundle = (x, y) => [(x - ox) / S, (y - oy) / S];
  const centerPx = () => [ox + job.cx * S, oy + job.cy * S];
  function insideBundle(bx, by, pad = 0) {
    if (job.kind === 'bar') {
      const b = SHAPE.bar;
      return bx > b.x0 - pad && bx < b.x1 + pad && by > b.y0 - pad - 0.04 && by < b.y1 + pad + 0.04;
    }
    return Math.hypot(bx - 0.5, by - 0.5) < SHAPE[job.kind].r * 1.08 + pad;
  }
  function pos(e) {
    const r = cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  cv.addEventListener('pointerdown', (e) => {
    if (!job) return;
    sfx.unlock();
    cv.setPointerCapture?.(e.pointerId);
    const [x, y] = pos(e);
    hover = [x, y];
    const [bx, by] = toBundle(x, y);
    const s = job.step;
    if (s === 0 && !job.folded) {
      const [cx, cy] = centerPx();
      if (job.tech.centered && job.p < 0.08 && Math.hypot(x - cx, y - cy) < Math.max(40, S * 0.08)) drag = { type: 'center' };
      else drag = { type: 'fold', x, y, moved: 0, ang: Math.atan2(y - cy, x - cx) };
    } else if (s === 1) addBand(bx, by);
    else if (s === 2 && color && insideBundle(bx, by)) {
      job.undo.push(cloneDye(job.dye));
      if (job.undo.length > 12) job.undo.shift();
      drag = { type: 'paint', bx, by, seg: segmentAt(job.kind, job.bands, bx, by) };
      paint(bx, by);
      report();
    } else if (s === 3 && job.open < 0) snip(bx, by);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!job) return;
    const [x, y] = pos(e);
    hover = [x, y];
    if (!drag) return;
    if (drag.type === 'center') {
      job.cx = clamp((x - ox) / S, 0.18, 0.82);
      job.cy = clamp((y - oy) / S, 0.18, 0.82);
    } else if (drag.type === 'fold') foldMove(x, y);
    else if (drag.type === 'paint') {
      const [bx, by] = toBundle(x, y);
      const d = Math.hypot(bx - drag.bx, by - drag.by), n = Math.ceil(d / 0.012);
      for (let i = 1; i <= n; i++) paint(drag.bx + ((bx - drag.bx) * i) / n, drag.by + ((by - drag.by) * i) / n);
      drag.bx = bx;
      drag.by = by;
    }
  });
  const up = (e) => {
    if (!job) return;
    if (drag?.type === 'fold' && drag.moved < 12) {
      addProgress(0.06);
      const [x, y] = pos(e);
      fx.push({ type: 'ring', x, y, t: 0 });
    }
    drag = null;
    if (e.pointerType !== 'mouse') hover = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hover = null; });

  // ---------- Falten ----------
  function foldMove(x, y) {
    const g = job.tech.gesture, dx = x - drag.x, dy = y - drag.y, dist = Math.hypot(dx, dy);
    if (g === 'twist') {
      const [cx, cy] = centerPx();
      if (Math.hypot(x - cx, y - cy) > 16) {
        const a = Math.atan2(y - cy, x - cx);
        let da = a - drag.ang;
        if (da > Math.PI) da -= TAU;
        if (da < -Math.PI) da += TAU;
        drag.ang = a;
        if (Math.abs(da) > 0.01) job.spin = Math.sign(da);
        addProgress(Math.abs(da) / (TAU * 1.6));
      }
    } else if (g === 'pull') addProgress(Math.max(0, -dy) / (S * 1.1));
    else if (g === 'fold') addProgress(Math.abs(dy) / (S * 2.6));
    else {
      addProgress(dist / (S * 3.2));
      if (Math.random() < 0.15) fx.push({ type: 'ring', x, y, t: 0 });
    }
    if (!drag) return; // gerade fertig gefaltet
    drag.moved += dist;
    drag.x = x;
    drag.y = y;
  }
  function addProgress(d) {
    if (job.folded) return;
    const before = Math.floor(job.p * 12);
    job.p = Math.min(1, job.p + d);
    if (Math.floor(job.p * 12) > before) sfx.twist(job.p);
    if (before === 0 && job.p >= 0.08) report(); // Hinweis auf den 📍 ausblenden
    if (job.p >= 1) {
      job.folded = true;
      drag = null;
      sfx.pop();
      setTimeout(() => job && job.step === 0 && enter(1), 500);
    }
  }

  // ---------- Gummibänder ----------
  function addBand(bx, by) {
    const k = job.kind;
    if (!insideBundle(bx, by, 0.04)) return;
    if (job.bands.length >= MAX_BANDS[k]) { sfx.nope(); hooks.toast('Genug Gummis! Jetzt färben 🎨'); return; }
    let b, gap;
    if (k === 'disc') {
      b = ((Math.atan2(by - 0.5, bx - 0.5) % Math.PI) + Math.PI) % Math.PI;
      gap = Math.min(...job.bands.map((o) => { const d = Math.abs(o - b) % Math.PI; return Math.min(d, Math.PI - d); }), 9);
      if (gap < 0.3) { sfx.nope(); return; }
    } else {
      const lo = k === 'bar' ? SHAPE.bar.x0 + 0.04 : 0.5 - SHAPE.blob.r * 0.8;
      const hi = k === 'bar' ? SHAPE.bar.x1 - 0.04 : 0.5 + SHAPE.blob.r * 0.8;
      b = clamp(bx, lo, hi);
      gap = Math.min(...job.bands.map((o) => Math.abs(o - b)), 9);
      if (gap < 0.05) { sfx.nope(); return; }
    }
    job.bands.push(b);
    job.pops.push(0);
    sfx.band();
    report();
  }

  // ---------- Färben ----------
  function paint(bx, by) {
    let rgb;
    if (color.rainbow) { job.hue = (job.hue + 0.006) % 1; rgb = hslToRgb(job.hue, 0.95, 0.55); } else rgb = color.rgb ||= hexToRgb(color.hex);
    const got = dab(job.dye, job.seg, drag.seg, bx, by, 0.065, rgb, 0.3);
    if (!got) return;
    job.usage[color.id] = (job.usage[color.id] || 0) + got;
    dyeDirty = true;
    if (Math.random() < 0.35) {
      fx.push({ type: 'drop', x: ox + bx * S + (Math.random() - 0.5) * S * 0.06, y: oy + by * S, vy: 0, t: 0, col: `rgb(${rgb.map(Math.round)})` });
    }
    const now = performance.now();
    if (now - lastSquirt > 140) { lastSquirt = now; sfx.squirt(); }
  }

  // ---------- Aufmachen ----------
  function snip(bx, by) {
    const left = job.bands.map((b, i) => i).filter((i) => !job.snipped[i]);
    if (!left.length) {
      if (insideBundle(bx, by, 0.05)) unfold();
      return;
    }
    let best = -1, bd = 0.06;
    for (const i of left) {
      const d = bandDist(job.kind, job.bands[i], bx, by);
      if (d < bd && insideBundle(bx, by, 0.06)) { bd = d; best = i; }
    }
    if (best < 0) return;
    job.snipped[best] = true;
    sfx.snip();
    fx.push({ type: 'band', b: job.bands[best], col: BAND_COLORS[best % BAND_COLORS.length], t: 0, vx: (Math.random() - 0.5) * 0.6, rot: (Math.random() - 0.5) * 3 });
    if (job.bands.every((b, i) => job.snipped[i])) setTimeout(unfold, 350);
  }
  function unfold() {
    if (!job || job.open >= 0) return;
    job.tex = renderFabric(job.tech.id, job.cx, job.cy, job.bands, job.dye, 512, job.g.box);
    job.open = 0;
    sfx.whoosh();
    report();
  }

  // ---------- Zeichnen ----------
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (!job || !W) return;
    ctx.clearRect(0, 0, W, H);
    const s = job.step;
    if (s === 0) drawFold();
    else if (s === 3 && job.open >= 0) drawUnfold(dt);
    else {
      drawBundle(s >= 2);
      drawBands(dt);
      if (s === 2 && hover && color) drawBottle(hover[0], hover[1]);
      if (s === 3 && job.bands.length && !drag) drawScissorsHint();
    }
    drawFx(dt);
  }

  function drawBundle(withDye, alpha = 1) {
    const k = job.kind, path = bundlePath(k);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(ox, oy);
    ctx.scale(S, S);
    ctx.save();
    ctx.shadowColor = 'rgba(70, 30, 100, 0.3)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#fcfbf7';
    ctx.fill(path);
    ctx.restore();
    ctx.save();
    ctx.clip(path);
    if (withDye) {
      if (dyeDirty) { dyeToImage(job.dye, dimg); dctx.putImageData(dimg, 0, 0); dyeDirty = false; }
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(dyeCv, 0, 0, 1, 1);
    }
    ctx.lineWidth = 0.005;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(90, 60, 120, 0.16)';
    ctx.stroke(foldPath(k, job.tech.id));
    let gr;
    if (k === 'bar') {
      gr = ctx.createLinearGradient(0, SHAPE.bar.y0, 0, SHAPE.bar.y1);
      gr.addColorStop(0, 'rgba(255,255,255,0.3)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0)');
      gr.addColorStop(1, 'rgba(40,20,60,0.2)');
    } else {
      gr = ctx.createRadialGradient(0.42, 0.4, 0.02, 0.5, 0.5, 0.48);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0)');
      gr.addColorStop(1, 'rgba(40,20,60,0.2)');
    }
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 1, 1);
    ctx.restore();
    ctx.lineWidth = 0.004;
    ctx.strokeStyle = 'rgba(70, 45, 95, 0.3)';
    ctx.stroke(path);
    ctx.restore();
  }

  function bandLine(b) {
    const k = job.kind;
    if (k === 'disc') {
      const r = SHAPE.disc.r + 0.015, c = Math.cos(b) * r, s = Math.sin(b) * r;
      return [0.5 - c, 0.5 - s, 0.5 + c, 0.5 + s, 0, 0];
    }
    if (k === 'bar') return [b, SHAPE.bar.y0 - 0.02, b, SHAPE.bar.y1 + 0.02, 0.014, 0];
    const half = Math.sqrt(Math.max(0, SHAPE.blob.r ** 2 - (b - 0.5) ** 2)) * 1.06;
    return [b, 0.5 - half, b, 0.5 + half, 0.012, 0];
  }
  function strokeBand(x0, y0, x1, y1, bulge, col, scale = 1) {
    const mx = (x0 + x1) / 2 + bulge, my = (y0 + y1) / 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(40, 20, 60, 0.35)';
    ctx.lineWidth = 0.03 * scale;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.022 * scale;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.006 * scale;
    ctx.stroke();
  }
  function drawBands(dt) {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(S, S);
    job.bands.forEach((b, i) => {
      if (job.snipped[i]) return;
      job.pops[i] = Math.min(1, job.pops[i] + dt * 4);
      const [x0, y0, x1, y1, bulge] = bandLine(b);
      const pulse = job.step === 3 ? 1 + Math.sin(time * 6 + i) * 0.08 : 1;
      strokeBand(x0, y0, x1, y1, bulge, BAND_COLORS[i % BAND_COLORS.length], backOut(job.pops[i]) * pulse);
    });
    ctx.restore();
  }

  function drawBottle(x, y) {
    const s = S * 0.13;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.45);
    let fill;
    if (color.rainbow) {
      fill = ctx.createLinearGradient(0, -s, 0, -s * 0.2);
      RAINBOW.forEach((c, i) => fill.addColorStop(i / (RAINBOW.length - 1), c));
    } else fill = color.hex;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(40, 20, 60, 0.45)';
    ctx.lineWidth = 2;
    // Spitze
    ctx.beginPath();
    ctx.moveTo(-s * 0.05, -s * 0.06);
    ctx.lineTo(s * 0.05, -s * 0.06);
    ctx.lineTo(s * 0.11, -s * 0.3);
    ctx.lineTo(-s * 0.11, -s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Flasche
    ctx.beginPath();
    ctx.roundRect(-s * 0.2, -s * 1.05, s * 0.4, s * 0.78, s * 0.1);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.roundRect(-s * 0.13, -s * 0.98, s * 0.07, s * 0.6, s * 0.04);
    ctx.fill();
    ctx.restore();
  }

  function drawScissorsHint() {
    const i = job.bands.findIndex((b, j) => !job.snipped[j]);
    if (i < 0) return;
    const [x0, y0, x1, y1] = bandLine(job.bands[i]);
    const t = 0.5 + Math.sin(time * 2) * 0.15;
    emoji('✂️', ox + (x0 + (x1 - x0) * t) * S + S * 0.05, oy + (y0 + (y1 - y0) * t) * S + S * 0.02, S * 0.08, 0.85);
  }

  function emoji(ch, x, y, size, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, x, y);
    ctx.restore();
  }

  // Schritt 1: Kleidungsstück verwandelt sich ins Bündel
  function drawFold() {
    const p = job.p, e = ease(p), g = job.g, gest = job.tech.gesture;
    const [cx, cy] = centerPx();
    const gA = 1 - smooth(0.62, 0.98, p);
    if (gA > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      if (gest === 'twist') { ctx.rotate(e * TAU * 0.9 * job.spin); ctx.scale(1 - 0.5 * e, 1 - 0.5 * e); } else if (gest === 'pull') { ctx.translate(0, -e * S * 0.06); ctx.scale(1 - 0.5 * e, 1 - 0.3 * e); } else if (gest === 'fold') ctx.scale(1 - 0.15 * e, 1 - 0.62 * e);
      else {
        const j = drag ? Math.sin(time * 40) * 0.025 : 0;
        ctx.rotate(j);
        ctx.scale(1 - 0.45 * e + j, 1 - 0.45 * e - j);
      }
      ctx.translate(-cx, -cy);
      drawGarment(ctx, g, blank, ox, oy, S, { alpha: gA, extra: p > 0.03 ? (c) => foldLines(c, p) : null });
      ctx.restore();
    }
    const bA = smooth(0.55, 1, p);
    if (bA > 0) {
      const k = 0.55 + 0.45 * backOut(smooth(0.55, 1, p));
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(k, k);
      ctx.translate(-W / 2, -H / 2);
      drawBundle(false, bA);
      ctx.restore();
    }
    if (!job.folded) {
      drawGuide(cx, cy);
      if (job.tech.centered && p < 0.08) drawPin(cx, cy);
      // Fortschritt
      const bw = S * 0.5, bh = Math.max(10, S * 0.025), bx = W / 2 - bw / 2, by = oy + S - bh;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, bh / 2);
      ctx.fill();
      const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      RAINBOW.forEach((c, i) => gr.addColorStop(i / (RAINBOW.length - 1), c));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.roundRect(bx, by, Math.max(bh, bw * p), bh, bh / 2);
      ctx.fill();
    }
  }
  // Falten-Linien im Stoff (im 400er-Feld des Kleidungsstücks)
  function foldLines(c, p) {
    const x = job.cx * 400, y = job.cy * 400, gest = job.tech.gesture;
    c.save();
    c.strokeStyle = `rgba(90, 60, 120, ${0.08 + p * 0.22})`;
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.beginPath();
    if (gest === 'twist') {
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * TAU;
        c.moveTo(x, y);
        for (let s = 1; s <= 20; s++) {
          const r = s * 14, a = a0 + s * 0.12 * p * 3 * job.spin;
          c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
      }
    } else if (gest === 'pull') {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        c.moveTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
        c.lineTo(x + Math.cos(a) * 300, y + Math.sin(a) * 300);
      }
    } else if (gest === 'fold') {
      for (let k = 0; k < 400; k += 34) { c.moveTo(0, k); c.lineTo(400, k + 6); }
    } else {
      const rand = rng(3);
      for (let i = 0; i < 18 + p * 30; i++) {
        const px = rand() * 400, py = rand() * 400, r = 8 + rand() * 18, s = rand() * TAU;
        c.moveTo(px + Math.cos(s) * r, py + Math.sin(s) * r);
        c.arc(px, py, r, s, s + 1.5);
      }
    }
    c.stroke();
    c.restore();
  }
  function drawGuide(cx, cy) {
    const gest = job.tech.gesture, a = drag ? 0.25 : 0.9, R = S * 0.2;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#ff3fa4';
    ctx.fillStyle = '#ff3fa4';
    ctx.lineWidth = Math.max(4, S * 0.012);
    ctx.lineCap = 'round';
    ctx.setLineDash([S * 0.03, S * 0.025]);
    ctx.lineDashOffset = -time * 40;
    const hs = S * 0.09;
    if (gest === 'twist') {
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI * 1.2);
      ctx.stroke();
      ctx.setLineDash([]);
      arrowHead(cx + Math.cos(Math.PI * 1.2) * R, cy + Math.sin(Math.PI * 1.2) * R, Math.PI * 1.2 + Math.PI / 2);
      const t = (time * 1.4) % TAU;
      emoji('👆', cx + Math.cos(t - Math.PI / 2) * R + hs * 0.15, cy + Math.sin(t - Math.PI / 2) * R + hs * 0.45, hs);
    } else if (gest === 'pull' || gest === 'fold') {
      const y0 = cy + S * 0.05, y1 = cy - S * 0.25;
      ctx.beginPath();
      ctx.moveTo(cx, y0);
      ctx.lineTo(cx, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      arrowHead(cx, y1, -Math.PI / 2);
      if (gest === 'fold') arrowHead(cx, y0, Math.PI / 2);
      const t = gest === 'pull' ? (time * 0.8) % 1 : 0.5 + Math.sin(time * 3) * 0.5;
      emoji('👆', cx + hs * 0.3, y0 + (y1 - y0) * t + hs * 0.45, hs);
    } else {
      const k = Math.floor(time * 1.6), rand = rng(k + 11);
      const px = ox + (0.3 + rand() * 0.4) * S, py = oy + (0.3 + rand() * 0.4) * S, ph = (time * 1.6) % 1;
      emoji('👆', px, py + hs * 0.45 + Math.abs(Math.sin(ph * Math.PI)) * -hs * 0.2, hs);
    }
    ctx.restore();
  }
  function arrowHead(x, y, ang) {
    const s = S * 0.035;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.7, -s * 0.8);
    ctx.lineTo(-s * 0.7, s * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawPin(x, y) {
    const r = Math.max(14, S * 0.03), b = 1 + Math.sin(time * 4) * 0.08;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 63, 164, 0.22)';
    ctx.beginPath();
    ctx.arc(x, y, r * 1.9 * b, 0, TAU);
    ctx.fill();
    ctx.restore();
    emoji('📍', x, y - r * 0.7, r * 2.2);
  }

  // Schritt 4: Bündel geht auf, das Muster erscheint
  function drawUnfold(dt) {
    job.open = Math.min(1, job.open + dt / 1.6);
    const o = job.open, e = ease(o);
    const bA = 1 - smooth(0, 0.45, o);
    if (bA > 0) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(1 - 0.3 * o, 1 - 0.3 * o);
      ctx.translate(-W / 2, -H / 2);
      drawBundle(true, bA);
      ctx.restore();
    }
    const [cx, cy] = centerPx();
    ctx.save();
    ctx.translate(cx, cy);
    if (job.tech.gesture === 'twist') ctx.rotate(-(1 - e) * TAU * 0.8 * job.spin);
    const k = 0.4 + 0.6 * backOut(smooth(0.15, 1, o));
    ctx.scale(k, k);
    ctx.translate(-cx, -cy);
    drawGarment(ctx, job.g, job.tex, ox, oy, S, { alpha: smooth(0.2, 0.6, o) });
    ctx.restore();
    if (o >= 1 && !job.finished) {
      job.finished = true;
      sfx.fanfare();
      for (let i = 0; i < 26; i++) {
        fx.push({ type: 'spark', x: ox + S * (0.15 + Math.random() * 0.7), y: oy + S * (0.15 + Math.random() * 0.7), t: -Math.random() * 0.5, s: 0.5 + Math.random() });
      }
      const g = job;
      setTimeout(() => job === g && hooks.onDone({ garment: g.g, tech: g.tech, tex: g.tex, usage: g.usage }), 1300);
    }
  }

  function drawFx(dt) {
    fx = fx.filter((f) => {
      f.t += dt;
      if (f.type === 'ring') {
        if (f.t > 0.5) return false;
        ctx.save();
        ctx.strokeStyle = `rgba(255, 63, 164, ${0.6 * (1 - f.t / 0.5)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 10 + f.t * 90, 0, TAU);
        ctx.stroke();
        ctx.restore();
      } else if (f.type === 'drop') {
        if (f.t > 0.35) return false;
        f.vy += 900 * dt;
        f.y += f.vy * dt;
        ctx.save();
        ctx.globalAlpha = 1 - f.t / 0.35;
        ctx.fillStyle = f.col;
        ctx.beginPath();
        ctx.arc(f.x, f.y, Math.max(3, S * 0.008), 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (f.type === 'band') {
        if (f.t > 1) return false;
        const [x0, y0, x1, y1, bulge] = bandLine(f.b);
        ctx.save();
        ctx.globalAlpha = 1 - f.t;
        ctx.translate(ox + ((x0 + x1) / 2 + f.vx * f.t) * S, oy + ((y0 + y1) / 2 - 0.3 * f.t + 0.9 * f.t * f.t) * S);
        ctx.rotate(f.rot * f.t);
        ctx.scale(S * (1 - f.t * 0.5), S * (1 - f.t * 0.5));
        const hx = (x1 - x0) / 2, hy = (y1 - y0) / 2;
        strokeBand(-hx, -hy, hx, hy, bulge + 0.06 * f.t, f.col);
        ctx.restore();
      } else if (f.type === 'spark') {
        if (f.t > 1.2) return false;
        if (f.t < 0) return true;
        const k = Math.sin((f.t / 1.2) * Math.PI);
        emoji('✨', f.x, f.y - f.t * 30, S * 0.06 * f.s * k + 1, k);
      }
      return true;
    });
  }

  return { start, stop, next, undo, setColor };
}
