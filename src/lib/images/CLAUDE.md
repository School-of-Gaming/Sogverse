# Images — purposes, the preview budget and og:image renditions

## The purpose registry

**Every storage bucket is one image purpose**, declared once in the registry here with its
bucket and its visibility (public, or private and reached only through a signed URL or a
checking route). A unit test parses the storage bucket schema and fails on a bucket with
no purpose, a purpose naming no bucket, or a visibility that disagrees with the bucket's
`public` flag — so a new bucket gets its purpose in the same change.

**Every purpose declares the size its pictures are stored at**, or that they keep the shape
they were uploaded in. Whatever crops a picture to a fixed size, and whatever checks a
stored picture against it, reads the size from the registry — no feature declares a fixed
size of its own. A picture that keeps its shape is never cropped; how far it may be scaled
down is its feature's own limit, not the registry's.

**Whether a purpose belongs to the admin image catalogue is a separate declaration**, not
implied by a fixed size: a team photo is cropped to its frame but is one person's own
picture and never a catalogue entry. The catalogue's purpose map is the slice of the
registry marked catalogue, not a second list, and the compiler refuses a catalogue purpose
without a fixed size, since the catalogue's crop and upload routes demand an exact one.

**Every purpose declares the largest upload its route accepts**, and the route reads that
figure from the registry, as does any browser check before posting.

**The platform's maximum edge is declared once, beside the registry**: a picture kept as
uploaded is held to it, the server decode bounds its input to its square, and a feature's
check on a claimed size reads it. The database's dimension CHECKs state the same figure as
their own bound.

## Server uploads

**A server upload route takes its bytes through the shared ingest steps in
`ingest-image.server.ts`**: the byte cap from the purpose's registry entry, a sniff of the
JPEG start-of-image marker (the declared content type is never consulted), then a
re-encode that bakes the orientation into the pixels and drops all metadata, GPS
included, and last a check of the measured size against the registry — exactly the
stored size for a fixed-size purpose, no edge past the platform maximum for one kept as
uploaded. What is stored is the re-encoded bytes, and what a row records is their
measured size, never a size the client claimed. The steps answer a refusal with a reason
and a status rather than throwing, so a route can put its own work between them (a cheap
authorization read before the decode) and answers each reason in its own vocabulary. The
route keeps its own authorization, the order of row and object, the compensation when a
half fails, the object's name and its error codes. The image catalogue's writers stand
outside these steps by design: their uploads come only from admins and are mostly graphics
rather than camera photos, and the browser crop that produced them has already dropped the
metadata, so they store the cropped JPEG byte for byte, named by its hash, after checking
its cap, type and exact size (`src/services/catalogue-images/`).

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
  hash-shaped key (anything else is refused before storage is asked), fetches the bucket's
  public object URL, and answers the budgeted rendition or a 500 — never an oversized
  image. It fetches the URL rather than downloading through a Supabase client because a
  client download checks the reader's rules on `storage.objects` even for a public bucket,
  and the catalogue buckets deliberately give anon none (one would also let anon list
  them). The route crops every picture of a purpose to one size whatever is stored, so the
  tag declares the rendition's width and height in advance.

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
call the card helper or the encoder, and any route that builds an `ImageResponse` to call
the card helper; enumerates every file under `src/` declaring an `openGraph` or `twitter`
block and requires each to take its image from `src/lib/og/` (or from another emitter it
extends) and never name a storage URL builder; and fails on any `opengraph-image.*` or
`twitter-image.*` file under `src/app/`, which Next would turn into an image tag outside
this mechanism. All three are found from disk on every run, so a new route or page is
checked without anyone listing it.
