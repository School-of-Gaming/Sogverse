import type { McpServer } from "@modelcontextprotocol/server";
import { SHOP_PRODUCT_TYPES } from "@/components/public/products/shop-categories";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { readMcpCaller } from "@/lib/mcp/auth";
import { READ_ONLY, answer, refusal } from "@/lib/mcp/library-call";
import { createBearerClient } from "@/lib/supabase/bearer";
import { getOrigin } from "@/lib/url";
import { ProductsService } from "@/services/products/products.service";

/*
 * The product tools: what an AI app needs to find shop products to promote —
 * today, the picks of a landing page's products section. Read-only, and on
 * the admin's own token-bound client like every tool, through the products
 * service's own listing read: the one the shop grid and every product rail
 * draw from, so a product listed here is a product a products section shows.
 */

const PICKING =
  "These are exactly the products a landing page's products section can show: the shop's listing, which drops a product when its term ends or it is taken off the listing, and never holds a municipality club. So a pick goes stale as terms end — the page then simply leaves its card out — and get_landing_page reports each products section's picks under productPicks, shown or not and why, for swapping in next term's products.";

export function registerProductTools(server: McpServer): void {
  server.registerTool(
    "list_shop_products",
    {
      title: "List shop products",
      description: `Every product the School of Gaming shop lists now — its clubs, camps and events — newest first: each one's id, its name in every language it is written in, its type and topic, whether it is online, its start and end dates (calendar dates in its own timezone; a club may have no end), its price (billing mode and the amount in each currency, in cents), and its shop page. Use the ids as a landing page products section's productIds. ${PICKING}`,
      annotations: READ_ONLY,
    },
    async (ctx) => {
      const authInfo = ctx.http?.authInfo;
      const request = ctx.http?.req;
      if (!authInfo || !readMcpCaller(authInfo) || !request) {
        // Unreachable behind the gate; said rather than assumed.
        return refusal("No verified caller on this request.");
      }
      try {
        const origin = getOrigin(request);
        const listing = await new ProductsService(
          createBearerClient(authInfo.token),
        ).listVisibleByTypes(SHOP_PRODUCT_TYPES);
        return answer({
          products: listing.map((product) => ({
            productId: product.id,
            names: inLocaleOrder(product.product_translations).map(({ locale, name }) => ({
              locale,
              name,
            })),
            type: product.product_type,
            topic: product.topic,
            online: product.is_remote,
            startDate: product.start_date,
            endDate: product.end_date,
            timezone: product.timezone,
            billingMode: product.billing_mode,
            prices: product.product_prices.map((price) => ({
              currency: price.currency,
              amountCents: price.price_cents,
            })),
            shopLink: `${origin}${getPathname({ href: ROUTES.shopProduct(product.id), locale: "en" })}`,
          })),
        });
      } catch (error) {
        console.error("[mcp] product tool failed:", error);
        return refusal("Sogverse could not read the shop's products. Try again.");
      }
    },
  );
}
