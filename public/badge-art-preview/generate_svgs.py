#!/usr/bin/env python3
"""Vector badge generator for the badge-art preview page (TEMP, deleted before merge).

Writes svg/<direction>-<badge>.svg (animated with SMIL, self-contained) and
svg/<direction>-<badge>-still.svg (the same art with every animation and every
motion-only element removed: the resting frame an unearned badge is drawn from).

Run:  python generate_svgs.py
"""
import math
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "svg")


def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


# --------------------------------------------------------------------------- shared shapes
def smooth(pts):
    """A smooth open path through points (quadratic through midpoints)."""
    d = f"M{f(pts[0][0])},{f(pts[0][1])}"
    if len(pts) == 2:
        return d + f" L{f(pts[1][0])},{f(pts[1][1])}"
    for i in range(1, len(pts) - 1):
        mx = (pts[i][0] + pts[i + 1][0]) / 2
        my = (pts[i][1] + pts[i + 1][1]) / 2
        if i == len(pts) - 2:
            mx, my = pts[i + 1]
        d += f" Q{f(pts[i][0])},{f(pts[i][1])} {f(mx)},{f(my)}"
    return d


def hemi_path(cx, cy, rx, ry, side, bumps=6, gap=1.2):
    """One scalloped hemisphere: straight on the fissure, bumped on the outside."""
    pts = []
    for i in range(bumps + 1):
        th = -math.pi / 2 + math.pi * i / bumps
        pts.append((cx + side * (gap + rx * math.cos(th)), cy + ry * math.sin(th)))
    d = f"M{f(pts[0][0])},{f(pts[0][1])}"
    sweep = 1 if side > 0 else 0
    for a, b in zip(pts, pts[1:]):
        r = math.hypot(b[0] - a[0], b[1] - a[1]) * 0.58
        d += f" A{f(r)},{f(r)} 0 0 {sweep} {f(b[0])},{f(b[1])}"
    return d + " Z"


GYRI = [
    [(0.12, -0.56), (0.32, -0.74), (0.52, -0.52), (0.4, -0.36), (0.62, -0.26), (0.8, -0.42)],
    [(0.12, -0.06), (0.32, -0.2), (0.48, 0.0), (0.36, 0.16), (0.58, 0.26), (0.82, 0.1)],
    [(0.16, 0.5), (0.36, 0.4), (0.52, 0.6), (0.72, 0.56)],
]


def gyri_paths(cx, cy, rx, ry, side, gap=1.2):
    out = []
    for g in GYRI:
        out.append(smooth([(cx + side * (gap + u * rx), cy + v * ry) for (u, v) in g]))
    return out


SHIP = {
    "hull": "M18,74 H110 Q104,90 92,94 H36 Q24,90 18,74 Z",
    "main": "M68,22 Q88,46 98,70 H68 Z",
    "jib": "M60,28 Q47,50 30,70 H60 Z",
    "mast": "M62.5,14 H65.5 V75 H62.5 Z",
    "flag": "M65,14 L80,18.5 L65,23 Z",
}

LIGHTHOUSE = {
    "tower": "M55,96 L59,46 H69 L73,96 Z",
    "gallery": "M53,43 H75 V47 H53 Z",
    "lantern": "M57,33 H71 V43 H57 Z",
    "cap": "M55,33 L64,24 L73,33 Z",
    "rock": "M30,108 Q40,94 64,94 Q88,94 98,108 Z",
}


# --------------------------------------------------------------------------- direction A
# LANKA — the stitched patch, drawn in vector.
def lanka(badge):
    if badge == "neuro":
        cloth, cloth2, thread, thread_hi, thread_lo = "#0b4f4c", "#0f5f5b", "#d94d93", "#ffd9ec", "#6b1842"
        emblem = brain_stitched()
    else:
        cloth, cloth2, thread, thread_hi, thread_lo = "#122758", "#173068", "#dda12b", "#fff5cf", "#6b400c"
        emblem = ship_stitched()
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
<defs>
  <pattern id="twill" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
    <rect width="5" height="5" fill="{cloth}"/><rect width="5" height="2" fill="{cloth2}"/>
  </pattern>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/>
    <stop offset="0.45" stop-color="#fff" stop-opacity="0"/>
    <stop offset="0.5" stop-color="#fff" stop-opacity="0.22"/>
    <stop offset="0.55" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    <animateTransform attributeName="gradientTransform" type="translate" values="-1 -1;-1 -1;1 1" keyTimes="0;0.55;1" dur="6s" repeatCount="indefinite"/>
  </linearGradient>
