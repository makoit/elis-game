#!/usr/bin/env python3
"""Echtes Gelände für jeden Angelplatz erzeugen (Höhen, Wasser, Landnutzung, Gebäude).

Aufruf (aus dem Repo-Root):
    node games/angeln/tools/export-spots.mjs > <cache>/spots.json
    python3 games/angeln/tools/terrain.py [spotId ...]

Braucht numpy, pillow, opencv (z. B. in einer venv). Downloads werden in TERRAIN_CACHE gecacht
(Standard: ~/.cache/elis-angeln-terrain), nicht im Repo.

Quellen:
- Höhen: AWS Terrain Tiles (Terrarium, Mapzen/Tilezen; SRTM, EU-DEM, Kartverket u. a.)
- Wasser: Uferlinien/Flüsse aus js/geo.js (OpenStreetMap)
- Landnutzung + Gebäude: OpenStreetMap über Overpass (© OpenStreetMap-Mitwirkende, ODbL)

Koordinaten im Spiel: Ursprung = Platz, +z = Blickrichtung (heading), +x = links vom Angler,
y = Höhe relativ zur Wasseroberfläche (Wasser bei y = 0).

Ausgabe je Platz: assets/terrain/<id>.bin (Layout siehe js/terrain.js), assets/terrain/<id>.json (Gebäude),
dazu js/terrainmeta.js mit Blickrichtung, Wasserspiegel und Standhöhe.
"""
import hashlib
import io
import json
import math
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

import ssl

import cv2
import numpy as np
from PIL import Image

try:  # python.org-Python auf macOS kennt die System-Zertifikate nicht
    import certifi
    SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL = ssl.create_default_context()

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
CACHE = os.environ.get('TERRAIN_CACHE', os.path.expanduser('~/.cache/elis-angeln-terrain'))
OUT = os.path.join(GAME, 'assets', 'terrain')
R = 6371000.0

NEAR_N, NEAR_SIZE, NEAR_Z = 257, 2560.0, 14   # 10 m Raster, Ursprung ist ein Gitterpunkt
FAR_N, FAR_SIZE, FAR_Z = 193, 24000.0, 12     # 125 m Raster
RIVER_W = {'donau': 300, 'po': 350, 'gaula': 70}
UA = 'elis-angeln-terrain/1.0 (family game; martin)'
MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
           'https://maps.mail.ru/osm/tools/overpass/api/interpreter']

# Klassen der Landnutzungsmaske (Bit 7 = Wasser)
MEADOW, FOREST, VINEYARD, ORCHARD, TOWN, ROCK, SAND, FARM, WETLAND = range(9)
WATER_BIT = 128

os.makedirs(CACHE, exist_ok=True)
os.makedirs(OUT, exist_ok=True)


# ---------- Downloads mit Cache ----------
def fetch(url, data=None, tries=6):
    key = hashlib.sha1((url + (data or '')).encode()).hexdigest()
    path = os.path.join(CACHE, key)
    if os.path.exists(path):
        with open(path, 'rb') as f:
            return f.read()
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data.encode() if data else None, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=180, context=SSL) as r:
                body = r.read()
            with open(path, 'wb') as f:
                f.write(body)
            return body
        except Exception as e:  # noqa: BLE001 – Netzfehler einfach wiederholen
            print('  fetch retry', i, url[:80], e, file=sys.stderr)
            time.sleep(3 + i * 5)
    raise RuntimeError('download failed: ' + url)


