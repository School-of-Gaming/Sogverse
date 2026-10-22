import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import { getPathname } from "@/i18n/navigation";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { LANDING_PRODUCT_TYPES } from "@/lib/landing-pages/sections";
import { readMcpCaller } from "@/lib/mcp/auth";
import { READ_ONLY, answer, refusal } from "@/lib/mcp/library-call";
import { productPageHref } from "@/lib/products/product-page-href";
import { createBearerClient } from "@/lib/supabase/bearer";
import { nextKeysetCursor, type KeysetCursor } from "@/lib/supabase/keyset";
import { getOrigin } from "@/lib/url";
import { listingAbsenceReasons } from "@/services/landing-pages/landing-pages.product-picks";
import {
  ADMIN_PRODUCT_LIST_PAGE_SIZE,
  ProductsService,
  type AdminProductListRow,
} from "@/services/products/products.service";
import { Constants } from "@/types";

/*
 * The product tools: what an AI app needs to find products — today, the picks
 * of a landing page's products section. Read-only, and on the admin's own
 * token-bound client like every tool, through the admin product list's own
 * read: every product of every type, filtered and keyset-paged exactly as
 * `/admin/products` pages it. Whether each one shows in a products section is
 * the listing's answer for that page of products — the read the section draws
 * by, over the same types — so the two cannot disagree.
 */

/** Whether a product shows in a landing page's products section now. */
type SectionListing = "listed" | "ended" | "hidden";

const LISTING =
  'listing says whether a landing page\'s products section shows the product now: "listed" is drawn; "ended" is not, its term being over, and never will be again; "hidden" is not, because the admin has unlisted it — it shows again if they list it.';

const PICKING =
  "A products section draws listed products of every type, municipality clubs included; a pick goes stale as terms end — the page then simply leaves its card out — and get_landing_page reports each products section's picks under productPicks, shown or not and why, for swapping in next term's products.";

/**
 * The page a cursor resumes after, as the AI app carries it: opaque, so it is
 * passed back as it was handed out and never built by hand.
 */
function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

const cursorShape = z.object({ createdAt: z.string().min(1), id: z.string().min(1) });

function decodeCursor(raw: string): KeysetCursor | null {
  try {
    const parsed = cursorShape.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const input = z.object({
  type: z
    .enum(Constants.public.Enums.product_type)
    .optional()
    .describe("Only products of this type. Every type when left out."),
  search: z
    .string()
    .max(200)
    .optional()
    .describe(
      "Only products with this text in any of their names, in any language, ignoring case.",
    ),
  spokenLanguage: z
    .enum(Constants.public.Enums.spoken_language)
    .optional()
    .describe("Only products delivered in this spoken language."),
  weekday: z
    .number()
    .int()
    .min(0)
    .max(6)
    .optional()
    .describe("Only products scheduled on this weekday, 0 for Monday to 6 for Sunday."),
  cursor: z
    .string()
    .optional()
    .describe("nextCursor from the previous page, to read the page after it. Left out for the first page."),
});

function sectionListing(
  row: AdminProductListRow,
  listedIds: ReadonlySet<string>,
  now: Date,
): SectionListing {
  if (listedIds.has(row.id)) return "listed";
  return listingAbsenceReasons(row, now).includes("ended") ? "ended" : "hidden";
}

export function registerProductTools(server: McpServer): void {
  server.registerTool(
    "list_products",
    {
      title: "List products",
      description: `School of Gaming's products, every type — clubs, municipality clubs, camps and events, listed or not — newest first, ${ADMIN_PRODUCT_LIST_PAGE_SIZE} to a page, as the admin product list in Sogverse shows them, narrowed by type, a name search, spoken language and weekday. Each one's id, its name in every language it is written in, its type and topic, whether it is online, its start and end dates (calendar dates in its own timezone; a club may have no end), its price (billing mode and the amount in each currency, in cents), its public page (a municipality club's is under its town's schools page), and listing. ${LISTING} The first page says how many products match (total); when more follow, nextCursor is set: pass it back as cursor for the next page, with the same filters. Use the ids as a landing page products section's productIds. ${PICKING}`,
      inputSchema: input,
      annotations: READ_ONLY,
    },
    async ({ type, search, spokenLanguage, weekday, cursor: rawCursor }, ctx) => {
      const authInfo = ctx.http?.authInfo;
      const request = ctx.http?.req;
      if (!authInfo || !readMcpCaller(authInfo) || !request) {
        // Unreachable behind the gate; said rather than assumed.
        return refusal("No verified caller on this request.");
      }
      const cursor = rawCursor === undefined ? undefined : decodeCursor(rawCursor);
      if (cursor === null) {
        return refusal(
          "That cursor is not one list_products handed out. Pass nextCursor exactly as it came, or leave cursor out to start from the first page.",
        );
      }
      try {
        const origin = getOrigin(request);
        const service = new ProductsService(createBearerClient(authInfo.token));
        const page = await service.getAdminListPage(
          {
            type: type ?? null,
            search: search?.trim() ?? "",
            spokenLanguage: spokenLanguage ?? null,
            weekday: weekday ?? null,
            geduId: null,
            municipalityId: null,
          },
          { cursor },
        );
        const listed = await service.listVisibleListingAmong(
          LANDING_PRODUCT_TYPES,
          page.rows.map((row) => row.id),
        );
        const listedIds = new Set(listed.map((row) => row.id));
        const now = new Date();
        const next = nextKeysetCursor(page.rows, ADMIN_PRODUCT_LIST_PAGE_SIZE);

        return answer({
          ...(page.total === null ? {} : { total: page.total }),
          products: page.rows.map((product) => ({
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
            pageLink: `${origin}${getPathname({ href: productPageHref(product, "en"), locale: "en" })}`,
            listing: sectionListing(product, listedIds, now),
          })),
          nextCursor: next === undefined ? null : encodeCursor(next),
        });
      } catch (error) {
        console.error("[mcp] product tool failed:", error);
        return refusal("Sogverse could not read the products. Try again.");
      }
    },
  );
}
