"""Lädt die Foto-Assets fürs Bike Race von Poly Haven (alles CC0) und bereitet sie fürs Web (Tablet) auf.

Aufruf (braucht numpy, pillow, opencv-python-headless und node/npx für gltf-transform):
    python3 games/bike-race/tools/fetch_assets.py            # alles
    python3 games/bike-race/tools/fetch_assets.py skies      # nur Himmel
    python3 games/bike-race/tools/fetch_assets.py models     # nur Modelle

- Himmel je Strecke: 2k-JPG (getonemappt) als Hintergrund + kleines, normiertes HDR fürs Umgebungslicht
  (Sonne gekappt, weil die Sonne als DirectionalLight dazukommt) + Sonnenrichtung/Horizontfarbe in sky.json
- Modelle (Felsen, Baumstämme, Stümpfe, Fässer …): glTF 1k -> Texturen auf 512 px, Geometrie mit
  meshoptimizer vereinfacht (gltf-transform), als GLB
Der Fahrer nutzt das Angler-Modell aus games/angeln/assets/models/angler.glb (wird nicht kopiert).
Downloads liegen im Cache-Ordner (CACHE), nur die fertigen Dateien landen in assets/.
"""
import io, json, os, shutil, subprocess, sys
import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets')
CACHE = os.environ.get('ASSET_CACHE', '/tmp/bike-asset-cache')
GLTF_TRANSFORM = ['npx', '-y', '@gltf-transform/cli@4.1.1']
os.makedirs(CACHE, exist_ok=True)


def get(url, sub=''):
    d = os.path.join(CACHE, sub)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, url.split('/')[-1])
    if not os.path.exists(path):
        print('lade', url)
        subprocess.run(['curl', '-sfL', '-m', '300', '-A', 'elis-game-assets', '-o', path, url], check=True)
    return path


def api(path):
    out = subprocess.run(['curl', '-sfL', '-m', '60', '-A', 'elis-game-assets', 'https://api.polyhaven.com/' + path], check=True, capture_output=True)
    return json.loads(out.stdout)


# ---- Himmel (Strecken-id -> Poly-Haven-HDRI) ----
SKIES = {
    'wiese': 'kloofendal_48d_partly_cloudy_puresky',
    'kueste': 'kloofendal_43d_clear_puresky',
    'wald': 'kloppenheim_05_puresky',
    'canyon': 'qwantani_late_afternoon_puresky',
    'bikepark': 'qwantani_sunset_puresky',
    'pumptrack': 'kloppenheim_02_puresky',
    'weinberg': 'citrus_orchard_puresky',
    'gardasee': 'pizzo_pernice_puresky',
}
# Belichtung des Hintergrunds je Himmel (Sonnenuntergang satter, Dunst weniger hell)
EXPOSE = {'pumptrack': 0.35, 'bikepark': 0.5, 'canyon': 0.8, 'kueste': 0.85, 'weinberg': 0.9}


def aces(c):
    a, b, cc, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    c = np.clip((c * (a * c + b)) / (c * (cc * c + d) + e), 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def skies():
    os.makedirs(os.path.join(OUT, 'sky'), exist_ok=True)
    meta = {}
    for key, name in SKIES.items():
        files = api('files/' + name)['hdri']
        hdr = get(files['2k']['hdr']['url'], 'hdri')
        img = cv2.imread(hdr, cv2.IMREAD_ANYDEPTH | cv2.IMREAD_COLOR)[:, :, ::-1].astype(np.float32)  # RGB, linear
        h, w, _ = img.shape
        lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        # Sonne/Mond = hellster Fleck (leicht geglättet), nur obere Hälfte
        blur = cv2.GaussianBlur(lum, (0, 0), 3)
        blur[h // 2:] = 0
        y, x = np.unravel_index(np.argmax(blur), blur.shape)
        sky = lum[: h // 2]
        med = float(np.median(sky))
        # Hintergrund: Median auf ~0.2 (kräftiges Blau statt Dunst), ACES, sRGB
        exposure = 0.2 / max(1e-4, med) * EXPOSE.get(key, 1)
        out = (np.clip(aces(img * exposure), 0, 1) * 255 + 0.5).astype(np.uint8)
        Image.fromarray(out).save(os.path.join(OUT, 'sky', key + '.jpg'), quality=85, optimize=True, progressive=True)
        # Horizontfarbe (knapp über dem Horizont, ohne Sonnenseite) für Nebel/Dunst
        band = out[int(h * 0.44):int(h * 0.49)].reshape(-1, 3).astype(np.float32)
        horizon = np.median(band, axis=0)
        # Umgebungslicht: Median des Himmels -> 0.6, Sonne bei 25 gekappt, 512x256
        env = img * (0.6 / max(1e-4, med))
        env = np.minimum(env, 25.0)
        env = cv2.resize(env, (512, 256), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(OUT, 'sky', key + '.hdr'), env[:, :, ::-1].astype(np.float32))
        el = (0.5 - (y + 0.5) / h) * np.pi
        meta[key] = {'source': name, 'u': round(float(x / w), 4), 'elevation': round(float(np.degrees(el)), 2),
                     'horizon': '#%02x%02x%02x' % tuple(int(v) for v in horizon)}
        print(key, meta[key])
    json.dump(meta, open(os.path.join(OUT, 'sky', 'sky.json'), 'w'), indent=1)


# ---- Modelle: Name -> (Poly-Haven-Asset, Anteil der Vertices, der bleibt) ----
# Sets (mehrere Einzelteile) werden nicht zusammengefügt, das Spiel wählt einzelne Teile aus.
SETS = {'rock_moss'}
MODELS = {
    'rock_a': ('rock_07', 0.06),
    'rock_b': ('rock_09', 0.06),
    'rock_moss': ('rock_moss_set_01', 0.08),
    'log': ('dead_tree_trunk', 0.02),
    'stump': ('tree_stump_01', 0.05),
    'tyre': ('old_tyre', 0.5),
    'wine_barrel': ('wine_barrel_01', 0.25),
    'fern': ('fern_02', 0.4),
}


def models(size=512):
    os.makedirs(os.path.join(OUT, 'models'), exist_ok=True)
    for out_name, (name, ratio) in MODELS.items():
        g = api('files/' + name)['gltf']['1k']['gltf']
        work = os.path.join(CACHE, 'gltf', name)
        os.makedirs(work, exist_ok=True)
        src = os.path.join(work, name + '.gltf')
        if not os.path.exists(src):
            shutil.copy(get(g['url'], 'dl/' + name), src)
        for rel, v in g['include'].items():
            dst = os.path.join(work, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if not os.path.exists(dst):
                p = get(v['url'], 'dl/' + name)
                if rel.lower().endswith(('.jpg', '.jpeg', '.png')):
                    im = Image.open(p)
                    im.resize((min(size, im.width), min(size, im.height)), Image.LANCZOS).save(dst, quality=84)
                else:
                    shutil.copy(p, dst)
        out = os.path.join(OUT, 'models', out_name + '.glb')
        subprocess.run(GLTF_TRANSFORM + ['optimize', src, out, '--compress', 'false', '--texture-compress', 'false',
                                         '--instance', 'false', '--palette', 'false', '--flatten', 'true', '--join', 'false' if out_name in SETS else 'true',
                                         '--simplify-ratio', str(ratio), '--simplify-error', '0.004'], check=True, capture_output=True)
        print('glb', out_name, name, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    what = sys.argv[1:] or ['skies', 'models']
    if 'skies' in what:
        skies()
    if 'models' in what:
        models()