def overpass(query, mirrors=None):
    key = hashlib.sha1(query.encode()).hexdigest()
    path = os.path.join(CACHE, 'ovp_' + key + '.json')
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    data = 'data=' + urllib.parse.quote(query)
    for i in range(8):
        for url in mirrors or MIRRORS:
            try:
                req = urllib.request.Request(url, data=data.encode(), headers={'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=200, context=SSL) as r:
                    d = json.loads(r.read())
                if 'elements' in d:
                    with open(path, 'w') as f:
                        json.dump(d, f)
                    return d
            except Exception as e:  # noqa: BLE001
                print('  overpass retry', i, url, str(e)[:80], file=sys.stderr)
        time.sleep(10 * (i + 1))
    raise RuntimeError('overpass failed')


# ---------- Höhen (Terrarium-Kacheln) ----------
_tiles = {}


def tile(z, x, y):
    k = (z, x, y)
    if k not in _tiles:
        png = fetch(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png')
        a = np.asarray(Image.open(io.BytesIO(png)).convert('RGB')).astype(np.float64)
        _tiles[k] = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
    return _tiles[k]


def dem(lat, lon, z):
    """Bilinear interpolierte Höhe (m) für Arrays lat/lon."""
    n = 2 ** z * 256
    px = (lon + 180) / 360 * n - 0.5
    lr = np.radians(lat)
    py = (1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / math.pi) / 2 * n - 0.5
    x0, y0 = int(np.floor(px.min())) // 256, int(np.floor(py.min())) // 256
    x1, y1 = int(np.floor(px.max() + 1)) // 256, int(np.floor(py.max() + 1)) // 256
    mos = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256))
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            mos[(ty - y0) * 256:(ty - y0 + 1) * 256, (tx - x0) * 256:(tx - x0 + 1) * 256] = tile(z, tx, ty)
    fx, fy = px - x0 * 256, py - y0 * 256
    ix, iy = np.clip(np.floor(fx).astype(int), 0, mos.shape[1] - 2), np.clip(np.floor(fy).astype(int), 0, mos.shape[0] - 2)
    ax, ay = fx - ix, fy - iy
    return (mos[iy, ix] * (1 - ax) * (1 - ay) + mos[iy, ix + 1] * ax * (1 - ay)
            + mos[iy + 1, ix] * (1 - ax) * ay + mos[iy + 1, ix + 1] * ax * ay)


# ---------- Koordinaten ----------
class Frame:
    """Gedrehtes lokales System um einen Platz: x links, z Blickrichtung."""

    def __init__(self, lat, lon, heading):
        self.lat, self.lon, self.h = lat, lon, heading
        self.k = math.cos(math.radians(lat))
        self.fwd = np.array([math.sin(heading), math.cos(heading)])   # (Ost, Nord)
        self.left = np.array([-math.cos(heading), math.sin(heading)])

    def en_to_game(self, e, n):
        return e * self.left[0] + n * self.left[1], e * self.fwd[0] + n * self.fwd[1]

    def game_to_en(self, x, z):
        return x * self.left[0] + z * self.fwd[0], x * self.left[1] + z * self.fwd[1]

    def latlon_to_game(self, lat, lon):
        e = np.radians(np.asarray(lon) - self.lon) * R * self.k
        n = np.radians(np.asarray(lat) - self.lat) * R
        return self.en_to_game(e, n)

    def game_to_latlon(self, x, z):
        e, n = self.game_to_en(x, z)
        return self.lat + np.degrees(n / R), self.lon + np.degrees(e / (R * self.k))


def geo_to_latlon(g, x, y):
    k = math.cos(math.radians(g['lat0']))
    return g['lat0'] + np.degrees(np.asarray(y, float) / R), g['lon0'] + np.degrees(np.asarray(x, float) / (R * k))


def grid_xz(n, size):
    c = np.linspace(-size / 2, size / 2, n)
    x, z = np.meshgrid(c, c)  # Zeile j = z, Spalte i = x
    return x, z


# ---------- Wasser ----------
def to_px(fr, lat, lon, n, size, ss):
    x, z = fr.latlon_to_game(lat, lon)
    s = (n - 1) * ss / size
    return np.stack([(x + size / 2) * s, (z + size / 2) * s], axis=-1)


def water_mask(fr, g, wid, n, size, ss=4):
    """Wasseranteil je Gitterpunkt (0..1), über ss-fache Überabtastung gerastert."""
    m = (n - 1) * ss + 1
    img = np.zeros((m, m), np.uint8)

    def poly_px(ring):
        a = np.array(ring, float)
        lat, lon = geo_to_latlon(g, a[:, 0], a[:, 1])
        p = to_px(fr, lat, lon, n, size, ss)
        return np.clip(np.round(p), -1e6, 1e6).astype(np.int32)

    if g['type'] in ('lake', 'sea'):
        rings = g['water'] if g['type'] == 'lake' else g['land']
        for ring in rings:  # Even-Odd: jede Fläche umschalten (Inseln = Löcher)
            t = np.zeros_like(img)
            cv2.fillPoly(t, [poly_px(ring)], 1)
            img ^= t
        if g['type'] == 'sea':
            img = 1 - img
    else:
        w = RIVER_W.get(wid, 100)
        th = max(1, int(round(w * (n - 1) * ss / size)))
        for r in g['rivers']:
            cv2.polylines(img, [poly_px(r['pts'])], False, 1, thickness=th, lineType=cv2.LINE_8)
    img = img.astype(np.float32)
    # Mittelwert über den Bereich um jeden Gitterpunkt (Pixel i*ss liegt genau auf dem Gitterpunkt)
    k = cv2.blur(img, (ss + 1, ss + 1)) if ss > 1 else img
    return k[::ss, ::ss][:n, :n]


def water_at(g, wid, lat, lon):
    """Punkt-Test im Geo-Raster (für Blickrichtung) – grob über ein kleines Frame-Raster."""
    fr = Frame(lat, lon, 0)
    wm = water_mask(fr, g, wid, 121, 1200, ss=1)
    return wm, fr


def heading_for(g, wid, spot):
    lat, lon = spot['lat'], spot['lon']
    if not spot['boat']:
        wm, _ = water_at(g, wid, lat, lon)  # 10 m Raster, Nord oben (z = Nord, x = West)
        n = wm.shape[0]
        c = np.linspace(-600, 600, n)
        x, z = np.meshgrid(c, c)
        d = np.hypot(x, z)
        sel = (wm > 0.5) & (d > 5) & (d < 300)
        if not sel.any():
            sel = (wm > 0.5) & (d > 5)
        w = 1 / np.maximum(d[sel], 10)
        vx, vz = (x[sel] / d[sel] * w).sum(), (z[sel] / d[sel] * w).sum()
        e, nn = -vx, vz  # x zeigt nach Westen (links bei Blick nach Norden)
        return math.atan2(e, nn) % (2 * math.pi)
    # Boot: zum nächsten Ufer schauen
    fr = Frame(lat, lon, 0)
    wm = water_mask(fr, g, wid, 241, 9600, ss=1)
    n = wm.shape[0]
    c = np.linspace(-4800, 4800, n)
    x, z = np.meshgrid(c, c)
    d = np.hypot(x, z)
    land = (wm < 0.5) & (d > 50)
    if not land.any():
        return 0.0
    i = np.argmin(np.where(land, d, 1e12))
    return math.atan2(-x.flat[i], z.flat[i]) % (2 * math.pi)


# ---------- Landnutzung ----------
CLASS_TAGS = [  # Reihenfolge = Malreihenfolge (spätere überschreiben)
    (FARM, [('landuse', 'farmland'), ('landuse', 'farmyard'), ('landuse', 'allotments')]),
    (MEADOW, [('landuse', 'meadow'), ('landuse', 'grass'), ('natural', 'grassland'), ('natural', 'heath'), ('leisure', 'park')]),
    (FOREST, [('landuse', 'forest'), ('natural', 'wood'), ('natural', 'scrub')]),
    (ORCHARD, [('landuse', 'orchard')]),
    (VINEYARD, [('landuse', 'vineyard')]),
    (TOWN, [('landuse', 'residential'), ('landuse', 'village_green'), ('landuse', 'commercial'), ('landuse', 'retail'),
            ('landuse', 'industrial'), ('landuse', 'railway')]),
    (WETLAND, [('natural', 'wetland'), ('wetland', 'reedbed')]),
    (SAND, [('natural', 'beach'), ('natural', 'sand'), ('natural', 'shingle')]),
    (ROCK, [('natural', 'bare_rock'), ('natural', 'scree'), ('natural', 'cliff')]),
]


def osm_query(lat, lon, rad, mirrors=None):
    return overpass(osm_query_text(lat, lon, rad), mirrors)


def osm_query_text(lat, lon, rad):
    dlat = rad / 111320
    dlon = rad / (111320 * math.cos(math.radians(lat)))
    bb = f'{lat - dlat:.5f},{lon - dlon:.5f},{lat + dlat:.5f},{lon + dlon:.5f}'
    lu = 'forest|vineyard|orchard|residential|village_green|farmland|farmyard|meadow|grass|allotments|commercial|retail|industrial|railway'
    nat = 'wood|bare_rock|scree|cliff|beach|sand|shingle|wetland|scrub|grassland|heath'
    q = (f'[out:json][timeout:180];('
         f'way["landuse"~"^({lu})$"]({bb});relation["landuse"~"^({lu})$"]({bb});'
         f'way["natural"~"^({nat})$"]({bb});relation["natural"~"^({nat})$"]({bb});'
         f'way["leisure"="park"]({bb});way["building"]({bb}););out geom;')
    return q


def cls_of(tags):
    best = None
    for c, kv in CLASS_TAGS:
        for k, v in kv:
            if tags.get(k) == v:
                best = c
    return best


def rings_of(el):
    """(Ringe als Listen von (lat, lon), Rolle, geschlossen?)."""
    if el['type'] == 'way' and 'geometry' in el:
        g = [(p['lat'], p['lon']) for p in el['geometry']]
        yield g, 'outer', len(g) > 2 and g[0] == g[-1]
    elif el['type'] == 'relation':
        # Teilstücke zu Ringen verketten
        for role in ('outer', 'inner'):
            parts = [[(p['lat'], p['lon']) for p in m['geometry']] for m in el.get('members', [])
                     if m.get('role', 'outer') == role and m['type'] == 'way' and m.get('geometry')]
            while parts:
                c = parts.pop(0)
                changed = True
                while changed and c[0] != c[-1]:
                    changed = False
                    for p in parts:
                        if p[0] == c[-1]:
                            c = c + p[1:]
                        elif p[-1] == c[-1]:
                            c = c + p[::-1][1:]
                        elif p[-1] == c[0]:
                            c = p[:-1] + c
                        elif p[0] == c[0]:
                            c = p[::-1][:-1] + c
                        else:
                            continue
                        parts.remove(p)
                        changed = True
                        break
                yield c, role, c[0] == c[-1]


def landcover(fr, osm, n, size, ss=2):
    m = (n - 1) * ss + 1
    layers = {}
    for el in osm['elements']:
        tags = el.get('tags', {})
        if 'building' in tags and el['type'] == 'way':
            continue
        c = cls_of(tags)
        if c is None:
            continue
        lay = layers.setdefault(c, np.zeros((m, m), np.uint8))
        for ring, role, closed in rings_of(el):
            a = np.array(ring)
            p = np.round(to_px(fr, a[:, 0], a[:, 1], n, size, ss)).astype(np.int32)
            if tags.get('natural') == 'cliff' or not closed:
                if tags.get('natural') == 'cliff':
                    cv2.polylines(lay, [p], False, 1, thickness=max(1, int(15 * (n - 1) * ss / size)))
                continue
            t = np.zeros((m, m), np.uint8)
            cv2.fillPoly(t, [p], 1)
            if role == 'inner':
                lay[t > 0] = 0
            else:
                lay |= t
    out = np.full((n, n), 255, np.uint8)  # 255 = unbekannt
    for c, _ in CLASS_TAGS:
        if c in layers:
            small = layers[c][::ss, ::ss][:n, :n]
            out[small > 0] = c
    return out


def heuristic_cover(habs, hrel, cell, lat, mask=None):
    """Landnutzung aus Höhe/Neigung, wo OSM nichts weiß."""
    gy, gx = np.gradient(habs, cell)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    treeline = 1900 if lat < 50 else 1300 if lat < 60 else 700
    out = np.full(habs.shape, MEADOW, np.uint8)
    out[(slope > 10) & (habs < treeline)] = FOREST
    out[(slope < 6) & (hrel > 3) & (hrel < 150)] = FARM  # Äcker nur im Tal, nicht auf Hochflächen
    out[slope > 38] = ROCK
    out[habs > treeline + 250] = ROCK
    out[(habs > treeline) & (habs <= treeline + 250) & (slope < 30)] = MEADOW
    if mask is not None:
        known = mask != 255
        out[known] = mask[known]
    return out


# ---------- Gebäude ----------
def buildings(fr, osm, maxn=400, rad=1500):
    out = []
    for el in osm['elements']:
        tags = el.get('tags', {})
        if el['type'] != 'way' or 'building' not in tags or not el.get('geometry'):
            continue
        a = np.array([(p['lat'], p['lon']) for p in el['geometry']])
        x, z = fr.latlon_to_game(a[:, 0], a[:, 1])
        cx, cz = float(np.mean(x)), float(np.mean(z))
        d = math.hypot(cx, cz)
        if d > rad:
            continue
        pts = np.stack([x, z], -1).astype(np.float32)
        if len(pts) > 4:
            pts = cv2.approxPolyDP(pts.reshape(-1, 1, 2), 0.6, True).reshape(-1, 2)
        if len(pts) > 1 and np.allclose(pts[0], pts[-1]):
            pts = pts[:-1]
        if len(pts) < 3 or cv2.contourArea(pts) < 12:
            continue
        h = None
        try:
            if 'height' in tags:
                h = float(str(tags['height']).replace('m', '').strip())
            elif 'building:levels' in tags:
                h = float(tags['building:levels']) * 3.0 + 1.2
        except ValueError:
            h = None
        if h is None:
            seed = int(hashlib.md5(str(el['id']).encode()).hexdigest()[:6], 16)
            area = cv2.contourArea(pts)
            h = 4.0 if tags['building'] in ('garage', 'shed', 'hut', 'roof', 'carport') or area < 30 else 7 + (seed % 30) / 10
        out.append({'d': d, 'p': [[round(float(px), 1), round(float(pz), 1)] for px, pz in pts], 'h': round(min(h, 60), 1),
                    'k': tags['building'], 'roof': tags.get('roof:shape', '')})
    out.sort(key=lambda b: b['d'])
    for b in out:
        del b['d']
    return out[:maxn]


# ---------- Hauptteil je Platz ----------
def smooth01(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def build_grid(fr, g, wid, kind, n, size, z, level, depth, cover=None):
    x, zz = grid_xz(n, size)
    lat, lon = fr.game_to_latlon(x, zz)
    habs = dem(lat, lon, z)
    wm = water_mask(fr, g, wid, n, size, ss=4 if n == NEAR_N else 2)
    water = wm > 0.5
    cell = size / (n - 1)
    # Abstand zum Ufer (m) für Uferschelf bzw. Uferanstieg
    dw = cv2.distanceTransform((water).astype(np.uint8), cv2.DIST_L2, 5) * cell
    dl = cv2.distanceTransform((~water).astype(np.uint8), cv2.DIST_L2, 5) * cell
    rel = habs - level
    shelf = 70 if kind == 'fluss' else 120
    under = -(0.3 + (depth - 0.3) * smooth01(dw / shelf))
    land = np.maximum(rel, 0.3 + np.minimum(dl, 60) * 0.015)
    h = np.where(water, under, land)
    if cover is None:
        cover = np.full((n, n), 255, np.uint8)
    lc = heuristic_cover(habs, rel, cell, fr.lat, cover)
    lc[water] |= WATER_BIT
    return h, lc, habs, water


def fix_origin(h, lc, boat, depth, harbour=False):
    """Standplatz trocken (0,5–2 m), Wasser direkt davor; Boot: Ursprung im Wasser.
    Hafen: senkrechte Kaimauer (1,2 m), Wasser beginnt 1–2 m vor dem Angler."""
    n = h.shape[0]
    c = n // 2
    if boat:
        h[c - 2:c + 3, c - 2:c + 3] = np.minimum(h[c - 2:c + 3, c - 2:c + 3], -max(2.0, min(depth, 40) * 0.8))
        lc[c - 2:c + 3, c - 2:c + 3] |= WATER_BIT
        return 0.0
    stand = 1.2 if harbour else float(np.clip(h[c, c] if h[c, c] > 0 else 1.0, 0.6, 1.8))
    # hinter dem Angler (z <= 0) im Umkreis 20 m: trockener, sanfter Platz
    for dj in range(-2, 1):
        for di in range(-2, 3):
            j, i = c + dj, c + di
            r = math.hypot(di, dj)
            if r <= 2.01:
                target = stand + (0 if r < 0.5 else (-dj) * 0.15)
                h[j, i] = target if r < 1.01 else max(min(h[j, i], target + 1.0), 0.4)
                lc[j, i] &= ~WATER_BIT & 0xFF
    # davor (z = +10 m, +20 m): Wasser
    front = ((1, 6.0), (2, 6.5), (3, 7.0)) if harbour else ((1, 1.2), (2, 2.0))
    for dj, dep in front:
        for di in ((-2, -1, 0, 1, 2) if harbour else (-1, 0, 1)):
            j, i = c + dj, c + di
            h[j, i] = min(h[j, i], -dep)
            lc[j, i] |= WATER_BIT
    h[c, c] = stand
    return stand


def save_debug(path, spots_out):
    tiles = []
    for sid, h, lc, hf, lcf in spots_out:
        imgs = []
        for hh, cc in ((h, lc), (hf, lcf)):
            gy, gx = np.gradient(hh)
            shade = np.clip(0.75 + (gx * 0.6 - gy * 0.6) / (np.hypot(gx, gy) + 3), 0.25, 1.3)
            pal = np.array([[150, 190, 110], [40, 95, 45], [120, 160, 60], [140, 150, 90], [205, 150, 140],
                            [150, 145, 140], [230, 215, 160], [200, 190, 110], [110, 140, 120]], np.float32)
            col = pal[np.minimum(cc & 0x7F, 8)] * shade[..., None]
            wat = (cc & WATER_BIT) > 0
            col[wat] = np.array([40, 110, 190]) * (0.6 + 0.4 * np.clip(1 + hh[wat] / 30, 0, 1))[..., None]
            col = np.clip(col, 0, 255).astype(np.uint8)[::-1, ::-1]  # Sicht des Anglers: +z oben, +x links
            img = cv2.resize(col, (300, 300), interpolation=cv2.INTER_NEAREST)
            cv2.circle(img, (150, 150), 3, (255, 0, 0), -1)
            cv2.arrowedLine(img, (150, 150), (150, 120), (255, 0, 0), 1)
            imgs.append(img)
        t = np.concatenate(imgs, 1)
        cv2.putText(t, sid, (5, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
        cv2.putText(t, sid, (5, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        tiles.append(t)
    Image.fromarray(np.concatenate(tiles, 0)).save(path)


def prefetch(spots):
    """OSM-Abfragen parallel über alle Spiegel vorab laden (Overpass ist einzeln oft sehr langsam)."""
    import threading

    def run(s, k):
        order = MIRRORS[k % len(MIRRORS):] + MIRRORS[:k % len(MIRRORS)]
        try:
            osm_query(s['lat'], s['lon'], 1900, order)
            print('  osm ok', s['id'], flush=True)
        except Exception as e:  # noqa: BLE001
            print('  osm FAILED', s['id'], e, flush=True)
    ths = [threading.Thread(target=run, args=(s, k)) for k, s in enumerate(spots)]
    for t in ths:
        t.start()
        time.sleep(2)
    for t in ths:
        t.join()


def main():
    spots_json = os.path.join(CACHE, 'spots.json')
    if not os.path.exists(spots_json) or '--export' in sys.argv:
        js = subprocess.run(['node', os.path.join(HERE, 'export-spots.mjs')], capture_output=True, text=True, check=True).stdout
        with open(spots_json, 'w') as f:
            f.write(js)
    data = json.load(open(spots_json))
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    meta_path = os.path.join(GAME, 'js', 'terrainmeta.js')
    meta = {}
    if os.path.exists(meta_path):  # bestehende Einträge behalten, wenn nur einzelne Plätze neu gebaut werden
        txt = open(meta_path).read()
        meta = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
    prefetch([s for w in data['waters'] for s in w['spots'] if not only or s['id'] in only])
    for w in data['waters']:
        g = data['geo'][w['id']]
        dbg = []
        for s in w['spots']:
            if only and s['id'] not in only:
                continue
            print('==', w['id'], s['id'], flush=True)
            head = heading_for(g, w['id'], s)
            fr = Frame(s['lat'], s['lon'], head)
            # Wasserspiegel
            if g['type'] == 'sea':
                level = 0.0
            else:
                x, z = grid_xz(NEAR_N, NEAR_SIZE)
                lat, lon = fr.game_to_latlon(x, z)
                habs = dem(lat, lon, NEAR_Z)
                wm = water_mask(fr, g, w['id'], NEAR_N, NEAR_SIZE) > 0.5
                d = np.hypot(x, z)
                sel = wm & (d < (600 if w['kind'] == 'fluss' else 1200))
                vals = habs[sel] if sel.any() else habs[wm]
                level = float(np.percentile(vals, 20 if w['kind'] == 'fluss' else 50))
            depth = min(float(s['depth']), 40.0)
            osm = osm_query(s['lat'], s['lon'], 1900)
            nx, nz = grid_xz(NEAR_N, NEAR_SIZE)
            cov = landcover(fr, osm, NEAR_N, NEAR_SIZE)
            hn, ln, _, _ = build_grid(fr, g, w['id'], w['kind'], NEAR_N, NEAR_SIZE, NEAR_Z, level, depth, cov)
            stand = fix_origin(hn, ln, s['boat'], depth, s.get('harbour', False))
            hf, lf, _, _ = build_grid(fr, g, w['id'], w['kind'], FAR_N, FAR_SIZE, FAR_Z, level, min(40.0, max(depth, 15.0)))
            bl = buildings(fr, osm)
            with open(os.path.join(OUT, s['id'] + '.bin'), 'wb') as f:
                f.write(np.clip(np.round(hn * 10), -32768, 32767).astype('<i2').tobytes())
                f.write(np.clip(np.round(hf * 10), -32768, 32767).astype('<i2').tobytes())
                f.write(ln.astype(np.uint8).tobytes())
                f.write(lf.astype(np.uint8).tobytes())
            with open(os.path.join(OUT, s['id'] + '.json'), 'w') as f:
                json.dump({'buildings': bl}, f, separators=(',', ':'))
            meta[s['id']] = {'heading': round(head, 4), 'level': round(level, 1), 'nearSize': NEAR_SIZE, 'farSize': FAR_SIZE,
                             'n': NEAR_N, 'nFar': FAR_N, 'standY': round(stand, 2)}
            cnt = np.bincount(ln.flatten() & 0x7F, minlength=9)
            print(f'   heading {math.degrees(head):.0f}° level {level:.1f} stand {stand:.2f} buildings {len(bl)} '
                  f'water {(ln >= 128).mean():.2f} cover {cnt.tolist()}', flush=True)
            dbg.append((s['id'], hn, ln, hf, lf))
        if dbg:
            save_debug(os.path.join(CACHE, f'debug_{w["id"]}.png'), dbg)
    with open(meta_path, 'w') as f:
        f.write('// Erzeugt von tools/terrain.py – nicht von Hand ändern.\n'
                '// heading: Blickrichtung (Bogenmaß, 0 = Nord, im Uhrzeigersinn), level: Wasserspiegel (m ü. NN),\n'
                '// n/nFar: Gitterpunkte je Seite, nearSize/farSize: Kantenlänge (m), standY: Standhöhe über dem Wasser (m).\n'
                'export const TERRAIN = ' + json.dumps(meta, indent=1) + ';\n')


if __name__ == '__main__':
    main()
