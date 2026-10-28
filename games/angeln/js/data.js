// Spieldaten (rein, ohne Three.js): Fische, Ruten, Köder, Angler-Look, Biss- und Gewichtsberechnung.

// ---- Fische ----
// w: [min, typisch, Rekord] in kg. lenK: Länge (cm) = lenK * kg^(1/3). depth: wo der Fisch steht (0 oben, 1 Mitte, 2 Grund).
// baits: Lieblingsköder (0..1). time: Beißlaune nach Tageszeit [Morgen, Mittag, Abend, Nacht].
// power: Kraft im Drill, jumps: springt aus dem Wasser, min: Schonmaß in cm (darunter zurücksetzen), protected: immer zurücksetzen.
// look: Farben/Form fürs 3D-Modell.
export const FISH = {
  lachs: {
    name: 'Lachs', latin: 'Salmo salar', w: [2, 6, 30], lenK: 45, depth: [1], power: 1.5, jumps: true, min: 60, price: 14,
    baits: { fliege: 0.9, spinner: 0.8, wobbler: 0.7, blinker: 0.7 }, time: [1.4, 0.6, 1.3, 0.5],
    info: 'Der König der Flüsse: wandert aus dem Meer zum Laichen flussaufwärts und springt dabei über Wasserfälle.',
    look: { body: 0xb9c4cc, back: 0x3d5566, belly: 0xf2f4f5, spots: 0x1d2630, fin: 0x55687a, shape: 'salmon' },
  },
  barsch: {
    name: 'Barsch', latin: 'Perca fluviatilis', w: [0.1, 0.4, 3], lenK: 42, depth: [1, 2], power: 0.9, price: 9,
    baits: { wurm: 0.9, made: 0.5, spinner: 0.9, gummi: 0.8, wobbler: 0.5, koederfisch: 0.4, garnele: 0.5, popper: 0.3 }, time: [1.3, 1.0, 1.3, 0.3],
    info: 'Gestreifter Räuber mit stacheliger Rückenflosse – jagt oft in Gruppen kleine Fische.',
    look: { body: 0x9fae4a, back: 0x4f5d22, belly: 0xf0e7c4, bars: 0x2e3612, fin: 0xe2622b, shape: 'perch' },
  },
  hecht: {
    name: 'Hecht', latin: 'Esox lucius', w: [1, 4, 25], lenK: 55, depth: [0, 1], power: 1.3, jumps: true, min: 50, price: 8,
    baits: { gummi: 0.9, wobbler: 0.9, koederfisch: 1, spinner: 0.6, blinker: 0.8, popper: 0.6 }, time: [1.3, 0.8, 1.2, 0.3],
    info: 'Der „Wolf der Gewässer“: lauert gut getarnt im Schilf und schießt blitzschnell auf seine Beute.',
    look: { body: 0x6f8a3e, back: 0x34461d, belly: 0xece8c8, spots: 0xd8d49a, fin: 0x9a6a3a, shape: 'pike' },
  },
  zander: {
    name: 'Zander', latin: 'Sander lucioperca', w: [0.5, 2.5, 15], lenK: 48, depth: [2], power: 1.1, min: 50, price: 16,
    baits: { gummi: 1, koederfisch: 0.9, wobbler: 0.4, wurm: 0.2 }, time: [1.0, 0.4, 1.5, 1.8],
    info: 'Hat große Glasaugen und sieht im Dunkeln super – beißt am liebsten in der Dämmerung und nachts.',
    look: { body: 0xa8ab9a, back: 0x535a4c, belly: 0xf3f2ea, bars: 0x3c4236, fin: 0x8e8f80, shape: 'perch', eye: 0xd9e4e0 },
  },
  karpfen: {
    name: 'Karpfen', latin: 'Cyprinus carpio', w: [2, 7, 40], lenK: 37, depth: [2], power: 1.25, min: 35, price: 5,
    baits: { boilie: 1, mais: 0.9, pellet: 0.7, teig: 0.6, brot: 0.5, wurm: 0.4 }, time: [1.4, 0.7, 1.2, 1.0],
    info: 'Kräftiger Friedfisch mit Barteln am Maul. Gründelt am Boden nach Futter und kämpft sehr ausdauernd.',
    look: { body: 0xb08a3c, back: 0x5a4518, belly: 0xf0d79a, scales: 0x7a5a20, fin: 0x8a4a2a, shape: 'carp' },
  },
  scholle: {
    name: 'Scholle', latin: 'Pleuronectes platessa', w: [0.2, 0.6, 3.5], lenK: 44, depth: [2], power: 0.7, min: 25, price: 10,
    baits: { wattwurm: 1, wurm: 0.5, muschel: 0.7, garnele: 0.4 }, time: [1.1, 1.0, 1.1, 0.8],
    info: 'Plattfisch mit orangen Punkten. Beide Augen sitzen auf einer Seite – sie liegt flach auf dem Meeresgrund.',
    look: { body: 0x9a8262, back: 0x7f6848, belly: 0xf3efe6, spots: 0xe0661c, fin: 0x8a7458, shape: 'flat' },
  },
  forelle: {
    name: 'Forelle', latin: 'Salmo trutta', w: [0.3, 1, 15], lenK: 43, depth: [0, 1], power: 1.05, jumps: true, min: 30, price: 12,
    baits: { spinner: 0.8, teig: 0.8, wurm: 0.7, made: 0.5, fliege: 0.9, nymphe: 0.8, blinker: 0.6, kaefer: 0.6, garnele: 0.5, pilker: 0.4 }, time: [1.5, 0.7, 1.3, 0.4],
    info: 'Liebt kühles, sauberes Wasser. Als See- oder Meerforelle wird sie richtig groß und silbern.',
    look: { body: 0xb7a36e, back: 0x5a5a3a, belly: 0xf5f0de, spots: 0xc0392b, fin: 0x8a7a4a, shape: 'salmon' },
  },
  aal: {
    name: 'Aal', latin: 'Anguilla anguilla', w: [0.2, 0.8, 5], lenK: 85, depth: [2], power: 0.95, min: 50, price: 18,
    baits: { wurm: 0.9, koederfisch: 0.6, made: 0.3, garnele: 0.5 }, time: [0.4, 0.2, 1.2, 2.2],
    info: 'Schlangenförmig und nachtaktiv. Wandert zum Laichen tausende Kilometer bis in die Sargassosee!',
    look: { body: 0x4e5530, back: 0x23281a, belly: 0xd9d3a8, fin: 0x3a3f22, shape: 'eel' },
  },
  wels: {
    name: 'Wels', latin: 'Silurus glanis', w: [3, 20, 140], lenK: 52, depth: [2], power: 1.6, price: 3,
    baits: { koederfisch: 0.8, pellet: 0.9, wurm: 0.5, gummi: 0.5, tintenfisch: 0.7 }, time: [0.8, 0.4, 1.3, 2.0],
    info: 'Europas größter Süßwasserfisch – kann über 2,5 m lang werden! Ertastet Beute mit seinen langen Barteln.',
    look: { body: 0x4a4a3e, back: 0x24251e, belly: 0xc9c6b0, spots: 0x34352a, fin: 0x30302a, shape: 'catfish' },
  },
  saibling: {
    name: 'Seesaibling', latin: 'Salvelinus umbla', w: [0.2, 0.5, 4], lenK: 46, depth: [2], power: 0.95, min: 25, price: 20,
    baits: { wurm: 0.7, made: 0.6, spinner: 0.6, blinker: 0.7, nymphe: 0.4 }, time: [1.3, 0.8, 1.2, 0.4],
    info: 'Lebt in tiefen, kalten Bergseen. Im Herbst bekommt er einen leuchtend orangeroten Bauch.',
    look: { body: 0x7c8a8a, back: 0x3f4d55, belly: 0xff7a3a, spots: 0xf0e2c0, fin: 0xff6a2a, shape: 'salmon', finEdge: 0xffffff },
  },
  aesche: {
    name: 'Äsche', latin: 'Thymallus thymallus', w: [0.2, 0.6, 3], lenK: 47, depth: [0, 1], power: 0.9, min: 35, price: 15,
    baits: { nymphe: 0.9, fliege: 0.8, made: 0.7, kaefer: 0.5 }, time: [1.2, 1.1, 1.3, 0.2],
    info: 'Die „Fahnenträgerin“: hat eine riesige, bunt schillernde Rückenflosse und riecht angeblich nach Thymian.',
    look: { body: 0x9aa3a8, back: 0x4a545c, belly: 0xeeeef0, spots: 0x2a2e33, fin: 0x8a4a7a, shape: 'grayling' },
  },
  doebel: {
    name: 'Döbel', latin: 'Squalius cephalus', w: [0.2, 1, 6], lenK: 42, depth: [0, 1], power: 0.9, price: 4,
    baits: { brot: 0.8, made: 0.7, fliege: 0.6, spinner: 0.5, mais: 0.4, wurm: 0.5, kaefer: 0.9 }, time: [1.2, 1.1, 1.2, 0.5],
    info: 'Frisst fast alles – von Kirschen bis zu kleinen Fischen. Sehr scheu: wer laut ist, fängt keinen Döbel!',
    look: { body: 0xc2c4b8, back: 0x4d5240, belly: 0xf5f3ea, scales: 0x6a6d5a, fin: 0xd9643a, shape: 'carp', slim: true },
  },
  nase: {
    name: 'Nase', latin: 'Chondrostoma nasus', w: [0.3, 0.9, 2.5], lenK: 47, depth: [2], power: 0.85, min: 30, price: 11,
    baits: { made: 0.8, teig: 0.6, brot: 0.4, wurm: 0.4 }, time: [1.1, 1.2, 1.1, 0.3],
    info: 'Raspelt mit ihrem harten Unterlippen-Maul Algen von den Steinen. Lebt in Schwärmen in schnellen Flüssen.',
    look: { body: 0xb4b9b6, back: 0x4a5250, belly: 0xf2f0ea, fin: 0xe07040, shape: 'carp', slim: true, nose: true },
  },
  stoer: {
    name: 'Stör', latin: 'Acipenser', w: [5, 20, 100], lenK: 52, depth: [2], power: 1.55, protected: true, price: 0,
    baits: { pellet: 0.9, wurm: 0.6, koederfisch: 0.4 }, time: [1.0, 0.6, 1.2, 1.5],
    info: 'Ein Urzeitfisch, den es schon seit den Dinosauriern gibt – mit Knochenplatten statt Schuppen. Streng geschützt!',
    look: { body: 0x6a6f6a, back: 0x3a3e3a, belly: 0xe6e2d6, plates: 0xd8d3c2, fin: 0x4a4e4a, shape: 'sturgeon' },
  },
  makrele: {
    name: 'Makrele', latin: 'Scomber colias', w: [0.15, 0.5, 1.5], lenK: 44, depth: [0, 1], power: 1.0, price: 5,
    baits: { blinker: 0.8, pilker: 0.7, spinner: 0.6, garnele: 0.6, tintenfisch: 0.4 }, time: [1.4, 0.9, 1.3, 0.3],
    info: 'Schwimmt in riesigen Schwärmen und glänzt grün-blau. Für Haie und Thunfische ist sie Lieblingsfutter!',
    look: { body: 0x9ab0a8, back: 0x2a5a5a, belly: 0xf4f2ea, waves: 0x10282a, fin: 0x5a6a6a, finlets: 0x6a7a7a, shape: 'tuna', slim: true },
  },
  papagei: {
    name: 'Papageifisch', latin: 'Sparisoma cretense', w: [0.2, 0.6, 2], lenK: 40, depth: [1, 2], power: 0.95, min: 20, price: 9,
    baits: { garnele: 0.9, muschel: 0.8, brot: 0.4 }, time: [1.1, 1.3, 1.0, 0.1],
    info: 'Knabbert mit seinem Schnabel-Maul Algen von den Lavafelsen. Die Weibchen sind knallrot, nachts schlafen sie in Felsspalten.',
    look: { body: 0xc8423a, back: 0x7a2a2a, belly: 0xf0b080, fin: 0xd85a3a, shape: 'carp', eye: 0xf0d040 },
  },
  bernstein: {
    name: 'Bernsteinmakrele', latin: 'Seriola dumerili', w: [2, 8, 60], lenK: 44, depth: [1, 2], power: 1.55, min: 40, price: 10,
    baits: { pilker: 1, koederfisch: 0.8, gummi: 0.7, tintenfisch: 0.6, popper: 0.5 }, time: [1.3, 0.9, 1.2, 0.4],
    info: 'Jagt im Rudel an Unterwasserbergen und zieht im Drill wie verrückt zum Grund. Ein gelber Streifen läuft vom Auge zum Schwanz.',
    look: { body: 0xb0a888, back: 0x4a5a5a, belly: 0xf0eee4, fin: 0xc8a040, finlets: 0xc8a040, shape: 'tuna', slim: true },
  },
  thun: {
    name: 'Gelbflossen-Thun', latin: 'Thunnus albacares', w: [8, 30, 180], lenK: 41, depth: [0, 1], power: 1.9, price: 14,
    baits: { popper: 0.9, tintenfisch: 0.8, koederfisch: 0.8, pilker: 0.6, wobbler: 0.5 }, time: [1.4, 0.8, 1.2, 0.4],
    info: 'Ein Kraftpaket: schwimmt sein Leben lang ohne Pause, bis zu 75 km/h schnell, und hält seine Muskeln wärmer als das Meer.',
    look: { body: 0x8a9ab0, back: 0x1c2a4a, belly: 0xeef0f2, fin: 0x2a3450, finlets: 0xffd23a, shape: 'tuna', eye: 0x202020 },
  },
  blauhai: {
    name: 'Blauhai', latin: 'Prionace glauca', w: [15, 45, 200], lenK: 62, depth: [0, 1], power: 1.6, protected: true, price: 0,
    baits: { tintenfisch: 1, koederfisch: 0.9 }, time: [1.1, 0.8, 1.2, 1.3],
    info: 'Schlanker Hochsee-Hai mit leuchtend blauem Rücken. Für Menschen harmlos – Angler lassen ihn immer wieder frei.',
    look: { body: 0x4a7ab0, back: 0x2a5590, belly: 0xf2f4f6, fin: 0x2c5a9a, shape: 'shark', eye: 0x111111 },
  },
  mako: {
    name: 'Makohai', latin: 'Isurus oxyrinchus', w: [30, 90, 400], lenK: 58, depth: [0, 1], power: 2.0, jumps: true, protected: true, price: 0,
    baits: { koederfisch: 1, tintenfisch: 0.6 }, time: [1.2, 0.9, 1.1, 0.6],
    info: 'Der schnellste Hai der Welt: über 70 km/h und springt meterhoch aus dem Wasser! Stark gefährdet – immer zurücksetzen.',
    look: { body: 0x3a5078, back: 0x1e2c4a, belly: 0xf4f4f2, fin: 0x24324e, shape: 'shark', eye: 0x050505 },
  },
};
export const FISH_IDS = Object.keys(FISH);

