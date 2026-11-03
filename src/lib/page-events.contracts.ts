import { z } from "zod";
import { GTM_EVENTS } from "@/lib/gtm-events";
import { conversionEventIdValue } from "@/lib/marketing-events";

/**
 * The wire shape of `POST /api/page-events`: a browser event the app has just
 * pushed into `dataLayer`, handed to our server so it can be reported as that
 * push's Conversions API twin.
 *
 * **Every field is a claim the route re-checks, never a fact it uses.** The
 * event name picks which checks apply; the page has to pass the marketing-page
 * allowlist on the server exactly as it did in the browser; the product is
 * re-read and has to be advertised, and has to be the one the page names.
 * Nothing about the product travels here but its id.
 *
 *   - `event` — one of the browser's three moments, under the name it was
 *     pushed with (`@/lib/gtm-events`).
 *   - `eventId` — the push's own id, required: a twin exists only to be
 *     deduplicated against the push that carries it.
 *   - `pagePath` — the raw path the address bar held, locale prefix and
 *     translated slug included, with the query the browser vetted.
 *   - `productId` — on the two product events only, the product the push named.
 */
const eventId = conversionEventIdValue.unwrap();
const pagePath = z.string().min(1).max(2048);

export const pageEventBody = z.discriminatedUnion("event", [
  z.object({
    event: z.literal(GTM_EVENTS.pageView),
    eventId,
    pagePath,
  }),
  z.object({
    event: z.enum([GTM_EVENTS.productView, GTM_EVENTS.checkoutStart]),
    eventId,
    pagePath,
    productId: z.string().uuid(),
  }),
]);

export type PageEventBody = z.infer<typeof pageEventBody>;
