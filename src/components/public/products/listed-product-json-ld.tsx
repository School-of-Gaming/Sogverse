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

/**
 * A product page's structured data — emitted only while the product is on the
 * shop's listing, which is when its page is promoted
 * (`docs/architecture/discoverability.md`); an unlisted, ended or schools
 * product emits none, because a page a crawler is told not to index has
 * nothing to assert.
 *
 * It reads the product through the same single-product read the visible page
 * body makes, so it can never state something the page does not show. It is
 * rendered on the server, in the first HTML, rather than streamed behind a
 * boundary: a consumer that does not run scripts still meets it.
 *
 * **A failed read emits nothing** and leaves the page itself alone — the body
 * is fetched client-side and has its own error state, so structured data
 * missing for one response costs nothing the next crawl does not restore.
 */
export async function ListedProductJsonLd({ productId }: { productId: string }) {
  if (!(await isListedInShop(productId))) return null;

  const product = await new ProductsService(await createClient())
    .getDetailById(productId)
    .catch((error: unknown) => {
      console.error("[product-json-ld] the product read failed", error);
      return null;
    });
  if (product === null) return null;

  const locale = resolveLocale(await getLocale());
  const translations = productWrittenRows(product.product_translations);
  const canonicalPath = translatedCanonicalPath(
    translations,
    locale,
    productPagePath(productId),
  );

  return (
    <JsonLd
      data={productJsonLd({
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
        canonicalPath,
        product: { ...product, product_translations: translations },
        locale,
      })}
    />
  );
}
