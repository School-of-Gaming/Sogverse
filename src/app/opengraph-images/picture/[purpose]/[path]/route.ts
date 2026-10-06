import { createAnonClient } from "@/lib/supabase/anon";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
import { encodeWithinBudget } from "@/lib/images/encode-within-budget.server";
import { IMAGE_PURPOSES, type ImagePurposeSpec } from "@/lib/images/image-purposes";
import { OG_CARD_CACHE_CONTROL } from "@/lib/og/cards";
import { CATALOGUE_OBJECT_KEY } from "@/lib/og/picture";
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
 * **It can reach only a public catalogue bucket.** The purpose has to be a
 * catalogue purpose and its registry entry has to say `public`, checked here on
 * every request rather than assumed, so a private bucket stays unreachable from
 * this address whatever a later registry entry declares. The read is the anon
 * client's, with no cookies, so storage's own anon rule is what answers — the
 * route reads exactly what the bucket's public URL would hand anyone.
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
 * The purpose's bucket when it is a catalogue purpose whose bucket is public,
 * otherwise `null`. The registry entry is read at its declared type so the
 * visibility check stands for whatever a future entry says.
 */
function publicCatalogueBucketOf(segment: string): string | null {
  if (!isCataloguePurpose(segment)) return null;
  const spec: ImagePurposeSpec = IMAGE_PURPOSES[segment];
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

  const bucket = publicCatalogueBucketOf(purpose);
  if (bucket === null || !CATALOGUE_OBJECT_KEY.test(path)) return notFound();

  const { data, error } = await createAnonClient().storage.from(bucket).download(path);
  if (error !== null) return notFound();

  try {
    const picture = await encodeWithinBudget(Buffer.from(await data.arrayBuffer()));
    return new Response(new Uint8Array(picture.bytes), {
      headers: {
        "Content-Type": picture.contentType,
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
