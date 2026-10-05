#!/usr/bin/env python3
"""Pixel-art badge generator for the badge-art preview page (TEMP, deleted before merge).

Every badge is built from rules, never painted by hand:

* A pixel is a (ramp, level) pair. A ramp is one hue's dark-to-light list of colours, so a
  badge can only ever use the colours its ramps name, and an effect (a shine, a glint, a
  pulse) is "this pixel goes up N levels on its own ramp". That keeps every frame inside
  the palette and keeps the outline pixel-stable: motion changes colours, never shapes.
* A direction is a function that takes a badge spec (emblem + colours) and returns frames.
  Adding a badge to a direction means adding a spec, not drawing.

Run:  python generate_pixels.py [contact_dir]
Writes px/<direction>-<badge>.png (horizontal sprite sheet), -still.png and -grey.png, and
px/manifest.json with the frame count and frame duration of each sheet. With contact_dir,
also writes enlarged contact sheets of every frame there (for review, not for the page).
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "px")
S = 64
ALL = [(x, y) for y in range(S) for x in range(S)]
N4 = [(1, 0), (-1, 0), (0, 1), (0, -1)]
N8 = N4 + [(1, 1), (1, -1), (-1, 1), (-1, -1)]

# --------------------------------------------------------------------------- palette
# Every ramp runs dark -> light, six levels (0..5).
RAMPS = {
    "gold": ["#2e1b06", "#6b400c", "#a86c17", "#dda12b", "#f6d267", "#fff5cf"],
    "silver": ["#1c222c", "#465163", "#7a8aa0", "#b4c1d2", "#e2e9f2", "#ffffff"],
    "violet": ["#22103d", "#43206f", "#6a33a8", "#9659dc", "#c597fb", "#efdfff"],
    "teal": ["#062b2c", "#0b4f4c", "#11807a", "#21b5a5", "#6fe3cf", "#d2fff4"],
    "pink": ["#3a0d25", "#6b1842", "#a22a66", "#d94d93", "#fb8fc0", "#ffd9ec"],
    "navy": ["#0a132c", "#122758", "#1b418c", "#2b66c9", "#68a0ee", "#c6ddff"],
    "sea": ["#06223a", "#0a3b5c", "#125d88", "#1f8bb6", "#58bfe0", "#c0efff"],
    "red": ["#360a0d", "#681318", "#a41f25", "#de3a3a", "#ff7c70", "#ffcbc2"],
    "sail": ["#353a46", "#636b7a", "#9ea6b4", "#d3d8e0", "#f1f3f7", "#ffffff"],
    "wood": ["#26140a", "#4b2a12", "#764420", "#a4662f", "#cf934f", "#f1c88e"],
    "pine": ["#071a10", "#0f301c", "#18502c", "#257540", "#4fa65e", "#a5dc9c"],
    "night": ["#04060d", "#090e20", "#0f1834", "#18264c", "#253a68", "#3a558e"],
    "aurora_g": ["#06281f", "#0b4a35", "#0f7a4d", "#1fb466", "#62ea8c", "#d0ffd8"],
    "aurora_v": ["#1d0b33", "#3a1463", "#6420a0", "#9a3fd6", "#d07dff", "#f6dcff"],
    "star": ["#2a2a3a", "#55597a", "#8f96bb", "#c6cce6", "#eef1ff", "#ffffff"],
    "lamp": ["#3b2a05", "#7a5508", "#c08a12", "#f2c02c", "#ffe67a", "#fffbe0"],
    "rock": ["#141519", "#26282f", "#3c3f49", "#585c68", "#7c818f", "#a9aebb"],
    "rb_red": ["#3a0a0a", "#701414", "#b01f1f", "#e5413a", "#ff8a7a", "#ffd0c8"],
    "rb_orange": ["#3d1a04", "#7a3608", "#c25a10", "#f28a1f", "#ffb866", "#ffe2bd"],
    "rb_yellow": ["#3a3005", "#76610a", "#b49612", "#e8c724", "#ffe36b", "#fff6c4"],
    "rb_green": ["#082c12", "#11572a", "#1b8a3e", "#33b858", "#7de08e", "#cfffd6"],
    "rb_blue": ["#071d3d", "#0f3a78", "#1a5cba", "#3389e8", "#7ab6ff", "#d0e6ff"],
    "rb_violet": ["#200c3a", "#3f1a72", "#6430ab", "#9157dd", "#c193ff", "#eddcff"],
}


def rgb(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


# --------------------------------------------------------------------------- masks
def disc(cx, cy, r):
    return {(x, y) for (x, y) in ALL if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r}


def ellipse(cx, cy, rx, ry):
    return {(x, y) for (x, y) in ALL if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1}


def poly(pts):
    out = set()
    n = len(pts)
    for (x, y) in ALL:
        px, py = x + 0.5, y + 0.5
        inside = False
        for i in range(n):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            if (y1 > py) != (y2 > py):
                xi = x1 + (py - y1) * (x2 - x1) / (y2 - y1)
                if px < xi:
                    inside = not inside
        if inside:
            out.add((x, y))
    return out


def edge(m, nb=N4):
    return {(x, y) for (x, y) in m if any((x + dx, y + dy) not in m for dx, dy in nb)}


def erode(m, n=1, nb=N4):
    for _ in range(n):
        m = m - edge(m, nb)
    return m


def dilate(m, n=1, nb=N4):
    for _ in range(n):
        m = m | {(x + dx, y + dy) for (x, y) in m for dx, dy in nb if 0 <= x + dx < S and 0 <= y + dy < S}
    return m


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    L = vx * vx + vy * vy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * vx + (py - ay) * vy) / L))
    qx, qy = ax + t * vx, ay + t * vy
    return math.hypot(px - qx, py - qy), t


def stroke(pts, r, closed=False):
    """Pixels within r of a polyline; also returns each pixel's position along it (0..1)."""
    segs = list(zip(pts, pts[1:] + ([pts[0]] if closed else [])))
    lens = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in segs]
    total = sum(lens) or 1
    starts = []
    acc = 0
    for L in lens:
        starts.append(acc)
        acc += L
    out = {}
    for (x, y) in ALL:
        best = None
        for i, (a, b) in enumerate(segs):
            d, t = seg_dist(x + 0.5, y + 0.5, a[0], a[1], b[0], b[1])
            if best is None or d < best[0]:
                best = (d, (starts[i] + t * lens[i]) / total)
        if best[0] <= r:
            out[(x, y)] = best[1]
    return out


