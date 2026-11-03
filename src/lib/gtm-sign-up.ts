import { isGtmArmed } from "@/lib/gtm";
import {
  gtmEcommerce,
  isAdvertisedProduct,
  type GtmEcommerce,
} from "@/lib/marketing-events";
import { signUpShopProductId } from "@/lib/sign-up-target";
import { getClient } from "@/lib/supabase/client";

/**
 * The product a registration form's `sign_up` push names: the advertised shop
 * product whose page the sign-up started from — the one the server's lead
 * names for the same registration, decided by the same rules — unpriced, as a
 * lead always is. `null` when there is none.
 *
 * **Read by the browser, in parallel with the registration itself.** The
 * server decides its own lead's product after its response has gone out, so
 * the answer cannot travel back on that response without making every
 * registration wait for it. The form starts this before it posts and awaits it
 * once the post has answered, by which time a read of one row has long
 * finished; it decides only what one push names, never whether the
 * registration goes ahead.
 *
 * **It never throws.** No container coming (nothing would take the push, so
 * nothing is read), no redirect, another page, an unknown or unadvertised
 * product and a failed read all answer `null`, and the `sign_up` goes out
 * naming no product — exactly as the server's lead would.
 */
export async function gtmSignUpProduct(
  redirect: string | null | undefined,
): Promise<GtmEcommerce | null> {
  try {
    if (!isGtmArmed()) return null;
    const productId = signUpShopProductId(redirect ?? undefined);
    if (!productId) return null;

    const { data: product, error } = await getClient()
      .from("products")
      .select(
        "id, product_type, billing_mode, topic, product_translations(locale, name), product_prices(currency, price_cents)",
      )
      .eq("id", productId)
      .maybeSingle();
    if (error) throw error;
    if (!product || !isAdvertisedProduct(product)) return null;

    return gtmEcommerce(product, { priced: false });
  } catch (error) {
    console.error("[gtm-sign-up] could not read the product", error);
    return null;
  }
}
