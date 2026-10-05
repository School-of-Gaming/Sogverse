#!/usr/bin/env python3
"""Builds index.html for the badge-art preview (TEMP, deleted before merge).

Run after generate_pixels.py and generate_svgs.py:  python build_page.py
Reads px/manifest.json for each sprite sheet's frame count and frame duration.
"""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

BADGES = [("neuro", "Neuroinclusive"), ("flagship", "Flagship")]

PIXEL = [
    {
        "id": "merkki",
        "name": "Merkki",
        "gloss": "the embroidered patch",
        "concept": "A Partio-style cloth merit badge: a round twill patch with a raised satin border, a running-stitch ring and the emblem stitched in thread. It reads as made by hand and sewn on, the opposite of a sticker.",
        "system": [
            ("Frame", "60px round patch. A 4px satin border of radial stitches (two thread levels alternating), one darker edge row, a twill cloth field with a 1px shadow under the border, and a dashed running-stitch ring at radius 23."),
            ("Emblem slot", "The 42px circle inside the stitch ring. The emblem is satin thread: a fill with diagonal satin texture, a 1px outline and folds in the darkest thread level."),
            ("Palette rule", "Three ramps per badge: cloth, border thread, emblem thread, plus at most two accent threads. The border thread is the badge's signature hue."),
            ("Motion rule", "One glint travels round the border once per loop. Nothing else moves. 48 frames at 70 ms."),
        ],
        "plug": "Minecraft: grass-green cloth, brown border thread, a pickaxe stitched in grey and wood. A gamer badge keeps the frame and swaps the cloth and thread; the frame never changes, so a jacket of them reads as one collection.",
    },
    {
        "id": "pinssi",
        "name": "Pinssi",
        "gloss": "the enamel pin",
        "concept": "A small hard-enamel pin in the spirit of a gym badge: no frame at all, the emblem is the silhouette. Gold wires separate flat enamel fields, and one shine crosses the metal.",
        "system": [
            ("Frame", "None. The silhouette is the emblem, up to 58px. A 2px gold rim with a lit top-left and a shaded bottom-right, a darker outer edge, flat enamel with a 1px inner shadow, raised 1px gold wires between fields and a fixed gloss dash."),
            ("Emblem slot", "The whole canvas. A new badge is a new silhouette that must not be confused with any other in the case: that distinctness is the point of this direction."),
            ("Palette rule", "One metal plus up to three enamel ramps. Metal names the awarder: gold for a gedu badge, silver for a gamer badge."),
            ("Motion rule", "A diagonal shine sweeps the silhouette (18 frames), the pin rests, then a four-point sparkle blooms on the rim. 36 frames at 80 ms."),
        ],
        "plug": "Minecraft: a pickaxe-shaped pin. eSports: a controller silhouette. Programming: a curly-brace pair. A profile's badges sit in a case, like a gym badge case, and each one is told apart by its outline alone.",
    },
    {
        "id": "revontuli",
        "name": "Revontuli",
        "gloss": "the aurora window",
        "concept": "An arched window onto a Finnish winter night: a spruce line, stars and an aurora. The emblem is made of light in that sky, so every badge shares one landscape and differs only in what shines in it.",
        "system": [
            ("Frame", "A 56x60 arch with a 2px frost-silver rim. Inside: the sky in four dithered bands, a spruce line along the bottom and a ground row."),
            ("Emblem slot", "The sky above the trees, about 44x40px. The emblem is light: stars and lines, a lamp, a beam, never a solid object pasted on."),
            ("Palette rule", "Sky, trees and rim are fixed across every badge. The badge owns the aurora hue and the colour of its light."),
            ("Motion rule", "The aurora's brightness rolls sideways while its pixels stay put, two stars twinkle on a schedule, and light travels along the emblem: a comet round the constellation with branch pulses, or a beam that swings by brightening fixed beam pixels. 48 frames at 70 ms."),
        ],
        "plug": "Programming: a constellation of curly braces with a pulse running along it, under a cyan aurora. Minecraft: a pickaxe constellation under a green aurora. The window is the same for gamers; a gamer badge could simply use a lower, friendlier arch.",
    },
    {
        "id": "mitali",
        "name": "Mitali",
        "gloss": "the medal on a ribbon",
        "concept": "A struck medal hanging from a ribbon. Colour lives only in the ribbon; the medal is one metal in relief, which makes the set feel official and earned.",
        "system": [
            ("Frame", "A gold clasp bar, a 28px ribbon and a 42px medal with a beaded rim, a bevel lit top-left and a recessed field."),
            ("Emblem slot", "The 34px field. The emblem is a single relief shape, embossed by rule: lit on its top-left edge, shadow cast bottom-right. It also supplies one path for the light to travel."),
            ("Palette rule", "The medal is always one metal ramp. The badge owns only the ribbon stripes: the spectrum for Neuroinclusive (the neurodiversity infinity's colours), navy, white and gold for Flagship."),
            ("Motion rule", "A light runs once round the beads and a glint runs once along the emblem's path. 48 frames at 70 ms."),
        ],
        "plug": "Minecraft: green and brown ribbon, a pickaxe in relief with the glint running down its handle and along its head. Note that Yty's Achievement Badges already own the metal tiers (bronze to diamond), so this direction should not use the medal metal to mean anything.",
    },
    {
        "id": "kide",
        "name": "Kide",
        "gloss": "the cut crystal",
        "concept": "An octagonal cut gem with the emblem inlaid in gold on its table. The stone's colour is the badge, and the facets catch the light one at a time, like turning a gem in your hand.",
        "system": [
            ("Frame", "A 64px octagon: eight crown facets shaded by a fixed top-left light, bright cut lines, a dark outer edge and a deep table with a dithered heart."),
            ("Emblem slot", "The 30px table. The emblem is a flat gold inlay with a one-pixel dark gap around it so it reads at 64px."),
            ("Palette rule", "One stone ramp plus gold. Neuroinclusive is amethyst, Flagship is sea sapphire."),
            ("Motion rule", "The light steps clockwise round the facets, each one rising a single level in turn, and a sparkle blooms on the top-left corner once per loop. 40 frames at 75 ms."),
        ],
        "plug": "Minecraft: an emerald with a pickaxe inlay. Programming: a cyan stone with a brace inlay. The stone colours could become a fixed palette of a dozen hues, so a collection reads like a jewellery tray.",
    },
]

