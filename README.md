# Elis Bike Race 🚲

Ein Fahrrad-Rennspiel im Browser mit [Three.js](https://threejs.org/) (v0.160, liegt in `vendor/` – kein Build, kein CDN nötig).
Für Laptop (Tastatur) und Tablet (Touch, z. B. Amazon Fire Kids). Als App installierbar (PWA) und offline spielbar.

## Spielen

1. **Modus**: Einzelfahrt (gegen die Uhr, 1–3 Sterne) oder gegen 3 Computer-Gegner (Leicht / Mittel / Schwer / Profi).
2. **Garage** (Tabs): *Marke* (Alpina, Velocità, Nordlicht, Kodiak – frei erfunden), *Typ* (Trail, Downhill, Rennrad, Gravel),
   *Teile* (Reifen, Laufräder, Federung, Übersetzung, Bremsen, Rahmenmaterial, Lenker – wirken sich auf Tempo, Antritt, Lenkung, Bremse, Gelände,
   Stabilität aus), *Look* (Lack glänzend/matt/metallic, Rahmenmuster, Reifenflanke, Felgenfarbe, Startnummer), *Farben* und *Fahrer*
   (Hautton, Frisur, Haarfarbe, Helmtyp & -farbe, Sonnenbrille, Trikot-Muster & -farbe, Hose, Schuhe). 🎲 würfelt einen Look. Alles wird gespeichert.
3. **Strecke**: Wiesenpfad, Küstenstraße, Waldtrail, Canyon-Abfahrt (A→B), **Bikepark Sunset** (Flow-Line mit Kickern, Tables, Doubles, Slalom)
   und **Pumptrack Arena** (kleiner Rundkurs mit Wellen und steilen Anliegern, Nacht-Look). Die **Rundenzahl** stellst du im Streckenmenü ein.
4. **Hindernisse**: Felsen, Baumstämme, Strohballen, Leitkegel (Slalom), dazu Pfützen, Matsch und Sandfelder, die bremsen und die Lenkung
   schwammig machen – plus gelbe Boost-Felder, Kicker, Tables, Doubles und Bodenwellen.
5. **Stimmung**: jubelndes Publikum am Streckenrand (hüpft und johlt, wenn du vorbeikommst), Fähnchen an Start/Ziel, Musik (live erzeugt, pro Strecke
   anderes Tempo/Tonart) und Geräusche – beides in den Einstellungen getrennt abschaltbar.

| Aktion | Tastatur | Touch |
|---|---|---|
| Lenken | ← → / A D | **Lenkleiste** unten links (Finger auf die Leiste, Position = Einschlag), alternativ *Wischen* oder *Neigen* (Tablet wie ein Lenkrad kippen) – in den Einstellungen |
| Gas | ↑ / W / Leertaste | automatisch (Auto-Gas) oder grüner GAS-Button |
| Bremse | ↓ / S / Shift | roter BREMSE-Button |
| Pause / Neustart | Esc oder P / R | ⏸-Button |

Die Lenkung ist geglättet; in den Einstellungen gibt es Empfindlichkeit (Sanft/Normal/Direkt) und eine **Lenkhilfe** (weniger Fliehkraft, sanftes Zurückholen
auf die Strecke). In Kurven wirst du nach außen getragen: rechtzeitig bremsen und in die Kurve lenken. Das Layout passt sich an iPhone/iPad/Fire-Tablet
(hoch und quer) an.

## Starten

```bash
npm start            # = npx serve .
# oder
python3 -m http.server 8000
```

`http://localhost:8000` öffnen. Touch-Bedienung am Laptop testen: `?touch=1`. Grafik erzwingen: `?q=low|mid|high`.
Debug: `?start&mode=vs&level=hard&cat=road&brand=velocita&map=4&laps=2&bot&warp=20` (direkt ins Rennen, Autopilot, Zeit vorspulen),
`&screen=garage&tab=parts`.

## Auf den Home-Screen (Fire-Tablet)

Spiel im Silk-Browser öffnen → Menü → „Zum Startbildschirm hinzufügen“ (bzw. „Zur Startseite“). Dank Service Worker läuft es danach auch ohne Internet
(einmal online öffnen, damit alles zwischengespeichert wird). PWA-Dateien: `manifest.webmanifest`, `sw.js`, `icons/`.
Bei neuen Versionen in `sw.js` die Konstante `CACHE` hochzählen.

## Struktur

```
index.html, css/style.css     UI (Menüs, Garage, HUD, Touch-Steuerung)
js/main.js                    Menüs, Zustand, Einstellungen, Game Loop
js/bikedata.js                Marken, Typen, Teile, Berechnung der Werte (rein)
js/bikes.js                   detailliertes 3D-Radmodell + Fahrer (statische Teile pro Material zusammengefasst)
js/maps.js                    Strecken (Rundkurse mit loop:true, Hindernisse, Zuschauer, Licht) – hier neue ergänzen
js/trackdata.js               Streckenmathematik: Rundkurs-Schließung, Kurven, Höhenprofil, Schanzen, Hindernisse, Pfützen (rein)
js/trackmesh.js               Gelände, Texturen, Bäume, Hindernis-Modelle, Pfützen/Matsch/Sand, Neon-Streifen, Boost-Felder, Start/Ziel
js/crowd.js                   Zuschauer (instanziert, jubeln, reagieren auf den Fahrer)
js/env.js                     Himmel, Umgebungsreflexion, Berge, Wolken
js/physics.js                 Fahrphysik (Gas, Gefälle, Fliehkraft, Sprünge)
js/ai.js                      Computergegner + Schwierigkeitsstufen
js/race.js                    Rennablauf, Kamera, Schatten, Minimap, HUD
js/showroom.js                Drehbühne in der Garage
js/input.js                   Eingabe: Tastatur, Lenkleiste/Wischen/Neigen, Glättung
js/sfx.js, js/music.js        Geräusche, Publikum-Jubel, Hintergrundmusik (alles WebAudio, keine Dateien)
js/autopilot.js               Referenzzeit für die Sterne
tools/sim.mjs                 `npm run sim [easy|medium|hard|pro]`: Testfahrten aller Typ/Strecken-Kombis
tools/bikeview.html           Entwickler-Ansicht des Radmodells
```

## Anpassen

- Neue Marke / echte Markennamen: `BRANDS` in `js/bikedata.js`. Neue Teile: `PARTS`. Neue Strecke: Eintrag in `js/maps.js` kopieren (Rundkurs: `loop: true`, `length` = Rundenlänge; Schanzen mindestens 40 m von Start/Ziel weg), dann `npm run sim`.
- Musik pro Strecke (Tempo, Tonart, Dur/Moll): `STYLES` in `js/music.js`.
- Tempo/Gefühl: `js/physics.js` (Konstanten) und Basiswerte in `CATEGORIES`.

## GitLab Pages

`.gitlab-ci.yml` kopiert die statischen Dateien nach `public/`. Nach dem Push auf den Default-Branch ist das Spiel unter der Pages-URL erreichbar (Settings → Pages).
