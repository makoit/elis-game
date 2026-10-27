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

1. **Montage** (Garage oder im Spiel über *Ausrüstung* / `M`): Rute → Technik, Köder, bei der Posenrute die Tiefe (Flach/Mittel/Grund), Bremse (weich/mittel/fest).
2. **Zielen** mit ◀ ▶ (oder Wischen), **Auswerfen**: Taste halten, die Kraft pendelt, loslassen. Ganz rechts im roten Bereich gibt es eine **Perücke** (Schnur verheddert, kurze Pause; mit Anfänger-Hilfe aus).
3. **Warten**, je nach Technik:
   - *Pose*: erst zupft es (nicht anschlagen!), dann taucht die Pose ab → **anschlagen**.
   - *Grund*: Rutenspitze ruckt, das Glöckchen bimmelt → anschlagen.
   - *Spinnfischen*: Köder durch Halten aktiv einkurbeln, bei einem Ruck loslassen und neu antippen.
   - *Fliege*: die Fliege treibt mit der Strömung, beim Zuschnappen sofort anschlagen.
4. **Drill**: Kurbeln halten holt den Fisch heran und erhöht die Spannung. Steht die Spannung zu lange im roten Bereich, reißt die Schnur. Bei **Fluchten** loslassen. Mit ◀ ▶ gegen die Schwimmrichtung halten, so ermüdet der Fisch schneller. Bleibt die Schnur zu lange locker, schlitzt der Fisch aus. Springende Fische (Lachs, Forelle, Hecht) schlitzen bei hoher Spannung leicht aus. Ist die Rolle leer, ist der Fisch weg.
5. **Fang**: Fangfoto mit Gewicht und Länge, Infotext. Fische unter dem **Schonmaß** und der **Stör** (streng geschützt) müssen zurück.

Ob etwas beißt, hängt ab vom Fischbestand am Platz, vom Köder (jede Art hat Lieblingsköder), von der Tiefe, von der Tageszeit (Aal, Zander und Wels nachts) und von der Wurfweite. Vom Boot zeigt das **Echolot**, in welcher Tiefe Fische stehen.

| Aktion | Tastatur | Touch |
|---|---|---|
| Zielen / Rute zur Seite | ← → / A D | ◀ ▶ oder über das Bild wischen |
| Auswerfen, Anschlagen, Kurbeln | Leertaste / ↑ (halten) | großer runder Knopf |
| Einholen ohne Biss | R | ⤺ Einholen |
| Ausrüstung | M | Ausrüstungs-Chip oben |
| Pause | Esc / P | ⏸ |

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
**Angler:** Hautton, Frisur, Haarfarbe, Kopfbedeckung, Oberteil, Hose und Farben, Polbrille, Bart. Alles wird gespeichert.

## Struktur (relativ zu `games/angeln/`)

```
index.html, css/style.css   Menüs, Garage, Karte, HUD, Dialoge
js/main.js                  Zustand/Speicher, Menüs, Garage-Shop, Karriere, Turnier, Fangbuch, Eingabe, Game Loop
js/data.js                  Fische, Ruten, Köder, Angler-Look, Biss- und Gewichtsberechnung (rein)
js/spots.js                 Gewässer und Plätze (echte Koordinaten), Fischbestand, Szenen-Look
js/geo.js                   Uferlinien/Flussläufe aus OpenStreetMap (erzeugt, nicht von Hand ändern)
js/worldmap.js              2D-Karte mit Orten und Platz-Pins (Canvas)
js/scene.js                 3D-Angelplatz: Himmel je Tageszeit, Wasser-Shader, Ufer/Boot, Berge, Wahrzeichen; Schaufenster
js/fishing.js               Angel-Ablauf als Zustandsmaschine (Wurf, Biss, Anschlag, Drill, Kescher)
js/fishmodel.js             prozedurale 3D-Fische (14 Arten)
js/angler.js                Angler-Figur, Ruten-Modelle, Wurf- und Biegeanimation
js/sfx.js                   Geräusche und Naturkulisse (WebAudio)
```

## Anpassen

- Neue Fischart: `FISH` in `js/data.js` (Gewicht, Köder, Tageszeit, Look), dann in `fish` eines Platzes in `js/spots.js` eintragen.
- Neuer Platz: Eintrag in `spots` des Gewässers. Liegt der Platz am Ufer, die Koordinate auf die Uferlinie setzen.
- Balance: Bissrate in `biteTable` (`data.js`), Drill-Konstanten in `updateFight` (`fishing.js`).

## Debug

`?go&mode=free&water=po&spot=po-boot&time=3&rod=waller&bait=pellet` startet direkt am Platz (`time` 0–3 = Morgen/Mittag/Abend/Nacht).
`&demo=fight:wels` springt in den Drill, `&demo=catch:hecht` aufs Fangfoto. `&bot` spielt selbst, `&dbg` loggt Kamera und Zustand, `?touch=1` zeigt die Touch-Bedienung, `?q=low|mid|high` setzt die Grafik.
`?screen=garage` oder `?screen=map` öffnet direkt diese Seite.
