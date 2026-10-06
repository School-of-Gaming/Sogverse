import { cache } from "react";
import type { Metadata, ResolvingMetadata } from "next";
import { getLocale } from "next-intl/server";
import { SHOP_PRODUCT_TYPES } from "@/components/public/products/shop-categories";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  translatedPageMetadataAlternates,
  type TranslatedPagePath,
} from "@/lib/metadata/translated-page";
import { ogPictureImage } from "@/lib/og/picture";
import { createClient } from "@/lib/supabase/server";
import { ProductsService } from "@/services/products/products.service";

/**
 * Robots policy for product pages: **decided per request, from the product's
 * own row** (owner, 2026-10-01). A product page is indexable exactly when its
 * product is on the shop's listing — listed, a shop type, and not ended, by
 * the very query the shop grid reads — and only at its shop address. Every
 * other product page is `noindex, nofollow`: an unlisted product, one that has
 * ended, a municipality club, and any product read through the `/schools`
 * tree. That is what `unlisted` means: hidden from the shop and never
 * promoted — not by the grid, not by a search engine, not by an AI assistant —
 * while a parent who was sent the link still gets in, because nothing here
 * gates the page itself.
 *
 * The owner's trade, stated with it: being found beats the occasional false
 * positive, so a product a search engine indexed while it was listed stays in
 * the index until its next crawl reads the tag that unlisting put there.
 * Search Console's removal tool is the fast path when that wait matters. The
 * whole posture, tier by tier, is the "Found" part of
 * `docs/architecture/site-quality.md`.
 *
 * This is a tag, not a robots.txt entry, and that is the point — a disallowed
 * URL is never fetched, so the crawler would never read the tag, and the URL
 * could still be indexed bare off an external link. Allowing the crawl and
 * serving noindex is what actually deindexes.
 *
 * **The Open Graph card is the product's own either way.** A product page is
 * often reached by a link someone was *sent*: a campaign, a parents' WhatsApp
 * group, a Slack channel. The scrapers behind those unfurls read the OG tags
 * and ignore the robots directive, so the card is what a shared link shows
 * whether or not search may index the page.
 */
export const PRODUCT_ROBOTS_ONLY: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Whether the product is on the shop's listing — the question that makes its
 * page indexable. Answered by the listing query itself, narrowed to this id,
 * rather than by a predicate restated over the product row: the grid and the
 * crawler must never disagree about what is listed. Deduped across
 * `generateMetadata` and the render within one request.
 *
 * **A failed read answers no.** The page then serves `noindex` for that one
 * response, which the next crawl corrects; answering yes on a failure would
 * promote a product nobody checked.
 */
export const isListedInShop = cache(async (id: string): Promise<boolean> => {
  try {
    const listed = await new ProductsService(
      await createClient(),
    ).listVisibleListingByTypes(SHOP_PRODUCT_TYPES, id);
    return listed.length > 0;
  } catch (error) {
    console.error("[product-metadata] the shop listing read failed", error);
    return false;
  }
});

/** A product's shop address at a locale — `/fi/kauppa/<id>`. */
export function productPagePath(id: string): TranslatedPagePath {
  return (locale) => getPathname({ href: ROUTES.shopProduct(id), locale });
}

/**
 * The product's own Open Graph card, shared by **every URL that renders a
 * product detail page** — `/shop/[id]` and the municipality route
 * `/schools/[municipalityName]/[id]`, which is a second URL for the same
 * product row. A shared link unfurls as the product at either one.
 *
 * **`promoted` is the robots decision, and the caller makes it**: the shop
 * route passes whether the product is on the shop's listing
 * (`isListedInShop`) as a promise it has not awaited, so that check runs
 * alongside the card's read rather than before it (it never rejects: a failed
 * check answers no), and the schools route passes `false` — the whole tree is
 * reachable, never promoted. A promoted page serves no robots tag, so it is
 * indexable, and names its canonical and language versions by the rule every
 * page written per locale follows (`src/lib/metadata/translated-page.ts`): the
 * locales the product's text was written in are its language versions, and a
 * locale it was not written in canonicalises to the one whose text it shows.
 * Klingon keeps the locale layout's `noindex`, which a page with no robots tag
 * of its own inherits. Anything not promoted is `noindex` with no alternates,
 * as every noindex page is.
 *
 * The card's read is kept as narrow as the card is: the image path, plus the
 * three translation columns the title and description come out of. Everything
 * visible is still fetched and rendered client-side by `ProductDetailPage`, and
 * the joined shapes the products service selects (prices, slots, locations)
 * exist for the page body and would be a large second fetch for two strings.
 *
 * **The translation is resolved at the request locale — the URL's.** It used to
 * resolve at the default locale, and the reason was sound while it held: a link
 * scraper carries no cookie, so it would have got the default anyway, and
 * saying so beat leaving it to a coincidence. The URL carries the locale now, so
 * a `/fi/kauppa/<id>` shared into a Finnish group unfurls with the Finnish name
 * and short description. `resolveTranslation` walks
 * locale → `en` → first row from there, so a product without that language
 * degrades exactly as the page body does rather than falling back to the
 * site-wide card. A product with no translation at all is DB-impossible, but
 * costs nothing to survive here. The picture is the product's own and is not
 * localized; only the text moves.
 *
 * A missing product — which now means only a bad id, since every product that
 * exists is readable — returns the robots-only metadata unchanged, exactly what
 * these routes served before the card existed.
 */
