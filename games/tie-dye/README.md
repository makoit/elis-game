# 🌀 Elaras Tie-Dye Studio

Batik-Werkstatt für Kinder, angelehnt an „Tie Dye“ von Crazy Labs. Reines 2D-Canvas, keine Bilddateien, läuft offline.

## Ablauf

1. **Kleidungsstück** wählen: T-Shirt, Kleid, Socke – später Pulli, Tasche, Kissen
2. **Technik** wählen: Spirale, Kreise, Knautsch – später Streifen, Herz, Stern
3. **Falten** per Geste: im Kreis drehen (Spirale), hochziehen (Kreise/Herz/Stern), hoch-runter wischen (Streifen), reiben/tippen (Knautsch).
   Bei Spirale & Co. lässt sich der Mittelpunkt (📍) vorher verschieben.
4. **Binden**: aufs Bündel tippen setzt Gummibänder (↺ nimmt das letzte weg)
5. **Färben**: Farbflasche wählen und aufs Bündel malen. Die Farbe bleibt im angefangenen Abschnitt zwischen zwei Gummis.
6. **Aufmachen**: Gummis antippen zum Aufschneiden – der Stoff entfaltet sich mit dem Muster.

**Mein Laden**: Tier-Kunden wünschen sich ein Teil (Kleidungsstück, Technik, Farben) – bis zu 3 ⭐ je nachdem, wie gut es passt.
**Frei gestalten** gibt 1 ⭐. Sterne schalten Kleidungsstücke, Techniken und Farben frei (`need` in `data.js`/`pattern.js`).
**Mein Schrank** zeigt die letzten 30 Werke (localStorage `elis.tiedye.*`).

## Dateien

```
js/main.js       Bildschirme, Laden/Kunden, Sterne, Schrank
js/workshop.js   Werkbank-Leinwand: Falten, Binden, Färben, Aufmachen (Eingabe + Zeichnen)
js/pattern.js    Muster-Mathematik: Falttechniken, Farbkarte, Gummiband-Linien, Stoff-Textur
js/data.js       Kleidungsstücke (SVG-Pfade 400×400), Farben, Kunden, drawGarment()
js/sfx.js        Geräusche per WebAudio
```

## Wie das Muster entsteht

Gefärbt wird auf dem **Bündel** (Farbkarte 160×160). Jede Technik ist eine Abbildung Stoffpunkt → Bündelpunkt
(`makeMapper`): bei der Spirale wird der Winkel um den Mittelpunkt mit dem Abstand verdreht, bei Kreisen/Herz/Stern wird der
(form-abhängige) Abstand zur Position entlang der Rolle, bei Streifen die Höhe, bei Knautsch ein verwirbeltes Rauschfeld.
Beim Aufmachen holt sich jeder Stoffpixel seine Farbe aus dem Bündel; Gummibänder lassen weiße Linien (`renderFabric`).

Neues Kleidungsstück: Eintrag in `GARMENTS` mit Umriss (`path`), Nähten (`details`, `~` = gestrichelt), `center` und `box` (Rahmen 0..1).
