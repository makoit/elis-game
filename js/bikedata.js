// Fahrrad-Daten (rein, ohne Three.js): Typen, Marken, Teile und die Berechnung der Werte.
//
// Ein Rad besteht aus  Marke × Typ × Teile × Farben  (= "config").
// resolveBike(config) liefert alle Werte für Physik (physics.js) und Aussehen (bikes.js).
//
// Die Marken sind frei erfunden (keine echten Markennamen/Logos). Wer echte Marken möchte,
// ändert nur die Texte in BRANDS.

// Basiswerte je Typ. Geschwindigkeiten in m/s (×3,6 = km/h).
export const CATEGORIES = {
  trail: {
    id: 'trail', name: 'Trail', long: 'Mountainbike · Trail', emoji: '🚵',
    vmax: 29, accel: 10, brake: 22, steer: 1.0, terrain: 0.8, susp: 0.6, sturdy: 0.7, slopeK: 1.0,
    surface: { asphalt: 0.95, dirt: 1.0 },
    defaults: { tires: 'allround', fork: 'trail', bars: 'riser', wheels: 'standard', gear: 'standard', brakes: 'disc', frameMat: 'alu' },
    look: { frame: 'mtb', wheelR: 0.37, hardtail: false },
  },
  downhill: {
    id: 'downhill', name: 'Downhill', long: 'Mountainbike · Downhill', emoji: '🏔️',
    vmax: 27, accel: 8.5, brake: 24, steer: 0.9, terrain: 1.0, susp: 0.9, sturdy: 0.92, slopeK: 1.25,
    surface: { asphalt: 0.9, dirt: 1.0 },
    defaults: { tires: 'knobby', fork: 'full', bars: 'riser', wheels: 'standard', gear: 'standard', brakes: 'hydro', frameMat: 'alu' },
    look: { frame: 'dh', wheelR: 0.375, hardtail: false },
  },
  road: {
    id: 'road', name: 'Rennrad', long: 'Rennrad', emoji: '🚴',
    vmax: 36, accel: 11.5, brake: 19, steer: 0.82, terrain: 0.25, susp: 0.15, sturdy: 0.3, slopeK: 1.0,
    surface: { asphalt: 1.08, dirt: 0.78 },
    defaults: { tires: 'slick', fork: 'rigid', bars: 'drop', wheels: 'standard', gear: 'standard', brakes: 'rim', frameMat: 'carbon' },
    look: { frame: 'road', wheelR: 0.34, hardtail: true },
  },
  gravel: {
    id: 'gravel', name: 'Gravel', long: 'Gravelbike', emoji: '🛤️',
    vmax: 32, accel: 10.5, brake: 20, steer: 0.95, terrain: 0.6, susp: 0.4, sturdy: 0.55, slopeK: 1.0,
    surface: { asphalt: 1.03, dirt: 0.95 },
    defaults: { tires: 'allround', fork: 'rigid', bars: 'drop', wheels: 'standard', gear: 'standard', brakes: 'disc', frameMat: 'steel' },
    look: { frame: 'road', wheelR: 0.35, hardtail: true },
  },
};

// Marken: kleine Unterschiede im Fahrverhalten + Farben/Schriftzug
export const BRANDS = {
  alpina: {
    id: 'alpina', name: 'Alpina', tagline: 'Robust wie ein Berg', font: '900 italic', frame: 0xd8262b, accent: 0xffffff,
    mod: { sturdy: 0.1, terrain: 0.05, vmax: 0.99 },
  },
  velocita: {
    id: 'velocita', name: 'Velocità', tagline: 'Gebaut für Tempo', font: '800', frame: 0x1c7a43, accent: 0xf2f2f2,
    mod: { vmax: 1.04, steer: -0.04, sturdy: -0.05 },
  },
  nordlicht: {
    id: 'nordlicht', name: 'Nordlicht', tagline: 'Leicht & wendig', font: '700', frame: 0x1fb5c9, accent: 0x12294d,
    mod: { accel: 1.06, steer: 0.06, sturdy: -0.05 },
  },
  kodiak: {
    id: 'kodiak', name: 'Kodiak', tagline: 'Der Bär unter den Rädern', font: '900', frame: 0x2d2d33, accent: 0xff8a1f,
    mod: { sturdy: 0.15, susp: 0.08, vmax: 0.98, accel: 0.97 },
  },
};

