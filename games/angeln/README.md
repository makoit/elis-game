# Elis Angel-Abenteuer 🎣

Ein Angelspiel im Browser mit [Three.js](https://threejs.org/) (v0.160 aus `../../vendor/`, kein Build). Teil von **Elis Spiele** (Hub im Repo-Root).
Für Laptop (Tastatur/Maus) und Tablet (Touch). Offline spielbar über den gemeinsamen Service Worker.

## Spielmodi

| Modus | Worum geht's |
|---|---|
| 🏆 **Karriere** | Start mit Posenrute, Wurm und Brot und 150 Talern. Fische verkaufen bringt Taler, zurücksetzen bringt 1,5× Erfahrung. Mit jeder Stufe werden neue Gewässer frei (Gardasee 1 · Bodensee 2 · Donau 3 · Ostsee 4 · Po 6 · Norwegen 8). In der Garage kauft man Ruten und Köder. Ziel: alle 14 Arten im **Fangbuch**. |
| ⏱️ **Turnier** | 5 Minuten am gewählten Platz gegen 3 Computer-Angler (Opa Heinz, Lena, Kapitän Jo). Es zählt das Gesamtgewicht. |
| 🌅 **Freies Angeln** | Alles freigeschaltet, eigenes Fangbuch. |

## Der Angel-Ablauf

Oben im Bild zeigt eine **Schritt-Leiste** immer, was gerade dran ist (🎯 Zielen → 🎣 Auswerfen → ⏳ Warten → ❗ Anschlagen → 💪 Drillen → 🥅 Keschern),
darunter steht in einem Satz, was zu tun ist. ❓ öffnet die bebilderte Anleitung (kommt beim ersten Angeln automatisch).

1. **Zielen** mit ◀ ▶ oder Wischen – der gelbe Ring auf dem Wasser zeigt den Landepunkt.
2. **Auswerfen**: großen Knopf **halten** (Rute holt aus, Ring und „Wurfweite“ wandern hinaus), **loslassen** = Wurf.
3. **Warten**: Pose wackelt erst (Zupfen – nicht drücken!). Spinnrute: Knopf halten = Köder einholen.
4. **Anschlagen**: Knopf wird rot („JETZT TIPPEN!“) → tippen.
5. **Drillen**: Knopf grün = halten und kurbeln; Knopf rot „LOSLASSEN!“ bei Flucht oder zu hoher Spannung. Blinkt ◀ oder ▶: diese Richtung halten.
6. **Keschern**: automatisch, danach Fangfoto (der Angler hält den Fisch) – behalten oder zurücksetzen.

Ob etwas beißt, hängt ab von Fischbestand, Köder, Tiefe, Tageszeit und Wurfweite. Vom Boot zeigt das **Echolot**, wo Fische stehen.

| Aktion | Tastatur | Touch |
|---|---|---|
| Zielen / im Drill gegenhalten | ← → / A D | ◀ ▶ oder Wischen |
| Ausholen & Werfen, Anschlagen, Kurbeln | Leertaste / ↑ | großer runder Knopf |
| Einholen ohne Biss | R | ⤺ Einholen |
| Ausrüstung | M | Ausrüstungs-Chip |
| Pause | Esc / P | ⏸ |

## Grafik

- **Gelände**: echte Höhendaten (AWS Terrain Tiles, Mapzen/SRTM) je Platz, 2,5 km fein + 24 km grob, Landnutzung aus OpenStreetMap
  (Wald, Wein, Obst/Oliven, Orte, Fels, Strand, Acker, Feuchtgebiet) als Foto-Textur-Mischung, Gebäude aus OSM-Grundrissen (`tools/terrain.py`).
- **Himmel & Licht**: HDRI-Fotos von Poly Haven je Tageszeit (Hintergrund + Umgebungslicht, Sonnenrichtung aus dem Bild).
- **Wasser**: Spiegelung mit `three/addons/objects/Water.js` (Grafik „Niedrig“: nur Himmelsspiegelung, schneller).
- **Bäume**: Fichte, Laubbaum, Birke, Pappel, Zypresse, Olive, Weinstock aus Foto-Zweigkarten (`tools/foliage.py`), instanziert; Schilf am Ufer.
- **Angler**: Ready-Player-Me-Modell mit Skelett; Jacken/Weste/Wathose als Hüllen, Farben frei wählbar, Fischerhut, Gummistiefel und Schwimmweste
  (auf dem Boot) von Poly Haven; Arme greifen per IK an Griff und Kurbel, beim Fangfoto halten beide Hände den Fisch.
- **Ausrüstung**: Ruten mit Kork-/EVA-Griff, Rollenhalter, Ringen (Schnur läuft durch alle Ringe), Stationär- bzw. Fliegenrolle mit drehender Kurbel,
  Balsa-Pose mit Leuchtantenne, Spinner/Blinker/Wobbler/Gummifisch/Fliege, GFK-Boot mit Außenborder.
- **Fische**: gemalte Haut-Texturen (artgerechte Muster, Seitenlinie, Schuppen-Normalmap, nasser Glanz), durchscheinende Flossen.

Assets neu laden/erzeugen (Python mit numpy, pillow, opencv-python-headless):
`python3 tools/fetch_assets.py` (Himmel, Texturen, Modelle), `python3 tools/foliage.py` (Zweigkarten), `python3 tools/terrain.py` (Gelände).
Lizenzen: Poly Haven CC0; Höhendaten AWS Terrain Tiles (Quellenangaben siehe tools/terrain.py); Karten- und Landnutzungsdaten © OpenStreetMap-Mitwirkende (ODbL);
Angler-Modell Ready Player Me (aus deren Unity-SDK-Beispielen, Nutzung nach den Ready-Player-Me-Bedingungen); `waternormals.jpg` aus den three.js-Beispielen (MIT).

## Gewässer und Plätze

Die Karten zeigen echte Uferlinien und Flussläufe aus **OpenStreetMap** (© OpenStreetMap-Mitwirkende, ODbL), vereinfacht in `js/geo.js`.
Die Uferplätze liegen genau auf der echten Uferlinie.

| Gewässer | Plätze | Fische |
|---|---|---|
| Gardasee 🇮🇹 | Sarca-Mündung (Torbole), Hafenmole Malcesine, Schilf bei Sirmione, Mincio-Ausfluss (Peschiera), 🚤 Seemitte vor Torri | Seeforelle, Barsch, Hecht, Karpfen, Döbel, Aal, Wels |
| Bodensee 🇩🇪🇦🇹🇨🇭 | Seerhein Konstanz, Schilfgürtel Reichenau, Argenmündung, Hafen Lindau, 🚤 Überlinger See | Äsche, Barsch, Hecht, Zander, Karpfen, Seeforelle, Seesaibling, Wels, Aal |
| Donau – Wachau 🇦🇹 | Buhne Dürnstein, Hafen Spitz, Kremsmündung, 🚤 Strommitte Weißenkirchen | Nase, Döbel, Zander, Wels, Barsch, Äsche, Sterlet (Stör) |
| Ostsee – Fehmarn 🇩🇪 | Fehmarnsundbrücke, Steinküste Staberhuk, Mole Burgtiefe, 🚤 Fehmarnbelt | Scholle, Meerforelle, Aal |
| Po-Ebene 🇮🇹 | Hafen Boretto, Sandbank Guastalla, 🚤 Wels-Gumpe | Wels, Karpfen, Zander, Stör |
| Gaula – Norwegen 🇳🇴 | Gaulfossen, Pool bei Støren, Melhus | Lachs, Meerforelle, Äsche |

## Ausrüstung

**Ruten:** Posenrute (Start), Barsch-Spinnrute, Feederrute, Hecht-Spinnrute, Fliegenrute, Brandungsrute, Karpfenrute, Wallerrute.
Jede Rute hat Technik, Schnur-Tragkraft, Wurfweite und Schnurvorrat.
**Köder:** Tauwurm, Maden, Mais, Brotflocke, Forellenteig, Boilie, Heilbutt-Pellet, Köderfisch, Wattwurm, Spinner, Blinker, Wobbler, Gummifisch, Trockenfliege, Nymphe.
**Angler:** Hautton, Kurzhaar/Glatze, Haarfarbe, Fischerhut/Basecap/Mütze, Regenjacke/Anglerweste/Softshell/Hoodie/Fleece/T-Shirt, Jeans/Cargo/Wathose
(mit Gummistiefeln), Farben, Polbrille. Alles wird gespeichert.

## Struktur (relativ zu `games/angeln/`)

```
index.html, css/style.css   Menüs, Garage, Karte, HUD mit Schritt-Leiste, Anleitung, Dialoge
js/main.js                  Zustand/Speicher, Menüs, Garage-Shop, Karriere, Turnier, Fangbuch, Eingabe, Game Loop
js/data.js                  Fische, Ruten, Köder, Angler-Look, Biss- und Gewichtsberechnung (rein)
js/spots.js                 Gewässer und Plätze (echte Koordinaten), Fischbestand, Szenen-Look
js/geo.js                   Uferlinien/Flussläufe für die 2D-Karte (OSM, erzeugt)
js/worldmap.js              2D-Karte mit Orten und Platz-Pins
js/terrain.js, terrainmeta.js  echtes Gelände je Platz laden, Geometrie, Baumstandorte, Gebäude (Daten in assets/terrain/)
js/scene.js                 3D-Angelplatz: HDRI-Himmel, Licht, Gelände-Shader, Wasser, Pflanzen, Steg/Felsen/Boot, Kamera; Garage-Schaufenster
js/flora.js                 Bäume und Schilf aus Foto-Zweigkarten (instanziert)
js/angler.js                Angler (Skelett, Kleidung, IK-Pose), Ruten, Rollen, Schnurführung
js/tackle.js                Pose, Kunstköder, Boot
js/fishing.js               Angel-Ablauf als Zustandsmaschine (Wurf, Biss, Anschlag, Drill, Kescher, Fangfoto)
js/fishmodel.js             Fische (14 Arten) mit gemalter Haut
js/sfx.js                   Geräusche und Naturkulisse (WebAudio)
assets/                     sky/ (HDRI + JPG), textures/, models/ (GLB), terrain/ (Höhen + Landnutzung)
tools/                      fetch_assets.py, foliage.py, terrain.py; pose.html, fish.html, viewer.html (Entwickler-Ansichten)
```

## Anpassen

- Neue Fischart: `FISH` in `js/data.js` (Gewicht, Köder, Tageszeit, Look), dann in `fish` eines Platzes in `js/spots.js` eintragen.
- Neuer Platz: Eintrag in `spots` des Gewässers, dann `python3 tools/terrain.py` für das Gelände. Ohne Geländedaten steht der Angler automatisch auf einem Steg.
- Balance: Bissrate in `biteTable` (`data.js`), Drill-Konstanten in `updateFight` (`fishing.js`).

## Debug

`?go&mode=free&water=po&spot=po-boot&time=3&rod=waller&bait=pellet` startet direkt am Platz (`time` 0–3 = Morgen/Mittag/Abend/Nacht).
`&demo=fight:wels` springt in den Drill, `&demo=catch:hecht` aufs Fangfoto, `&tdbg` färbt das Gelände nach Landnutzung. `&bot` spielt selbst, `&dbg` loggt Kamera und Zustand, `?touch=1` zeigt die Touch-Bedienung, `?q=low|mid|high` setzt die Grafik.
`?screen=garage` oder `?screen=map` öffnet direkt diese Seite.
