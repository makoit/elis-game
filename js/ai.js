// Computergegner (und Autopilot für die Referenzzeit). Reine Logik, kein Three.js.

import { LAT_SPEED, cornerGrip } from './physics.js';

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
  const maxLatV = LAT_SPEED * sim.b.steer * (0.35 + 0.65 * Math.min(1, sim.v / 6));
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

    // Hindernissen ausweichen (Position innerhalb der Runde)
    const ws = track.wrap(sim.s);
    const look = (14 + sim.v * 0.9) * level.look;
    for (const r of track.rocks) {
      if (sim.rockHit.has(r) || r.s < ws - 1 || r.s > ws + look) continue;
      if (r.kind === 'cone' && level.look < 0.9) continue; // Kegel werfen nur um
      const clear = r.hw + 1.1;
      if (Math.abs(r.lat - target) < clear) {
        const left = r.lat - clear, right = r.lat + clear; // links / rechts vorbei
        const okL = left > -hw + 0.8, okR = right < hw - 0.8;
        target = okL && okR ? (Math.abs(left - target) < Math.abs(right - target) ? left : right) : okL ? left : right;
        target = clamp(target, -hw + 0.8, hw - 0.8);
        break;
      }
    }
    // Boost-Felder mitnehmen
    if (rng() < level.pads) {
      for (const p of track.pads) {
        if (sim.padUsed.has(p) || p.s < ws + 4 || p.s > ws + 45) continue;
        if (Math.abs(p.lat - target) < 4.5 && !track.rocks.some((r) => !sim.rockHit.has(r) && Math.abs(r.s - p.s) < 6 && Math.abs(r.lat - p.lat) < r.hw + 1.3)) target = p.lat;
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
    let need = 0;
    for (const ahead of [0.4, 0.9, 1.5]) need = Math.max(need, Math.abs(track.curvAt(sim.s + sim.v * ahead)) * sim.v * sim.v);
    const brake = need > cornerGrip(sim) * 1.05 && sim.v > 6 && !sim.air;

    // Gummiband für leichte Stufen
    sim.speedFactor = level.speed;
    if (level.rubber && playerS != null) {
      const gap = sim.s - playerS; // Gesamtstrecke (mit Runden)
      if (gap > 60) sim.speedFactor *= 0.93;
      else if (gap < -90) sim.speedFactor *= 1.06;
    }
    // ab und zu ein Wheelie auf geraden, freien Stücken (nicht beim Autopiloten für die Sternzeiten)
    let wheelie = false;
    if (level !== PERFECT) {
      this.wTime = (this.wTime || 0) - dt;
      if (this.wTime <= 0 && rng() < dt * 0.05 && Math.abs(track.curvAt(sim.s + 10)) < 0.01 && !sim.air) this.wTime = 1 + rng() * 1.5;
      wheelie = this.wTime > 0 && !brake;
    }
    return { gas: true, brake, steer, wheelie };
  }
}