// Teile: je Gruppe mehrere Optionen mit Änderungen (m = Faktor, a = Zuschlag)
export const PARTS = {
  tires: {
    label: 'Reifen',
    options: {
      slick: { name: 'Slick', desc: 'Schnell auf Asphalt', mod: { asphalt: 1.08, dirt: 0.78, terrain: -0.12 }, look: { tire: 0.022, tread: false } },
      allround: { name: 'Allround', desc: 'Für alles ein bisschen', mod: { asphalt: 1.0, dirt: 0.97 }, look: { tire: 0.035, tread: 'fine' } },
      knobby: { name: 'Stollen', desc: 'Grip im Gelände', mod: { asphalt: 0.88, dirt: 1.05, terrain: 0.12, steer: 0.03 }, look: { tire: 0.042, tread: 'knobs' } },
    },
  },
  wheels: {
    label: 'Laufräder',
    options: {
      light: { name: 'Leicht', desc: 'Starker Antritt', mod: { accel: 1.1, vmax: 0.98 }, look: { rim: 0.018 } },
      standard: { name: 'Standard', desc: 'Solide', mod: {}, look: { rim: 0.026 } },
      aero: { name: 'Aero', desc: 'Höheres Spitzentempo', mod: { vmax: 1.07, accel: 0.94, steer: -0.03 }, look: { rim: 0.06 } },
    },
  },
  fork: {
    label: 'Federung',
    options: {
      rigid: { name: 'Starr', desc: 'Direkt & schnell', mod: { susp: -0.3, vmax: 1.02, accel: 1.02, terrain: -0.1 }, look: { fork: 'rigid' } },
      trail: { name: 'Trail', desc: 'Guter Kompromiss', mod: {}, look: { fork: 'trail' } },
      full: { name: 'Voll', desc: 'Weiche Landungen', mod: { susp: 0.3, terrain: 0.12, vmax: 0.97 }, look: { fork: 'full' } },
    },
  },
  gear: {
    label: 'Übersetzung',
    options: {
      climb: { name: 'Berg', desc: 'Schneller Antritt', mod: { accel: 1.15, vmax: 0.92 } },
      standard: { name: 'Standard', desc: 'Ausgewogen', mod: {} },
      speed: { name: 'Schnell', desc: 'Hohes Endtempo', mod: { accel: 0.9, vmax: 1.1 } },
    },
  },
  brakes: {
    label: 'Bremsen',
    options: {
      rim: { name: 'Felge', desc: 'Leicht, schwächer', mod: { brake: 0.85, accel: 1.03 }, look: { disc: false } },
      disc: { name: 'Scheibe', desc: 'Zuverlässig', mod: {}, look: { disc: true } },
      hydro: { name: 'Hydraulik', desc: 'Starke Bremswirkung', mod: { brake: 1.18, accel: 0.97 }, look: { disc: true } },
    },
  },
  frameMat: {
    label: 'Rahmen',
    options: {
      steel: { name: 'Stahl', desc: 'Schwer & robust', mod: { accel: 0.95, sturdy: 0.1, susp: 0.03 }, look: { tubes: 1.15 } },
      alu: { name: 'Alu', desc: 'Der Allrounder', mod: {}, look: { tubes: 1.0 } },
      carbon: { name: 'Carbon', desc: 'Leicht & schnell', mod: { accel: 1.05, vmax: 1.02, sturdy: -0.07 }, look: { tubes: 0.9 } },
    },
  },
  bars: {
    label: 'Lenker',
    options: {
      flat: { name: 'Gerade', desc: 'Klassisch', mod: {}, look: { bars: 'flat' } },
      riser: { name: 'Riser', desc: 'Präzise Lenkung', mod: { steer: 0.04 }, look: { bars: 'riser' } },
      drop: { name: 'Rennlenker', desc: 'Windschnittig', mod: { vmax: 1.03, steer: -0.04 }, look: { bars: 'drop' } },
    },
  },
};

export const SKIN_TONES = [0xf6d9c0, 0xe9b996, 0xd29a74, 0xa86f4c, 0x7a4b30, 0x573420];
export const HAIR_COLORS = [0x15100c, 0x4a2f1d, 0x8a5a2b, 0xd9a94a, 0xc2491d, 0x9a9a9e, 0xe8e8ec, 0x2b6cff];
export const HAIR_STYLES = { short: 'Kurz', pony: 'Zopf', long: 'Lang', curly: 'Locken', none: 'Glatze' };
export const KITS = { solid: 'Einfarbig', bands: 'Ringe', stripe: 'Streifen', halves: 'Zweifarbig', fade: 'Verlauf', checks: 'Karo' };
export const HELMETS = { auto: 'Passend', road: 'Rennrad', mtb: 'MTB', full: 'Fullface' };
export const FINISHES = { gloss: 'Glanz', matte: 'Matt', metal: 'Metallic' };
export const PATTERNS = { none: 'Uni', stripes: 'Streifen', flames: 'Flammen', camo: 'Camo', fade: 'Verlauf', dots: 'Punkte' };
export const TIRE_WALLS = { black: 'Schwarz', white: 'Weiß', tan: 'Braun', red: 'Rot' };
export const TIRE_WALL_COLORS = { black: 0x111112, white: 0xe8e8e8, tan: 0x9a7a4a, red: 0xc2281f };

export const PALETTE = [0xe5352b, 0xff8a1f, 0xffd400, 0x2fae4d, 0x1fb5c9, 0x1f6fe5, 0x8e44ad, 0xff4f9a, 0xf2f2f2, 0x2d2d33];