</defs>
<circle cx="64" cy="64" r="61" fill="{thread_lo}"/>
<circle cx="64" cy="64" r="52" fill="url(#twill)"/>
<circle cx="64" cy="64" r="56" fill="none" stroke="{thread}" stroke-width="9.5" stroke-dasharray="1.4 1.1"/>
<circle cx="64" cy="64" r="56" fill="none" stroke="{thread_lo}" stroke-width="9.5" stroke-dasharray="1.1 1.4" stroke-dashoffset="1.4" opacity="0.55"/>
<circle cx="64" cy="64" r="51.2" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="1.2"/>
<circle class="m" cx="64" cy="64" r="56" fill="none" stroke="{thread_hi}" stroke-width="9.5" stroke-linecap="round" pathLength="100" stroke-dasharray="5 95" transform="rotate(-90 64 64)" opacity="0.9">
  <animate attributeName="stroke-dashoffset" values="0;-100" dur="6s" repeatCount="indefinite"/>
</circle>
<circle cx="64" cy="64" r="46" fill="none" stroke="{thread_hi}" stroke-width="1.6" stroke-dasharray="4.5 3" stroke-linecap="round" opacity="0.8"/>
{emblem}
<circle cx="64" cy="64" r="44" fill="url(#sheen)"/>
</svg>"""


def brain_stitched():
    out = []
    for side in (-1, 1):
        out.append(f'<path d="{hemi_path(64, 64, 25, 28, side)}" fill="#d94d93" stroke="#6b1842" stroke-width="1.6" stroke-linejoin="round"/>')
        for g in gyri_paths(64, 64, 25, 28, side):
            out.append(f'<path d="{g}" fill="none" stroke="#6b1842" stroke-width="1.7" stroke-linecap="round" stroke-dasharray="3 1.2"/>')
    return "\n".join(out)


def ship_stitched():
    s = 'transform="translate(19.5 18) scale(0.7)"'
    waves = "".join(
        f'<path d="M30,{y} q5,-3 10,0 t10,0 t10,0 t10,0 t10,0 t10,0 t10,0" fill="none" stroke="{c}" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="4 2"/>'
        for y, c in ((86, "#58bfe0"), (92, "#1f8bb6"), (98, "#1f8bb6"))
    )
    return f"""{waves}
<g {s} stroke-linejoin="round">
  <path d="{SHIP['hull']}" fill="#a4662f" stroke="#4b2a12" stroke-width="2"/>
  <path d="M22,80 H106" stroke="#f6d267" stroke-width="2.4" stroke-dasharray="4 2"/>
  <path d="{SHIP['mast']}" fill="#764420"/>
  <path d="{SHIP['main']}" fill="#f1f3f7" stroke="#9ea6b4" stroke-width="2"/>
  <path d="{SHIP['jib']}" fill="#f1f3f7" stroke="#9ea6b4" stroke-width="2"/>
  <path d="M74,36 L80,48 M70,46 L84,60" stroke="#d3d8e0" stroke-width="1.4" stroke-dasharray="3 1.5"/>
  <path d="{SHIP['flag']}" fill="#de3a3a" stroke="#681318" stroke-width="1.4"/>
