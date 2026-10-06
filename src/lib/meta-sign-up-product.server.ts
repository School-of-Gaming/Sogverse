import "server-only";
import { z } from "zod";
import {
  isAdvertisedProduct,
  metaProductDetails,
  type MetaProductDetails,
} from "@/lib/marketing-events";
import { resolveInternalPath } from "@/lib/navigation/internal-path";
import { normalizeExternalPath } from "@/lib/navigation/locale-path";
import { createAnonClient } from "@/lib/supabase/anon";

/**
 * The product a parent's sign-up started from, in Meta's product fields — or
 * `undefined`, and then the account-creation report names no product.
 *
 * **The value is untrusted.** It is the `?redirect=` the register page was
 * opened with, carried in the registration body by our own forms, so a client
 * can send anything. It is resolved through `resolveInternalPath()`, matched on
 * its locale-stripped, untranslated pathname, and accepted only as a shop
 * product page (`/fi/kauppa/<id>` is `/shop/<id>`); the id must be a UUID before
 * anything is read with it.
 *
 * **Decided by the product row, never by the URL**, exactly as for an
 * enrolment: a product we do not advertise names nothing. The row is read with
 * the anon client, so only a product the public shop would show anyone can be
 * named, and the fields are the ones `metaProductDetails()` builds for the
 * enrolment — one product, described one way.
 *
 * **It never throws.** No redirect, another page, an unknown or unadvertised
 * product and a failed read all answer `undefined`: the Lead goes out as it
 * would have without a product, and nothing about the registration waits on
 * or fails over it.
 */
export async function signUpProductFor(
  redirect: string | undefined,
): Promise<MetaProductDetails | undefined> {
  try {
    const productId = shopProductIdFrom(redirect);
    if (!productId) return undefined;

    const { data: product, error } = await createAnonClient()
      .from("products")
      .select(
        "id, product_type, billing_mode, topic, product_translations(locale, name), product_prices(currency, price_cents)",
      )
      .eq("id", productId)
      .maybeSingle();
    if (error) throw error;
    if (!product || !isAdvertisedProduct(product)) return undefined;

    return metaProductDetails(product);
  } catch (error) {
    console.error("[meta-sign-up-product] could not read the product", error);
    return undefined;
  }
}

// Any absolute base splits a path from its query; the value has already been
// proved same-origin by the time it is parsed against this.
const SENTINEL = "https://internal.invalid";

const SHOP_PRODUCT_TEMPLATE = "/shop/[id]";

const productId = z.string().uuid();

/** The product id a redirect names, when it is a shop product page. */
function shopProductIdFrom(redirect: string | undefined): string | null {
  const path = resolveInternalPath(redirect, "");
  if (!path) return null;

  const { pathname, template } = normalizeExternalPath(
    new URL(path, SENTINEL).pathname,
  );
  if (template !== SHOP_PRODUCT_TEMPLATE) return null;

  const id = pathname.split("/")[2];
  return productId.safeParse(id).success ? id : null;
}
