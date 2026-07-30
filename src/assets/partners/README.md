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
| `roblox-wordmark-black.svg` | Official Roblox press kit → "Roblox Logo" pack, `about.roblox.com/press-kit` |
| `lynx-educate.svg` | `lynxeducate.com/wp-content/uploads/2023/10/logo.svg` |
| `sog-badge-yellow.svg` | Our own badge, from the sog.gg Webflow CDN |

The Roblox pack also ships white wordmark and black/white Tilt variants, plus the brand
guidelines PDF. Only the black wordmark is vendored here because that is the only
colourway this codebase currently renders — re-download the pack if a dark-surface
lockup or the Tilt is ever needed.

## Usage constraints

**Roblox** (from the pack's brand guidelines, © 2024 Roblox Corporation): use the black
wordmark on light surfaces and the white one on dark surfaces; keep a clearspace buffer
around the mark so nothing encroaches; never go below 20px; and never recolour, restyle,
adjust transparency, add a stroke or shadow, scale parts independently, skew, rotate,
vertically stack, or place it over a busy background. Their pack also supplies approved
boilerplate copy describing Roblox, and requires a trademark notice wherever the mark
appears. Using the mark to represent a partnership needs Roblox's approval, which we have.

**Lynx Educate** ships only a dark-ink mark — black wordmark with a `#009fe3` lynx head —
so it is illegible on our dark-default background. Lockups therefore sit on an explicitly
light surface (see the `brand-plate` tokens in `globals.css`) with every mark in its
light-surface colourway. Do **not** recolour their wordmark to solve this; the fix is a
reversed variant from Lynx, tracked in `TODO.md`.