export async function buildProductMetadata(
  id: string,
  parent: ResolvingMetadata,
  promoted: boolean | Promise<boolean>,
): Promise<Metadata> {
  const supabase = await createClient();

  const { data: product, error } = await supabase
    .from("products")
    .select("image_path, product_translations(locale, name, short_description)")
    // Embedded resources come back unordered, so `resolveTranslation`'s last
    // step ("first row present") would otherwise pick an arbitrary language for
    // a product carrying neither the default locale nor English. Alphabetical
    // locale order is arbitrary too, but it is *stable*, which is all that step
    // needs. Ordering an embedded resource needs its table named — a bare
    // `.order("locale")` would order `products` by a column it does not have.
    .order("locale", { referencedTable: "product_translations" })
    .eq("id", id)
    .maybeSingle();

  // Logged, not thrown, and only for a real read failure — an absent product is
  // the ordinary case (a stale link, a draft) and says nothing. Without this, a
  // PostgREST timeout or an RLS regression degrades *every* card to the
  // site-wide default with no signal, and is indistinguishable from a bad id.
  if (error) {
    console.error("[product-metadata] product read failed", error);
  }

  const locale = resolveLocale(await getLocale());
  const translation =
    product && resolveTranslation(inLocaleOrder(product.product_translations), locale);
  if (!product || !translation) return PRODUCT_ROBOTS_ONLY;

  // The product's name and nothing else. It used to be an absolute
  // `… | School of Gaming` string built by hand to bypass a root template that
  // said `%s | Sogverse` — a shared product link is cold contact, and the brand
  // is the name a parent recognises. The template says the brand on every page
  // now (CLAUDE.md § Brand vs. Platform), so the document title arrives at the
  // same words by inheriting it, and the hand-built version has nothing left to
  // fix. The Open Graph and Twitter cards take this name bare, because there the
  // brand has its own field — `og:site_name` below — and a card whose site and
  // title both say "School of Gaming" spends its widest line saying it twice.
  const title = translation.name;
  // `short_description` is plain text (it renders into a bare <p> on the page
  // body), and it is sent whole — unfurl surfaces clip to their own widths and
  // there is nothing here to choose a better break than they will. An empty
  // one omits the key rather than emitting a blank description.
  const description = translation.short_description || undefined;
  // **The picture is a preview rendition, not the stored object.** A stored
  // product picture can be a legacy PNG of a couple of megabytes, and WhatsApp
  // drops any preview image past roughly 300 KB without a word, so the card
  // points at the picture route (`ogPictureImage`), which serves the same
  // picture at preview width under the preview byte budget. That rendition's
  // size is known before it is fetched — a product is stored at one exact size
  // and the route only narrows it — so `width` and `height` are declared, and a
  // consumer that trusts them reserves the right frame instead of measuring.
  //
  // **A product with no picture falls back to the parent's resolved images —
  // the site-wide card the `[locale]` layout emits at this URL's locale — and
  // this cannot be done by omission.** `mergeMetadata` *assigns* `openGraph`
  // rather than merging it, so declaring the block at all discards the layout's
  // images, and `{ images: undefined }` is a declared, empty one. An imageless
  // product would then emit no `og:image` whatsoever, which is strictly worse
  // than the card it used to inherit. `image_path` is tested for truthiness, as
  // every reader of it is: an empty string means no picture, like null.
  const images = product.image_path
    ? [ogPictureImage("product", product.image_path, translation.name)]
    : (await parent).openGraph?.images;

  const alternates = (await promoted)
    ? translatedPageMetadataAlternates(
        inLocaleOrder(product.product_translations),
        locale,
        productPagePath(id),
      )
    : undefined;

  return {
    ...(alternates === undefined ? PRODUCT_ROBOTS_ONLY : { alternates }),
    title,
    description,
    // `siteName` is restated, not inherited: a child `openGraph` replaces the
    // root's block wholesale, so leaving it out would silently drop
    // `og:site_name` from exactly the pages most likely to be shared. It is a
    // verbatim copy of the root's value, not a second decision — the repetition
    // is what Next's merge costs, so keep the two in step.
    openGraph: {
      type: "website",
      siteName: "School of Gaming",
      // The language of the words on the card, which is the translation's —
      // not the URL's, when the product was not written in that locale.
      locale: translation.locale,
      ...(alternates !== undefined && { url: alternates.canonical }),
      title,
      description,
      images,
    },
    // Mirrored rather than inherited: Next.js replaces the parent's `twitter`
    // block wholesale when a child declares one and keeps the parent's intact
    // when it does not — so omitting this would leave the Twitter card naming
    // the site while the Open Graph card named the product.
    twitter: { card: "summary_large_image", title, description, images },
  };
}
