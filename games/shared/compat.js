// Nachrüstungen für ältere Browser (iPad mit iPadOS 15: Safari 15). Muss als Erstes importiert werden.

// Canvas roundRect (erst ab Safari 16): abgerundetes Rechteck als Pfad, Radius als Zahl oder [r]
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii = 0) {
    let r = Array.isArray(radii) ? radii[0] ?? 0 : radii;
    if (typeof r === 'object') r = r.x ?? 0; // DOMPointInit
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}
