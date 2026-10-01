import { getLocale } from "next-intl/server";
import { JsonLd } from "@/components/seo/json-ld";
import { resolveLocale } from "@/lib/constants/locales";
import { translatedCanonicalPath } from "@/lib/metadata/translated-page";
import { productJsonLd } from "@/lib/products/product-json-ld";
import {
  isListedInShop,
  productPagePath,
  productWrittenRows,
} from "@/lib/products/product-metadata";
import { createClient } from "@/lib/supabase/server";
import { ProductsService } from "@/services/products/products.service";

/** The single-product read the page body makes; a failure reads as no product. */
async function readProductDetail(productId: string) {
  try {
    return await new ProductsService(await createClient()).getDetailById(productId);
  } catch (error) {
    console.error("[product-json-ld] the product read failed", error);
    return null;
  }
}

/**
 * A product page's structured data — emitted only while the product is on the
 * shop's listing, which is when its page is promoted
 * (`docs/architecture/site-quality.md`); an unlisted, ended or schools
 * product emits none, because a page a crawler is told not to index has
 * nothing to assert.
 *
 * It reads the product through the same single-product read the visible page
 * body makes, so it can never state something the page does not show. The
 * page renders it behind its own `Suspense` boundary, so the page shell does
 * not wait on these reads; streamed content still arrives in the same HTML
 * response, so the `ld+json` block is in the raw HTML a parser that runs no
 * scripts reads. The listing check and the product read start together, and
 * the read is discarded when the product is not listed.
 *
 * **A failed read emits nothing** and leaves the page itself alone — the body
 * is fetched client-side and has its own error state, so structured data
 * missing for one response costs nothing the next crawl does not restore. A
 * failed listing check answers "not listed", so it emits nothing too.
 */
export async function ListedProductJsonLd({ productId }: { productId: string }) {
  const [listed, product] = await Promise.all([
    isListedInShop(productId),
    readProductDetail(productId),
  ]);
  if (!listed || product === null) return null;

  const locale = resolveLocale(await getLocale());
  const translations = productWrittenRows(product.product_translations);
  const canonicalPath = translatedCanonicalPath(
    translations,
    locale,
    productPagePath(productId),
  );
  const data = productJsonLd({
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    canonicalPath,
    product: { ...product, product_translations: translations },
    locale,
  });

  return data === null ? null : <JsonLd data={data} />;
}
