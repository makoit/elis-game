// Kleidungsstücke, Farben und Kunden. Umrisse als SVG-Pfade im Feld 400×400; need = Sterne zum Freischalten.
// center: Startpunkt für Spirale/Kreise, box: Rahmen des Umrisses (0..1).

export const GARMENTS = [
  {
    id: 'tshirt', name: 'T-Shirt', acc: 'ein T-Shirt', emoji: '👕', need: 0, center: [0.5, 0.5], box: [0.01, 0.1, 0.99, 0.95],
    path: 'M140 42 Q200 78 260 42 L330 66 Q352 74 366 96 L396 156 L326 186 L306 154 L308 368 Q200 380 92 368 L94 154 L74 186 L4 156 L34 96 Q48 74 70 66 Z',
    details: ['M140 42 Q200 100 260 42', 'M306 154 Q298 110 312 70', 'M94 154 Q102 110 88 70', '~M98 352 Q200 364 302 352'],
  },
  {
    id: 'kleid', name: 'Kleid', acc: 'ein Kleid', emoji: '👗', need: 0, center: [0.5, 0.58], box: [0.09, 0.06, 0.91, 0.98],
    path: 'M152 28 Q160 22 170 28 Q200 74 230 28 Q240 22 248 28 L262 118 Q246 148 262 182 L364 362 Q200 392 36 362 L138 182 Q154 148 138 118 Z',
    details: ['M170 28 Q200 92 230 28', 'M140 180 Q200 194 260 180', '~M52 350 Q200 378 348 350'],
  },
  {
    id: 'socke', name: 'Socke', acc: 'eine Socke', emoji: '🧦', need: 0, center: [0.48, 0.42], box: [0.36, 0.04, 0.96, 0.98],
    path: 'M150 18 L270 18 L270 238 Q272 276 304 290 L346 306 Q388 324 380 360 Q372 394 328 388 L188 366 Q140 356 146 306 Z',
    details: ['M150 70 L270 70', 'M170 24 V64 M190 24 V64 M210 24 V64 M230 24 V64 M250 24 V64', 'M146 314 Q196 306 206 368', 'M334 300 Q308 344 332 388'],
  },
  {
    id: 'pulli', name: 'Pulli', acc: 'einen Pulli', emoji: '🧥', need: 3, center: [0.5, 0.5], box: [0.01, 0.01, 0.99, 0.96],
    path: 'M128 60 Q128 6 200 6 Q272 6 272 60 L326 76 Q356 88 366 130 L394 320 Q390 336 372 338 L346 340 Q334 338 332 324 L314 176 L312 372 Q200 384 88 372 L86 176 L68 324 Q66 338 54 340 L28 338 Q10 336 6 320 L34 130 Q44 88 74 76 Z',
    details: ['M150 66 Q150 26 200 26 Q250 26 250 66 Q200 96 150 66 Z', 'M140 268 L260 268 L276 340 L124 340 Z', 'M186 92 L182 140 M214 92 L218 140', 'M332 306 L386 300', 'M68 306 L14 300', '~M90 352 Q200 364 310 352'],
  },
  {
    id: 'tasche', name: 'Tasche', acc: 'eine Tasche', emoji: '👜', need: 7, center: [0.5, 0.62], box: [0.17, 0.07, 0.83, 0.96],
    path: 'M84 138 L316 138 L332 384 L68 384 Z M124 138 L124 70 Q124 30 164 30 L236 30 Q276 30 276 70 L276 138 L252 138 L252 72 Q252 54 234 54 L166 54 Q148 54 148 72 L148 138 Z',
    details: ['~M86 160 L314 160', '~M72 366 L328 366'],
  },
  {
    id: 'kissen', name: 'Kissen', acc: 'ein Kissen', emoji: '🛋️', need: 12, center: [0.5, 0.5], box: [0.06, 0.09, 0.94, 0.91],
    path: 'M48 64 Q200 34 352 64 Q378 70 372 96 Q356 200 372 304 Q378 330 352 336 Q200 366 48 336 Q22 330 28 304 Q44 200 28 96 Q22 70 48 64 Z',
    details: ['M48 64 L84 98 M352 64 L316 98 M48 336 L84 302 M352 336 L316 302', 'M190 200 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0'],
  },
];
export const garmentById = (id) => GARMENTS.find((g) => g.id === id);

export const COLORS = [
  { id: 'pink', name: 'Pink', hex: '#ff3fa4' },
  { id: 'rot', name: 'Rot', hex: '#ff3b3b' },
  { id: 'orange', name: 'Orange', hex: '#ff8a1f' },
  { id: 'gelb', name: 'Gelb', hex: '#ffd21f' },
  { id: 'gruen', name: 'Grün', hex: '#3ed16b' },
  { id: 'tuerkis', name: 'Türkis', hex: '#14c8d4' },
  { id: 'blau', name: 'Blau', hex: '#2f6bff' },
  { id: 'lila', name: 'Lila', hex: '#9b4dff' },
  { id: 'mint', name: 'Mint', hex: '#6ee8bd', need: 1 },
  { id: 'rosa', name: 'Rosa', hex: '#ffaad4', need: 4 },
  { id: 'regenbogen', name: 'Regenbogen', rainbow: true, need: 6 },
];
export const RAINBOW = ['#ff3fa4', '#ff8a1f', '#ffd21f', '#3ed16b', '#2f6bff', '#9b4dff'];

export const CUSTOMERS = [
  { emoji: '🐱', name: 'Mimi' }, { emoji: '🐶', name: 'Bello' }, { emoji: '🦄', name: 'Luna' }, { emoji: '🐰', name: 'Hoppel' },
  { emoji: '🐻', name: 'Bruno' }, { emoji: '🦊', name: 'Fuchsi' }, { emoji: '🐼', name: 'Pandi' }, { emoji: '🐸', name: 'Quaki' },
  { emoji: '🐷', name: 'Rosi' }, { emoji: '🐨', name: 'Koko' },
];

// ---------- Zeichnen ----------
const paths = new Map();
function shapes(g) {
  if (!paths.has(g.id)) {
    paths.set(g.id, {
      body: new Path2D(g.path),
      details: g.details.map((d) => ({ dash: d[0] === '~', p: new Path2D(d.replace('~', '')) })),
    });
  }
  return paths.get(g.id);
}

// Kleidungsstück mit Stoff-Textur `tex` in das Quadrat (x, y, size). extra(ctx): zeichnet zusätzlich im Umriss (400er-Feld).
export function drawGarment(ctx, g, tex, x, y, size, { alpha = 1, extra = null, shadow = true } = {}) {
  const p = shapes(g), k = size / 400;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.globalAlpha *= alpha;
  if (shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(70, 30, 100, 0.28)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#fff';
    ctx.fill(p.body);
    ctx.restore();
  }
  ctx.save();
  ctx.clip(p.body);
  ctx.drawImage(tex, 0, 0, 400, 400);
  const gr = ctx.createLinearGradient(0, 0, 400, 400);
  gr.addColorStop(0, 'rgba(255,255,255,0.18)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0)');
  gr.addColorStop(1, 'rgba(40,20,60,0.16)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 400, 400);
  if (extra) extra(ctx);
  ctx.restore();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(70, 45, 95, 0.38)';
  ctx.lineWidth = 2.5;
  ctx.stroke(p.body);
  ctx.strokeStyle = 'rgba(70, 45, 95, 0.24)';
  ctx.lineWidth = 2;
  for (const d of p.details) {
    ctx.setLineDash(d.dash ? [7, 6] : []);
    ctx.stroke(d.p);
  }
  ctx.restore();
}