def path_pixels(pts, closed=False):
    """A clean 1px line through float points: ordered, deduplicated, no L-shaped corners."""
    seq = []
    pp = pts + ([pts[0]] if closed else [])
    for (a, b) in zip(pp, pp[1:]):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) * 3))
        for i in range(n + 1):
            x = a[0] + (b[0] - a[0]) * i / n
            y = a[1] + (b[1] - a[1]) * i / n
            p = (int(math.floor(x)), int(math.floor(y)))
            if not seq or seq[-1] != p:
                seq.append(p)
    # bridge diagonal-free gaps, then prune L corners
    clean = []
    for p in seq:
        if clean and p in clean[-3:]:
            continue
        clean.append(p)
    i = 1
    while i < len(clean) - 1:
        a, b, c = clean[i - 1], clean[i], clean[i + 1]
        if abs(a[0] - c[0]) == 1 and abs(a[1] - c[1]) == 1 and (abs(a[0] - b[0]) + abs(a[1] - b[1]) == 1):
            del clean[i]
        else:
            i += 1
    return [p for p in clean if 0 <= p[0] < S and 0 <= p[1] < S]


def angle_of(x, y, cx=32, cy=32):
    """0 at the top, increasing clockwise, in 0..1."""
    a = math.atan2(x + 0.5 - cx, -(y + 0.5 - cy))
    return (a / (2 * math.pi)) % 1.0


def wrapdist(a, b):
    d = abs(a - b) % 1.0
    return min(d, 1 - d)


# --------------------------------------------------------------------------- canvas
class Canvas(dict):
    """(x, y) -> (ramp, level)."""

    def fill(self, mask, ramp, level):
        for p in mask:
            self[p] = (ramp, level)

    def bump(self, p, n):
        if p in self:
            r, l = self[p]
            self[p] = (r, max(0, min(5, l + n)))

    def copy(self):
        c = Canvas()
        c.update(self)
        return c


def render(cv, scale=1):
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    pix = im.load()
    for (x, y), (r, l) in cv.items():
        if 0 <= x < S and 0 <= y < S:
            pix[x, y] = rgb(RAMPS[r][l])
    if scale != 1:
        im = im.resize((S * scale, S * scale), Image.NEAREST)
    return im


def grey(im):
    """The unearned look: luma pushed into a narrow, dim grey band, kept on a hard palette."""
    g = im.copy()
    pix = g.load()
    for y in range(S):
        for x in range(S):
            r, gg, b, a = pix[x, y]
            if a == 0:
                continue
            lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b
            v = 46 + lum * 0.42
            v = int(round(v / 12) * 12)
            pix[x, y] = (v, v, v + 3, a)
    return g


def emboss(cv, mask, ramp, base, inside_ok=None):
    """Raised relief: lit on its top-left edge, casting a shadow bottom-right."""
    for (x, y) in mask:
        lvl = base
        if (x - 1, y) not in mask or (x, y - 1) not in mask:
            lvl = base + 1
        if (x + 1, y) not in mask and (x, y + 1) not in mask:
            lvl = base - 1
        cv[(x, y)] = (ramp, max(0, min(5, lvl)))
    for (x, y) in mask:
        for q in ((x + 1, y + 1), (x + 1, y), (x, y + 1)):
            if q not in mask and (inside_ok is None or q in inside_ok):
                cv[q] = (ramp, max(0, base - 2))


def twinkle(cv, cx, cy, size, ramp="star"):
    """A four-point star: size 0 = one pixel, 1 = plus, 2 = long plus."""
    pts = [(cx, cy, 5)]
    if size >= 1:
        pts += [(cx + 1, cy, 4), (cx - 1, cy, 4), (cx, cy + 1, 4), (cx, cy - 1, 4)]
    if size >= 2:
        pts += [(cx + 2, cy, 3), (cx - 2, cy, 3), (cx, cy + 2, 3), (cx, cy - 2, 3)]
    for (x, y, l) in pts:
        if 0 <= x < S and 0 <= y < S:
            cv[(x, y)] = (ramp, l)


TWINKLE_SEQ = [0, 1, 2, 2, 1, 0]  # sizes over six frames


# --------------------------------------------------------------------------- emblems
def brain_parts(cx, cy, w, h, gap=2, bumps=10, rb=None):
    """Top view: two scalloped hemispheres either side of a straight fissure."""
    rb = rb or max(2.2, h / 8.5)
    core = ellipse(cx, cy, w / 2 - rb * 0.7, h / 2 - rb * 0.7)
    m = set(core)
    for side in (-1, 1):
        for k in range(bumps):
            a = -math.pi / 2 + (k + 0.5) * math.pi / bumps
            bx = cx + side * math.cos(a) * (w / 2 - rb)
            by = cy + math.sin(a) * (h / 2 - rb)
            m |= disc(bx, by, rb)
    fissure = {(x, y) for (x, y) in m if abs(x + 0.5 - cx) < gap / 2}
    left = {(x, y) for (x, y) in m if x + 0.5 < cx and (x, y) not in fissure}
    right = {(x, y) for (x, y) in m if x + 0.5 > cx and (x, y) not in fissure}
    return m, left, right, fissure