export const DEFAULT_CONFIG = {
  brand: 'alpina', cat: 'trail',
  tires: null, wheels: null, fork: null, gear: null, bars: null, brakes: null, frameMat: null, // null = Standard des Typs
  frame: null, accent: null, jersey: 0xff8a1f, helmet: 0xf2f2f2, // null = Farben der Marke
  shorts: 0x20232b, shoes: 0xf4f4f4, rim: null, // rim: null = automatisch
  skin: 1, hair: 1, hairStyle: 'short', kit: 'bands', helmetType: 'auto', glasses: true,
  finish: 'gloss', pattern: 'none', tireWall: 'black', number: 7,
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function resolveBike(cfg) {
  const cat = CATEGORIES[cfg.cat] || CATEGORIES.trail;
  const brand = BRANDS[cfg.brand] || BRANDS.alpina;
  const parts = {};
  for (const g of Object.keys(PARTS)) {
    const id = cfg[g] && PARTS[g].options[cfg[g]] ? cfg[g] : cat.defaults[g];
    parts[g] = id;
  }

  const def = {
    cat: cat.id, brand: brand.id,
    name: `${brand.name} ${cat.name}`, long: cat.long, emoji: cat.emoji, brandDef: brand, parts,
    vmax: cat.vmax, accel: cat.accel, brake: cat.brake, steer: cat.steer,
    terrain: cat.terrain, susp: cat.susp, sturdy: cat.sturdy, slopeK: cat.slopeK,
    surface: { ...cat.surface },
    colors: {
      frame: cfg.frame ?? brand.frame, accent: cfg.accent ?? brand.accent,
      jersey: cfg.jersey ?? 0xff8a1f, helmet: cfg.helmet ?? 0xf2f2f2,
      shorts: cfg.shorts ?? 0x20232b, shoes: cfg.shoes ?? 0xf4f4f4, rim: cfg.rim ?? null,
    },
    look: { ...cat.look, finish: cfg.finish || 'gloss', pattern: cfg.pattern || 'none', number: cfg.number ?? 0, tireWall: cfg.tireWall || 'black' },
    rider: {
      skin: SKIN_TONES[cfg.skin ?? 1] ?? SKIN_TONES[1], hair: HAIR_COLORS[cfg.hair ?? 1] ?? HAIR_COLORS[1], hairStyle: cfg.hairStyle || 'short',
      kit: cfg.kit || 'bands', glasses: cfg.glasses !== false,
      helmetType: cfg.helmetType && cfg.helmetType !== 'auto' ? cfg.helmetType : cat.id === 'downhill' ? 'full' : cat.look.frame === 'road' ? 'road' : 'mtb',
    },
    brake: cat.brake,
  };

  const apply = (m) => {
    if (!m) return;
    if (m.vmax) def.vmax *= m.vmax;
    if (m.accel) def.accel *= m.accel;
    if (m.brake) def.brake *= m.brake;
    if (m.steer) def.steer += m.steer;
    if (m.terrain) def.terrain += m.terrain;
    if (m.susp) def.susp += m.susp;
    if (m.sturdy) def.sturdy += m.sturdy;
    if (m.asphalt) def.surface.asphalt *= m.asphalt;
    if (m.dirt) def.surface.dirt *= m.dirt;
  };
  apply(brand.mod);
  for (const g of Object.keys(PARTS)) {
    const opt = PARTS[g].options[parts[g]];
    apply(opt.mod);
    Object.assign(def.look, opt.look);
  }
  def.terrain = clamp(def.terrain, 0, 1);
  def.susp = clamp(def.susp, 0, 1);
  def.sturdy = clamp(def.sturdy, 0, 1);
  def.steer = clamp(def.steer, 0.6, 1.2);
  return def;
}

// Balken für die Anzeige (0..1)
export function statBars(def) {
  const top = Math.max(def.vmax * def.surface.asphalt, def.vmax * def.surface.dirt);
  return {
    speed: clamp((top - 22) / 20, 0.05, 1),
    accel: clamp((def.accel - 6) / 8, 0.05, 1),
    steer: clamp((def.steer - 0.6) / 0.5, 0.05, 1),
    brake: clamp((def.brake - 14) / 14, 0.05, 1),
    offroad: clamp(def.terrain * 0.7 + def.susp * 0.3, 0.05, 1),
    stability: clamp(def.sturdy * 0.6 + def.susp * 0.4, 0.05, 1),
  };
}

export function randomConfig(rng) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const cfg = {
    ...DEFAULT_CONFIG,
    brand: pick(Object.keys(BRANDS)),
    cat: pick(Object.keys(CATEGORIES)),
    frame: pick(PALETTE), accent: pick(PALETTE), jersey: pick(PALETTE), helmet: pick(PALETTE), shorts: pick([0x20232b, 0x20232b, 0x1f3a6f, 0x3a3a3f]),
    skin: Math.floor(rng() * SKIN_TONES.length), hair: Math.floor(rng() * HAIR_COLORS.length),
    hairStyle: pick(Object.keys(HAIR_STYLES)), kit: pick(Object.keys(KITS)), glasses: rng() < 0.7,
    finish: pick(Object.keys(FINISHES)), pattern: pick(Object.keys(PATTERNS)), number: 1 + Math.floor(rng() * 98),
  };
  return cfg;
}
