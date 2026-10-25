# Elis Game

Ein Browser-Spiel mit [Three.js](https://threejs.org/) (v0.160, per Import-Map vom CDN geladen – kein Build nötig).

## Struktur

```
├── index.html        # Einstiegspunkt, Import-Map für Three.js
├── js/
│   └── main.js       # Szene, Kamera, Game Loop
├── assets/
│   ├── models/       # 3D-Modelle (.glb / .gltf)
│   ├── textures/     # Texturen (.png / .jpg)
│   └── sounds/       # Sounds (.mp3 / .ogg)
└── README.md
```

## Starten

ES-Module funktionieren nicht über `file://`, daher einen lokalen Server starten:

```bash
npx serve .
# oder
python3 -m http.server 8000
```

Dann im Browser `http://localhost:8000` öffnen.
