import { GTM_EVENTS, type GtmEvent } from "@/lib/gtm-events";
import type { PageEventBody } from "@/lib/page-events.contracts";

/**
 * Hand a browser event the app has just pushed to our server, which reports it
 * as that push's Conversions API twin under the same id (`/api/page-events`).
 *
 * Client-safe and React-free: the container's reporters call it the moment a
 * push has gone out, so it inherits every gate the push passed and adds none.
 * The server re-checks them all regardless.
 *
 * **Only the browser's three moments have a twin here** — the page view, the
 * product view and the checkout start. The account and the enrolment are
 * reported by the routes that commit them, and the Stripe handoff by nobody.
 * **A product event goes only for an advertised product**, because the server
 * would refuse any other and the request would be wasted.
 *
 * **Fire and forget.** Nothing waits on it and nothing it does can fail the
 * page. `keepalive` is what lets it outlive the navigation a checkout start's
 * click usually begins, and costs nothing on the other two.
 *
 * `pagePath` is the raw path the address bar held with the query the push was
 * vetted against — the page the push authorised, as the server must re-check it.
 */
export function sendPageEventTwin(event: GtmEvent, pagePath: string): void {
  const body = twinBodyFor(event, pagePath);
  if (body === null) return;
  try {
    fetch("/api/page-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // A browser that refuses the request outright has refused a twin, and the
    // push it would have doubled has already gone.
  }
}

function twinBodyFor(event: GtmEvent, pagePath: string): PageEventBody | null {
  switch (event.event) {
    case GTM_EVENTS.pageView:
      return { event: event.event, eventId: event.event_id, pagePath };
    case GTM_EVENTS.productView:
    case GTM_EVENTS.checkoutStart:
      if (!event.advertised) return null;
      return {
        event: event.event,
        eventId: event.event_id,
        pagePath,
        productId: event.ecommerce.items[0].item_id,
      };
    default:
      return null;
  }
}
