# Elis Bike Race 🚲

Ein Fahrrad-Rennspiel im Browser mit [Three.js](https://threejs.org/) (v0.160, per Import-Map vom CDN – kein Build nötig).
Gedacht für Laptop (Tastatur) und Tablet (Touch, z. B. Amazon Fire Kids).

## Spielen

1. **Rad wählen** – Trailfuchs (MTB Trail), Bergbezwinger (MTB Downhill), Blitzpfeil (Rennrad), Allrounder (Gravel); Farbe frei wählbar.
2. **Strecke wählen** – Wiesenpfad ★, Küstenstraße ★★, Waldtrail ★★, Canyon-Abfahrt ★★★.
3. **Rennen fahren** – Schanzen, Felsen (bremsen aus), gelbe Boost-Felder. Am Ziel gibt es 1–3 Sterne; Bestzeiten werden im Browser gespeichert.

| Aktion | Tastatur | Touch |
|---|---|---|
| Gas | ↑ / W / Leertaste | grüner GAS-Button |
| Bremse | ↓ / S / Shift | roter BREMSE-Button |
| Lenken | ← → / A D | ◀ ▶ Buttons |
| Pause / Neustart | Esc oder P / R | ⏸-Button |

„Auto-Gas“ (Strecken-Auswahl) lässt das Rad von allein treten – gut für kleine Fahrer.

## Starten

ES-Module funktionieren nicht über `file://`, daher einen lokalen Server starten:

```bash
npm start            # = npx serve .
# oder
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Touch-Buttons am Laptop testen: `?touch=1` anhängen.
Debug-Parameter: `?start&bike=2&map=1` (direkt ins Rennen), `&autogas`, `&warp=20` (Zeit vorspulen).

## Struktur

```
index.html, css/style.css     UI (Menüs, HUD, Touch-Buttons)
js/main.js                    Menüs, Zustände, Game Loop
js/bikedata.js, bikes.js      Rad-Werte / prozedurales 3D-Modell
js/maps.js                    Strecken (hier neue Strecken ergänzen!)
js/trackdata.js               Streckenmathematik: Kurven, Höhenprofil, Schanzen, Hindernisse
js/trackmesh.js               3D-Gelände, Bäume, Felsen, Boost-Felder, Start/Ziel
js/physics.js                 Fahrphysik (Gas, Gefälle, Sprünge, Landung)
js/race.js                    Rennablauf, Kamera, HUD
js/showroom.js                Drehbühne für die Radauswahl
js/input.js, sfx.js           Eingabe, Sounds (WebAudio)
js/autopilot.js               Referenzzeit für die Sterne
tools/sim.mjs                 `npm run sim`: Autopilot-Testfahrten aller Rad/Strecken-Kombis
```

## Neue Strecke bauen

In `js/maps.js` einen Eintrag kopieren und anpassen: `curves` (Kurven), `hills` (Hügel), `trend` (Gefälle),
`ramps` (Schanzen mit Position/Höhe/Steigung), `rocks`/`pads` (Dichte), Farben. Danach `npm run sim`.

## GitLab Pages

`.gitlab-ci.yml` kopiert die statischen Dateien nach `public/`. Nach dem Push auf den Default-Branch
ist das Spiel unter der Pages-URL des Projekts erreichbar (Settings → Pages).
