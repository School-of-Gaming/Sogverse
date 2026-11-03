import "server-only";
import { advertisedProductFor } from "@/lib/advertised-product.server";
import type { AdvertisedProductDetails } from "@/lib/marketing-events";
import { signUpShopProductId } from "@/lib/sign-up-target";

/**
 * The product a parent's sign-up started from, in every advertising
 * platform's product fields — or `undefined`, and then the account-creation
 * report names no product.
 *
 * **The value is untrusted.** It is the `?redirect=` the register page was
 * opened with, carried in the registration body by our own forms, so a client
 * can send anything. It is resolved through `resolveInternalPath()`, matched on
 * its locale-stripped, untranslated pathname, and accepted only as a shop
 * product page (`/fi/kauppa/<id>` is `/shop/<id>`); the id must be a UUID before
 * anything is read with it.
 *
 * **Decided by the product row, never by the URL**, exactly as for an
 * enrolment, through `advertisedProductFor()`: a product we do not advertise
 * names nothing.
 *
 * **It never throws.** No redirect, another page, an unknown or unadvertised
 * product and a failed read all answer `undefined`: the lead goes out as it
 * would have without a product, and nothing about the registration waits on
 * or fails over it.
 */
export async function signUpProductFor(
  redirect: string | undefined,
): Promise<AdvertisedProductDetails | undefined> {
  const productId = signUpShopProductId(redirect);
  if (!productId) return undefined;
  return advertisedProductFor(productId);
}