// ---- Rutentechniken ----
// pose: Köder hängt unter der Pose in einstellbarer Tiefe. grund: Köder liegt am Boden, Bissanzeiger an der Rutenspitze.
// spinn: Kunstköder wird aktiv eingeholt. fliege: leichte Fliege, kurzer Wurf, treibt mit der Strömung.
export const TECHNIQUES = {
  pose: { name: 'Posenangeln', hint: 'Warte, bis die Pose ganz abtaucht – dann anschlagen!' },
  grund: { name: 'Grundangeln', hint: 'Der Köder liegt am Boden. Wenn die Rutenspitze ruckt und das Glöckchen bimmelt: anschlagen!' },
  spinn: { name: 'Spinnfischen', hint: 'Halte EINHOLEN gedrückt – gleichmäßig oder mit kleinen Pausen. Bei einem Ruck sofort anschlagen!' },
  fliege: { name: 'Fliegenfischen', hint: 'Die Fliege treibt auf dem Wasser. Wenn ein Fisch zuschnappt: schnell anschlagen!' },
};

// ---- Ruten ----
// line: Tragkraft der Schnur in kg, range: max. Wurfweite (m), spool: Schnur auf der Rolle (m).
export const RODS = [
  { id: 'pose', name: 'Posenrute', tech: 'pose', line: 4, range: 28, spool: 120, price: 0, color: 0x2a6f3a,
    desc: 'Der Klassiker zum Anfangen: Pose, Haken, Wurm – fertig.' },
  { id: 'ul', name: 'Barsch-Spinnrute', tech: 'spinn', line: 3.5, range: 38, spool: 150, price: 120, color: 0xd9a21a,
    desc: 'Leicht und fein für Barsch, Forelle und Döbel.' },
  { id: 'feeder', name: 'Feederrute', tech: 'grund', line: 7, range: 55, spool: 200, price: 220, color: 0x2a4f9a,
    desc: 'Mit Futterkorb am Grund – für Nase, Brassen, Aal und kleine Karpfen.' },
  { id: 'hecht', name: 'Hecht-Spinnrute', tech: 'spinn', line: 11, range: 48, spool: 180, price: 340, color: 0x111418,
    desc: 'Kräftig für große Kunstköder – Hecht, Zander und Seeforelle.' },
  { id: 'fliege', name: 'Fliegenrute', tech: 'fliege', line: 5, range: 24, spool: 100, price: 380, color: 0x7a3a1a,
    desc: 'Elegant! Für Äsche, Forelle, Döbel – und Lachs.' },
  { id: 'brandung', name: 'Brandungsrute', tech: 'grund', line: 10, range: 110, spool: 250, price: 420, color: 0xe8e8e8, sea: true,
    desc: 'Extra lang für weite Würfe vom Strand ins Meer.' },
  { id: 'karpfen', name: 'Karpfenrute', tech: 'grund', line: 16, range: 85, spool: 300, price: 500, color: 0x2e3a26,
    desc: 'Mit Bissanzeiger und Freilauf – für kapitale Karpfen.' },
  { id: 'waller', name: 'Wallerrute', tech: 'grund', line: 60, range: 50, spool: 300, price: 950, color: 0x6a1a1a,
    desc: 'Ein Monster-Prügel für Wels und Stör.' },
  { id: 'meerspinn', name: 'Meeres-Spinnrute', tech: 'spinn', line: 35, range: 60, spool: 300, price: 750, color: 0x1a8a9a, sea: true,
    desc: 'Salzwasserfest und stark: Pilker und Popper für Makrele, Bernsteinmakrele und Thun.' },
  { id: 'hochsee', name: 'Hochseerute', tech: 'pose', line: 120, range: 45, spool: 500, price: 1400, color: 0x1a2a5a, sea: true,
    desc: 'Kurz, extrem stark, mit Ballon-Pose: Der Köder treibt im Freiwasser – für Haie und riesige Thunfische.' },
];
export const rodById = (id) => RODS.find((r) => r.id === id) || RODS[0];

