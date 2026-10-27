// Spiele-Katalog für den Hub. Neues Spiel: Ordner unter games/<id>/ anlegen und hier einen Eintrag ergänzen.
// Kategorien ohne Spiele werden im Hub automatisch ausgeblendet.

export const CATEGORIES = [
  { id: 'rennen', name: 'Rennen', emoji: '🏁' },
  { id: 'geschick', name: 'Geschicklichkeit', emoji: '🎯' },
  { id: 'abenteuer', name: 'Abenteuer', emoji: '🗺️' },
  { id: 'raetsel', name: 'Rätsel', emoji: '🧩' },
  { id: 'lernen', name: 'Lernen', emoji: '📚' },
  { id: 'kreativ', name: 'Kreativ', emoji: '🎨' },
];

// path: relativ zur Startseite. cover: Bild für die Kachel (optional, sonst Emoji).
// colors: Verlauf der Kachel. isNew: zeigt ein „Neu“-Abzeichen.
export const GAMES = [
  {
    id: 'bike-race',
    title: 'Bike Race',
    category: 'rennen',
    path: './games/bike-race/',
    cover: './games/bike-race/cover.svg',
    emoji: '🚲',
    colors: ['#ff9a1f', '#ff3d6e'],
    desc: 'Fahrrad- und Motorradrennen auf 8 Strecken – mit Garage zum Selberbauen.',
    tags: ['3D', 'Fahrrad', 'Motorrad'],
    isNew: true,
  },
];
