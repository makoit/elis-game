// 2D-Karte eines Gewässers auf einem Canvas: echte Uferlinien (geo.js), Orte, Angelplätze als Pins.
import { GEO } from './geo.js';

const R = 6371000;
// lat/lon -> Meter relativ zum Kartenmittelpunkt (x Ost, y Nord)
export function project(geo, lat, lon) {
  const k = Math.cos((geo.lat0 * Math.PI) / 180);
  return [((lon - geo.lon0) * Math.PI / 180) * R * k, ((lat - geo.lat0) * Math.PI / 180) * R];
}

const COL = {
  land: '#cfe3b0', land2: '#b9d69a', water: '#5fb8d9', waterDeep: '#3d97c4', coast: '#2d6f8f', text: '#21313d', river: '#4aa6cf',
};

// Zeichnet die Karte; gibt die Bildschirm-Positionen der Spots zurück (für Klicks).
export function drawWaterMap(canvas, water, opts = {}) {
  const geo = GEO[water.id];
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const cw = canvas.clientWidth || canvas.width;
  const ch = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Ausschnitt: Bounding-Box der Geometrie + Spots
  const [x0, y0, x1, y1] = geo.bbox;
  const pad = opts.mini ? 6 : 34;
  const s = Math.min((cw - pad * 2) / (x1 - x0), (ch - pad * 2) / (y1 - y0));
  const ox = cw / 2 - ((x0 + x1) / 2) * s;
  const oy = ch / 2 + ((y0 + y1) / 2) * s;
  const P = (x, y) => [ox + x * s, oy - y * s];
  const ring = (pts) => { pts.forEach(([x, y], i) => { const [a, b] = P(x, y); if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b); }); ctx.closePath(); };

  const sea = geo.type === 'sea';
  // Hintergrund
  ctx.fillStyle = sea ? COL.water : COL.land;
  ctx.fillRect(0, 0, cw, ch);
  if (sea) {
    ctx.beginPath(); geo.land.forEach(ring);
    ctx.fillStyle = COL.land; ctx.fill('evenodd');
    ctx.strokeStyle = COL.coast; ctx.lineWidth = opts.mini ? 1 : 1.6; ctx.stroke();
  } else {
    // Wasserflächen (Seen); Inseln sind Löcher (evenodd)
    if (geo.water.length) {
      ctx.beginPath(); geo.water.forEach(ring);
      ctx.fillStyle = COL.water; ctx.fill('evenodd');
      ctx.strokeStyle = COL.coast; ctx.lineWidth = opts.mini ? 1 : 1.6; ctx.stroke();
    }
    // Flüsse als dicke Linien
    for (const r of geo.rivers || []) {
      const w = Math.max(opts.mini ? 2.5 : 5, r.width * s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [col, ww] of [[COL.coast, w + 2.5], [COL.river, w]]) {
        ctx.beginPath(); r.pts.forEach(([x, y], i) => { const [a, b] = P(x, y); if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
        ctx.strokeStyle = col; ctx.lineWidth = ww; ctx.stroke();
      }
    }
  }
  if (opts.mini) return [];

  // Wellenlinien im Wasser
  ctx.save();
  ctx.beginPath();
  if (sea) { ctx.rect(0, 0, cw, ch); geo.land.forEach(ring); ctx.clip('evenodd'); } else if (geo.water.length) { geo.water.forEach(ring); ctx.clip('evenodd'); }
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.4;
  for (let y = 10; y < ch; y += 26) for (let x = (y / 26) % 2 ? 0 : 30; x < cw; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 7, y - 5, x + 14, y); ctx.quadraticCurveTo(x + 21, y + 5, x + 28, y); ctx.stroke();
  }
  ctx.restore();

  // Orte
  ctx.font = '600 12px "Avenir Next", system-ui, sans-serif';
  ctx.textAlign = 'left';
  for (const l of water.labels) {
    const [x, y] = P(...project(geo, l.lat, l.lon));
    if (l.peak) {
      ctx.fillStyle = '#7a6a5a'; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 8, y + 4); ctx.lineTo(x - 8, y + 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 3, y - 4); ctx.lineTo(x - 3, y - 4); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = COL.text; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill(); ctx.stroke();
    }
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.strokeText(l.name, x + 7, y + 4);
    ctx.fillStyle = COL.text; ctx.fillText(l.name, x + 7, y + 4);
  }

  // Kompass + Maßstab
  ctx.save(); ctx.translate(cw - 30, 34);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.fill();
  ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(5, 0); ctx.lineTo(-5, 0); ctx.fill();
  ctx.fillStyle = '#2c3e50'; ctx.beginPath(); ctx.moveTo(0, 13); ctx.lineTo(5, 0); ctx.lineTo(-5, 0); ctx.fill();
  ctx.font = '800 9px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText('N', 0, -3);
  ctx.restore();
  const km = [1, 2, 5, 10, 20].find((k) => k * 1000 * s > 60) || 20;
  const sw = km * 1000 * s;
  ctx.fillStyle = COL.text; ctx.fillRect(cw - 14 - sw, ch - 18, sw, 4);
  ctx.textAlign = 'right'; ctx.font = '700 11px system-ui'; ctx.fillText(`${km} km`, cw - 14, ch - 24);

  // Angelplätze
  const hits = [];
  for (const sp of water.spots) {
    const [x, y] = P(...project(geo, sp.lat, sp.lon));
    const sel = sp.id === opts.selected;
    const r = sel ? 17 : 14;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillStyle = sel ? '#ff8a1f' : sp.boat ? '#1a6fd1' : '#1f9d55';
    ctx.beginPath(); ctx.arc(x, y - r - 6, r, Math.PI * 0.8, Math.PI * 2.2); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = sel ? 3 : 2; ctx.stroke();
    ctx.font = `${sel ? 17 : 14}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(sp.boat ? '🚤' : '🎣', x, y - r - 6);
    ctx.textBaseline = 'alphabetic';
    if (sel || opts.names) {
      ctx.font = '800 13px "Avenir Next", system-ui'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(sp.name, x, y + 16); ctx.fillStyle = '#fff'; ctx.fillText(sp.name, x, y + 16);
    }
    hits.push({ id: sp.id, x, y: y - r - 6, r: r + 8 });
  }
  return hits;
}

// Auf welchen Spot wurde getippt?
export function hitSpot(hits, x, y) {
  let best = null;
  let bd = Infinity;
  for (const h of hits) {
    const d = Math.hypot(h.x - x, h.y - y);
    if (d < h.r && d < bd) { bd = d; best = h.id; }
  }
  return best;
}
