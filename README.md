# Elis Bike Race 🚲

Ein Fahrrad-Rennspiel im Browser mit [Three.js](https://threejs.org/) (v0.160, liegt in `vendor/` – kein Build, kein CDN nötig).
Für Laptop (Tastatur) und Tablet (Touch, z. B. Amazon Fire Kids). Als App installierbar (PWA) und offline spielbar.

## Spielen

1. **Modus**: Einzelfahrt (gegen die Uhr, 1–3 Sterne) oder gegen 3 Computer-Gegner (Leicht / Mittel / Schwer / Profi).
2. **Garage**: Marke (Alpina, Velocità, Nordlicht, Kodiak – frei erfunden), Typ (Trail, Downhill, Rennrad, Gravel),
   Teile (Reifen, Laufräder, Federung, Übersetzung, Lenker – wirken sich auf Tempo, Antritt, Lenkung, Gelände, Stabilität aus)
   und Farben (Rahmen, Akzent, Trikot, Helm). Die Auswahl wird gespeichert.
3. **Strecke**: Wiesenpfad ★, Küstenstraße ★★, Waldtrail ★★, Canyon-Abfahrt ★★★ – mit Kurven (Fliehkraft!), Querneigung,
   Kickern, Tables, Doubles, Bodenwellen, Felsen und gelben Boost-Feldern.

| Aktion | Tastatur | Touch |
|---|---|---|
| Lenken | ← → / A D | links irgendwo hinsetzen und nach links/rechts wischen (wie ein Lenker) – oder Tablet kippen (Einstellungen) |
| Gas | ↑ / W / Leertaste | automatisch (Auto-Gas) oder grüner GAS-Button |
| Bremse | ↓ / S / Shift | roter BREMSE-Button |
| Pause / Neustart | Esc oder P / R | ⏸-Button |

In Kurven wirst du nach außen getragen: rechtzeitig bremsen und in die Kurve lenken.

## Starten

```bash
npm start            # = npx serve .
# oder
python3 -m http.server 8000
```

`http://localhost:8000` öffnen. Touch-Bedienung am Laptop testen: `?touch=1`. Grafik erzwingen: `?q=low|mid|high`.
Debug: `?start&mode=vs&level=hard&cat=road&brand=velocita&map=1&bot&warp=20` (direkt ins Rennen, Autopilot, Zeit vorspulen),
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
js/maps.js                    Strecken – hier neue ergänzen
js/trackdata.js               Streckenmathematik: Kurven, Höhenprofil, Schanzen, Hindernisse (rein)
js/trackmesh.js               Gelände, Texturen, Bäume, Felsen, Boost-Felder, Start/Ziel
js/env.js                     Himmel, Umgebungsreflexion, Berge, Wolken
js/physics.js                 Fahrphysik (Gas, Gefälle, Fliehkraft, Sprünge)
js/ai.js                      Computergegner + Schwierigkeitsstufen
js/race.js                    Rennablauf, Kamera, Schatten, Minimap, HUD
js/showroom.js                Drehbühne in der Garage
js/input.js, sfx.js           Eingabe, Sounds (WebAudio)
js/autopilot.js               Referenzzeit für die Sterne
tools/sim.mjs                 `npm run sim [easy|medium|hard|pro]`: Testfahrten aller Typ/Strecken-Kombis
tools/bikeview.html           Entwickler-Ansicht des Radmodells
```

## Anpassen

- Neue Marke / echte Markennamen: `BRANDS` in `js/bikedata.js`. Neue Teile: `PARTS`. Neue Strecke: Eintrag in `js/maps.js` kopieren, dann `npm run sim`.
- Tempo/Gefühl: `js/physics.js` (Konstanten) und Basiswerte in `CATEGORIES`.

## GitLab Pages

`.gitlab-ci.yml` kopiert die statischen Dateien nach `public/`. Nach dem Push auf den Default-Branch ist das Spiel unter der Pages-URL erreichbar (Settings → Pages).