</g>"""


# --------------------------------------------------------------------------- direction B
# EMALI — the enamel pin in vector. Silhouette = emblem; gold rim; one shine, one sparkle.
SHINE_DUR = "4.2s"


def emali(badge):
    if badge == "neuro":
        parts = [
            (hemi_path(64, 62, 46, 50, -1, bumps=7, gap=2.2), "url(#enamelA)"),
            (hemi_path(64, 62, 46, 50, 1, bumps=7, gap=2.2), "url(#enamelB)"),
        ]
        wires = []
        for side in (-1, 1):
            wires += gyri_paths(64, 62, 46, 50, side, gap=2.2)
        extra = '<rect x="61.6" y="12" width="4.8" height="100" rx="2" fill="url(#gold)"/>'
        grads = """
  <linearGradient id="enamelA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9659dc"/><stop offset="1" stop-color="#6a33a8"/></linearGradient>
  <linearGradient id="enamelB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#21b5a5"/><stop offset="1" stop-color="#11807a"/></linearGradient>"""
        spark = (108, 22)
        gloss = '<path d="M30,26 q8,-6 16,-6" stroke="#fff" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M80,22 q8,-2 15,3" stroke="#fff" stroke-opacity="0.45" stroke-width="3" stroke-linecap="round" fill="none"/>'
    else:
        waves = "M14,96 q8,-6 16,0 t16,0 t16,0 t16,0 t16,0 t16,0 Q110,110 96,110 H32 Q14,110 14,96 Z"
        parts = [
            (waves, "url(#sea)"),
            (SHIP["hull"], "url(#navy)"),
            (SHIP["main"], "#f1f3f7"),
            (SHIP["jib"], "#f1f3f7"),
            (SHIP["flag"], "#de3a3a"),
            (SHIP["mast"], "url(#gold)"),
        ]
        wires = ["M24,82 H104"]
        extra = ""
        grads = """
  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f8bb6"/><stop offset="1" stop-color="#125d88"/></linearGradient>
  <linearGradient id="navy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b66c9"/><stop offset="1" stop-color="#1b418c"/></linearGradient>"""
        spark = (104, 12)
        gloss = '<path d="M72,32 l8,14" stroke="#fff" stroke-opacity="0.8" stroke-width="2.4" stroke-linecap="round"/><path d="M54,36 l-5,9" stroke="#fff" stroke-opacity="0.8" stroke-width="2.4" stroke-linecap="round"/>'
    rim_dark = "\n".join(f'<path d="{d}" fill="#6b400c" stroke="#6b400c" stroke-width="11" stroke-linejoin="round"/>' for d, _ in parts)
    rim = "\n".join(f'<path d="{d}" fill="url(#gold)" stroke="url(#gold)" stroke-width="7.5" stroke-linejoin="round"/>' for d, _ in parts)
    fills = "\n".join(f'<path d="{d}" fill="{fill}"/>' for d, fill in parts)
    clips = "\n".join(f'<path d="{d}" stroke="#000" stroke-width="11" stroke-linejoin="round"/>' for d, _ in parts)
    wire_el = "\n".join(f'<path d="{w}" fill="none" stroke="url(#gold)" stroke-width="2.2" stroke-linecap="round"/>' for w in wires)
    sx, sy = spark
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
<defs>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff5cf"/><stop offset="0.25" stop-color="#f6d267"/><stop offset="0.6" stop-color="#dda12b"/><stop offset="1" stop-color="#a86c17"/>
  </linearGradient>{grads}
  <linearGradient id="band" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="sil">{clips}{extra.replace('fill="url(#gold)"', '')}</clipPath>
</defs>
{rim_dark}
{rim}
{fills}
{extra}
{wire_el}
{gloss}
<g clip-path="url(#sil)">
  <g class="m"><rect x="-40" y="-40" width="18" height="220" fill="url(#band)" transform="rotate(35 64 64)">
    <animate attributeName="x" values="-90;150;150" keyTimes="0;0.38;1" dur="{SHINE_DUR}" repeatCount="indefinite"/>
  </rect></g>
</g>
<g class="m" transform="translate({sx} {sy})">
  <path d="M0,-8 L1.6,-1.6 L8,0 L1.6,1.6 L0,8 L-1.6,1.6 L-8,0 L-1.6,-1.6 Z" fill="#fff5cf" transform="scale(0)">
    <animateTransform attributeName="transform" type="scale" values="0;0;1;0;0" keyTimes="0;0.42;0.5;0.6;1" dur="{SHINE_DUR}" repeatCount="indefinite"/>
  </path>
</g>
</svg>"""


