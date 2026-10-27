"""Lädt die Foto-Assets fürs Angelspiel von Poly Haven (alles CC0) und bereitet sie fürs Web auf.

Aufruf (braucht numpy, pillow, opencv-python-headless):
    python3 games/angeln/tools/fetch_assets.py

- HDRIs je Tageszeit: 1k-.hdr fürs Licht (RGBELoader) + getonemapptes 2k-JPG als Himmel + Sonnenrichtung in sky.json
- Texturen 1k (Farbe + Normalmap) für Gelände, Steg, Boot
- Blatt-/Nadel-Texturen (mit Alpha) für die Bäume
Downloads werden im Cache-Ordner (CACHE) gehalten, nur die fertigen Dateien landen in assets/.
"""
import io, json, os, subprocess, sys
import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets')
CACHE = os.environ.get('ASSET_CACHE', '/tmp/angeln-asset-cache')
os.makedirs(CACHE, exist_ok=True)

def get(url):
    path = os.path.join(CACHE, url.split('/')[-1])
    if not os.path.exists(path):
        print('lade', url)
        subprocess.run(['curl', '-sfL', '-m', '300', '-A', 'elis-game-assets', '-o', path, url], check=True)  # curl: nutzt die System-Zertifikate
    return path

def api(path):
    out = subprocess.run(['curl', '-sfL', '-m', '60', '-A', 'elis-game-assets', 'https://api.polyhaven.com/' + path], check=True, capture_output=True)
    return json.loads(out.stdout)

# ---- Himmel ----
SKIES = {'morning': 'hilly_terrain_01_puresky', 'noon': 'kloofendal_48d_partly_cloudy_puresky', 'evening': 'evening_road_01_puresky', 'night': 'qwantani_moonrise_puresky'}
def skies():
    os.makedirs(os.path.join(OUT, 'sky'), exist_ok=True)
    meta = {}
    for key, name in SKIES.items():
        files = api('files/' + name)['hdri']
        hdr1 = get(files['1k']['hdr']['url'])
        hdr2 = get(files['2k']['hdr']['url'])
        img = cv2.imread(hdr2, cv2.IMREAD_ANYDEPTH | cv2.IMREAD_COLOR)[:, :, ::-1].astype(np.float32)  # RGB, linear
        h, w, _ = img.shape
        lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        # Sonne/Mond = hellster Fleck (leicht geglättet)
        blur = cv2.GaussianBlur(lum, (0, 0), 3)
        y, x = np.unravel_index(np.argmax(blur), blur.shape)
        az = (x / w) * 2 * np.pi  # equirect: u=0 -> -z ... wird im Spiel so interpretiert wie bei three.js
        el = (0.5 - (y + 0.5) / h) * np.pi
        # Belichtung: Median des Himmels auf ~0.2 bringen (kräftiges Blau statt Dunst), dann ACES-Filmic, sRGB
        sky = lum[: h // 2]
        exposure = 0.2 / max(1e-4, float(np.median(sky)))
        if key == 'night':
            exposure *= 0.3
        c = img * exposure
        a, b, cc, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
        c = np.clip((c * (a * c + b)) / (c * (cc * c + d) + e), 0, 1)
        c = np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)
        out = (np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8)
        Image.fromarray(out).save(os.path.join(OUT, 'sky', key + '.jpg'), quality=86, optimize=True, progressive=True)
        with open(hdr1, 'rb') as f, open(os.path.join(OUT, 'sky', key + '.hdr'), 'wb') as g:
            g.write(f.read())
        meta[key] = {'source': name, 'u': round(float(x / w), 4), 'v': round(float((y + 0.5) / h), 4), 'elevation': round(float(np.degrees(el)), 2),
                     'exposure': round(float(exposure), 4), 'sunLum': round(float(blur[y, x]), 1)}
        print(key, meta[key])
    json.dump(meta, open(os.path.join(OUT, 'sky', 'sky.json'), 'w'), indent=1)