VECTOR = [
    {
        "id": "lanka",
        "name": "Lanka",
        "gloss": "thread, in vector",
        "concept": "The stitched patch drawn clean: a satin border built from a thick dashed stroke, a twill pattern, a running-stitch ring and an emblem outlined in thread with stitched folds.",
        "system": [
            ("Frame", "A 128-unit round patch: satin border (r 56, dashed 9.5-wide stroke), twill field, dashed stitch ring at r 46."),
            ("Emblem slot", "The 88-unit circle inside the ring. Emblems are filled shapes with a dark thread outline; inner lines are dashed, as stitches."),
            ("Palette rule", "Cloth, border thread and emblem thread, as in Merkki."),
            ("Motion rule", "A highlight runs round the border (one 6 s loop) and a soft sheen crosses the patch once per loop."),
        ],
        "plug": "Any new badge supplies an emblem group and three colours. Stitched details come free by drawing inner lines dashed.",
    },
    {
        "id": "emali",
        "name": "Emali",
        "gloss": "enamel, in vector",
        "concept": "The enamel pin with real metal: a gold gradient rim built by stroking every part of the emblem, so any set of shapes becomes one solid pin, with gold wires between enamel fields.",
        "system": [
            ("Frame", "None. Each emblem part is stroked twice (dark gold, then a gradient gold) behind its fill, which welds the parts into one pin."),
            ("Emblem slot", "The whole 128 units; silhouette first, as in Pinssi."),
            ("Palette rule", "One metal gradient plus up to three enamel gradients; gold for gedu badges, silver for gamer badges."),
            ("Motion rule", "One shine band sweeps across the clipped silhouette in the first 38% of a 4.2 s loop, then a sparkle blooms on the rim and the pin rests."),
        ],
        "plug": "A new badge is a list of (path, enamel) pairs plus optional wire paths; the rim, the clip for the shine and the sparkle are generated from that list.",
    },
    {
        "id": "tahti",
        "name": "Tähtikartta",
        "gloss": "the star chart",
        "concept": "A round night window with a graduated silver bezel, like an instrument. The emblem is drawn in the sky, and the motion follows the same path that draws it.",
        "system": [
            ("Frame", "A silver bezel with 48 ticks, a night radial gradient, a drifting aurora band and a spruce line."),
            ("Emblem slot", "The sky, about 80 units across. A constellation (nodes and lines) or a lit object such as the lighthouse."),
            ("Palette rule", "Bezel, sky and trees fixed; the badge owns the aurora's three stops and its light colour."),
            ("Motion rule", "A comet runs along the emblem's own path (8 s), branch pulses leave it, stars breathe out of step; or a beam swings round its lamp (6 s). The aurora drifts on a 12 s loop."),
        ],
        "plug": "A new badge supplies one path, which becomes both the constellation and the comet's route. Programming: a braces constellation under cyan. Minecraft: a pickaxe constellation under green.",
    },
]


