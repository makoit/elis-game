// Gibt Gewässer, Plätze und Uferlinien als JSON aus (Eingabe für tools/terrain.py).
import { WATERS } from '../js/spots.js';
import { GEO } from '../js/geo.js';

const waters = WATERS.map((w) => ({
  id: w.id, kind: w.kind,
  spots: w.spots.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, boat: !!s.boat, harbour: !!s.harbour, depth: s.depth })),
}));
console.log(JSON.stringify({ waters, geo: GEO }));
