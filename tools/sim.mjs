// Autopilot-Simulation zum Kalibrieren der Strecken: node tools/sim.mjs
import { MAPS } from '../js/maps.js';
import { BIKES } from '../js/bikedata.js';
import { buildTrack } from '../js/trackdata.js';
import { BikeSim } from '../js/physics.js';

for (const map of MAPS) {
  for (const bike of BIKES) {
    const track = buildTrack(map);
    const sim = new BikeSim(track, bike);
    let time = 0, jumps = 0, rocks = 0, maxAir = 0, pads = 0, vmax = 0, offroad = 0;
    while (!sim.finished && time < 300) {
      // Ziel: Mitte, Felsen ausweichen
      let target = 0;
      for (const r of track.rocks) {
        if (!r.hit && r.s > sim.s && r.s < sim.s + 22 && Math.abs(r.lat - sim.lat) < 1.5) target = r.lat > sim.lat ? -1 : 1;
      }
      const steer = target !== 0 ? target : Math.max(-1, Math.min(1, -sim.lat * 0.5));
      for (const e of sim.step(1 / 60, { gas: true, brake: false, steer })) {
        if (e.type === 'jump') jumps++;
        if (e.type === 'rock') rocks++;
        if (e.type === 'pad') pads++;
        if (e.type === 'land') maxAir = Math.max(maxAir, e.airTime);
      }
      if (sim.offroad) offroad++;
      vmax = Math.max(vmax, sim.v);
      time += 1 / 60;
    }
    console.log(`${map.id.padEnd(7)} ${bike.id.padEnd(9)} ${time.toFixed(1).padStart(6)}s  jumps ${jumps} rocks ${rocks} pads ${pads} maxAir ${maxAir.toFixed(2)}s vmax ${(vmax * 3.6).toFixed(0)}km/h`);
  }
}