// ---- Köder ----
// techs: an welchen Ruten der Köder passt. pack: wie viele Würfe eine Packung reicht (Kunstköder halten ewig = 0).
export const BAITS = [
  { id: 'wurm', name: 'Tauwurm', emoji: '🪱', techs: ['pose', 'grund'], price: 0, pack: 0, color: 0xb05a5a },
  { id: 'made', name: 'Maden', emoji: '🐛', techs: ['pose', 'grund'], price: 15, pack: 0, color: 0xf3ead2 },
  { id: 'mais', name: 'Mais', emoji: '🌽', techs: ['pose', 'grund'], price: 10, pack: 0, color: 0xffd23a },
  { id: 'brot', name: 'Brotflocke', emoji: '🍞', techs: ['pose', 'grund'], price: 5, pack: 0, color: 0xf6efe0 },
  { id: 'teig', name: 'Forellenteig', emoji: '🟠', techs: ['pose', 'grund'], price: 25, pack: 0, color: 0xff8a2a },
  { id: 'boilie', name: 'Boilie', emoji: '🟤', techs: ['grund'], price: 40, pack: 0, color: 0xc48a3a },
  { id: 'pellet', name: 'Heilbutt-Pellet', emoji: '🟫', techs: ['grund'], price: 35, pack: 0, color: 0x6a3a1a },
  { id: 'koederfisch', name: 'Köderfisch', emoji: '🐟', techs: ['pose', 'grund'], price: 50, pack: 0, color: 0xc8d0d8 },
  { id: 'wattwurm', name: 'Wattwurm', emoji: '🪱', techs: ['grund'], price: 30, pack: 0, color: 0x8a4a3a, sea: true },
  { id: 'garnele', name: 'Garnele', emoji: '🍤', techs: ['pose', 'grund'], price: 20, pack: 0, color: 0xff9a7a },
  { id: 'muschel', name: 'Muschelfleisch', emoji: '🦪', techs: ['pose', 'grund'], price: 20, pack: 0, color: 0xf0c8a0, sea: true },
  { id: 'tintenfisch', name: 'Tintenfisch', emoji: '🦑', techs: ['pose', 'grund'], price: 45, pack: 0, color: 0xe8d8e0, sea: true },
  { id: 'spinner', name: 'Spinner', emoji: '🌀', techs: ['spinn'], price: 30, pack: 0, color: 0xe0e4ea, depth: 0 },
  { id: 'blinker', name: 'Blinker', emoji: '🥄', techs: ['spinn'], price: 35, pack: 0, color: 0xffd23a, depth: 1 },
  { id: 'wobbler', name: 'Wobbler', emoji: '🐠', techs: ['spinn'], price: 60, pack: 0, color: 0x3ac46a, depth: 1 },
  { id: 'gummi', name: 'Gummifisch', emoji: '🦐', techs: ['spinn'], price: 45, pack: 0, color: 0xff4fa0, depth: 2 },
  { id: 'popper', name: 'Popper', emoji: '💥', techs: ['spinn'], price: 55, pack: 0, color: 0xf4f4f0, depth: 0 },
  { id: 'pilker', name: 'Pilker', emoji: '🔩', techs: ['spinn'], price: 40, pack: 0, color: 0xc8d0d8, depth: 2, sea: true },
  { id: 'fliege', name: 'Trockenfliege', emoji: '🪰', techs: ['fliege'], price: 40, pack: 0, color: 0x6a4a2a, depth: 0 },
  { id: 'nymphe', name: 'Nymphe', emoji: '🦗', techs: ['fliege'], price: 40, pack: 0, color: 0x3a5a2a, depth: 1 },
  { id: 'kaefer', name: 'Käfer-Fliege', emoji: '🪲', techs: ['fliege'], price: 40, pack: 0, color: 0x2a2a1a, depth: 0 },
];
export const baitById = (id) => BAITS.find((b) => b.id === id) || BAITS[0];
export const baitFitsRod = (bait, rod) => bait.techs.includes(rod.tech);
export const DEPTHS = ['Flach', 'Mittel', 'Grund'];