def esc(s):
    return html.escape(s, quote=True)


def system_list(items):
    rows = "".join(f"<div><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>" for k, v in items)
    return f'<dl class="sys">{rows}</dl>'


def sprite(name, meta, scale):
    w = 64 * scale
    n = meta["frames"]
    dur = n * meta["ms"]
    return (
        f'<div class="sprite" role="img" aria-label="{esc(name)} at {scale}x" '
        f'style="--w:{w}px;--n:{n};--d:{dur}ms;background-image:url(px/{name}.png)"></div>'
    )


def pixel_section(d, manifest):
    cards = []
    for key, label in BADGES:
        name = f"{d['id']}-{key}"
        meta = manifest[name]
        cards.append(
            f"""<figure class="card">
  <figcaption><span class="badge-name">{label}</span><span class="meta">{meta['frames']} frames · {meta['ms']} ms · {meta['colours']} colours</span></figcaption>
  <div class="row big">{sprite(name, meta, 4)}</div>
  <div class="row">
    <div class="cell">{sprite(name, meta, 2)}<span>2x</span></div>
    <div class="cell">{sprite(name, meta, 1)}<span>1x</span></div>
    <div class="cell"><img class="px" src="px/{name}-still.png" width="128" height="128" alt="{label} still frame"><span>still</span></div>
    <div class="cell"><img class="px" src="px/{name}-grey.png" width="128" height="128" alt="{label} unearned"><span>unearned</span></div>
  </div>
</figure>"""
        )
    return section(d, "".join(cards), "Pixel")


def vector_section(d):
    cards = []
    for key, label in BADGES:
        name = f"{d['id']}-{key}"
        cards.append(
            f"""<figure class="card">
  <figcaption><span class="badge-name">{label}</span><span class="meta">SVG · SMIL</span></figcaption>
  <div class="row big"><img src="svg/{name}.svg" width="256" height="256" alt="{label} at 256px"></div>
  <div class="row">
    <div class="cell"><img src="svg/{name}.svg" width="128" height="128" alt="{label} at 128px"><span>128px</span></div>
    <div class="cell"><img class="unearned" src="svg/{name}-still.svg" width="128" height="128" alt="{label} unearned"><span>unearned</span></div>
  </div>
</figure>"""
        )
    return section(d, "".join(cards), "Vector")


def section(d, cards, kind):
    return f"""<section id="{d['id']}">
  <p class="eyebrow">{kind}</p>
  <h2>{esc(d['name'])} <span class="gloss">{esc(d['gloss'])}</span></h2>
  <p class="concept">{esc(d['concept'])}</p>
  <div class="pair">{cards}</div>
  {system_list(d['system'])}
  <p class="plug"><strong>A new badge:</strong> {esc(d['plug'])}</p>
</section>"""


