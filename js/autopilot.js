// Simuliert eine saubere Fahrt. Die Zeit dient als Referenz für die Sterne – so sind sie für jedes Rad fair.
import { buildTrack } from './trackdata.js';
import { BikeSim } from './physics.js';
import { AIDriver, PERFECT } from './ai.js';
import { mulberry32 } from './trackdata.js';

export function autopilotTime(map, bike, laps = 1) {
  const track = buildTrack(map, laps);
  const sim = new BikeSim(track, bike);
  const driver = new AIDriver(PERFECT, mulberry32(1), track, 0);
  let time = 0;
  while (!sim.finished && time < 3000) {
    sim.step(1 / 60, driver.control(sim, 1 / 60));
    time += 1 / 60;
  }
  return time;
}

export function starTimes(map, bike, laps = 1) {
  const t = autopilotTime(map, bike, laps);
  return { gold: t * 1.18, silver: t * 1.5, ref: t };
}