# --------------------------------------------------------------------------- direction C
# TAHTIKARTTA — the star chart: a round night window, aurora, a constellation or a beam.
def tahti(badge):
    if badge == "neuro":
        a1, a2, a3 = "#6420a0", "#d07dff", "#9a3fd6"
        body = constellation()
    else:
        a1, a2, a3 = "#0f7a4d", "#62ea8c", "#1fb466"
        body = lighthouse_beam()
    ticks = "".join(
        f'<line x1="64" y1="4.5" x2="64" y2="{8 if i % 4 else 10}" stroke="#b4c1d2" stroke-width="{1 if i % 4 else 1.6}" transform="rotate({i * 7.5} 64 64)"/>'
        for i in range(48)
    )
    stars = "".join(
        f'<circle class="m" cx="{x}" cy="{y}" r="{r}" fill="#eef1ff"><animate attributeName="opacity" values="1;0.25;1" dur="{d}s" begin="{b}s" repeatCount="indefinite"/></circle>'
        for x, y, r, d, b in ((24, 46, 0.9, 3.4, 0), (100, 40, 1.1, 4.2, 1.1), (36, 30, 0.7, 2.9, 0.6), (92, 70, 0.8, 3.8, 2), (20, 70, 0.7, 4.6, 1.5), (106, 58, 0.6, 3.1, 0.3))
    )
    static_stars = "".join(
        f'<circle cx="{x}" cy="{y}" r="{r}" fill="#c6cce6"/>'
        for x, y, r in ((24, 46, 0.9), (100, 40, 1.1), (36, 30, 0.7), (92, 70, 0.8), (20, 70, 0.7), (106, 58, 0.6))
    )
    trees = "M12,104 " + " ".join(
        f"L{x - w},{104} L{x},{104 - h} L{x + w},{104}" for x, h, w in ((16, 16, 6), (26, 22, 7), (36, 12, 5), (92, 14, 5), (102, 24, 7), (112, 16, 6))
    ) + " L116,104 V130 H12 Z"
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
<defs>
  <radialGradient id="sky" cx="0.5" cy="0.9" r="0.9">
    <stop offset="0" stop-color="#253a68"/><stop offset="0.55" stop-color="#0f1834"/><stop offset="1" stop-color="#04060d"/>
  </radialGradient>
  <linearGradient id="aur" x1="0" y1="0" x2="1" y2="0" spreadMethod="reflect">
    <stop offset="0" stop-color="{a1}" stop-opacity="0.15"/><stop offset="0.35" stop-color="{a2}" stop-opacity="0.85"/><stop offset="0.6" stop-color="{a3}" stop-opacity="0.5"/><stop offset="1" stop-color="{a1}" stop-opacity="0.1"/>
    <animateTransform attributeName="gradientTransform" type="translate" values="0 0;1 0;0 0" dur="12s" repeatCount="indefinite"/>
  </linearGradient>
  <linearGradient id="aurfade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.7" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0.2"/>
  </linearGradient>
  <mask id="aurmask"><path d="M0,14 Q32,4 64,16 T128,12 V40 Q96,30 64,42 T0,36 Z" fill="url(#aurfade)"/></mask>
  <clipPath id="win"><circle cx="64" cy="64" r="53"/></clipPath>
  <filter id="glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="1.6"/></filter>
</defs>
<circle cx="64" cy="64" r="62" fill="#1c222c"/>
<circle cx="64" cy="64" r="60" fill="none" stroke="#7a8aa0" stroke-width="3"/>
{ticks}
<circle cx="64" cy="64" r="54.5" fill="none" stroke="#e2e9f2" stroke-width="1.4"/>
<g clip-path="url(#win)">
  <rect width="128" height="128" fill="url(#sky)"/>
  <rect y="0" width="128" height="48" fill="url(#aur)" mask="url(#aurmask)"/>
  {static_stars}
  {stars}
  {body}
  <path d="{trees}" fill="#0f301c"/>
</g>
</svg>"""


def constellation():
    # top-view brain as stars (the pixel direction's node set, doubled to this grid)
    right = [(37, 15), (45, 16), (50, 22), (51, 30), (49, 38), (43, 43), (36, 44)]
    left = [(63 - x, y) for (x, y) in right]
    nodes = [(32, 19)] + right + [(32, 41)] + left[::-1]
    P = [(x * 2 + 0.5, y * 2 + 2) for x, y in nodes]
    loop = "M" + " L".join(f"{f(x)},{f(y)}" for x, y in P) + " Z"
    fis = f"M{f(P[0][0])},{f(P[0][1])} L{f(P[8][0])},{f(P[8][1])}"
    folds_r = [(43, 26), (41, 34)]
    fr = [(x * 2 + 0.5, y * 2 + 2) for x, y in folds_r]
    fl = [(127 - x, y) for x, y in fr]
    fold_r = f"M{f(P[3][0])},{f(P[3][1])} L{f(fr[0][0])},{f(fr[0][1])} L{f(fr[1][0])},{f(fr[1][1])} L{f(P[5][0])},{f(P[5][1])}"
    fold_l = f"M{f(P[13][0])},{f(P[13][1])} L{f(fl[0][0])},{f(fl[0][1])} L{f(fl[1][0])},{f(fl[1][1])} L{f(P[11][0])},{f(P[11][1])}"
    lines = "".join(f'<path d="{d}" fill="none" stroke="#c6cce6" stroke-opacity="0.45" stroke-width="0.9"/>' for d in (loop, fis, fold_r, fold_l))
    dots = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="1.9" fill="#f6dcff"/><circle cx="{f(x)}" cy="{f(y)}" r="3.6" fill="#d07dff" opacity="0.25"/>' for x, y in P + fr + fl)
    comet = f"""<g class="m">
  <circle r="4.5" fill="#d07dff" opacity="0.6" filter="url(#glow)"><animateMotion dur="8s" repeatCount="indefinite" path="{loop}"/></circle>
  <circle r="1.9" fill="#fff"><animateMotion dur="8s" repeatCount="indefinite" path="{loop}"/></circle>
  <circle r="1.4" fill="#fff" opacity="0.5"><animateMotion dur="8s" begin="-0.18s" repeatCount="indefinite" path="{loop}"/></circle>
