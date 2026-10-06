import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
import { catalogueImageUrl } from "@/lib/images/catalogue-image-url";
import { encodeWithinBudget } from "@/lib/images/encode-within-budget.server";
import { IMAGE_PURPOSES, type ImagePurposeSpec } from "@/lib/images/image-purposes";
import { OG_CARD_CACHE_CONTROL } from "@/lib/og/cards";
import { CATALOGUE_OBJECT_KEY, ogPictureSize } from "@/lib/og/picture";
import type { CatalogueImagePurpose } from "@/types";

/**
 * A stored catalogue picture — a product's picture, a Library article's
 * cover — as a link preview is given it: the same picture, at most preview
 * width, and under the preview byte budget, as a PNG or a JPEG.
 *
 * **Why pages do not point `og:image` at the bucket.** The stored object is the
 * full-size original. Older product pictures are PNGs of up to a couple of
 * megabytes, and nothing bounds a cover's bytes; WhatsApp drops any preview
 * image past roughly 300 KB without a word, so a link to that page arrives with
 * no picture and nobody on our side ever hears of it. This route is the one
 * place a stored picture is turned into a preview, through the one encoder that
 * guarantees the budget (`encodeWithinBudget`), so no page has to judge for
 * itself whether its picture is "probably small enough". Pages name it through
 * `ogPictureImage` (`src/lib/og/picture.ts`), which also declares the
 * rendition's exact size.
 *
 * **The declared size is the served size, whatever is stored.** The picture is
 * cropped to cover `ogPictureSize` — the very size `ogPictureImage` declares —
 * rather than merely narrowed. Catalogue entries uploaded before sizes were
 * enforced can be any shape and nothing detects them, so narrowing alone would
 * serve such an entry at a size the tag contradicts, and a preview that trusts
 * the tag would letterbox or mis-crop it.
 *
 * **It can reach only a public catalogue bucket.** The purpose has to be a
 * catalogue purpose and its registry entry has to say `public`, checked here on
 * every request rather than assumed, so a private bucket stays unreachable from
 * this address whatever a later registry entry declares. The bytes are fetched
 * from the bucket's public object URL (`catalogueImageUrl`) with no cookies and
 * no key, so the route reads exactly what that URL hands anyone.
 *
 * **Why the public URL, not a Supabase client's `download`.** `download` goes
 * through storage's authenticated object endpoint, which checks the reader's
 * row-level rules on `storage.objects` even for a public bucket — and the
 * catalogue buckets give anon no read rule there, only admin writes. Giving
 * them one would also let anon list every object in them; the public URL
 * serves a named object of a public bucket without consulting those rules, which
 * is exactly the access a link preview needs and nothing more.
 *
 * **Only a catalogue object key is looked up.** Every catalogue object is named
 * by the sha256 of its bytes, `<sha256>.<ext>`; anything else answers 404
 * before storage is asked, so the address cannot be used to walk a bucket or
 * to make storage requests on a crawler's say-so.
 *
 * **A year, immutable.** The key is the hash of the bytes and an object is
 * never written over, so a different picture is always a different address and
 * what one address serves can never change. The encode runs once per address
 * for as long as the CDN holds it.
 *
 * **A picture that cannot be served within budget is a 500, never an oversized
 * image.** That is either a stored object that will not decode or one no
 * encode brings under the budget; both are ours to fix, and logged, while an
 * oversized answer would fail silently in every chat it was shared into.
 *
 * Like the drawn cards beside it, this sits outside `src/app/api/` and the
 * proxy's matcher excludes its prefix, so the publicly cacheable answer never
 * passes through the session refresh (`src/proxy.ts`).
 */

/**
 * The picture's own sandbox: the bytes are an image and nothing in them may
 * run. The proxy, which sets the app's CSP, never sees this path.
 */
const CONTENT_SECURITY_POLICY = "default-src 'none'; sandbox";

/**
 * Whether a path segment names a catalogue purpose. An own-key check, so a
 * segment like `constructor` names nothing.
 */
function isCataloguePurpose(segment: string): segment is CatalogueImagePurpose {
  return Object.hasOwn(CATALOGUE_IMAGE_PURPOSES, segment);
}

/**
 * The catalogue purpose's bucket when that bucket is public, otherwise `null`.
 * The registry entry is read at its declared type so the visibility check
 * stands for whatever a future entry says.
 */
function publicBucketOf(purpose: CatalogueImagePurpose): string | null {
  const spec: ImagePurposeSpec = IMAGE_PURPOSES[purpose];
  return spec.visibility === "public" ? spec.bucket : null;
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ purpose: string; path: string }> },
) {
  const { purpose, path } = await params;

  if (!isCataloguePurpose(purpose)) return notFound();
  const bucket = publicBucketOf(purpose);
  if (bucket === null || !CATALOGUE_OBJECT_KEY.test(path)) return notFound();

  // A missing object answers 400 or 404 from storage, and anything else not ok
  // is no more servable; none of it is ours to log, since a crawler asking for a
  // key that is not there is ordinary.
  const stored = await fetch(catalogueImageUrl(purpose, path));
  if (!stored.ok) return notFound();

  try {
    const picture = await encodeWithinBudget(Buffer.from(await stored.arrayBuffer()), {
      cover: ogPictureSize(purpose),
    });
    return new Response(new Uint8Array(picture.bytes), {
      headers: {
        "Content-Type": picture.contentType,
        "Content-Length": String(picture.bytes.length),
        "Cache-Control": OG_CARD_CACHE_CONTROL,
        "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      },
    });
  } catch (failure) {
    // Over budget at every rung, or not a picture at all: either way the
    // stored object cannot be served as a preview, and a preview with no image
    // is a better failure than one WhatsApp silently drops.
    console.error(
      `[og-picture] ${purpose}/${path} cannot be served within the preview budget`,
      failure,
    );
    return new Response("Picture unavailable", { status: 500 });
  }
}
