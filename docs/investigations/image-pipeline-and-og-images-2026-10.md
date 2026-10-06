# Image upload, storage and link-preview serving

**Status: OPEN — nothing decided, no code changed. Researched 2026-10-05.** The trigger was
one broken WhatsApp preview; it turned out to be one instance of a missing shared system.
Re-verify the measurements before acting on them: product pictures get replaced, and
WhatsApp's limit is folklore rather than documentation.

## The symptom

A team profile link (`/en/team/<slug>`) pasted into WhatsApp unfurled with a title and
description but no image. opengraph.xyz showed the expected card for the same URL.

## What it is

**WhatsApp silently drops a preview image above roughly 300 KB.** No platform document
states the figure; it is the widely reported community threshold, and it matched what we
saw. The page's tags were correct, near the top of the HTML, and the image answered 200 to
WhatsApp's user agent. It was simply too big: a 459 KB PNG.

**The team card is a PNG because the card renderer only produces PNG.** Every card under
`src/app/opengraph-images/` is drawn by `next/og`, whose output is always PNG. That is the
right format for the site and Roblox cards (flat colour, text, marks: 56 KB and 72 KB). The
team card is the first card carrying a photograph, and a photograph stored losslessly is
large whatever compression the source photo had: the renderer decodes the embedded JPEG
to pixels before drawing, so the upload's quality has no bearing on the card's size.

A JPEG re-encode of the rendered card was tried and measured: quality 85 took the
live card from 459 KB to 63 KB. It was reverted. It fixes one route and leaves every
other image surface to solve the same problem its own way.

## The same budget, missed elsewhere

Every `og:image` reachable from the English sitemap, measured 2026-10-05 by fetching each
page, reading its `og:image` and downloading it:

| `og:image` | Count | Size | Fits WhatsApp |
|---|---|---|---|
| Product picture, PNG | 20 | 1.4–2.3 MB | no |
| Product picture, JPEG | 3 | 27–55 KB | yes |
| Site card | rest | 56 KB | yes |
| Team card | per person | ~459 KB | no |

**A product page's `og:image` is the stored product picture itself**, with no card around
it. The 20 PNGs are catalogue entries from before catalogue uploads were JPEG-only. They
are already 1200 × 800, just in the wrong format. The catalogue's own rule is that such
entries are corrected by hand (`src/services/catalogue-images/CLAUDE.md`).

**Library covers are unmeasured**: no article was published. They are JPEG-only at
1600 × 900 under a 4 MB cap, and nothing bounds the stored bytes below that cap, so a
detailed cover can exceed 300 KB.

## Every surface already does it differently

Every upload surface makes its own choices of format, size, quality and where the
re-encode happens:

| Surface | Bucket | Picker accepts | Browser pass | Server pass | Stored |
|---|---|---|---|---|---|
| Team photo | `team-photos` (private, 2 MB, JPEG/WebP) | JPEG, PNG, WebP | crop dialog → 800 × 1000 JPEG q0.9 | none | JPEG |
| Product picture | `product-images` (public, no type list) | JPEG, PNG, WebP | crop dialog → 1200 × 800 JPEG q0.9 | verify JPEG + exact size | JPEG; legacy PNG/WebP/AVIF |
| Library cover | `library-covers` (public, 4 MB, JPEG) | JPEG, PNG, WebP | crop dialog → 1600 × 900 JPEG q0.9 | verify JPEG + exact size | JPEG |
| Session photo | `session-images` (public, no cap) | JPEG, PNG, WebP | normalise → ≤ 2048 edge JPEG q0.8, EXIF stripped | re-encode JPEG q80 | JPEG |
| Chat image | `chat-images` (private, 3 MB) | per chat constants | normalise → chat edge/quality | re-encode JPEG q80 | JPEG |
| MCP cover upload | `library-covers` | — | — | verify as the routes do | JPEG |

On the serving side there are three shapes, each choosing its own encoding:

- **Drawn cards** (`src/app/opengraph-images/`): always PNG, whatever they contain.
- **The stored file served directly** (products, Library covers): whatever is stored.
- **Server-side re-encodes for one consumer**: the team card decodes the team photo and
  saves it as JPEG q85 again before embedding it, and the MCP server shrinks covers to
  preview JPEGs for an AI client.

Consequences seen so far:

- **A photo can be saved as JPEG three times before anyone sees it.** The team photo is
  saved at q0.9 in the browser, then q85 by the card route, and the card is then a PNG.
  No one decided that; each step chose its own encoding.
- **EXIF stripping is a guarantee only on the normalise path.** The crop dialog's canvas
  re-encode strips it too, but as a side effect of how that dialog works, not as a stated
  property of the pipeline.
- **The size budget an outside consumer imposes (WhatsApp's ~300 KB) is checked nowhere.**
  No test, no upload rule and no serving rule knows it exists.

## Which way we lean

**One shared image system that every feature goes through, rather than another per-feature
fix.** Roughly three parts, not yet designed:

1. **Ingest.** One upload pipeline: one place that decides the accepted formats, the
   decode bound, the EXIF strip, the orientation bake, the stored format, and each
   purpose's size and quality. The catalogue's purpose map is the nearest existing shape
   and may be the thing to generalise.
2. **Storage.** One stored form per purpose, with the legacy entries brought into it
   once, by hand or by a backfill, instead of every consumer coping with them.
3. **Serving to link previews.** One way to produce an `og:image` from any source (a drawn
   card or a stored picture) that guarantees the format and the byte budget, so a feature
   names what it wants to show and cannot get the encoding wrong. A drawn card containing
   a photograph comes out as JPEG; a flat one can stay PNG.

That is the root `CLAUDE.md`'s correctness-by-mechanism shape: the surface is every
upload route and every `og:image` emitter, and the check is that each goes through the
shared primitive.

**Rejected as the serving fix: pointing `og:image` at Next's image optimiser.** It
converts to a smaller format only when the requester's `Accept` header asks for one, and a
link-preview crawler is unlikely to. That is unverified: measure it before ruling it out
for good.

## Open questions

- **The real budget.** Is ~300 KB still WhatsApp's threshold, and what do the other
  preview consumers that matter to us enforce (Facebook, LinkedIn, iMessage, Slack,
  Discord, X)? The budget the serving primitive guarantees should be the smallest of them.
- **Whether the 20 legacy product PNGs wait for the system or get re-encoded by hand
  now.** Re-encoding each to JPEG and swapping it in through the admin's replace flow
  keeps every product linked, and fixes their previews today. It is a prod write.
- **Whether team photos and session photos belong to the catalogue's purpose model**, or
  to a sibling one: they differ in privacy (private buckets, signed reads) and ownership
  (a Gedu writes their own folder).
- **Caching.** Preview consumers cache an image under its URL and ignore our headers. The
  team card versions its URL for that reason, and stored pictures are content-addressed.
  The shared system has to keep one of those properties.

## What would change the answer

- A preview consumer we care about turning out to need something other than a small
  JPEG or PNG would reshape part 3.
- If the legacy PNGs are fixed by hand and no new surface is planned, the system could
  shrink to part 3 alone. That is weaker: the next upload feature would still choose its
  own encoding.

## Re-pulling the measurements

For each URL in `https://sogverse.sog.gg/sitemap.xml`, fetch the page, read
`<meta property="og:image">`, and download that URL, recording its byte size and
`Content-Type`. Fetch with a WhatsApp user agent (`WhatsApp/2.23.20.0 A`) to see what it
sees. A team card is reached from a public team profile page the same way.