CSS = """
:root{--bg:#121212;--card:#1A1A1A;--lifted:#262626;--fg:#EDEDED;--muted:#A6A6A6;--border:#333333;--act:#FAA901;color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font-family:Poppins,system-ui,sans-serif;font-size:16px;line-height:1.6}
body{padding:0 16px 64px;overflow-x:hidden}
main{max-width:1040px;margin:0 auto}
header{padding:40px 0 8px;border-bottom:1px solid var(--border)}
h1{font-size:1.875rem;line-height:1.15;font-weight:600;margin:0 0 12px}
@media (min-width:720px){h1{font-size:2.25rem}}
h2{font-size:1.5rem;line-height:1.3;font-weight:600;margin:0 0 8px}
.gloss{color:var(--muted);font-weight:400;font-size:1.05rem}
.eyebrow{margin:0 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--act);font-weight:600}
.lede{color:var(--muted);max-width:68ch;margin:0 0 16px}
nav{display:flex;flex-wrap:wrap;gap:8px;padding:16px 0}
nav a{color:var(--fg);text-decoration:none;font-size:.875rem;padding:4px 12px;border:1px solid var(--border);border-radius:999px}
nav a:hover{background-image:linear-gradient(rgba(237,237,237,.08),rgba(237,237,237,.08))}
section{padding:40px 0;border-bottom:1px solid var(--border)}
.concept{max-width:68ch;margin:0 0 20px}
.pair{display:flex;flex-wrap:wrap;gap:16px}
.card{margin:0;flex:1 1 300px;min-width:0;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px}
figcaption{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 12px;margin-bottom:12px}
.badge-name{font-weight:600}
.meta{font-size:.75rem;color:var(--muted);font-family:"Space Mono",ui-monospace,monospace}
.row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:16px}
.row.big{justify-content:center;padding:8px 0 20px}
.cell{display:flex;flex-direction:column;align-items:center;gap:4px}
.cell span{font-size:.75rem;color:var(--muted)}
.sprite{width:var(--w);height:var(--w);background-repeat:no-repeat;background-position:0 0;background-size:calc(var(--n) * var(--w)) var(--w);image-rendering:pixelated;animation:play var(--d) steps(var(--n)) infinite}
@keyframes play{to{background-position:calc(var(--n) * var(--w) * -1) 0}}
img{display:block;max-width:100%;height:auto}
img.px{image-rendering:pixelated}
img.unearned{filter:grayscale(1) brightness(.62) contrast(.9)}
.sys{display:grid;grid-template-columns:1fr;gap:12px;margin:24px 0 0}
@media (min-width:720px){.sys{grid-template-columns:1fr 1fr}}
.sys div{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 16px}
.sys dt{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:4px}
.sys dd{margin:0;font-size:.875rem}
.plug{max-width:72ch;margin:20px 0 0;font-size:.875rem}
.plug strong{color:var(--act);font-weight:600}
.notes{font-size:.875rem;color:var(--muted);max-width:72ch}
.notes li{margin:4px 0}
"""


def main():
    with open(os.path.join(HERE, "px", "manifest.json")) as fh:
        manifest = json.load(fh)
    nav = "".join(f'<a href="#{d["id"]}">{esc(d["name"])}</a>' for d in PIXEL + VECTOR)
    body = "".join(pixel_section(d, manifest) for d in PIXEL) + "".join(vector_section(d) for d in VECTOR)
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Badge art directions</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&family=Space+Mono&display=swap" rel="stylesheet">
<style>{CSS}</style>
</head>
<body>
<main>
<header>
  <p class="eyebrow">Temporary preview, deleted before merge</p>
  <h1>Badge art directions</h1>
  <p class="lede">Eight directions for gedu and gamer badges, each shown with the two badges that exist today: Neuroinclusive and Flagship. Five are 64x64 pixel art, played from sprite sheets; three are animated SVG. Each is a system: a shared frame, an emblem slot, a palette rule and a motion rule, so a future badge plugs in by changing its emblem and colours.</p>
  <ul class="notes">
    <li>Every animation here plays regardless of your motion settings, so the motion can be judged.</li>
    <li>"Unearned" is the resting frame in grey. Pixel art maps each colour's brightness into a narrow, dim grey band; vector art is the still file desaturated and dimmed.</li>
    <li>Pixel motion only changes colours, never shapes (the one deliberate exception is a sparkle), so outlines stay pixel-stable and every loop closes on itself. Every frame is generated by rule from <a href="generate_pixels.py">generate_pixels.py</a>; the vectors from <a href="generate_svgs.py">generate_svgs.py</a>.</li>
  </ul>
  <nav aria-label="Directions">{nav}</nav>
</header>
{body}
</main>
</body>
</html>
"""
    with open(os.path.join(HERE, "index.html"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(page)
    print("index.html", len(page), "bytes")


if __name__ == "__main__":
    main()
