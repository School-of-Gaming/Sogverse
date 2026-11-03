import "server-only";
import {
  advertisedProductDetails,
  isAdvertisedProduct,
  type AdvertisedProductDetails,
} from "@/lib/marketing-events";
import { createAnonClient } from "@/lib/supabase/anon";

/**
 * A product, in every advertising platform's product fields, when it is one we
 * advertise — or `undefined`, and then a report names no product.
 *
 * **Read as a stranger reads it.** The anon client, so only a product the
 * public shop would show anyone can be named, whoever is asking; the id is the
 * caller's to have checked as a UUID first. **Decided by the product row,
 * never by the URL** it was reached from: a product we do not advertise
 * answers `undefined`. The fields are the ones `advertisedProductDetails()`
 * builds for every report — one product, described one way.
 *
 * **It never throws**: an unknown product and a failed read answer `undefined`
 * too, with the failure logged, so whatever called it goes on as if no
 * product had been named.
 */
export async function advertisedProductFor(
  productId: string,
): Promise<AdvertisedProductDetails | undefined> {
  try {
    const { data: product, error } = await createAnonClient()
      .from("products")
      .select(
        "id, product_type, billing_mode, topic, product_translations(locale, name), product_prices(currency, price_cents)",
      )
      .eq("id", productId)
      .maybeSingle();
    if (error) throw error;
    if (!product || !isAdvertisedProduct(product)) return undefined;

    return advertisedProductDetails(product);
  } catch (error) {
    console.error("[advertised-product] could not read the product", error);
    return undefined;
  }
}