# ---- Texturen ----
TEX = {
    'grass': 'leafy_grass', 'meadow': 'sparse_grass', 'forest': 'forest_leaves_02', 'rock': 'rock_face_03', 'cliff': 'aerial_rocks_02',
    'sand': 'coast_sand_01', 'pebbles': 'river_small_rocks', 'mud': 'brown_mud_leaves_01', 'snow': 'snow_02',
    'vineyard': 'grass_ground', 'planks': 'weathered_planks', 'bark': 'pine_bark', 'farmland': 'dirt_aerial_02',
}
def textures():
    os.makedirs(os.path.join(OUT, 'textures'), exist_ok=True)
    for key, name in TEX.items():
        files = api('files/' + name)
        for kind, out in (('Diffuse', 'diff'), ('nor_gl', 'nor')):
            url = files[kind]['1k']['jpg']['url']
            p = get(url)
            Image.open(p).convert('RGB').resize((1024, 1024)).save(os.path.join(OUT, 'textures', f'{key}_{out}.jpg'), quality=82, optimize=True)
        print('tex', key, name)

# ---- Baum-Blätter (Alpha aus der Maske/Alpha-Map) ----
LEAVES = {'fir': ('fir_tree_01', 'twig'), 'leaf': ('island_tree_02', None)}
def leaves():
    os.makedirs(os.path.join(OUT, 'textures'), exist_ok=True)
    for key, (model, part) in LEAVES.items():
        files = api('files/' + model)
        names = [k for k in files if k not in ('blend', 'fbx', 'gltf', 'usd')]
        part = part or next((n.split('_')[0] for n in names if n.endswith('_alpha')), None)
        diff = get(files[f'{part}_diff']['1k']['jpg']['url'])
        alpha_key = f'{part}_alpha' if f'{part}_alpha' in files else f'{part}_mask'
        alpha = get(files[alpha_key]['1k']['jpg']['url'] if 'jpg' in files[alpha_key]['1k'] else files[alpha_key]['1k']['png']['url'])
        d = Image.open(diff).convert('RGB').resize((1024, 1024))
        a = Image.open(alpha).convert('L').resize((1024, 1024))
        d.putalpha(a)
        d.save(os.path.join(OUT, 'textures', f'{key}_leaves.png'), optimize=True)
        print('leaves', key, model, part, alpha_key)


# ---- Modelle (glTF 1k -> GLB mit 512er-Texturen) ----
MODELS = ['fishermans_hat', 'rubber_boots', 'life_jacket', 'modular_wooden_pier', 'rock_moss_set_01',
          'wooden_bucket_01', 'folding_wooden_stool', 'Lantern_01']
def models(size=512):
    import struct
    os.makedirs(os.path.join(OUT, 'models'), exist_ok=True)
    for name in MODELS:
        g = api('files/' + name)['gltf']['1k']['gltf']
        gl = json.load(open(get(g['url'])))
        files = {k: get(v['url']) for k, v in g['include'].items()}
        binblob = bytearray(open(files[next(k for k in files if k.endswith('.bin'))], 'rb').read())
        def pad(b, c=b'\0'):
            while len(b) % 4: b += c
            return b
        binblob = pad(binblob)
        views = gl['bufferViews']
        for img in gl.get('images', []):
            src = files[img.pop('uri')]
            im = Image.open(src)
            alpha = im.mode in ('RGBA', 'LA') and np.array(im.convert('RGBA'))[:, :, 3].min() < 250
            im = im.convert('RGBA' if alpha else 'RGB').resize((size, size), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, 'PNG' if alpha else 'JPEG', quality=84)
            data = buf.getvalue()
            views.append({'buffer': 0, 'byteOffset': len(binblob), 'byteLength': len(data)})
            img['bufferView'] = len(views) - 1
            img['mimeType'] = 'image/png' if alpha else 'image/jpeg'
            binblob = pad(binblob + data)
        gl['buffers'] = [{'byteLength': len(binblob)}]
        js = pad(bytearray(json.dumps(gl, separators=(',', ':')).encode()), b' ')
        total = 12 + 8 + len(js) + 8 + len(binblob)
        with open(os.path.join(OUT, 'models', name + '.glb'), 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, total))
            f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
            f.write(struct.pack('<II', len(binblob), 0x004E4942)); f.write(binblob)
        print('glb', name, total // 1024, 'KB')


if __name__ == '__main__':
    what = sys.argv[1:] or ['skies', 'textures', 'leaves', 'models']
    for w in what:
        globals()[w]()
