import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import { getPathname } from "@/i18n/navigation";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { LANDING_PRODUCT_TYPES } from "@/lib/landing-pages/sections";
import { readMcpCaller } from "@/lib/mcp/auth";
import { READ_ONLY, answer, refusal } from "@/lib/mcp/library-call";
import { formatProductLocation } from "@/lib/products/format-product-location";
import { clockFace, formatWeekday } from "@/lib/products/format-product-schedule";
import { productPageHref } from "@/lib/products/product-page-href";
import { nextOccurrenceInstant } from "@/lib/schedule-occurrence";
import { createBearerClient } from "@/lib/supabase/bearer";
import { nextKeysetCursor, type KeysetCursor } from "@/lib/supabase/keyset";
import { getOrigin } from "@/lib/url";
import { seatsAreFull } from "@/components/public/products/derive-registration-state";
import { listingAbsenceReasons } from "@/services/landing-pages/landing-pages.product-picks";
import {
  ParticipationsService,
  type ParticipationCounts,
} from "@/services/participations/participations.service";
import {
  ADMIN_PRODUCT_LIST_PAGE_SIZE,
  ProductsService,
  type AdminProductListRow,
} from "@/services/products/products.service";
import { Constants } from "@/types";

/*
 * The product tools: what an AI app needs to know about products — to write
 * about them in posts and ads, and to pick them for a landing page's products
 * section. Read-only, and on the admin's own token-bound client like every
 * tool, through the admin product list's own read: every product of every
 * type, filtered and keyset-paged exactly as `/admin/products` pages it. Each
 * fact is read by the code the app's own pages read it by: whether a products
 * section shows a product is the listing's answer for that page of products —
 * the read the section draws by, over the same types — the seat counts are the
 * shop's read and its full rule, the location is named as the product page
 * names it, and the schedule's clock faces are the schedule formatter's.
 */

/** Whether a product shows in a landing page's products section now. */
type SectionListing = "listed" | "ended" | "hidden";

const LISTING =
  'listing says whether a landing page\'s products section shows the product now: "listed" is drawn; "ended" is not, its term being over, and never will be again; "hidden" is not, because the admin has unlisted it — it shows again if they list it.';

const PICKING =
  "A products section draws listed products of every type, municipality clubs included; a pick goes stale as terms end — the page then simply leaves its card out — and get_landing_page reports the working copy's picks in each products section under productPicks, each with whether it would be drawn once the page is published and why not, for swapping in next term's products.";

/**
 * The page a cursor resumes after, as the AI app carries it: opaque, so it is
 * passed back as it was handed out and never built by hand.
 */
function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

// Checked to the shapes the database will parse, so a cursor that decodes but
// carries a bad timestamp or id is refused as not ours rather than failing in
// Postgres as a retryable read error. `guid`, not `uuid`: fixture ids are not
// RFC-versioned. PostgREST writes microseconds and an offset.
const cursorShape = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.guid(),
});

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

/**
 * One weekly slot as the product's own wall clock reads it. The slot is pinned
 * to its next occurrence so the clock face comes from a real instant, and the
 * end is that instant plus the duration, re-read in the same zone — the
 * schedule formatter's arithmetic, in the product's zone instead of a viewer's.
 */
function slotFacts(
  slot: AdminProductListRow["schedule_slots"][number],
  timezone: string,
  now: Date,
) {
  const start = nextOccurrenceInstant(slot.weekday, slot.start_time, timezone, now);
  return {
    weekday: slot.weekday,
    weekdayName: formatWeekday(slot.weekday, "en"),
    startTime: clockFace(start, timezone),
    endTime: clockFace(new Date(start.getTime() + slot.duration_minutes * 60_000), timezone),
    durationMinutes: slot.duration_minutes,
  };
}

/**
 * Where the product is held, named in English as its admin details page names
 * it: a site with the place it sits in, or the area an online municipality
 * club serves. `null` for an online product with no place behind it.
 */
function locationFacts(product: AdminProductListRow) {
  const location = formatProductLocation(product, "en");
  if (location === null) return null;
  return location.kind === "site"
    ? { site: location.site, area: location.parent }
    : { site: null, area: location.name };
}

