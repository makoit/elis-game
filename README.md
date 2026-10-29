# Elis & Elaras Spiele 🎮

Eine kleine Spielesammlung im Browser – Startseite wie ein App Store: jedes Spiel ist eine Kachel, oben kann man nach Kategorien filtern.
Kein Build, keine Abhängigkeiten zur Laufzeit. Für Laptop und Tablet (z. B. Amazon Fire Kids), als App installierbar (PWA) und offline spielbar.

| Spiel | Kategorie | Ordner |
|---|---|---|
| 🚲 Bike Race | 🏁 Rennen | [games/bike-race/](games/bike-race/README.md) |
| 🎣 Angel-Abenteuer | 🗺️ Abenteuer | [games/angeln/](games/angeln/README.md) |
| 🌀 Tie-Dye Studio (Elara) | 🎨 Kreativ | [games/tie-dye/](games/tie-dye/README.md) |

## Starten

```bash
npm start            # = npx serve .
# oder
python3 -m http.server 8000
```

`http://localhost:8000` öffnen → Hub mit allen Spielen.

## Struktur

```
index.html                    Hub (Spieleauswahl)
hub/games.js                  Katalog: Kategorien + Spiele (hier neue Spiele eintragen)
hub/hub.js, hub/hub.css       Kacheln, Kategorie-Filter, „Zuletzt gespielt“
games/<id>/                   jedes Spiel in eigenem Ordner mit eigener index.html
vendor/                       Three.js (v0.160), von allen Spielen gemeinsam genutzt
manifest.webmanifest, sw.js   PWA + Offline-Cache für Hub und alle Spiele
icons/                        App-Icons
```

## Neues Spiel hinzufügen

1. Ordner `games/<id>/` mit `index.html` anlegen (Pfade relativ halten; Three.js per Importmap aus `../../vendor/`).
2. Ein Kachelbild `games/<id>/cover.svg` (oder `.png`, Format 16:10) – optional, sonst wird das Emoji gezeigt.
3. Eintrag in `GAMES` in `hub/games.js` (`id`, `title`, `category`, `path`, `cover`, `emoji`, `colors`, `desc`, optional `isNew`).
   Neue Kategorie? In `CATEGORIES` ergänzen – Kategorien ohne Spiele blendet der Hub aus.
4. Im Spiel einen Zurück-Button auf `../../` (Hub) einbauen, `manifest.webmanifest` von `../../` verlinken und `../../sw.js` mit `scope: '../../'` registrieren.
5. Die wichtigsten Dateien des Spiels in `CORE` in `sw.js` ergänzen und `CACHE` hochzählen.

## Auf den Home-Screen (Fire-Tablet)

Im Silk-Browser öffnen → Menü → „Zum Startbildschirm hinzufügen“. Danach läuft alles auch ohne Internet (einmal online öffnen, damit alles zwischengespeichert wird).

## GitLab Pages

`.gitlab-ci.yml` kopiert die statischen Dateien nach `public/`. Nach dem Push auf den Default-Branch ist der Hub unter der Pages-URL erreichbar (Settings → Pages),
das Bike Race direkt unter `<pages-url>/games/bike-race/`.
