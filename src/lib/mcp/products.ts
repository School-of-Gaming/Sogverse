import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import { getPathname } from "@/i18n/navigation";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { LANDING_PRODUCT_TYPES } from "@/lib/landing-pages/sections";
import { readMcpCaller } from "@/lib/mcp/auth";
import { READ_ONLY, answer, refusal } from "@/lib/mcp/library-call";
import { formatProductLocation } from "@/lib/products/format-product-location";
import { formatProductSchedule } from "@/lib/products/format-product-schedule";
import { productPageHref } from "@/lib/products/product-page-href";
import { createBearerClient } from "@/lib/supabase/bearer";
import { nextKeysetCursor, type KeysetCursor } from "@/lib/supabase/keyset";
import { getOrigin } from "@/lib/url";
import { deriveRegistrationState } from "@/components/public/products/derive-registration-state";
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
 * type, filtered and keyset-paged exactly as `/admin/products` pages it.
 *
 * It hands over raw facts as stored, and every derived one is the answer of a
 * function the app's own pages call, called unchanged — never arithmetic of
 * the tool's own: the schedule is the shop's formatter read in the product's
 * own zone, the sign-up state is the shop's registration state over the shop's
 * seat counts, the location is named as the product page names it, and whether
 * a products section shows a product is the listing's answer for that page of
 * products — the read the section draws by, over the same types.
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
 * Where the product is held, named in English as its admin details page names
 * it: a site with the place it sits in, or the area an online municipality
 * club serves. A site filed under no place has no area. `null` for an online
 * product with no place behind it.
 */
function locationFacts(product: AdminProductListRow) {
  const location = formatProductLocation(product, "en");
  if (location === null) return null;
  return location.kind === "site"
    ? { site: location.site, area: location.parent }
    : { site: null, area: location.name };
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
      description: `School of Gaming's products, every type — clubs, municipality clubs, camps and events, listed or not — newest first, ${ADMIN_PRODUCT_LIST_PAGE_SIZE} to a page, as the admin product list in Sogverse shows them, narrowed by type, a name search, spoken language and weekday. Product names are not unique — two products may share a name and a date, such as back-to-back trial slots — so tell them apart by id and schedule. Raw facts, as stored: productId; names: its name and short description (shortDescription, empty where none is written) in every language it is written in; its type and topic; deliveryMode: online in a voice room, in_person at a site, or hybrid — children at a site and the gedu in the Sogverse voice room; spokenLanguage: the language it is delivered in; its audience (forGamers: children take seats, forParents: adults take seats themselves; at least one is true) and the children's age range (minAge and maxAge, both set exactly when forGamers is true, both null otherwise); startDate and endDate: calendar dates (a club may have no end); timezone: the IANA zone its dates and slots are in; slots: its weekly slots — weekday 0 for Monday to 6 for Sunday, as the weekday filter counts, startTime the wall-clock start in that zone as stored (HH:MM:SS), and durationMinutes; a club's slots repeat every week of its term, a camp's run on each of those weekdays between its dates, an event's one slot is on its date; slots is empty while no time is set; registrationOpensAt: the instant sign-ups open, ISO 8601 with its own offset; publiclyListed: whether the admin lists the product on the public site — the shop, a town's schools page and landing page products sections; false means unlisted, kept off every public page, yet anyone with pageLink can still open it and sign up, so it is not a sign the product is unavailable; billingMode and prices (the amount in each currency, in cents); seats: capacity (null when there is no seat limit), taken (seats held now), waitlisted (people on the waiting list) and waitlistEnabled. Derived, by the code the public pages run: schedule: exactly what the product's shop page shows a parent in the product's own timezone — kind "recurring" for a club (groups), "ranged" for a camp (its startDate and endDate as written dates, and groups), "single" for an event (its date, weekday and time with start and end, time null while no slot is set) or "tbd" while nothing is set; each group is the weekdays (0 for Monday) sharing one startTime and endTime, with weekdaysLabel naming them in English; times are 24-hour HH:MM, an endTime at or before its startTime runs past midnight, and tzAbbrev is the zone's short name; registration: exactly the sign-up state the shop's card and page show — kind "open" (seatCount, seatsLeft, both null without a seat limit, and waitlistEnabled), "closed_pre" (sign-ups open at opensAt, with the same seat fields), "full_waitlist" (every seat taken, the waiting list open), "full_closed" (every seat taken, no waiting list), "running_late" (no more sign-ups: phase "underway" for a camp already started, "over" for an event already held) or "ended" (its term is over); a municipality club's sign-up goes through its town, not the shop, so for one its registration states only its seats and term; location: where it is held, in English, as the product page names it — site is the venue and area the place it sits in, null when the venue is not filed under a place; for an online municipality club site is null and area is the town or region it serves; location is null for an online product with no place behind it; pageLink: its public page (a municipality club's is under its town's schools page); and listing. ${LISTING} The first page says how many products match (total); when more follow, nextCursor is set: pass it back as cursor for the next page, with the same filters. Use the ids as a landing page products section's productIds. ${PICKING}`,
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
          products: page.rows.map((product) => {
            const seats = countsFor(product.id);
            return {
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
              slots: product.schedule_slots.map((slot) => ({
                weekday: slot.weekday,
                startTime: slot.start_time,
                durationMinutes: slot.duration_minutes,
              })),
              // What a parent in the product's own zone reads on the shop.
              schedule: formatProductSchedule({
                product,
                locale: "en",
                timeZone: product.timezone,
                now,
              }),
              registrationOpensAt: product.registration_opens_at,
              billingMode: product.billing_mode,
              prices: product.product_prices.map((price) => ({
                currency: price.currency,
                amountCents: price.price_cents,
              })),
              seats: {
                capacity: product.seat_count,
                taken: seats.activeCount,
                waitlisted: seats.waitlistCount,
                waitlistEnabled: product.waitlist_enabled,
              },
              // The sign-up state the shop's card and page show.
              registration: deriveRegistrationState({
                product,
                now,
                participationsCount: seats.activeCount,
              }),
              pageLink: `${origin}${getPathname({ href: productPageHref(product, "en"), locale: "en" })}`,
              publiclyListed: product.is_visible,
              listing: sectionListing(product, listedIds, now),
            };
          }),
          nextCursor: next === undefined ? null : encodeCursor(next),
        });
      } catch (error) {
        console.error("[mcp] product tool failed:", error);
        return refusal("Sogverse could not read the products. Try again.");
      }
    },
  );
}
