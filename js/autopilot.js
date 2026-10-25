// Simuliert eine saubere Fahrt (immer Gas, Felsen ausweichen). Die Zeit dient als Referenz
// für die Sterne – so sind sie für jedes Rad fair.
import { buildTrack } from './trackdata.js';
import { BikeSim } from './physics.js';

export function autopilotTime(map, bike) {
  const track = buildTrack(map);
  const sim = new BikeSim(track, bike);
  let time = 0;
  while (!sim.finished && time < 300) {
    let dodge = 0;
    for (const r of track.rocks) {
      if (!r.hit && r.s > sim.s && r.s < sim.s + 22 && Math.abs(r.lat - sim.lat) < 1.5) dodge = r.lat > sim.lat ? -1 : 1;
    }
    const steer = dodge || Math.max(-1, Math.min(1, -sim.lat * 0.5));
    sim.step(1 / 60, { gas: true, brake: false, steer });
    time += 1 / 60;
  }
  return time;
}

export function starTimes(map, bike) {
  const t = autopilotTime(map, bike);
  return { gold: t * 1.12, silver: t * 1.35, ref: t };
}
