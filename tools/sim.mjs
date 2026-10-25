// Autopilot-Simulation zum Kalibrieren: node tools/sim.mjs
import { MAPS } from '../js/maps.js';
import { CATEGORIES, BRANDS, DEFAULT_CONFIG, resolveBike } from '../js/bikedata.js';
import { buildTrack, mulberry32 } from '../js/trackdata.js';
import { BikeSim } from '../js/physics.js';
import { AIDriver, PERFECT, LEVELS } from '../js/ai.js';

const level = LEVELS.find((l) => l.id === process.argv[2]) || PERFECT;
for (const map of MAPS) {
  for (const cat of Object.keys(CATEGORIES)) {
    const bike = resolveBike({ ...DEFAULT_CONFIG, cat, brand: 'alpina' });
    const track = buildTrack(map);
    const sim = new BikeSim(track, bike);
    const drv = new AIDriver(level, mulberry32(5), track, 0);
    let time = 0, jumps = 0, rocks = 0, pads = 0, maxAir = 0, vmax = 0, off = 0, hard = 0, vsum = 0;
    while (!sim.finished && time < 400) {
      for (const e of sim.step(1 / 60, drv.control(sim, 1 / 60))) {
        if (e.type === 'jump') jumps++;
        if (e.type === 'rock') rocks++;
        if (e.type === 'pad') pads++;
        if (e.type === 'land') { maxAir = Math.max(maxAir, e.airTime); if (e.impact > 12) hard++; }
      }
      if (sim.offroad) off++;
      vmax = Math.max(vmax, sim.v); vsum += sim.v;
      time += 1 / 60;
    }
    console.log(`${map.id.padEnd(7)} ${cat.padEnd(9)} ${time.toFixed(1).padStart(6)}s avg ${(vsum / (time * 60) * 3.6).toFixed(0)}km/h max ${(vmax * 3.6).toFixed(0)} jumps ${jumps} rocks ${rocks} pads ${pads} air ${maxAir.toFixed(2)}s hardLand ${hard} offroad ${(off / 60).toFixed(1)}s`);
  }
}