// Welche Fische mögen diesen Köder? (für die Garage)
export function fishForBait(baitId) {
  return FISH_IDS.filter((id) => (FISH[id].baits[baitId] || 0) >= 0.5);
}

// ---- Tageszeit ----
export const TIMES = [
  { id: 0, name: 'Morgen', emoji: '🌅' },
  { id: 1, name: 'Mittag', emoji: '☀️' },
  { id: 2, name: 'Abend', emoji: '🌇' },
  { id: 3, name: 'Nacht', emoji: '🌙' },
];

// ---- Angler-Look ----
// Hautton: Farbe der (entsättigten) Hauttextur des Modells
export const SKIN_TONES = [0xf3c6a6, 0xe0a882, 0xbd8058, 0x8e5a3a, 0x5a3624];
export const HAIR_COLORS = [0x2a1a10, 0x5a3418, 0xa8642a, 0xe8c26a, 0xc8401a, 0x9a9aa0];
export const HAIR_STYLES = [{ id: 'short', name: 'Kurzhaar' }, { id: 'bald', name: 'Glatze' }];
export const HATS = [
  { id: 'none', name: 'Ohne' }, { id: 'bucket', name: 'Fischerhut' }, { id: 'cap', name: 'Basecap' },
  { id: 'beanie', name: 'Mütze' },
];
export const TOPS = [
  { id: 'rain', name: 'Regenjacke' }, { id: 'vest', name: 'Anglerweste' }, { id: 'softshell', name: 'Softshell' },
  { id: 'hoodie', name: 'Hoodie' }, { id: 'fleece', name: 'Fleece' }, { id: 'tshirt', name: 'T-Shirt' },
];
export const PANTS = [
  { id: 'wader', name: 'Wathose' }, { id: 'jeans', name: 'Jeans' }, { id: 'cargo', name: 'Cargohose' },
];
export const OUTFIT_COLORS = [0x3d5a2a, 0x2a4f9a, 0xe8501a, 0xffc61a, 0xb8262a, 0x1a7a7a, 0x5a3a8a, 0x2a2e36, 0xd8d0b8, 0x7a5a3a];
export const DEFAULT_LOOK = {
  skin: 1, hair: 'short', hairColor: 1, hat: 'bucket', hatColor: 8, top: 'vest', topColor: 0, shirtColor: 7,
  pants: 'cargo', pantsColor: 9, glasses: true, beard: false, boots: true,
};

