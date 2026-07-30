# Partner brand assets

Third-party logos used in partnership lockups. **Vendored deliberately** rather than
served from the `product-images` Supabase bucket: that bucket holds *content* an admin
uploads at runtime and references by a DB path, whereas these are *code* — they change
only when we deploy, they are identical for every visitor, and a revision should be
reviewable in a PR diff. They are imported statically so the bundler content-hashes them
and hands the intrinsic dimensions to `next/image`, which is what keeps a lockup from
reflowing once it has painted.

SVG on purpose: each mark is 2–15KB of text (so git delta-compresses revisions, unlike a
binary), and a wordmark rendered at a few hundred CSS px stays crisp at any density —
which is also what the Roblox guidelines require ("always at full resolution").

## Provenance

| File | Source |
|---|---|
| `roblox-wordmark-white.svg` | Official Roblox press kit → "Roblox Logo" pack, `about.roblox.com/press-kit` |
| `lynx-educate.svg` | `lynxeducate.com/wp-content/uploads/2023/10/logo.svg` — as supplied, unmodified |
| `lynx-educate-reversed.svg` | **Derived by us** from the file above — see below |
| `sog-badge-yellow.svg` | Our own badge, from the sog.gg Webflow CDN |

The Roblox pack also ships the black wordmark and both Tilt colourways, plus the brand
guidelines PDF. Only the white wordmark is vendored because the app renders dark-only
(the root layout hardcodes the dark class), so the black colourway has no surface to sit
on yet — re-download the pack if a light theme or the Tilt is ever needed.

### The derived Lynx mark

`lynx-educate-reversed.svg` is **our reversal, not something Lynx supplied.** Lynx ships
one colourway everywhere — a `#000000` wordmark with a `#009fe3` lynx head, in the site
`logo.svg` and in both legacy logo PNGs — and there is no reversed variant anywhere on
their site, so their mark is illegible on our dark pages as delivered.

The reversal changes `fill="#000000"` to `fill="#ffffff"` and nothing else: the blue lynx
head keeps its brand colour and every path is byte-identical to the supplied file, which
is kept beside it precisely so the derivation can be verified or redone. Black-to-white is
the conventional reversed treatment and almost certainly what Lynx would send if asked,
but we did not ask — so if Lynx ever supplies an official reversed mark, prefer theirs
over this file.

Do not extend this to the other marks. Roblox supplies both colourways and their
guidelines forbid recolouring outright, so their wordmark is only ever used as shipped.

## Usage constraints

**Roblox** (from the pack's brand guidelines, © 2024 Roblox Corporation): use the black
wordmark on light surfaces and the white one on dark surfaces; keep a clearspace buffer
around the mark so nothing encroaches; never go below 20px; and never recolour, restyle,
adjust transparency, add a stroke or shadow, scale parts independently, skew, rotate,
vertically stack, or place it over a busy background. Their pack also supplies approved
boilerplate copy describing Roblox, and requires a trademark notice wherever the mark
appears. Using the mark to represent a partnership needs Roblox's approval, which we have.

**Lynx Educate** — see "The derived Lynx mark" above. Their trademark is used with
permission; the reversal is our own and needs confirming.
