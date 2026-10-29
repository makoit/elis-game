// Bildschärfe für alle Spiele: Die 3D-Grafik läuft mit der Pixeldichte des Bildschirms (bis maxRatio und höchstens
// `budget` Pixel), statt fest mit 1× – das war auf Handy- und Tablet-Displays (2×/3×) sehr unscharf.
// Ruckelt es, wird die Auflösung schrittweise gesenkt; hat das Gerät wieder Luft, geht sie langsam hoch.
export function createResolution(renderer, onChange = () => {}) {
  let cap = 1, ratio = 1, acc = 0, n = 0, calm = 0;
  const floor = () => Math.min(1, devicePixelRatio || 1);
  function apply() {
    renderer.setPixelRatio(ratio);
    renderer.setSize(innerWidth, innerHeight);
    onChange(ratio);
  }
  return {
    get ratio() { return ratio; },
    // Obergrenze setzen (Qualitätsstufe, Größenänderung) und mit voller Schärfe neu anfangen
    set(maxRatio, budget) {
      const dpr = devicePixelRatio || 1;
      const byBudget = Math.sqrt(budget / Math.max(1, innerWidth * innerHeight));
      cap = Math.max(floor(), Math.min(dpr, maxRatio, byBudget));
      ratio = cap;
      acc = n = calm = 0;
      apply();
    },
    // jedes Bild aufrufen (dt in Sekunden)
    update(dt) {
      if (!(dt > 0) || dt > 0.25) return; // Ladepausen, Tab im Hintergrund
      acc += dt; n++;
      if (acc < 2) return;
      const ms = (acc / n) * 1000;
      acc = n = 0;
      if (ms > 24 && ratio > floor() + 0.01) { // unter ~40 Bildern/s: schärfe opfern
        ratio = Math.max(floor(), ratio * 0.8);
        calm = 0;
        apply();
      } else if (ms < 17.5 && ratio < cap - 0.01) { // 6 s lang flüssig: wieder etwas schärfer
        if (++calm >= 3) { ratio = Math.min(cap, ratio * 1.15); calm = 0; apply(); }
      } else calm = 0;
    },
  };
}

// Pixel-Obergrenze je Qualitätsstufe
export const RES = {
  high: { max: 2, budget: 8.3e6 },
  mid: { max: 2, budget: 3.2e6 },
  low: { max: 1.5, budget: 1.6e6 },
};