// ---- Gewicht, Länge, Bisswahrscheinlichkeit ----
export function lengthCm(fishId, kg) {
  return Math.round(FISH[fishId].lenK * Math.cbrt(kg));
}

// Gewicht zufällig: meistens um den typischen Wert, selten richtig groß. `luck` (0..1) verschiebt Richtung groß.
export function rollWeight(fishId, rnd = Math.random, luck = 0) {
  const [min, typ, max] = FISH[fishId].w;
  const u = rnd();
  let kg;
  if (u < 0.8 - luck * 0.3) kg = min + (typ - min) * Math.pow(rnd(), 0.7) * 1.25; // Normalfang
  else kg = typ + (max - typ) * Math.pow(rnd(), 3.2); // Brocken, ganz selten Rekordnähe
  return Math.round(Math.min(max, Math.max(min, kg)) * 100) / 100;
}

// Wie gut passt die Montage für einen Fisch? 0 = beißt nie.
export function baitScore(fishId, baitId, depthIdx) {
  const f = FISH[fishId];
  const b = f.baits[baitId] || 0;
  if (!b) return 0;
  const near = Math.min(...f.depth.map((d) => Math.abs(d - depthIdx)));
  return b * (near === 0 ? 1 : near === 1 ? 0.35 : 0.08);
}