/** The seats, by the shop's own read and its rule for "full". */
function seatFacts(product: AdminProductListRow, counts: ParticipationCounts) {
  return {
    capacity: product.seat_count,
    taken: counts.activeCount,
    waitlisted: counts.waitlistCount,
    full: seatsAreFull(product, counts.activeCount),
    waitlistEnabled: product.waitlist_enabled,
  };
}

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
      description: `School of Gaming's products, every type — clubs, municipality clubs, camps and events, listed or not — newest first, ${ADMIN_PRODUCT_LIST_PAGE_SIZE} to a page, as the admin product list in Sogverse shows them, narrowed by type, a name search, spoken language and weekday. Product names are not unique — two products may share a name and a date, such as back-to-back trial slots — so tell them apart by id and schedule. Each one's id; names: its name and short description (shortDescription) in every language it is written in; its type and topic; how it is delivered (deliveryMode: online in a voice room, in_person at a site, or hybrid — children at a site and the gedu in the Sogverse voice room); location: where it is held, in English — site is the venue and area the place it sits in, or for an online municipality club site is null and area is the town or region it serves; location is null for an online product with no place behind it; spokenLanguage: the language it is delivered in; its audience (forGamers: children take seats, forParents: adults take seats themselves; at least one is true) and the children's age range (minAge and maxAge, both set exactly when forGamers is true, both null otherwise); its start and end dates (calendar dates in its own timezone; a club may have no end); timezone, the IANA zone every date and time of the product is in; schedule: its weekly slots, ordered by weekday, at most one a weekday — weekday 0 for Monday to 6 for Sunday, as the weekday filter counts, with weekdayName in English, startTime and endTime as 24-hour HH:MM on the wall clock in the product's own timezone, and durationMinutes; endTime is startTime plus durationMinutes, so an endTime at or before startTime means the slot runs past midnight into the next day; a club's slots repeat every week of its term, a camp's run on each of those weekdays between its dates, an event's one slot is on its date; schedule is empty while no time is set; registrationOpensAt: the instant sign-ups open, ISO 8601; its price (billing mode and the amount in each currency, in cents); seats: capacity (null when there is no seat limit), taken (seats held now), waitlisted (people on the waiting list), full (true when capacity is set and taken has reached it, the rule by which the product's page shows it as full while sign-ups are open — offering the waiting list when waitlistEnabled is true, and no sign-up otherwise; never true without a capacity) and waitlistEnabled; its public page (pageLink; a municipality club's is under its town's schools page); publiclyListed: whether the admin lists the product on the public site — the shop, a town's schools page and landing page products sections; false means unlisted, kept off every public page, yet anyone with pageLink can still open it and sign up, so it is not a sign the product is unavailable; and listing. ${LISTING} The first page says how many products match (total); when more follow, nextCursor is set: pass it back as cursor for the next page, with the same filters. Use the ids as a landing page products section's productIds. ${PICKING}`,
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
        const client = createBearerClient(authInfo.token);
        const service = new ProductsService(client);
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
        const ids = page.rows.map((row) => row.id);
        const [listed, counts] = await Promise.all([
          service.listVisibleListingAmong(LANDING_PRODUCT_TYPES, ids),
          new ParticipationsService(client).getParticipationCounts(ids),
        ]);
        const listedIds = new Set(listed.map((row) => row.id));
        const countsById = new Map(counts.map((row) => [row.productId, row]));
        const countsFor = (id: string): ParticipationCounts => {
          const row = countsById.get(id);
          // The counts read answers every id it is asked about.
          if (!row) throw new Error(`No seat counts for product ${id}`);
          return row;
        };
        const now = new Date();
        const next = nextKeysetCursor(page.rows, ADMIN_PRODUCT_LIST_PAGE_SIZE);

        return answer({
          ...(page.total === null ? {} : { total: page.total }),
          products: page.rows.map((product) => ({
            productId: product.id,
            names: inLocaleOrder(product.product_translations).map(
              ({ locale, name, short_description }) => ({
                locale,
                name,
                shortDescription: short_description,
              }),
            ),
            type: product.product_type,
            topic: product.topic,
            deliveryMode: product.delivery_mode,
            location: locationFacts(product),
            spokenLanguage: product.spoken_language_code,
            forGamers: product.for_gamers,
            forParents: product.for_parents,
            minAge: product.min_age,
            maxAge: product.max_age,
            startDate: product.start_date,
            endDate: product.end_date,
            timezone: product.timezone,
            // One slot per weekday at most (a unique key), so the weekday
            // alone orders them.
            schedule: [...product.schedule_slots]
              .sort((a, b) => a.weekday - b.weekday)
              .map((slot) => slotFacts(slot, product.timezone, now)),
            registrationOpensAt: product.registration_opens_at,
            billingMode: product.billing_mode,
            prices: product.product_prices.map((price) => ({
              currency: price.currency,
              amountCents: price.price_cents,
            })),
            seats: seatFacts(product, countsFor(product.id)),
            pageLink: `${origin}${getPathname({ href: productPageHref(product, "en"), locale: "en" })}`,
            publiclyListed: product.is_visible,
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
