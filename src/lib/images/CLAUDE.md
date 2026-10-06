# Images — purposes, the preview budget and og:image renditions

## The purpose registry

**Every storage bucket is one image purpose**, declared once in the registry here with its
bucket and its visibility (public, or private and reached only through a signed URL or a
checking route). A purpose kept in the admin image catalogue also declares the exact size
its entries are stored at; the catalogue's own purpose map is that slice of the registry,
not a second list. A unit test parses the storage bucket schema and fails on a bucket with
no purpose, a purpose naming no bucket, or a visibility that disagrees with the bucket's
`public` flag — so a new bucket gets its purpose in the same change.

The team photo, session photo and chat image purposes are declared for that coverage only.
Their upload routes keep their own handling and read nothing from the registry.

## The preview budget

**Every image a link preview fetches from us is at most 250 KB and at most 1200 px wide,
as a PNG or a JPEG.** WhatsApp drops a preview image over roughly 300 KB without a word —
the link arrives with no picture and nothing on our side hears about it. The figure is
community-reported, not documented; it is the strictest consumer we care about (Facebook
allows 8 MB), and the margin below it absorbs how the kilobyte is counted. WebP and AVIF
are not decoded by every crawler, so a preview is never either.

**Bytes for a preview go through `encodeWithinBudget`**, the one place the guarantee
lives. It bakes EXIF orientation, narrows to preview width without enlarging (or crops to
an exact size when the caller declares one), keeps a PNG that fits — a flat card with text
stays crisp — and otherwise walks a JPEG quality ladder. A picture no rung fits throws: an
oversized image is never returned, because it would fail silently in every chat it was
shared into.

## How an image reaches a preview

- **A drawn card returns through `ogCardResponse`**, never as the `ImageResponse` itself.
  The renderer only produces PNG, and a photograph stored losslessly is large whatever the
  upload's quality was, so a card carrying a photo comes out JPEG while a flat card stays
  PNG.
- **A stored catalogue picture's preview URL comes from `ogPictureImage`**, never from a
  bucket URL builder: the stored object is the full-size original, and older product
  pictures are PNGs of a couple of megabytes. The URL leads to the picture route under
  `src/app/opengraph-images/`, which serves only a public catalogue purpose and a
  hash-shaped key (anything else is refused before storage is asked), reads as anon, and
  answers the budgeted rendition or a 500 — never an oversized image. The tag declares the
  rendition's width and height, known from the purpose's stored size.

The routes under `src/app/opengraph-images/` are public images fetched by crawlers and are
excluded from the proxy so they stay cacheable; they sit outside the API route posture
registry on purpose.

## Caching

**A preview consumer caches an image under its URL, for weeks, and ignores our headers —
so a preview URL's bytes never change.** A stored picture's URL is its content hash, which
is why the rendition is served for a year, immutable. A drawn card whose URL carries a
hash of its inputs folds in the card encoding version: **bump it whenever the way cards
are encoded changes** (format, budget, encoder), or every consumer that already fetched a
card keeps the old bytes.

## What keeps it true

A unit test enumerates every route under `src/app/opengraph-images/` and requires each to
return through the card helper or the encoder and none to return a raw `ImageResponse`;
and enumerates every file under `src/` declaring `openGraph:` and requires each to take
its image from `src/lib/og/` (or from another emitter it extends) and never name a
storage URL builder. Both surfaces are found from disk on every run, so a new route or
page is checked without anyone listing it.
