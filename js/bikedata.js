
// Fahrräder: Werte für die Physik (physics.js) + Aussehen (createBike).
//  vmax: Höchstgeschwindigkeit durch Treten (m/s), accel: Beschleunigung, steer: Lenkung,
//  terrain: 0..1 wie gut es abseits der Strecke fährt, susp: Federung (weiche Landungen),
//  sturdy: Robustheit bei Felsen, slopeK: wie stark Gefälle beschleunigt,
//  surface: Faktor je Untergrund.

export const BIKES = [
  {
    id: 'trail', name: 'Trailfuchs', type: 'Mountainbike · Trail', emoji: '🚵',
    color: 0x2fae4d, jersey: 0xff8a1f, helmet: 0xffffff,
    vmax: 16.5, accel: 6.2, brake: 14, steer: 1.0, terrain: 0.8, susp: 0.7, sturdy: 0.7, slopeK: 1.0,
    surface: { asphalt: 0.95, dirt: 1.0 },
    ratings: { speed: 3, accel: 3, steer: 4, offroad: 4 },
    look: { wheelR: 0.36, tire: 0.055, road: false, fork: 0.032, shock: true },
  },
  {
    id: 'downhill', name: 'Bergbezwinger', type: 'Mountainbike · Downhill', emoji: '🏔️',
    color: 0xe5352b, jersey: 0x222222, helmet: 0xffd400,
    vmax: 15, accel: 5.2, brake: 15, steer: 0.88, terrain: 1.0, susp: 1.0, sturdy: 0.95, slopeK: 1.2,
    surface: { asphalt: 0.93, dirt: 1.0 },
    ratings: { speed: 2, accel: 2, steer: 3, offroad: 5 },
    look: { wheelR: 0.37, tire: 0.07, road: false, fork: 0.042, shock: true },
  },
  {
    id: 'road', name: 'Blitzpfeil', type: 'Rennrad', emoji: '🚴',
    color: 0x1f6fe5, jersey: 0xffe14a, helmet: 0xff3b6b,
    vmax: 20, accel: 7.2, brake: 12, steer: 0.82, terrain: 0.25, susp: 0.15, sturdy: 0.3, slopeK: 1.0,
    surface: { asphalt: 1.1, dirt: 0.78 },
    ratings: { speed: 5, accel: 4, steer: 3, offroad: 1 },
    look: { wheelR: 0.34, tire: 0.022, road: true, fork: 0.022, shock: false },
  },
  {
    id: 'gravel', name: 'Allrounder', type: 'Gravelbike', emoji: '🛤️',
    color: 0x8e44ad, jersey: 0x2ec4b6, helmet: 0x222222,
    vmax: 17.5, accel: 6.6, brake: 13, steer: 0.95, terrain: 0.6, susp: 0.4, sturdy: 0.55, slopeK: 1.0,
    surface: { asphalt: 1.03, dirt: 0.95 },
    ratings: { speed: 4, accel: 3, steer: 4, offroad: 3 },
    look: { wheelR: 0.35, tire: 0.035, road: true, fork: 0.026, shock: false },
  },
];

export const BIKE_COLORS = [0xe5352b, 0xff8a1f, 0xffd400, 0x2fae4d, 0x1f6fe5, 0x8e44ad, 0xff4f9a, 0x222222];