// Biss-Tabelle für einen Spot: [{ id, rate }], rate = Bisse pro Minute (grob).
export function biteTable(spot, rod, baitId, depthIdx, timeIdx) {
  const out = [];
  for (const [id, abundance] of Object.entries(spot.fish)) {
    const s = baitScore(id, baitId, depthIdx);
    if (!s) continue;
    const t = FISH[id].time[timeIdx] ?? 1;
    out.push({ id, rate: abundance * s * t * 0.55 });
  }
  return out;
}

// Welche Tiefe fischt eine Montage? Grund liegt unten, Pose wie eingestellt, Kunstköder/Fliege laufen in ihrer Tiefe.
export const fishingDepth = (rod, bait, poseDepth) => (rod.tech === 'grund' ? 2 : rod.tech === 'pose' ? poseDepth : bait.depth ?? 1);

// Hält die Schnur einen typischen Fisch dieser Art? 1 = locker, darunter reißt es immer öfter.
export function lineOk(rod, fishId) {
  const f = FISH[fishId];
  const pull = (0.35 * Math.pow(f.w[1], 0.85) + 0.25) * f.power * 1.4; // typischer Fisch auf der Flucht
  return Math.min(1, rod.line / pull);
}

// Erwartete Fänge pro Minute einer Montage an einem Platz (Bisse × Chance, den Fisch auch zu landen)
export function gearScore(spot, rod, bait, depthIdx, timeIdx) {
  return biteTable(spot, rod, bait.id, depthIdx, timeIdx).reduce((a, t) => a + t.rate * Math.pow(lineOk(rod, t.id), 2), 0);
}

// Beste Montage aus den angebotenen Ruten/Ködern (für den Tipp auf der Karte)
export function bestGear(spot, timeIdx, rods, baits) {
  let best = null;
  for (const rod of rods) {
    for (const bait of baits) {
      if (!baitFitsRod(bait, rod)) continue;
      for (const depth of rod.tech === 'pose' ? [0, 1, 2] : [fishingDepth(rod, bait, 1)]) {
        const score = gearScore(spot, rod, bait, depth, timeIdx);
        if (!best || score > best.score) best = { rod, bait, depth, score };
      }
    }
  }
  return best;
}

export function pickFish(table, rnd = Math.random) {
  const sum = table.reduce((a, t) => a + t.rate, 0);
  let u = rnd() * sum;
  for (const t of table) { u -= t.rate; if (u <= 0) return t.id; }
  return table[table.length - 1]?.id;
}

// Erfahrungspunkte & Level
export const levelFromXp = (xp) => Math.floor(Math.sqrt(xp / 60)) + 1;
export const xpForLevel = (lvl) => 60 * (lvl - 1) * (lvl - 1);

export function fmtKg(kg) {
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg.toFixed(kg < 10 ? 2 : 1).replace('.', ',')} kg`;
}