def brain_gyri(cx, cy, w, h, amp=1.1, rows=(-0.52, -0.12, 0.3), freq=0.95):
    """Wiggly sulci, mirrored on both hemispheres, as clean 1px paths."""
    lines = []
    for side in (-1, 1):
        for f in rows:
            half = w / 2 * 0.78 * math.sqrt(max(0.0, 1 - f * f))
            pts = []
            n = 24
            for i in range(n + 1):
                u = i / n
                dx = 2.2 + u * (half - 2.2 - 1.5)
                x = cx + side * dx
                y = cy + f * h / 2 + amp * math.sin(dx * freq + f * 3)
                pts.append((x, y))
            lines.append(path_pixels(pts))
    return lines


def brain_folds(hemi, side, cx, cy, depths=(4, 9), segs=(7, 5), offsets=(0.0, 0.5)):
    """Folds as broken contours: rings parallel to the hemisphere's own outline, cut into
    arcs, the way a pixel brain is usually read. Returns a set of 1px pixels."""
    xs = [p[0] for p in hemi]
    ys = [p[1] for p in hemi]
    ax = (max(xs) - min(xs) + 1) / 2
    ay = (max(ys) - min(ys) + 1) / 2
    hx = (max(xs) + min(xs) + 1) / 2
    hy = (max(ys) + min(ys) + 1) / 2
    out = set()
    # depth is a fraction of the hemisphere's half-size here; segs the number of arcs
    for depth, n, off in zip(depths, segs, offsets):
        k = 1 - depth
        for j in range(n):
            a0 = (j + off) / n
            a1 = a0 + 0.62 / n
            pts = []
            for i in range(25):
                th = 2 * math.pi * (a0 + (a1 - a0) * i / 24)
                wob = 1 + 0.09 * math.sin(th * 7 + j)
                pts.append((hx + side * 0 + math.sin(th) * ax * k * wob, hy - math.cos(th) * ay * k * wob))
            for p in path_pixels(pts):
                if p in hemi and abs(p[0] + 0.5 - cx) > 2 and p not in edge(hemi, N8):
                    out.add(p)
    return out


def ship_parts(cx, base_y, scale=1.0):
    """A two-masted sailing ship. Returns named masks; scale 1.0 is ~34px wide."""
    s = scale
    hull = poly([(cx - 17 * s, base_y - 7 * s), (cx + 17 * s, base_y - 7 * s), (cx + 12 * s, base_y), (cx - 12 * s, base_y)])
    hull_stripe = {p for p in hull if base_y - 5.6 * s <= p[1] + 0.5 <= base_y - 4.2 * s}
    mast = {(x, y) for (x, y) in ALL if abs(x + 0.5 - (cx + 1 * s)) <= 0.5 * max(1, s) and base_y - 30 * s <= y + 0.5 <= base_y - 6.5 * s}
    main = poly([(cx + 2.4 * s, base_y - 27 * s), (cx + 2.4 * s, base_y - 9 * s), (cx + 15 * s, base_y - 9 * s)])
    jib = poly([(cx - 0.4 * s, base_y - 25 * s), (cx - 0.4 * s, base_y - 9 * s), (cx - 13 * s, base_y - 9 * s)])
    flag = poly([(cx + 1.5 * s, base_y - 30.5 * s), (cx + 8.5 * s, base_y - 28.5 * s), (cx + 1.5 * s, base_y - 26.5 * s)])
    return {"hull": hull, "stripe": hull_stripe, "mast": mast, "main": main, "jib": jib, "flag": flag}


