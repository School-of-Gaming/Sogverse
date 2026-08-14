import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LOCALE } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { productImageSrc } from "@/lib/images/product-image-url";
import { ProductDetailPage } from "@/components/public/products/product-detail-page";

// Unified product detail / signup page for the shop. One route for every
// product type — the page fetches the product and derives its type from the
// row (for type-specific copy and the "back to listing" link). The URL ends in
// an opaque product id, so a per-type path segment (/shop/clubs/[id]) would add
// nesting without making the URL any more readable; a single /shop/[id] keeps
// it simple.
//
// The route shell is a server component purely so it can answer the crawler;
// everything visible is still rendered client-side by ProductDetailPage.

/**
 * Robots policy for product pages: **noindex, unconditionally.** Owner
 * decision (Aug 2026): search engines and AI crawlers may discover only the
 * `/shop` browse surface — never an individual product page, listed or not.
 * Listings change with terms and seasons; the browse page is the stable thing
 * worth a search result, and an unlisted product's direct link (a campaign, an
 * unannounced cohort) must never turn up in search and become listed after
 * all. One static rule covers every case, so it is set unconditionally below,
 * before anything about the product is known.
 *
 * This is a tag, not a robots.txt entry, and that is the point — a disallowed
 * URL is never fetched, so the crawler would never read the tag, and the URL
 * could still be indexed bare off an external link. Allowing the crawl and
 * serving noindex is what actually deindexes.
 *
 * **Noindex does not make the Open Graph card pointless — it is the reason the
 * card matters.** A product page is reached by a link someone was *sent*: a
 * campaign, a parents' WhatsApp group, a Slack channel. The scrapers behind
 * those unfurls read the OG tags and ignore the robots directive, so the card
 * is the only thing standing between a shared club link and a generic
 * site-wide preview. Search stays shut; sharing gets the product.
 */
const ROBOTS_ONLY: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The product's own Open Graph card.
 *
 * **This is the page's only server-side read** — everything visible is still
 * fetched and rendered client-side by `ProductDetailPage` — so it is kept as
 * narrow as the card is: the image path, plus the three translation columns the
 * title and description come out of. The joined shapes the products service
 * selects (prices, slots, locations, holiday calendars) exist for the page
 * body and would be a large second fetch for two strings.
 *
 * **The translation is resolved at the default locale, not the viewer's.** The
 * audience for this metadata is a link scraper, which carries no locale cookie
 * and would therefore get the default anyway; resolving deliberately says so
 * rather than leaving it to a coincidence. `resolveTranslation` walks
 * `en` → `en` → first row from there, so a product translated only into some
 * other language still gets a real name instead of falling back to the
 * site-wide card. A product with no translation at all is DB-impossible, but
 * costs nothing to survive here.
 *
 * A missing product (a bad id, or one no anonymous reader may see) returns the
 * robots-only metadata unchanged — exactly what this route served before the
 * card existed.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: product } = await supabase
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

  const translation = resolveTranslation(
    product?.product_translations,
    DEFAULT_LOCALE,
  );
  if (!product || !translation) return ROBOTS_ONLY;

  // Absolute, so it bypasses the root layout's `%s | Sogverse` template: a
  // shared product link is cold contact, and the brand is the name a parent
  // recognises (CLAUDE.md § Brand vs. Platform). The platform name would be
  // the half of the lockup that survives truncation otherwise.
  const title = `${translation.name} | School of Gaming`;
  // `short_description` is plain text (it renders into a bare <p> on the page
  // body), and it is sent whole — unfurl surfaces clip to their own widths and
  // there is nothing here to choose a better break than they will. An empty
  // one omits the key rather than emitting a blank description.
  const description = translation.short_description || undefined;
  const image = productImageSrc(product.image_path);
  // 3:2, the aspect every product image is stored at. Declaring the true
  // dimensions is what lets a platform crop deliberately to its own frame
  // instead of guessing; a product with no image omits `images` entirely so the
  // root branded card (src/app/opengraph-image.tsx) is inherited.
  const images = image
    ? [{ url: image, width: 1200, height: 800, alt: translation.name }]
    : undefined;

  return {
    ...ROBOTS_ONLY,
    title: { absolute: title },
    description,
    // `siteName` is restated, not inherited: a child `openGraph` replaces the
    // root's block wholesale, so leaving it out would silently drop
    // `og:site_name` from exactly the pages most likely to be shared. Whether
    // that tag should say "Sogverse" at all is the open question CLAUDE.md
    // flags under § Brand vs. Platform — this repeats today's answer rather
    // than deciding it here as a side effect.
    openGraph: { type: "website", siteName: "Sogverse", title, description, images },
    // Mirrored rather than inherited: Next.js replaces the parent's `twitter`
    // block wholesale when a child declares one and keeps the parent's intact
    // when it does not — so omitting this would leave the Twitter card naming
    // the site while the Open Graph card named the product.
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export default async function ShopProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductDetailPage productId={id} />;
}
