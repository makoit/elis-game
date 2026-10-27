"""Erzeugt Icon (icons/icon.svg) und Hub-Kachel (games/bike-race/cover.svg).
Aufruf im Repo-Root: python3 games/bike-race/tools/icons.py
Fahrer-Gelenke werden per 2-Gelenk-IK an Pedale und Lenker gesetzt, damit die Proportionen stimmen."""
import math, os

def ik(a, b, l1, l2, bend):
    """Gelenk zwischen a und b (Längen l1, l2); bend=+1/-1 wählt die Seite."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    d = min(math.hypot(dx, dy), l1 + l2 - 0.01)
    x = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - x * x, 0))
    ux, uy = dx / d, dy / d
    return (a[0] + ux * x - uy * h * bend, a[1] + uy * x + ux * h * bend)

def p(pt): return f'{pt[0]:.1f} {pt[1]:.1f}'
def line(a, b, color, w, extra=''):
    return f'<path d="M{p(a)} L{p(b)}" stroke="{color}" stroke-width="{w}" stroke-linecap="round" fill="none" {extra}/>'
def poly(pts, color, extra=''):
    return f'<path d="M{" L".join(p(q) for q in pts)}Z" fill="{color}" {extra}/>'

def wheel(c, spin):
    cx, cy = c
    s = [f'<g transform="translate({cx} {cy})">']
    # Stollenreifen
    s.append('<circle r="67" fill="none" stroke="#14161c" stroke-width="15"/>')
    s.append('<circle r="74" fill="none" stroke="#14161c" stroke-width="5" stroke-dasharray="6 7"/>')
    s.append('<circle r="59" fill="none" stroke="url(#rim)" stroke-width="5"/>')
    # Speichen (leicht verwischt = Tempo)
    for i in range(16):
        a = math.radians(i * 22.5 + spin)
        a2 = math.radians(i * 22.5 + spin + 32)
        s.append(f'<path d="M{6*math.cos(a):.1f} {6*math.sin(a):.1f} L{57*math.cos(a2):.1f} {57*math.sin(a2):.1f}" stroke="#c9d3e6" stroke-width="1.6" opacity="0.55"/>')
    s.append('<circle r="44" fill="none" stroke="#ffffff" stroke-width="10" opacity="0.06"/>')
    s.append('<circle r="9" fill="#2a2f3a" stroke="#9aa6bd" stroke-width="3"/>')
    s.append('</g>')
    return ''.join(s)

def rider_and_bike():
    R, F, B = (170, 372), (402, 372), (270, 384)
    S = (246, 268)            # Sitzrohr oben
    H1, H2 = (374, 262), (385, 298)  # Steuerrohr
    stem = (397, 244)
    hand = (404, 248)
    saddle = (238, 236)
    crank = 34
    ang = math.radians(28)
    P1 = (B[0] + crank * math.cos(ang), B[1] + crank * math.sin(ang))           # Pedal vorne (nah)
    P2 = (B[0] - crank * math.cos(ang), B[1] - crank * math.sin(ang))           # Pedal hinten (fern)
    hip = (246, 222)
    shoulder = (336, 168)
    head = (362, 146)
    K1 = ik(hip, P1, 100, 104, -1)
    K2 = ik(hip, P2, 100, 104, -1)
    E1 = ik(shoulder, hand, 62, 58, 1)
    o = []
    # --- ferne Seite (dunkler) ---
    o.append(line(hip, K2, '#0b1730', 27) + line(K2, P2, '#0b1730', 21))
    o.append(f'<path d="M{p((P2[0]-8,P2[1]+6))} l26 -6" stroke="#0a0c12" stroke-width="12" stroke-linecap="round"/>')
    o.append(line(B, P2, '#3a4150', 7))
    # --- Räder ---
    o.append(wheel(R, 0) + wheel(F, 9))
    # --- Rahmen ---
    fr = 'url(#frame)'
    o.append(line(B, R, fr, 10) + line((S[0]+3, S[1]+8), R, fr, 8))                 # Kettenstrebe, Sitzstrebe
    o.append(line(B, S, fr, 13))                                                      # Sitzrohr
    o.append(line((S[0]+2, S[1]+4), (H1[0], H1[1]+6), fr, 13))                        # Oberrohr
    o.append(line(B, (H2[0]-2, H2[1]-4), fr, 18))                                     # Unterrohr
    o.append(line(H1, H2, fr, 16))                                                    # Steuerrohr
    # Federgabel: Tauchrohre + Standrohre
    o.append(line((H2[0]+1, H2[1]+4), (H2[0]+7, H2[1]+34), '#d7dde8', 9))
    o.append(line((H2[0]+7, H2[1]+32), F, '#1d2230', 11))
    o.append(line((H2[0]-6, H2[1]+6), (H2[0]+10, H2[1]+4), '#1d2230', 10))            # Gabelbrücke
    # Sattelstütze + Sattel
    o.append(line(S, (saddle[0]+4, saddle[1]+6), '#2b3140', 7))
    o.append(f'<path d="M{saddle[0]-24} {saddle[1]+2} q 6 -9 26 -7 l 20 3 q 4 3 0 6 l -26 3 q -16 2 -20 -5z" fill="#11131a"/>')
    # Vorbau + Lenker
    o.append(line(H1, (H1[0]-2, H1[1]-10), '#2b3140', 9))
    o.append(line((H1[0]-2, H1[1]-12), stem, '#2b3140', 9))
    o.append(line((stem[0]-1, stem[1]+6), (stem[0]+6, stem[1]-10), '#11131a', 8))
    # Antrieb
    o.append(f'<circle cx="{B[0]}" cy="{B[1]}" r="20" fill="none" stroke="#9aa6bd" stroke-width="5" stroke-dasharray="3 2"/>')
    o.append(f'<path d="M{B[0]} {B[1]-20} L{R[0]} {R[1]-9} M{B[0]} {B[1]+20} L{R[0]} {R[1]+9}" stroke="#596276" stroke-width="2.5"/>')
    o.append(f'<circle cx="{R[0]}" cy="{R[1]}" r="12" fill="none" stroke="#9aa6bd" stroke-width="3"/>')
    o.append(f'<circle cx="{B[0]}" cy="{B[1]}" r="7" fill="#2b3140"/>')
    # Logo-Streifen auf dem Unterrohr
    o.append(line((B[0]+(H2[0]-B[0])*0.35, B[1]+(H2[1]-B[1])*0.35), (B[0]+(H2[0]-B[0])*0.62, B[1]+(H2[1]-B[1])*0.62), '#ffffff', 5, 'opacity="0.85"'))
    # --- Fahrer, nahe Seite ---
    # Hose + Bein
    o.append(line(hip, K1, '#162447', 29) + line(K1, P1, '#e6b48f', 20))
    o.append(line((K1[0]*0.25+P1[0]*0.75, K1[1]*0.25+P1[1]*0.75), P1, '#ffffff', 19))   # Socke
    o.append(f'<path d="M{p((P1[0]-12,P1[1]+5))} l30 -5" stroke="#0e1018" stroke-width="13" stroke-linecap="round"/>')
    o.append(f'<path d="M{p((P1[0]-6,P1[1]+1))} l14 -2" stroke="#19d3ff" stroke-width="3" stroke-linecap="round"/>')
    o.append(line(B, P1, '#c6cfdf', 7))
    o.append(f'<rect x="{P1[0]-11:.1f}" y="{P1[1]+7:.1f}" width="22" height="5" rx="2" fill="#2b3140"/>')
    # Oberkörper (Trikot) als Keil Hüfte -> Schulter
    nx, ny = shoulder[1]-hip[1], -(shoulder[0]-hip[0])
    n = math.hypot(nx, ny); nx, ny = nx/n, ny/n
    mid = ((hip[0]+shoulder[0])/2, (hip[1]+shoulder[1])/2)
    torso = (f'<path d="M{p((hip[0]+nx*16, hip[1]+ny*16))} Q{p((mid[0]+nx*34, mid[1]+ny*34))} {p((shoulder[0]+nx*18, shoulder[1]+ny*18))}'
             f' Q{p((shoulder[0]+12, shoulder[1]-4))} {p((shoulder[0]-nx*13, shoulder[1]-ny*13))}'
             f' Q{p((mid[0]-nx*6, mid[1]-ny*6))} {p((hip[0]-nx*17, hip[1]-ny*17))} Q{p((hip[0]-6, hip[1]+14))} {p((hip[0]+nx*16, hip[1]+ny*16))}Z" fill="url(#jersey)"/>')
    o.append(torso)
    # Trikotstreifen entlang des Rückens
    o.append(f'<path d="M{p((hip[0]+nx*8, hip[1]+ny*8))} Q{p((mid[0]+nx*24, mid[1]+ny*24))} {p((shoulder[0]+nx*10, shoulder[1]+ny*10))}" stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.9"/>')
    o.append(f'<path d="M{p((hip[0]+nx*2, hip[1]+ny*2))} Q{p((mid[0]+nx*16, mid[1]+ny*16))} {p((shoulder[0]+nx*3, shoulder[1]+ny*3))}" stroke="#ffb000" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.9"/>')
    # Arm + Handschuh
    o.append(line(shoulder, E1, 'url(#jersey)', 19) + line(E1, hand, '#e6b48f', 15))
    o.append(f'<circle cx="{hand[0]}" cy="{hand[1]}" r="10" fill="#0e1018"/>')
    # Kopf + Helm mit Visier + Brille
    o.append(line((shoulder[0]+4, shoulder[1]-2), (head[0]-4, head[1]+12), '#e6b48f', 13))
    o.append(f'<circle cx="{head[0]}" cy="{head[1]}" r="19" fill="#e6b48f"/>')
    o.append(f'<path d="M{head[0]-27} {head[1]+2} q 2 -30 34 -30 q 22 2 30 22 l -10 2 q -24 -8 -54 6z" fill="url(#helmet)"/>')
    o.append(f'<path d="M{head[0]-18} {head[1]-18} l 10 -6 M{head[0]-6} {head[1]-23} l 10 -3" stroke="#0e1018" stroke-width="4" stroke-linecap="round"/>')
    o.append(f'<path d="M{head[0]+30} {head[1]-6} l 14 4" stroke="#0e1018" stroke-width="6" stroke-linecap="round"/>')
    o.append(f'<path d="M{head[0]+3} {head[1]-2} q 12 -3 21 1 l -1 8 q -10 2 -20 -1z" fill="#19d3ff" stroke="#0e1018" stroke-width="3"/>')
    return ''.join(o)

DEFS = '''<defs>
  <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd659"/><stop offset="0.5" stop-color="#ff8a00"/><stop offset="1" stop-color="#ff3d00"/></linearGradient>
  <linearGradient id="jersey" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#19d3ff"/><stop offset="1" stop-color="#0a6cff"/></linearGradient>
  <linearGradient id="helmet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffb000"/></linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd659"/><stop offset="1" stop-color="#ff5a00"/></linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ff9a1f" stop-opacity="0.95"/><stop offset="0.45" stop-color="#ff5a1f" stop-opacity="0.45"/><stop offset="1" stop-color="#ff3d6e" stop-opacity="0"/></radialGradient>
  <linearGradient id="dirt" x1="0" x2="0" y1="446" y2="620" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6b4424"/><stop offset="1" stop-color="#1e120a"/></linearGradient>
  <linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1430"/><stop offset="0.65" stop-color="#1a1440"/><stop offset="1" stop-color="#05070d"/></linearGradient>
  <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1446"/><stop offset="0.45" stop-color="#b8325e"/><stop offset="0.8" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ffc56b"/></linearGradient>
</defs>'''

def speed_lines(x0, ys, color='#ffffff'):
    return ''.join(f'<path d="M{x0 - l} {y} h{l}" stroke="{color}" stroke-width="{w}" stroke-linecap="round" opacity="{op}"/>'
                   for y, l, w, op in ys)

def dust(cx, cy):
    pts = [(-10, 0, 16, .35), (-34, -10, 12, .28), (-56, 4, 10, .22), (-78, -14, 8, .16), (-22, -22, 9, .25), (-96, -2, 6, .12)]
    return ''.join(f'<circle cx="{cx+x}" cy="{cy+y}" r="{r}" fill="#ffcf8a" opacity="{o}"/>' for x, y, r, o in pts)

def ground(fill='url(#dirt)', edge='#ffb000'):
    rnd = __import__('random').Random(7)
    stones = ''.join(f'<ellipse cx="{x}" cy="{446 + rnd.uniform(8, 60):.0f}" rx="{rnd.uniform(3, 8):.1f}" ry="{rnd.uniform(2, 4):.1f}" fill="#8a6a48" opacity="{rnd.uniform(.35, .8):.2f}"/>'
                     for x in range(-100, 760, 23))
    grass = ''.join(f'<path d="M{x} 448 l-5 -14 M{x} 448 l1 -18 M{x} 448 l7 -13" stroke="#3fae5a" stroke-width="3" stroke-linecap="round"/>'
                    for x in (-60, 40, 470, 560, 690))
    return (f'<path d="M-400 446 H1000 V900 H-400Z" fill="{fill}"/>{stones}'
            f'<path d="M-400 446 H1000" stroke="{edge}" stroke-width="4" opacity="0.85"/>{grass}')

RIDER = rider_and_bike()

def icon(scale, pad_note=''):
    # 512x512, Fahrer leicht bergab geneigt
    t = 256 - 290 * scale
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{pad_note}
{DEFS}
<rect width="512" height="512" fill="url(#night)"/>
<circle cx="300" cy="250" r="230" fill="url(#glow)"/>
<path d="M0 360 L90 300 L170 340 L260 270 L360 330 L440 290 L512 320 V512 H0Z" fill="#2a1a4a" opacity="0.9"/>
<g transform="translate({256 - 290*scale:.1f} {256 - 286*scale:.1f}) scale({scale})">
  <g transform="rotate(7 288 300)">
    {ground()}
    {speed_lines(120, [(170, 90, 6, .5), (215, 130, 5, .35), (260, 70, 6, .45), (305, 110, 4, .3)])}
    {dust(98, 436)}
    {RIDER}
  </g>
</g>
</svg>'''

def cover():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
{DEFS}
<rect width="800" height="500" fill="url(#dusk)"/>
<circle cx="560" cy="300" r="120" fill="#ffe08a" opacity="0.9"/>
<circle cx="560" cy="300" r="260" fill="url(#glow)" opacity="0.6"/>
<path d="M0 330 L110 250 L200 300 L320 200 L450 300 L560 230 L680 290 L800 240 V500 H0Z" fill="#5a1f4f" opacity="0.85"/>
<path d="M0 380 L140 320 L260 360 L400 300 L540 350 L680 310 L800 340 V500 H0Z" fill="#2c1238"/>
<g transform="translate(150 -40) scale(1.05)">
  <g transform="rotate(6 290 300)">
    {ground()}
    {speed_lines(110, [(160, 120, 6, .55), (210, 170, 5, .4), (255, 100, 6, .5), (300, 150, 4, .35), (345, 80, 4, .3)])}
    {dust(98, 432)}
    {RIDER}
  </g>
</g>
</svg>'''

root = os.path.normpath(os.path.join(os.path.dirname(__file__), '../../..'))
open(os.path.join(root, 'icons/icon.svg'), 'w').write(icon(0.98))
open(os.path.join(root, 'games/bike-race/cover.svg'), 'w').write(cover())
# Maskable-Variante (Inhalt in der inneren 80 %-Zone) nur als Quelle für das PNG
open(os.path.join(root, 'icons/icon-maskable.svg'), 'w').write(icon(0.74))
print('ok')