def lighthouse_parts(cx, top, bottom):
    h = bottom - top
    tower = poly([(cx - 3.6, top + 9), (cx + 3.6, top + 9), (cx + 6, bottom), (cx - 6, bottom)])
    bands = [{p for p in tower if ((p[1] - (top + 9)) // 5) % 2 == 1}]
    gallery = {(x, y) for (x, y) in ALL if abs(x + 0.5 - cx) <= 5.5 and top + 8 <= y < top + 9}
    lantern = {(x, y) for (x, y) in ALL if abs(x + 0.5 - cx) <= 3 and top + 4 <= y < top + 8}
    cap = poly([(cx - 4.5, top + 4.5), (cx + 4.5, top + 4.5), (cx, top)])
    door = {(x, y) for (x, y) in ALL if abs(x + 0.5 - cx) <= 1 and bottom - 4 <= y < bottom}
    return {"tower": tower, "bands": bands[0], "gallery": gallery, "lantern": lantern, "cap": cap, "door": door}


def infinity_pts(cx, cy, a, n=160):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        d = 1 + math.sin(t) ** 2
        pts.append((cx + a * math.cos(t) / d, cy + a * math.sin(t) * math.cos(t) / d * 1.25))
    return pts


def neuron_parts(cx, cy, s=1.0):
    soma = disc(cx, cy, 3.3 * s)
    branches = [
        [(cx, cy), (cx - 4 * s, cy - 6 * s), (cx - 6 * s, cy - 11 * s)],
        [(cx - 4 * s, cy - 6 * s), (cx - 10 * s, cy - 8 * s)],
        [(cx, cy), (cx + 3 * s, cy - 7 * s), (cx + 2 * s, cy - 12 * s)],
        [(cx + 3 * s, cy - 7 * s), (cx + 8 * s, cy - 10 * s)],
        [(cx, cy), (cx - 7 * s, cy + 1 * s), (cx - 12 * s, cy - 1 * s)],
        [(cx - 7 * s, cy + 1 * s), (cx - 10 * s, cy + 5 * s)],
        [(cx, cy), (cx + 6 * s, cy + 4 * s), (cx + 10 * s, cy + 9 * s), (cx + 11 * s, cy + 13 * s)],
        [(cx + 10 * s, cy + 9 * s), (cx + 14 * s, cy + 9 * s)],
        [(cx + 10 * s, cy + 9 * s), (cx + 7 * s, cy + 13 * s)],
    ]
    lines = set()
    for b in branches:
        lines |= set(path_pixels(b))
    return soma, lines


# --------------------------------------------------------------------------- direction 1
# MERKKI â€” the embroidered patch.
def d1_patch(spec):
    N = 48
    cx = cy = 32
    patch = disc(cx, cy, 30)
    field = disc(cx, cy, 25.6)
    border = patch - field
    rim_out = edge(patch, N8)
    base = Canvas()
    cl = spec["cloth"]
    # cloth: a twill, diagonal ribs one level apart
    for (x, y) in field:
        base[(x, y)] = (cl, 2 if (x + 2 * y) % 5 in (0, 1) else 1)
    # the fabric shadow the raised border casts inward
    for p in edge(field, N8):
        if p[1] >= cy - 12:
            base[p] = (cl, 0)
    # satin border: radial stitches alternate a level
    th = spec["thread"]
    for (x, y) in border:
        idx = int(angle_of(x, y) * 112)
        base[(x, y)] = (th, 3 if idx % 2 == 0 else 2)
    for p in rim_out:
        base[p] = (th, 1)
    for p in edge(border | field, N4) & border:
        pass
    # running stitch ring
    ring = {(x, y) for (x, y) in field if 22.6 <= math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 23.6}
    for (x, y) in ring:
        if int(angle_of(x, y) * 60) % 3 != 2:
            base[(x, y)] = (spec["stitch"], 4)
    spec["emblem"](base)
    frames = []
    for t in range(N):
        cv = base.copy()
        head = t / N
        for (x, y) in border:
            d = wrapdist(angle_of(x, y), head) * 2 * math.pi * 28
            if d < 2.2:
                cv[(x, y)] = (th, 5)
            elif d < 5.5:
                cv.bump((x, y), 1)
        frames.append(cv)
    return frames, 70


def patch_brain(cv):
    m, left, right, fis = brain_parts(32, 32, 34, 34, gap=1.4, bumps=8, rb=3.4)
    for (x, y) in m:
        satin = 3 if (x - y) % 4 else 4
        cv[(x, y)] = ("pink", satin)
    for side, h in ((-1, left), (1, right)):
        for p in brain_folds(h, side, 32, 32, depths=(0.3, 0.68), segs=(3, 2), offsets=(0.1 if side < 0 else 0.4, 0.3)):
            cv[p] = ("pink", 1)
    for p in fis:
        cv[p] = ("pink", 1)
    for p in edge(m, N8):
        cv[p] = ("pink", 1)


def patch_ship(cv):
    # lake: three stitched wave rows
    for (x, y) in ALL:
        r = math.hypot(x + 0.5 - 32, y + 0.5 - 32)
        if r < 22 and y >= 41:
            if (y - 41) % 3 == 0 and (x + (y // 3)) % 6 < 4:
                cv[(x, y)] = ("sea", 4 if y < 46 else 3)
    parts = ship_parts(32, 42, 0.92)
    cv.fill(parts["hull"], "wood", 3)
    for p in edge(parts["hull"], N8):
        cv[p] = ("wood", 1)
    cv.fill(parts["stripe"], "gold", 4)
    cv.fill(parts["mast"], "wood", 2)
    for k in ("main", "jib"):
        for (x, y) in parts[k]:
            cv[(x, y)] = ("sail", 4 if (x + y) % 4 else 5)
        for p in edge(parts[k], N8):
            cv[p] = ("sail", 2)
    cv.fill(parts["flag"], "red", 3)
    for p in edge(parts["flag"], N8):
        cv[p] = ("red", 2)


# --------------------------------------------------------------------------- direction 2
# PINSSI â€” the enamel pin. The emblem is the silhouette.
def pin_render(regions, metal="gold", lines=()):
    """regions: list of (mask, ramp). The union is the silhouette."""
    sil = set()
    for m, _ in regions:
        sil |= m
    cv = Canvas()
    inner = erode(sil, 2, N8)
    rim = sil - inner
    for (x, y) in rim:
        lvl = 3
        if (x - 2, y - 2) not in sil or (x - 1, y - 2) not in sil:
            lvl = 4
        if (x + 2, y + 2) not in sil:
            lvl = 2
        cv[(x, y)] = (metal, lvl)
    for p in edge(sil, N8):
        cv[p] = (metal, 1 if cv[p][1] < 4 else 2)
    for m, ramp in regions:
        for p in m & inner:
            cv[p] = (ramp, 3)
    # enamel lies below the rim: a one-pixel inner shadow on the lower-right
    for (x, y) in inner:
        if (x + 1, y + 1) not in inner or (x, y + 1) not in inner:
            r, l = cv[(x, y)]
            if r != metal:
                cv[(x, y)] = (r, 2)
    # raised cloisonne wires between enamel fields
    for m, ramp in regions:
        for p in edge(m, N4) & inner:
            if any((p[0] + dx, p[1] + dy) in inner and (p[0] + dx, p[1] + dy) not in m for dx, dy in N4):
                if p[0] + p[1] > 0:
                    cv[p] = (metal, 3)
    for ln in lines:
        for p in ln:
            if p in inner:
                cv[p] = (metal, 3)
    return cv, sil


def d2_pin(spec):
    N = 36
    base, sil, glints, star = spec["build"]()
    # glossy enamel: a fixed highlight dash, part of the still
    for p in glints:
        r, l = base[p]
        if r != "gold":
            base[p] = (r, 5)
    frames = []
    sweep = 18
    for t in range(N):
        cv = base.copy()
        if t < sweep:
            c = -10 + (t / (sweep - 1)) * 148
            for (x, y) in sil:
                d = abs((x + y) - c)
                if d <= 1.5:
                    cv.bump((x, y), 2)
                elif d <= 4:
                    cv.bump((x, y), 1)
        k = t - sweep - 1
        if 0 <= k < len(TWINKLE_SEQ):
            twinkle(cv, star[0], star[1], TWINKLE_SEQ[k], "gold")
        frames.append(cv)
    return frames, 80


def pin_brain():
    m, left, right, fis = brain_parts(32, 32, 58, 54, gap=2, bumps=9, rb=5.0)
    gyri = [brain_folds(h, s, 32, 32, depths=(0.28, 0.6), segs=(4, 3), offsets=(0.1 if s < 0 else 0.35, 0.25)) for s, h in ((-1, left), (1, right))]
    cv, sil = pin_render([(left, "violet"), (right, "teal"), (fis, "gold")], "gold", gyri)
    for p in fis:
        if p in cv:
            cv[p] = ("gold", 4 if p[1] < 32 else 3)
    glints = {(x, y) for (x, y) in sil if 11 <= y <= 12 and 13 <= x <= 17} | {(x, y) for (x, y) in sil if 11 <= y <= 12 and 37 <= x <= 41}
    return cv, sil, glints, (54, 12)


def pin_ship():
    p = ship_parts(32, 50, 1.5)
    waves = set()
    for (x, y) in ALL:
        crest = 50.5 - 2.2 * abs(math.sin((x + 0.5 - 32) * 0.33))
        if crest <= y + 0.5 <= 59 and math.hypot(x + 0.5 - 32, (y + 0.5 - 52) * 2.4) < 28:
            waves.add((x, y))
    waves = waves - p["hull"]
    cv, sil = pin_render(
        [(waves, "sea"), (p["hull"], "navy"), (p["main"], "sail"), (p["jib"], "sail"), (p["flag"], "red"), (p["mast"], "gold")],
        "gold",
    )
    glints = {(x, y) for (x, y) in p["main"] if 20 <= y <= 23 and x == 38} | {(x, y) for (x, y) in p["jib"] if 22 <= y <= 25 and x == 28}
    return cv, sil, glints, (49, 7)


# --------------------------------------------------------------------------- direction 3
# REVONTULI â€” a night window: aurora, spruce line, the emblem as light in the sky.
def arch_mask():
    top = disc(32, 30, 28) & {(x, y) for (x, y) in ALL if y < 30}
    body = {(x, y) for (x, y) in ALL if 4 <= x < 60 and 30 <= y < 62}
    m = top | body
    # soften the two bottom corners
    for (x, y) in list(m):
        if y >= 59 and (x < 6 or x > 57) and math.hypot(x + 0.5 - (7 if x < 32 else 57), y + 0.5 - 59) > 3.2:
            m.discard((x, y))
    return m


def d3_night(spec):
    N = 48
    frame = arch_mask()
    inner = erode(frame, 2, N8)
    base = Canvas()
    for p in frame - inner:
        base[p] = ("silver", 3 if p[1] < 32 else 2)
    for p in edge(frame, N8):
        base[p] = ("silver", 1)
    for p in edge(inner, N8) - edge(frame, N8):
        if base.get(p, ("", 0))[0] == "silver" and p[1] < 20:
            base[p] = ("silver", 4)
    # sky: four dithered bands, darkest at the top
    for (x, y) in inner:
        f = (y - 4) / 54
        lvl_f = 1 + f * 2.2
        lvl = int(lvl_f)
        if (lvl_f - lvl) > 0.5 and (x + y) % 2 == 0:
            lvl += 1
        base[(x, y)] = ("night", min(3, lvl))
    # spruce line
    trees = set()
    for tx, th in spec["trees"]:
        trees |= poly([(tx - th * 0.32, 61), (tx + th * 0.32, 61), (tx, 61 - th)])
    trees &= inner
    for (x, y) in trees:
        base[(x, y)] = ("pine", 1 if (x * 7 + y) % 5 else 2)
    for (x, y) in inner:
        if y >= 59:
            base[(x, y)] = ("pine", 0)
    # fixed stars
    for (x, y) in spec["stars"]:
        if (x, y) in inner and base[(x, y)][0] == "night":
            base[(x, y)] = ("star", 3)
    sky = {p for p in inner if base[p][0] == "night"}
    # aurora curtain: positions fixed, brightness rolls sideways
    ar = spec["aurora"]
    curtain = {}
    for x in range(4, 60):
        yc = spec["aurora_y"] + 3.0 * math.sin(x * 0.19 + 0.6)
        length = spec["aurora_len"] + 3 * math.sin(x * 0.31 + 2.0)
        for y in range(int(yc), int(yc + length)):
            if (x, y) in sky:
                curtain[(x, y)] = (y - yc) / length
    fixed = spec["build"](base, inner, sky)
    frames = []
    for t in range(N):
        cv = base.copy()
        for (x, y), v in curtain.items():
            if base[(x, y)][0] != "night" or cv[(x, y)][0] != "night":
                continue
            wave = 0.5 + 0.5 * math.sin(2 * math.pi * (x / 28 - t / N))
            inten = (0.35 + 0.65 * v) * (0.45 + 0.55 * wave)
            if inten > 0.72:
                cv[(x, y)] = (ar, 3)
            elif inten > 0.52:
                cv[(x, y)] = (ar, 2)
            elif inten > 0.36:
                cv[(x, y)] = (ar, 1)
            elif inten > 0.24 and (x + y) % 2 == 0:
                cv[(x, y)] = (ar, 1)
        for (sx, sy, start) in spec["twinkles"]:
            k = (t - start) % N
            if k < len(TWINKLE_SEQ):
                twinkle(cv, sx, sy, TWINKLE_SEQ[k])
        fixed(cv, t, N)
        frames.append(cv)
    return frames, 70


def night_net(base, inner, sky):
    # a top-view brain drawn as a constellation: the outline, the fissure, two folds a side
    right = [(37, 15), (45, 16), (50, 22), (51, 30), (49, 38), (43, 43), (36, 44)]
    left = [(63 - x, y) for (x, y) in right]
    top, bottom = (32, 19), (32, 41)
    nodes = [top] + right + [bottom] + left[::-1]
    loop = list(range(len(nodes)))
    edges = [(loop[i], loop[(i + 1) % len(loop)]) for i in range(len(loop))]
    edges.append((0, 8))  # the fissure
    folds = [(43, 26), (41, 34)]
    base_n = len(nodes)
    nodes += folds + [(63 - x, y) for (x, y) in folds]
    edges += [(3, base_n), (base_n, base_n + 1), (base_n + 1, 5)]
    edges += [(15 - 3 + 1, base_n + 2), (base_n + 2, base_n + 3), (15 - 5 + 1, base_n + 3)]
    paths = []
    for a, b in edges:
        pa, pb = nodes[a], nodes[b]
        line = path_pixels([(pa[0] + 0.5, pa[1] + 0.5), (pb[0] + 0.5, pb[1] + 0.5)])
        paths.append(line)
        for p in line:
            if p in inner:
                base[p] = ("star", 1)
    node_px = []
    for (x, y) in nodes:
        pts = [(x, y), (x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
        node_px.append(pts)
        for p in pts:
            base[p] = ("aurora_v", 4)
        base[(x, y)] = ("star", 5)
    # One comet runs the outline once per loop. When it reaches a node that has an inner
    # branch, a pulse leaves along that branch, and a node it reaches flares.
    n_loop = len(loop)
    ring = []
    arrive = {}
    for i in range(n_loop):
        arrive[edges[i][0]] = len(ring)
        seg = paths[i]
        ring += seg if not ring or seg[0] != ring[-1] else seg[1:]
    L = len(ring)
    span = 8
    start = {}
    for i in range(n_loop, len(edges)):
        a, b = edges[i]
        if a in arrive:
            start[i] = arrive[a] / L
        else:
            prev = [j for j in start if edges[j][1] == a][0]
            start[i] = start[prev] + span / 48

    def fixed(cv, t, N):
        head = t / N * L
        for j, p in enumerate(ring):
            d = min(abs(j - head), L - abs(j - head))
            if d < 0.8:
                cv[p] = ("star", 5)
            elif d < 3:
                cv[p] = ("aurora_v", 4 if d < 2 else 3)
        for k, idx in arrive.items():
            if isinstance(k, int):
                d = min(abs(idx - head), L - abs(idx - head))
                if d < 1.5:
                    for p in node_px[k]:
                        cv[p] = ("star", 5)
        for i, s in start.items():
            k = (t - round(s * N)) % N
            line = paths[i]
            if k < span:
                pos = k / (span - 1) * (len(line) - 1)
                for j, p in enumerate(line):
                    d = abs(j - pos)
                    if d < 0.8:
                        cv[p] = ("star", 5)
                    elif d < 2.2:
                        cv[p] = ("aurora_v", 4)
            elif k == span:
                for p in node_px[edges[i][1]]:
                    cv[p] = ("star", 5)
    return fixed


def night_lighthouse(base, inner, sky):
    lh = lighthouse_parts(32, 12, 51)
    rock = poly([(16, 61), (20, 53), (26, 50), (38, 50), (44, 53), (48, 61)]) & inner
    for (x, y) in rock:
        base[(x, y)] = ("rock", 2 if (x + y) % 3 else 3)
    for p in edge(rock, N8):
        if p[1] < 55:
            base[p] = ("rock", 4)
    base.fill(lh["tower"], "sail", 4)
    base.fill(lh["bands"], "red", 3)
    for p in edge(lh["tower"], N8):
        if p[0] >= 33:
            r, l = base[p]
            base[p] = (r, l - 1)
    base.fill(lh["door"], "rock", 1)
    base.fill(lh["gallery"], "rock", 3)
    base.fill(lh["lantern"], "lamp", 5)
    base.fill(lh["cap"], "red", 2)
    lamp_y = 12 + 6
    beams = {}
    for (x, y) in sky:
        dx = x + 0.5 - 32
        dy = y + 0.5 - lamp_y
        if abs(dx) < 4:
            continue
        if abs(dy) <= abs(dx) * 0.16 + 1.2:
            beams[(x, y)] = (dx, abs(dx))

    def fixed(cv, t, N):
        ph = 2 * math.pi * t / N
        left = max(0.0, math.cos(ph))
        right = max(0.0, -math.cos(ph))
        for (x, y), (dx, dist) in beams.items():
            side = left if dx < 0 else right
            inten = side * (1 - dist / 34)
            if inten > 0.6:
                cv[(x, y)] = ("lamp", 4)
            elif inten > 0.4:
                cv[(x, y)] = ("lamp", 3)
            elif inten > 0.22:
                cv[(x, y)] = ("lamp", 2)
            elif inten > 0.1 and (x + y) % 2 == 0:
                cv[(x, y)] = ("lamp", 1)
        glow = 0.5 + 0.5 * abs(math.cos(ph))
        if glow > 0.85:
            for p in ((31, 16), (32, 16)):
                cv[p] = ("lamp", 5)
    return fixed


# --------------------------------------------------------------------------- direction 4
# MITALI â€” the medal on its ribbon. Colour lives in the ribbon; the medal is metal relief.
def d4_medal(spec):
    N = 48
    cx, cy, R = 32, 41, 21
    base = Canvas()
    stripes = spec["ribbon"]
    rib = {(x, y) for (x, y) in ALL if 18 <= x < 46 and 4 <= y < 34}
    width = 28
    for (x, y) in rib:
        i = min(len(stripes) - 1, (x - 18) * len(stripes) // width)
        lvl = 3
        if x in (18, 45):
            lvl = 2
        if (x - 18) * len(stripes) % width < len(stripes) and x != 18:
            lvl = 2  # a darker seam where two stripes meet
        base[(x, y)] = (stripes[i], lvl)
    # the fold shadow under the clasp
    for x in range(18, 46):
        r, l = base[(x, 4)]
        base[(x, 4)] = (r, 1)
    clasp = {(x, y) for (x, y) in ALL if 16 <= x < 48 and 0 <= y < 4}
    for (x, y) in clasp:
        base[(x, y)] = ("gold", 4 if y == 0 else (3 if y < 3 else 2))
    for p in edge(clasp, N8):
        if p[1] == 3 or p[0] in (16, 47):
            base[p] = ("gold", 1)
    medal = disc(cx, cy, R)
    field = disc(cx, cy, R - 4)
    for p in medal:
        base[p] = ("gold", 3)
    for (x, y) in medal - field:
        dx, dy = x + 0.5 - cx, y + 0.5 - cy
        if dx + dy < -6:
            base[(x, y)] = ("gold", 4)
        elif dx + dy > 8:
            base[(x, y)] = ("gold", 2)
    for p in edge(medal, N8):
        base[p] = ("gold", 1)
    for (x, y) in field:
        base[(x, y)] = ("gold", 2)
    for p in edge(field, N8):
        dx, dy = p[0] + 0.5 - cx, p[1] + 0.5 - cy
        base[p] = ("gold", 1 if dx + dy < 0 else 3)
    # beads on the rim
    beads = []
    nb = 28
    for i in range(nb):
        a = 2 * math.pi * i / nb
        bx = cx + math.sin(a) * (R - 2.2)
        by = cy - math.cos(a) * (R - 2.2)
        px = (int(math.floor(bx)), int(math.floor(by)))
        beads.append(px)
        base[px] = ("gold", 4)
    emb, path = spec["emblem"](cx, cy)
    emboss(base, set(emb), "gold", 3, inside_ok=field)
    frames = []
    for t in range(N):
        cv = base.copy()
        head = t / N * nb
        for i, p in enumerate(beads):
            d = min(abs(i - head), nb - abs(i - head))
            if d < 0.5:
                cv[p] = ("gold", 5)
                twinkle_ok = True
            elif d < 1.5:
                cv[p] = ("gold", 5)
        pos = t / N
        for p, u in emb.items():
            d = wrapdist(u, pos) if path == "closed" else abs(u - pos)
            if d < 0.025:
                cv[p] = ("gold", 5)
            elif d < 0.06:
                cv.bump(p, 1)
        frames.append(cv)
    return frames, 70


def medal_infinity(cx, cy):
    pts = infinity_pts(cx, cy + 0.5, 13.5)
    return stroke(pts, 1.75, closed=True), "closed"


def medal_pennant(cx, cy):
    # path: up the mast, out along the pennant, back along its lower edge
    pts = [(cx - 6, cy + 11), (cx - 6, cy - 11), (cx + 11, cy - 6), (cx + 4, cy - 3.5), (cx + 11, cy - 1), (cx - 6, cy + 0.5)]
    out = stroke(pts, 1.3)
    flag = poly([(cx - 6, cy - 11), (cx + 11, cy - 6), (cx + 4, cy - 3.5), (cx + 11, cy - 1), (cx - 6, cy + 0.5)])
    for p in flag:
        if p not in out:
            out[p] = -1.0
    ball = disc(cx - 6, cy - 12.5, 1.8)
    for p in ball:
        out[p] = out.get(p, 0.0)
    for x in range(int(cx - 13), int(cx + 14)):
        y = cy + 11 + 1.2 * math.sin(x * 0.7)
        p = (x, int(round(y)))
        if math.hypot(p[0] + 0.5 - cx, p[1] + 0.5 - cy) < 15.5:
            out[p] = -1.0
    return out, "open"


# --------------------------------------------------------------------------- direction 5
# KIDE â€” the cut crystal. The hue is the stone; the emblem is a gold inlay on its table.
def octagon(cx, cy, r):
    pts = []
    for i in range(8):
        a = math.pi / 8 + i * math.pi / 4
        pts.append((cx + r * math.sin(a), cy - r * math.cos(a)))
    return poly(pts), pts


def d5_gem(spec):
    N = 40
    cx = cy = 32
    hue = spec["hue"]
    outer, opts = octagon(cx, cy, 31.5)
    table, tpts = octagon(cx, cy, 19)
    crown = outer - table
    base = Canvas()
    facet_of = {}
    # facet light from the top-left: level by facet direction
    facet_lvl = [4, 3, 2, 1, 1, 2, 3, 4]  # facets clockwise from top
    for (x, y) in crown:
        f = int(((angle_of(x, y) + 1 / 16) % 1.0) * 8) % 8
        facet_of[(x, y)] = f
        base[(x, y)] = (hue, facet_lvl[f])
    for (x, y) in table:
        base[(x, y)] = (hue, 2)
    # table: a darker heart so the inlay reads
    for (x, y) in disc(cx, cy, 12):
        if (x, y) in table:
            base[(x, y)] = (hue, 1 if (x + y) % 2 else 2)
    # cut lines: between facets and around the table
    lines = set()
    for (ox, oy), (tx, ty) in zip(opts, tpts):
        lines |= set(path_pixels([(ox, oy), (tx, ty)]))
    lines |= edge(table, N8)
    for p in lines:
        if p in outer:
            base[p] = (hue, 5 if base[p][1] >= 3 else 4)
    for p in edge(outer, N8):
        base[p] = (hue, 0)
    spec["emblem"](base)
    frames = []
    skip = lines | edge(outer, N8)
    for t in range(N):
        cv = base.copy()
        head = t / N
        for p, f in facet_of.items():
            if p in skip:
                continue
            fa = (f + 0.5) / 8
            if wrapdist(fa, head) < 0.0625:
                cv.bump(p, 1)
        k = t - int(N * 0.8)
        if 0 <= k < len(TWINKLE_SEQ):
            twinkle(cv, 14, 12, TWINKLE_SEQ[k])
        frames.append(cv)
    return frames, 75


def gem_neuron(cv):
    soma, lines = neuron_parts(32, 32.5, 1.0)
    shape = soma | lines
    for p in dilate(shape, 1, N8):
        if p not in shape and p in cv and cv[p][0] != "gold":
            r, l = cv[p]
            cv[p] = (r, 0)
    for p in lines:
        cv[p] = ("gold", 4)
    for p in soma:
        cv[p] = ("gold", 4)
    for p in disc(31, 31.5, 1.6):
        cv[p] = ("gold", 5)


def gem_ship(cv):
    p = ship_parts(32, 43, 0.72)
    shape = set()
    for k in ("hull", "mast", "main", "jib", "flag"):
        shape |= p[k]
    for q in dilate(shape, 1, N8):
        if q not in shape and q in cv:
            r, l = cv[q]
            cv[q] = (r, 0)
    cv.fill(p["hull"], "gold", 3)
    cv.fill(p["mast"], "gold", 3)
    cv.fill(p["main"], "gold", 5)
    cv.fill(p["jib"], "gold", 4)
    cv.fill(p["flag"], "gold", 4)


# --------------------------------------------------------------------------- the catalogue
BADGES = {
    "merkki": {
        "neuro": lambda: d1_patch({"cloth": "teal", "thread": "pink", "stitch": "pink", "emblem": patch_brain}),
        "flagship": lambda: d1_patch({"cloth": "navy", "thread": "gold", "stitch": "gold", "emblem": patch_ship}),
    },
    "pinssi": {
        "neuro": lambda: d2_pin({"build": pin_brain}),
        "flagship": lambda: d2_pin({"build": pin_ship}),
    },
    "revontuli": {
        "neuro": lambda: d3_night({
            "aurora": "aurora_v", "aurora_y": 6, "aurora_len": 10,
            "trees": [(8, 9), (13, 13), (19, 8), (45, 9), (51, 14), (57, 10)],
            "stars": [(12, 10), (51, 9), (26, 6), (9, 22), (55, 20), (39, 6)],
            "twinkles": [(51, 9, 6), (12, 10, 30)],
            "build": night_net,
        }),
        "flagship": lambda: d3_night({
            "aurora": "aurora_g", "aurora_y": 9, "aurora_len": 6,
            "trees": [(7, 10), (12, 14), (52, 13), (57, 9)],
            "stars": [(12, 30), (52, 31), (20, 33), (45, 8), (17, 8), (55, 26)],
            "twinkles": [(45, 8, 20), (12, 30, 44)],
            "build": night_lighthouse,
        }),
    },
    "mitali": {
        "neuro": lambda: d4_medal({"ribbon": ["rb_red", "rb_orange", "rb_yellow", "rb_green", "rb_blue", "rb_violet"], "emblem": medal_infinity}),
        "flagship": lambda: d4_medal({"ribbon": ["navy", "sail", "gold", "sail", "navy"], "emblem": medal_pennant}),
    },
    "kide": {
        "neuro": lambda: d5_gem({"hue": "violet", "emblem": gem_neuron}),
        "flagship": lambda: d5_gem({"hue": "sea", "emblem": gem_ship}),
    },
}


def main():
    contact = sys.argv[1] if len(sys.argv) > 1 else None
    only = sys.argv[2] if len(sys.argv) > 2 else None
    os.makedirs(OUT, exist_ok=True)
    manifest_path = os.path.join(OUT, "manifest.json")
    manifest = {}
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            manifest = json.load(f)
    for direction, badges in BADGES.items():
        if only and only != direction:
            continue
        for badge, make in badges.items():
            frames, ms = make()
            name = f"{direction}-{badge}"
            sheet = Image.new("RGBA", (S * len(frames), S), (0, 0, 0, 0))
            for i, cv in enumerate(frames):
                sheet.paste(render(cv), (i * S, 0))
            sheet.save(os.path.join(OUT, name + ".png"), optimize=True)
            still = render(frames[0])
            still.save(os.path.join(OUT, name + "-still.png"), optimize=True)
            grey(still).save(os.path.join(OUT, name + "-grey.png"), optimize=True)
            colours = set()
            for cv in frames:
                colours |= set(cv.values())
            manifest[name] = {"frames": len(frames), "ms": ms, "colours": len({RAMPS[r][l] for r, l in colours})}
            if contact:
                # detail: frame 0 at 8x, the grey still at 4x and native, then every frame at 3x
                k = 3
                cols = 12
                rows = (len(frames) + cols - 1) // cols
                W = max(S * 8 + S * 4 + S + 40, cols * (S * k + 4))
                cs = Image.new("RGBA", (W, S * 8 + 10 + rows * (S * k + 4)), (18, 18, 18, 255))
                cs.alpha_composite(render(frames[0], 8), (0, 0))
                cs.alpha_composite(grey(still).resize((S * 4, S * 4), Image.NEAREST), (S * 8 + 20, 0))
                cs.alpha_composite(still, (S * 8 + 20, S * 4 + 20))
                cs.alpha_composite(grey(still), (S * 8 + 40 + S, S * 4 + 20))
                d = ImageDraw.Draw(cs)
                for i, cv in enumerate(frames):
                    x0 = (i % cols) * (S * k + 4)
                    y0 = S * 8 + 10 + (i // cols) * (S * k + 4)
                    cs.alpha_composite(render(cv, k), (x0, y0))
                    d.text((x0 + 1, y0 + 1), str(i), fill=(110, 110, 110, 255))
                cs.save(os.path.join(contact, name + ".png"))
            print(name, len(frames), "frames", manifest[name]["colours"], "colours")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)


if __name__ == "__main__":
    main()
