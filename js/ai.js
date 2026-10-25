// Computergegner (und Autopilot für die Referenzzeit). Reine Logik, kein Three.js.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// speed: Anteil der Leistung des Rades, mistakes: Fehler pro Sekunde, look: Vorausschau auf Felsen (0..1)
export const LEVELS = [
  { id: 'easy', name: 'Leicht', emoji: '🐢', speed: 0.8, mistakes: 0.22, look: 0.5, pads: 0.3, rubber: true },
  { id: 'medium', name: 'Mittel', emoji: '🚲', speed: 0.9, mistakes: 0.12, look: 0.75, pads: 0.6, rubber: true },
  { id: 'hard', name: 'Schwer', emoji: '🔥', speed: 0.97, mistakes: 0.05, look: 0.95, pads: 0.9, rubber: false },
  { id: 'pro', name: 'Profi', emoji: '🏆', speed: 1.03, mistakes: 0.015, look: 1.0, pads: 1.0, rubber: false },
];
export const PERFECT = { id: 'perfect', name: 'Autopilot', speed: 1, mistakes: 0, look: 1, pads: 1, rubber: false };

// Lenkbefehl, damit das Rad die Seitenlage `targetLat` ansteuert (inkl. Ausgleich der Fliehkraft)
export function steerToward(sim, targetLat) {
  const maxLatV = 11 * sim.b.steer * (0.35 + 0.65 * Math.min(1, sim.v / 10));
  const wanted = clamp((targetLat - sim.lat) * 1.6, -9, 9) + sim.drift;
  return clamp(wanted / (maxLatV || 1), -1, 1);
}

export class AIDriver {
  constructor(level, rng, track, lane = 0) {
    this.level = level;
    this.rng = rng;
    this.track = track;
    this.lane = lane; // bevorzugte Seitenlage
    this.err = 0; // aktueller Lenkfehler
    this.errTime = 0;
    this.sim = null;
  }

  control(sim, dt, playerS = null) {
    const { level, track, rng } = this;
    const hw = track.halfW;
    let target = clamp(this.lane, -hw + 1.5, hw - 1.5);

    // Felsen ausweichen
    const look = (14 + sim.v * 0.9) * level.look;
    for (const r of track.rocks) {
      if (sim.rockHit.has(r) || r.s < sim.s - 1 || r.s > sim.s + look) continue;
      if (Math.abs(r.lat - target) < 2.0) {
        const room = r.lat > 0 ? r.lat + hw : hw - r.lat; // Platz links bzw. rechts
        target = r.lat + (r.lat > 0 ? -1 : 1) * 2.4 * (room > 0 ? 1 : 1);
        target = clamp(target, -hw + 1, hw - 1);
        break;
      }
    }
    // Boost-Felder mitnehmen
    if (rng() < level.pads) {
      for (const p of track.pads) {
        if (sim.padUsed.has(p) || p.s < sim.s + 4 || p.s > sim.s + 45) continue;
        if (Math.abs(p.lat - target) < 4.5 && !track.rocks.some((r) => !sim.rockHit.has(r) && Math.abs(r.s - p.s) < 6 && Math.abs(r.lat - p.lat) < 2.2)) target = p.lat;
        break;
      }
    }

    // gelegentliche Fehler
    this.errTime -= dt;
    if (this.errTime <= 0) {
      this.err = 0;
      if (rng() < level.mistakes * 0.5) { this.err = (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.6); this.errTime = 0.3 + rng() * 0.4; }
      else this.errTime = 0.5;
    }

    let steer = steerToward(sim, target) + this.err;
    steer = clamp(steer, -1, 1);

    // vor engen Kurven bremsen, wenn die Fliehkraft nicht mehr auszugleichen ist
    const aheadK = Math.abs(track.curvAt(sim.s + sim.v * 0.6));
    const need = aheadK * sim.v * sim.v * 0.13;
    const have = 11 * sim.b.steer * 0.85;
    const brake = need > have && sim.v > 15 && !sim.air;

    // Gummiband für leichte Stufen
    sim.speedFactor = level.speed;
    if (level.rubber && playerS != null) {
      const gap = sim.s - playerS;
      if (gap > 60) sim.speedFactor *= 0.93;
      else if (gap < -90) sim.speedFactor *= 1.06;
    }
    return { gas: true, brake, steer };
  }
}