</g>"""
    branch = "".join(
        f"""<g class="m"><circle r="1.6" fill="#fff" opacity="0"><animateMotion dur="8s" begin="{b}s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.15;1" calcMode="linear" path="{d}"/><animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.02;0.15;1" dur="8s" begin="{b}s" repeatCount="indefinite"/></circle></g>"""
        for d, b in ((fis, 0), (fold_r, 1.6), (fold_l, 6.4))
    )
    return lines + dots + comet + branch


def lighthouse_beam():
    lh = LIGHTHOUSE
    bands = "".join(f'<rect x="50" y="{y}" width="28" height="6" fill="#de3a3a"/>' for y in (52, 64, 76, 88))
    return f"""<g>
  <g transform="translate(64 38)">
    <g>
      <path d="M0,-3 L-66,-12 L-66,12 L0,3 Z" fill="#ffe67a" opacity="0.55"/>
      <path d="M0,-1.6 L-66,-6 L-66,6 L0,1.6 Z" fill="#fffbe0" opacity="0.6"/>
      <animateTransform attributeName="transform" type="scale" values="1 1;0 1;-1 1;0 1;1 1" dur="6s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="1;1;1;0.1;1" dur="6s" repeatCount="indefinite"/>
    </g>
  </g>
  <path d="{lh['rock']}" fill="#3c3f49"/>
  <path d="M38,102 Q50,96 64,97" fill="none" stroke="#585c68" stroke-width="1.4"/>
  <clipPath id="tw"><path d="{lh['tower']}"/></clipPath>
  <path d="{lh['tower']}" fill="#f1f3f7"/>
  <g clip-path="url(#tw)">{bands}<rect x="64" y="40" width="14" height="60" fill="#000" opacity="0.18"/></g>
  <path d="{lh['gallery']}" fill="#3c3f49"/>
  <path d="{lh['lantern']}" fill="#ffe67a"/>
  <circle cx="64" cy="38" r="5" fill="#fffbe0" filter="url(#glow)" opacity="0.8"><animate attributeName="opacity" values="0.6;1;0.6;0.3;0.6" dur="6s" repeatCount="indefinite"/></circle>
  <path d="M60,33 V43 M68,33 V43" stroke="#a86c17" stroke-width="1"/>
  <path d="{lh['cap']}" fill="#a41f25"/>
  <rect x="62" y="84" width="4" height="12" rx="1" fill="#26282f"/>
</g>"""


# --------------------------------------------------------------------------- output
STILL_STRIP = [
    (re.compile(r"<animate(Transform|Motion)?\b[^>]*/>", re.S), ""),
    (re.compile(r'<g class="m"[^>]*>.*?</g>', re.S), ""),
    (re.compile(r'<circle class="m"[^>]*>.*?</circle>', re.S), ""),
]


def still(svg):
    for rx, rep in STILL_STRIP:
        svg = rx.sub(rep, svg)
    return svg


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (("lanka", lanka), ("emali", emali), ("tahti", tahti)):
        for badge in ("neuro", "flagship"):
            svg = fn(badge)
            with open(os.path.join(OUT, f"{name}-{badge}.svg"), "w", encoding="utf-8", newline="\n") as fh:
                fh.write(svg)
            with open(os.path.join(OUT, f"{name}-{badge}-still.svg"), "w", encoding="utf-8", newline="\n") as fh:
                fh.write(still(svg))
            print(name, badge, len(svg), "bytes")


if __name__ == "__main__":
    main()
