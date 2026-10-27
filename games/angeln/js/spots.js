// Gewässer und Angelplätze. Koordinaten sind echte Orte (WGS84), die Umrisse kommen aus geo.js (OpenStreetMap).
// fish: Bestand am Platz (0..5, höher = mehr Fische). depth: Wassertiefe in m (fürs Echolot und die Optik).
// boat: Platz wird vom Boot aus beangelt. level: ab welcher Stufe der Ausflug in der Karriere frei ist.
// scene: Aussehen der 3D-Szene (Wasserfarbe, Ufer, Berge, Strömung, Wahrzeichen). Ein Spot kann mit `landmark` ein eigenes Wahrzeichen setzen.

export const WATERS = [
  {
    id: 'garda', name: 'Gardasee', country: '🇮🇹 Italien', kind: 'see', level: 1, emoji: '🏔️',
    desc: 'Größter See Italiens – türkisblau, tief und von steilen Bergen umrahmt.',
    labels: [
      { name: 'Riva del Garda', lat: 45.886, lon: 10.842 }, { name: 'Malcesine', lat: 45.764, lon: 10.81 },
      { name: 'Torri del Benaco', lat: 45.61, lon: 10.688 }, { name: 'Garda', lat: 45.575, lon: 10.708 },
      { name: 'Sirmione', lat: 45.492, lon: 10.607 }, { name: 'Peschiera', lat: 45.44, lon: 10.69 },
      { name: 'Salò', lat: 45.606, lon: 10.522 }, { name: 'Limone', lat: 45.812, lon: 10.79 }, { name: 'Monte Baldo', lat: 45.72, lon: 10.86, peak: true },
    ],
    spots: [
      { id: 'sarca', name: 'Sarca-Mündung', place: 'Torbole', lat: 45.87232, lon: 10.86702, depth: 6,
        fish: { forelle: 3, doebel: 4, barsch: 2, aal: 1, hecht: 1 },
        text: 'Hier fließt kaltes Bergwasser in den See – Seeforellen jagen an der Strömungskante.' },
      { id: 'malcesine', name: 'Hafenmole Malcesine', place: 'Malcesine', lat: 45.76277, lon: 10.80671, depth: 12,
        fish: { barsch: 4, doebel: 3, hecht: 1, forelle: 1, aal: 1 },
        text: 'Unter der Burg Scaligera fällt der Grund steil ab. Barsche stehen an den Steinen der Mole.' },
      { id: 'sirmione', name: 'Schilf bei Sirmione', place: 'Sirmione', lat: 45.48953, lon: 10.60775, depth: 3,
        fish: { hecht: 3, karpfen: 3, barsch: 3, aal: 2, doebel: 1 },
        text: 'Flaches, warmes Wasser mit Schilf und Kraut – ein Paradies für Hecht und Karpfen.' },
      { id: 'mincio', name: 'Mincio-Ausfluss', place: 'Peschiera del Garda', lat: 45.44050, lon: 10.69050, depth: 4,
        fish: { doebel: 3, karpfen: 3, wels: 2, aal: 2, barsch: 2 },
        text: 'An den alten Festungsmauern verlässt der Mincio den See. Hier lauern sogar Welse.' },
      { id: 'garda-boot', name: 'Seemitte vor Torri', place: 'Boot', lat: 45.62, lon: 10.655, depth: 180, boat: true,
        fish: { forelle: 3, barsch: 3, hecht: 1 },
        text: 'Mit dem Boot aufs tiefe Wasser: Hier ziehen große Seeforellen ihre Bahnen.' },
    ],
    scene: { water: 0x1c8aa0, deep: 0x0b4a63, shore: 'rocks', hills: 'alps', hillColor: 0x4a6a4a, far: 0x8aa2b8, landmark: 'castle', trees: 'olive', flow: 0 },
  },
  {
    id: 'bodensee', name: 'Bodensee', country: '🇩🇪 🇦🇹 🇨🇭', kind: 'see', level: 2, emoji: '⛵',
    desc: 'Das „Schwäbische Meer“ zwischen drei Ländern – mit Blick auf die Alpen.',
    labels: [
      { name: 'Konstanz', lat: 47.66, lon: 9.175 }, { name: 'Überlingen', lat: 47.767, lon: 9.158 },
      { name: 'Meersburg', lat: 47.693, lon: 9.271 }, { name: 'Friedrichshafen', lat: 47.654, lon: 9.479 },
      { name: 'Langenargen', lat: 47.598, lon: 9.542 }, { name: 'Lindau', lat: 47.546, lon: 9.684 },
      { name: 'Bregenz', lat: 47.503, lon: 9.747 }, { name: 'Romanshorn', lat: 47.566, lon: 9.379 },
      { name: 'Reichenau', lat: 47.69, lon: 9.06 }, { name: 'Mainau', lat: 47.705, lon: 9.195 },
    ],
    spots: [
      { id: 'seerhein', name: 'Seerhein Konstanz', place: 'Konstanz', lat: 47.66648, lon: 9.18046, depth: 5,
        fish: { aesche: 2, barsch: 3, hecht: 2, doebel: 2, aal: 1, forelle: 1 },
        text: 'Unter der Rheinbrücke strömt der junge Rhein aus dem See – Äschen lieben das klare Wasser.' },
      { id: 'reichenau', name: 'Schilfgürtel Reichenau', place: 'Untersee', lat: 47.69438, lon: 9.04311, depth: 3,
        fish: { hecht: 3, zander: 2, karpfen: 3, wels: 1, barsch: 2, aal: 1 },
        text: 'Im flachen Untersee wachsen Schilf und Seerosen. Hecht, Zander und Karpfen fühlen sich hier wohl.' },
      { id: 'argen', name: 'Argenmündung', place: 'Langenargen', lat: 47.58778, lon: 9.55515, depth: 8,
        fish: { forelle: 3, barsch: 3, aal: 1, doebel: 1, hecht: 1 },
        text: 'Die Argen bringt kaltes Wasser aus dem Allgäu. Seeforellen ziehen hier zum Laichen hinauf.' },
      { id: 'lindau', name: 'Hafen Lindau', place: 'Lindau', lat: 47.54303, lon: 9.68438, depth: 7, landmark: 'lindau',
        fish: { barsch: 4, hecht: 2, aal: 2, karpfen: 1 },
        text: 'Zwischen Löwe und Leuchtturm: In der Hafeneinfahrt jagen Barschschwärme.' },
      { id: 'ueberlingen-boot', name: 'Überlinger See', place: 'Boot', lat: 47.738, lon: 9.19, depth: 140, boat: true,
        fish: { saibling: 3, forelle: 2, barsch: 2, hecht: 1 },
        text: 'Tief und kalt: Mit dem Boot geht es zum Seesaibling, der in über 50 m Tiefe lebt.' },
    ],
    scene: { water: 0x2f8a8a, deep: 0x154a55, shore: 'meadow', hills: 'hills', hillColor: 0x5a7a3a, far: 0xc8d4e2, landmark: 'none', trees: 'leaf', flow: 0 },
  },
  {
    id: 'donau', name: 'Donau – Wachau', country: '🇦🇹 Österreich', kind: 'fluss', level: 3, emoji: '🍇',
    desc: 'Der große Strom schlängelt sich zwischen Weinbergen, Burgruinen und Marillengärten.',
    labels: [
      { name: 'Krems', lat: 48.41, lon: 15.603 }, { name: 'Stein', lat: 48.402, lon: 15.585 },
      { name: 'Dürnstein', lat: 48.395, lon: 15.52 }, { name: 'Weißenkirchen', lat: 48.398, lon: 15.468 },
      { name: 'Spitz', lat: 48.366, lon: 15.415 }, { name: 'Rossatz', lat: 48.388, lon: 15.52 }, { name: 'Mautern', lat: 48.394, lon: 15.578 },
    ],
    spots: [
      { id: 'duernstein', name: 'Buhne Dürnstein', place: 'Dürnstein', lat: 48.39242, lon: 15.52026, depth: 5,
        fish: { nase: 3, doebel: 3, barsch: 2, zander: 2, wels: 1 },
        text: 'Unter der Burgruine, in der einst Richard Löwenherz gefangen war, raspeln Nasen an den Steinen.' },
      { id: 'spitz', name: 'Hafen Spitz', place: 'Spitz', lat: 48.36373, lon: 15.41960, depth: 6,
        fish: { barsch: 2, zander: 2, hecht: 1, nase: 2, doebel: 2, aal: 1 },
        text: 'Ruhiges Wasser im Hafenbecken – perfekt für Zander in der Dämmerung.' },
      { id: 'krems', name: 'Kremsmündung', place: 'Krems-Stein', lat: 48.40010, lon: 15.59198, depth: 4,
        fish: { doebel: 2, nase: 3, aesche: 1, barsch: 2, aal: 1 },
        text: 'Wo der kleine Kremsfluss in die Donau mündet, mischen sich zwei Gewässer.' },
      { id: 'wachau-boot', name: 'Strommitte Weißenkirchen', place: 'Boot', lat: 48.39442, lon: 15.47431, depth: 12, boat: true,
        fish: { wels: 2, zander: 3, stoer: 1, hecht: 1, karpfen: 1 },
        text: 'In den tiefen Rinnen der Donau leben Welse – und mit viel Glück der seltene Sterlet (ein kleiner Stör).' },
    ],
    scene: { water: 0x4a7a6a, deep: 0x22423a, shore: 'stones', hills: 'vineyard', hillColor: 0x6a8a3a, far: 0x8a9a7a, landmark: 'church', trees: 'leaf', flow: 0.9 },
  },
  {
    id: 'ostsee', name: 'Ostsee – Fehmarn', country: '🇩🇪 Deutschland', kind: 'meer', level: 4, emoji: '🌊',
    desc: 'Salzwasser, Wind und Möwen: Deutschlands Sonneninsel mit der berühmten Kleiderbügel-Brücke.',
    labels: [
      { name: 'Burg auf Fehmarn', lat: 54.438, lon: 11.193 }, { name: 'Puttgarden', lat: 54.497, lon: 11.228 },
      { name: 'Heiligenhafen', lat: 54.373, lon: 10.982 }, { name: 'Großenbrode', lat: 54.365, lon: 11.085 },
      { name: 'Fehmarnsund', lat: 54.398, lon: 11.112 }, { name: 'Staberhuk', lat: 54.403, lon: 11.31 }, { name: 'Orth', lat: 54.448, lon: 11.05 },
    ],
    spots: [
      { id: 'sundbruecke', name: 'Fehmarnsundbrücke', place: 'Fehmarnsund', lat: 54.40314, lon: 11.12686, depth: 9, landmark: 'bridge',
        fish: { scholle: 3, forelle: 1, aal: 1 },
        text: 'Unter dem „Kleiderbügel“ strömt das Wasser durch den Sund – Plattfische liegen am Grund.' },
      { id: 'staberhuk', name: 'Steinküste Staberhuk', place: 'Staberhuk', lat: 54.40262, lon: 11.30523, depth: 4, landmark: 'lighthouse',
        fish: { forelle: 3, scholle: 2 },
        text: 'Am Leuchtturm mit Steinen und Seegras: Hier jagen silberne Meerforellen.' },
      { id: 'burgtiefe', name: 'Mole Burgtiefe', place: 'Burgtiefe', lat: 54.41225, lon: 11.20100, depth: 6,
        fish: { scholle: 4, aal: 1, forelle: 1 },
        text: 'Von der langen Mole wirft man weit auf den Sandgrund – Schollen satt!' },
      { id: 'belt-boot', name: 'Fehmarnbelt', place: 'Boot', lat: 54.535, lon: 11.15, depth: 25, boat: true,
        fish: { scholle: 4, forelle: 1 },
        text: 'Raus auf die offene Ostsee, wo die großen Fähren nach Dänemark fahren.' },
    ],
    scene: { water: 0x2a6a8a, deep: 0x123a55, shore: 'beach', hills: 'flat', hillColor: 0x7a9a4a, far: 0xb0c4d4, landmark: 'none', trees: 'none', flow: 0, waves: 1.6 },
  },
  {
    id: 'po', name: 'Po-Ebene', country: '🇮🇹 Italien', kind: 'fluss', level: 6, emoji: '🐋',
    desc: 'Italiens längster Fluss – breit, warm und berühmt für riesige Welse.',
    labels: [
      { name: 'Boretto', lat: 44.904, lon: 10.555 }, { name: 'Guastalla', lat: 44.921, lon: 10.656 },
      { name: 'Viadana', lat: 44.927, lon: 10.52 }, { name: 'Dosolo', lat: 44.954, lon: 10.637 }, { name: 'Gualtieri', lat: 44.9, lon: 10.63 },
    ],
    spots: [
      { id: 'boretto', name: 'Hafen Boretto', place: 'Boretto', lat: 44.90729, lon: 10.55475, depth: 6, landmark: 'poplars',
        fish: { wels: 3, karpfen: 3, zander: 2, aal: 1 },
        text: 'Am Flusshafen mit den alten Raddampfern beginnt das Wels-Abenteuer.' },
      { id: 'guastalla', name: 'Sandbank Guastalla', place: 'Guastalla', lat: 44.93151, lon: 10.63589, depth: 4,
        fish: { wels: 2, karpfen: 2, zander: 2, barsch: 1, doebel: 1 },
        text: 'Pappelwälder und eine lange Sandbank – abends rauben hier die Zander.' },
      { id: 'po-boot', name: 'Wels-Gumpe', place: 'Boot', lat: 44.91668, lon: 10.60341, depth: 14, boat: true,
        fish: { wels: 4, stoer: 1, zander: 1 },
        text: 'Ein tiefes Loch in der Flusskurve. Hier wohnen die Riesen – haltet die Rute gut fest!' },
    ],
    scene: { water: 0x6a6a42, deep: 0x3a3a22, shore: 'sand', hills: 'flat', hillColor: 0x6a8a3a, far: 0xc8c8a8, landmark: 'none', trees: 'poplar', flow: 0.6 },
  },
  {
    id: 'gaula', name: 'Gaula – Norwegen', country: '🇳🇴 Norwegen', kind: 'fluss', level: 8, emoji: '🐟',
    desc: 'Einer der besten Lachsflüsse der Welt – wilde Stromschnellen zwischen Fichtenwäldern.',
    labels: [
      { name: 'Støren', lat: 63.034, lon: 10.287 }, { name: 'Melhus', lat: 63.285, lon: 10.278 },
      { name: 'Hovin', lat: 63.1, lon: 10.27 }, { name: 'Gaulfossen', lat: 63.124, lon: 10.255 }, { name: 'Lundamo', lat: 63.153, lon: 10.29 },
    ],
    spots: [
      { id: 'gaulfossen', name: 'Gaulfossen', place: 'Hovin', lat: 63.12301, lon: 10.24157, depth: 5,
        fish: { lachs: 3, forelle: 2, aesche: 1 },
        text: 'Unterhalb des Wasserfalls sammeln sich die Lachse, bevor sie springen.' },
      { id: 'stoeren', name: 'Pool bei Støren', place: 'Støren', lat: 63.04010, lon: 10.28971, depth: 3,
        fish: { lachs: 2, forelle: 2, aesche: 2 },
        text: 'Wo die Sokna in die Gaula fließt: kristallklares Wasser und flinke Äschen.' },
      { id: 'melhus', name: 'Langsame Pools Melhus', place: 'Melhus', lat: 63.25947, lon: 10.27128, depth: 4,
        fish: { lachs: 3, forelle: 3 },
        text: 'Kurz vor dem Fjord ist der Fluss breit und ruhig – frisch aufgestiegene, silberne Lachse!' },
    ],
    scene: { water: 0x3a6a62, deep: 0x1a3a36, shore: 'stones', hills: 'forest', hillColor: 0x2a4a2a, far: 0x7a8a9a, landmark: 'cabin', trees: 'spruce', flow: 1.5 },
  },
];
export const waterById = (id) => WATERS.find((w) => w.id === id) || WATERS[0];
export const spotById = (water, id) => water.spots.find((s) => s.id === id) || water.spots[0];

// Welche Fische gibt es überhaupt wo? (für Fangbuch-Tipps)
export function whereIs(fishId) {
  const out = [];
  for (const w of WATERS) for (const s of w.spots) if (s.fish[fishId]) out.push({ water: w, spot: s });
  return out;
}
