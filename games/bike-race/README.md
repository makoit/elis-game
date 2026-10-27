# Elis Bike Race 🚲🏍️

Ein Fahrrad- und Motorrad-Rennspiel im Browser mit [Three.js](https://threejs.org/) (v0.160, liegt im Repo-Root unter `vendor/` – kein Build, kein CDN nötig).
Teil von **Elis Spiele** (Hub im Repo-Root, siehe [../../README.md](../../README.md)); „◀ Alle Spiele“ im Startmenü, in der Pause und im Ergebnis führt zurück zur Spieleauswahl.
Für Laptop (Tastatur) und Tablet (Touch, z. B. Amazon Fire Kids). Als App installierbar (PWA) und offline spielbar.

## Spielen

1. **Modus**: Einzelfahrt (gegen die Uhr, 1–3 Sterne) oder gegen 3 Computer-Gegner (Leicht / Mittel / Schwer / Profi).
2. **Garage**: oben **Fahrrad** oder **Motorrad** wählen. Motorräder: *Typ* Dirt Bike, Enduro, Naked Bike, Supersportler
   (deutlich schneller – bis über 200 km/h), *Marke* Falco, Raiden, Bergwerk, Vulkan (frei erfunden), *Teile* Reifen, Motor, Auspuff,
   Fahrwerk, Übersetzung, Bremsen, Verkleidung; dazu Integral- oder Motocross-Helm, Lederkombi/MX-Jacke und Stiefel.
   Fahrrad-Tabs: *Marke* (Alpina, Velocità, Nordlicht, Kodiak – frei erfunden), *Typ* (Trail, Downhill, Rennrad, Gravel),
   *Teile* (Reifen, Laufräder, Federung, Übersetzung, Bremsen, Rahmenmaterial, Lenker – wirken sich auf Tempo, Antritt, Lenkung, Bremse, Gelände,
   Stabilität aus), *Look* (Lack glänzend/matt/metallic, Rahmenmuster, Reifenflanke, Felgenfarbe, Startnummer), *Farben* und *Fahrer*
   (Hautton, Frisur, Haarfarbe, Helmtyp & -farbe, Sonnenbrille, Trikot-Muster & -farbe, Hose, Schuhe). 🎲 würfelt einen Look. Alles wird gespeichert.
3. **Strecke**: Wiesenpfad, Küstenstraße, Waldtrail, Canyon-Abfahrt (A→B), **Bikepark Sunset** (Flow-Line mit Kickern, Tables, Doubles, Slalom)
   und **Pumptrack Arena** (kleiner Rundkurs mit Wellen und steilen Anliegern, Nacht-Look), **Weinberge** und die **Gardasee-Runde**
   (Gardesana am Seeufer durch Torri del Benaco mit Hafen, Scaliger-Burg, Olivenhainen, Limonaie und Segelbooten). Die **Rundenzahl** stellst du im Streckenmenü ein.
   Fahrbahn, Seitenstreifen (Kies) und Wiese haben eigene Farben und Strukturen.
4. **Hindernisse**: Felsen, Baumstämme, Strohballen, Leitkegel (Slalom), dazu Pfützen, Matsch und Sandfelder, die bremsen und die Lenkung
   schwammig machen – plus gelbe Boost-Felder, Kicker, Tables, Doubles und Bodenwellen.
5. **Stimmung**: jubelndes Publikum am Streckenrand (hüpft und johlt, wenn du vorbeikommst), Fähnchen an Start/Ziel, Musik (live erzeugt, pro Strecke
   anderes Tempo/Tonart) und Geräusche – beides in den Einstellungen getrennt abschaltbar.

| Aktion | Tastatur | Touch |
|---|---|---|
| Lenken | ← → / A D | **Lenkleiste** unten links (Finger auf die Leiste, Position = Einschlag), alternativ *Wischen* oder *Neigen* (Tablet wie ein Lenkrad kippen) – in den Einstellungen |
| Gas | ↑ / W / Leertaste | automatisch (Auto-Gas) oder grüner GAS-Button |
| Bremse | ↓ / S / Shift | roter BREMSE-Button |
| Wheelie (halten) | E (oder Q) | lila ⤴ WHEELIE-Button über der Bremse |
| Pause / Neustart | Esc oder P / R | ⏸-Button |

Die Lenkung ist geglättet; in den Einstellungen gibt es Empfindlichkeit (Sanft/Normal/Direkt) und eine **Lenkhilfe** (weniger Fliehkraft, sanftes Zurückholen
auf die Strecke), einen **Bremsassistenten** (bremst vor zu schnellen Kurven; Aus / nur Motorrad / immer) und den **Kamera-Abstand**. Für Motorräder:
**Tempolimit** (ohne / 160 / 100 km/h, gilt für alle Motorräder im Rennen) und **Motorgeräusch**. Bestzeiten werden für Fahrrad und Motorrad getrennt gespeichert. In Kurven wirst du nach außen getragen: rechtzeitig bremsen und in die Kurve lenken. Das Layout passt sich an iPhone/iPad/Fire-Tablet
(hoch und quer) an.

## Starten

```bash
npm start            # = npx serve .
# oder
python3 -m http.server 8000
```

`http://localhost:8000/games/bike-race/` öffnen (oder `http://localhost:8000` → Kachel *Bike Race*). Touch-Bedienung am Laptop testen: `?touch=1`. Grafik erzwingen: `?q=low|mid|high`.
Debug: `?start&mode=vs&level=hard&cat=road&brand=velocita&map=4&laps=2&bot&warp=20` (direkt ins Rennen, Autopilot, Zeit vorspulen;
Motorrad: `cat=dirt|enduro|naked|superbike`),
`&screen=garage&tab=parts`.

## Auf den Home-Screen (Fire-Tablet)

Hub im Silk-Browser öffnen → Menü → „Zum Startbildschirm hinzufügen“ (bzw. „Zur Startseite“). Dank Service Worker läuft es danach auch ohne Internet
(einmal online öffnen, damit alles zwischengespeichert wird). PWA-Dateien liegen im Repo-Root (`manifest.webmanifest`, `sw.js`, `icons/`) und gelten für alle Spiele.
Bei neuen Versionen in `sw.js` die Konstante `CACHE` hochzählen.

## Struktur (alles relativ zu `games/bike-race/`)

```
cover.svg                     Kachelbild im Hub
index.html, css/style.css     UI (Menüs, Garage, HUD, Touch-Steuerung)
js/main.js                    Menüs, Zustand, Einstellungen, Game Loop
js/bikedata.js                Fahrzeugarten, Marken, Typen, Teile (Fahrrad + Motorrad), Berechnung der Werte (rein)
js/bikes.js                   detailliertes 3D-Radmodell + Fahrer (statische Teile pro Material zusammengefasst)
js/motos.js                   3D-Motorräder (Dirt Bike, Enduro, Naked Bike, Supersportler); Fahrer kommt aus bikes.js
js/geom.js                    gemeinsame Bauhelfer für Fahrrad/Motorrad (Lofts, Rohre, Material-Bündel)
js/maps.js                    Strecken (Rundkurse mit loop:true, Hindernisse, Zuschauer, Licht) – hier neue ergänzen
js/trackdata.js               Streckenmathematik: Rundkurs-Schließung, Kurven, Höhenprofil, Schanzen, Hindernisse, Pfützen (rein)
js/trackmesh.js               Gelände, Texturen, Bäume, Hindernis-Modelle, Pfützen/Matsch/Sand, Neon-Streifen, Boost-Felder, Start/Ziel,
                              Weinberg und Gardasee (See, Ufermauern, Ort, Burg, Hafen, Boote)
js/crowd.js                   Zuschauer (instanziert, jubeln, reagieren auf den Fahrer)
js/env.js                     Himmel, Umgebungsreflexion, Berge, Wolken
js/physics.js                 Fahrphysik: Tretleistung, Luft-/Rollwiderstand, Hangabtrieb, Kurven-Haftgrenze, Sprünge, Wheelie, Rempler, Hindernisse
js/ai.js                      Computergegner + Schwierigkeitsstufen
js/race.js                    Rennablauf, Kamera, Schatten, Minimap, HUD
js/postfx.js                  Nachbearbeitung (nur Qualität „Hoch“): Bloom, Speed-Blur, Vignette, Color-Grading
js/particles.js               Staub/Kies/Wasser/Funken-Partikel und Reifenspuren (ab „Mittel“)
js/pbr.js                     lädt Foto-Texturen aus assets/textures (Poly Haven, CC0) für Boden und Piste (ab „Mittel“)
js/showroom.js                Drehbühne in der Garage
js/input.js                   Eingabe: Tastatur, Lenkleiste/Wischen/Neigen, Glättung
js/sfx.js, js/music.js        Geräusche, Motorklang, Publikum-Jubel, Hintergrundmusik (alles WebAudio, keine Dateien)
js/autopilot.js               Referenzzeit für die Sterne
tools/sim.mjs                 `npm run sim [easy|medium|hard|pro]`: Testfahrten aller Typ/Strecken-Kombis
tools/bikeview.html           Entwickler-Ansicht des Radmodells
tools/icons.py                `python3 games/bike-race/tools/icons.py`: erzeugt icons/icon.svg, icons/icon-maskable.svg und cover.svg
                              (PNGs in icons/ danach aus den SVGs exportieren, 192/512 px)
```

## Anpassen

- Neue Marke / echte Markennamen: `BRANDS` in `js/bikedata.js` (Feld `kind`: `bike` oder `moto`). Neue Teile: `PARTS` bzw. `MOTO_PARTS`. Neue Strecke: Eintrag in `js/maps.js` kopieren (Rundkurs: `loop: true`, `length` = Rundenlänge; Schanzen mindestens 40 m von Start/Ziel weg), dann `npm run sim` (im Repo-Root).
- Musik pro Strecke (Tempo, Tonart, Dur/Moll): `STYLES` in `js/music.js`.
- Tempo/Gefühl: `js/physics.js` (Konstanten) und Basiswerte in `CATEGORIES`.
