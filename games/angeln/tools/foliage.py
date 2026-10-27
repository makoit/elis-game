"""Baut aus den Poly-Haven-Blattatlanten (fir_leaves.png, leaf_leaves.png) zwei Laub-Karten für die Bäume:
- conifer_card.png: Fichtenzweig (Stiel mit Nadelzweigen links/rechts), Stiel liegt waagerecht, Ansatz links
- leaf_card.png: Laubbüschel (viele Blätter um kurze Zweige)
Aufruf: python3 games/angeln/tools/foliage.py (braucht numpy, pillow, opencv-python-headless)
"""
import os, random
import numpy as np
import cv2
from PIL import Image, ImageDraw

TEX = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'textures')
random.seed(4)

def parts(path, min_px, max_frac=0.6):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    mask = (a[:, :, 3] > 90).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    out = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < min_px or w > im.width * max_frac or h > im.height * max_frac:
            continue
        crop = a[y:y + h, x:x + w].copy()
        crop[lab[y:y + h, x:x + w] != i, 3] = 0
        out.append(Image.fromarray(crop))
    return out

def paste_rot(card, sprite, cx, cy, angle, scale):
    s = sprite.resize((max(1, int(sprite.width * scale)), max(1, int(sprite.height * scale))), Image.LANCZOS)
    s = s.rotate(angle, expand=True, resample=Image.BICUBIC)
    card.alpha_composite(s, (int(cx - s.width / 2), int(cy - s.height / 2)))

def conifer():
    sprigs = parts(os.path.join(TEX, 'fir_leaves.png'), 1500)
    sprigs.sort(key=lambda s: -s.width * s.height)
    sprigs = sprigs[:8]
    W, H = 512, 256
    card = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.line([(0, H / 2), (W * 0.97, H / 2 + 6)], fill=(70, 50, 35, 255), width=7)
    for i in range(46):
        t = i / 46
        x = 10 + t * W * 0.92
        side = 1 if i % 2 else -1
        sp = random.choice(sprigs)
        sc = (1.0 - t * 0.55) * 0.55 * (180 / max(sp.width, sp.height))
        paste_rot(card, sp, x + 12, H / 2 + side * (26 - t * 12), side * (35 + random.uniform(-15, 15)) - 90 * (sp.height > sp.width), sc * random.uniform(0.85, 1.15))
    # dichter Kern über der Mittellinie
    for i in range(20):
        t = random.random()
        sp = random.choice(sprigs)
        sc = (1.0 - t * 0.6) * 0.4 * (180 / max(sp.width, sp.height))
        paste_rot(card, sp, 20 + t * W * 0.88, H / 2 + random.uniform(-14, 14), random.uniform(0, 360), sc)
    card.save(os.path.join(TEX, 'conifer_card.png'), optimize=True)

def broadleaf():
    leaves = parts(os.path.join(TEX, 'leaf_leaves.png'), 3000)
    W = H = 512
    card = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    # kurze Zweige vom unteren Rand nach oben verzweigt
    tips = []
    for b in range(7):
        a = np.radians(-90 + random.uniform(-55, 55))
        x0, y0 = W / 2 + random.uniform(-30, 30), H * 0.95
        L = random.uniform(170, 260)
        x1, y1 = x0 + np.cos(a) * L, y0 + np.sin(a) * L
        d.line([(x0, y0), (x1, y1)], fill=(80, 62, 45, 255), width=5)
        tips += [(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f) for f in (0.45, 0.65, 0.85, 1.0)]
    for i in range(110):
        tx, ty = random.choice(tips)
        lf = random.choice(leaves)
        sc = random.uniform(0.18, 0.28) * (300 / max(lf.width, lf.height))
        ang = random.uniform(0, 360)
        paste_rot(card, lf, tx + random.uniform(-45, 45), ty + random.uniform(-45, 45), ang, sc)
    card.save(os.path.join(TEX, 'leaf_card.png'), optimize=True)

conifer()
broadleaf()
print('ok')
