import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin } from "@/lib/url";
import { buildCalendarFeedEvents } from "@/lib/calendar-feed/events";
import { buildIcsCalendar, type IcsEvent } from "@/lib/calendar-feed/ics";
import {
  alarmMinutes,
  parseCalendarFeedOptions,
  refreshDuration,
  type CalendarFeedOptions,
} from "@/lib/calendar-feed/options";
import {
  loadCancelingSubscriptionEnds,
  loadFeedCustomer,
  loadFeedParticipations,
} from "@/lib/calendar-feed/query";
import { getCalendarFeedTranslator } from "@/lib/calendar-feed/translator";
import { verifyCalendarFeedToken } from "@/lib/calendar-feed/token";
import { BRAND } from "@/lib/constants/colors";
import type { CalendarFeedPreviewResponse } from "@/services/calendar-feed/calendar-feed.contracts";
import type { CalendarFeedEvent } from "@/lib/calendar-feed/events";

/**
 * The subscribed calendar feed — one URL per parent, covering their family.
 *
 * **The token in the path is the whole of the authorization.** A calendar app
 * polls this forever with no session, so there is nothing else it could be; the
 * URL is therefore a credential, and what it discloses is a child's weekly
 * whereabouts. Everything that follows from that:
 *
 * - **An unverifiable token answers 404, never 401.** A 401 would say "that
 *   customer exists, you just cannot read them", which is itself the
 *   information the token is protecting. One answer for a bad signature, a
 *   malformed token, a deleted account and a non-customer id.
 * - **The reads go through the service-role client**, because there is no
 *   caller to act as — every family-enumeration path in `src/services/` is
 *   `auth.uid()`-scoped. They are filtered on the *verified* customer id, and
 *   that filter is inside the query module rather than here.
 * - **`Cache-Control: private, no-store`**, so no shared cache ever holds one
 *   family's schedule under a URL another request might reach.
 *
 * `?format=json` answers with the same computed events as data **and** the
 * document those very events serialize to, in one response. It is the admin
 * card's whole preview, and it is one request rather than two on purpose: two
 * polls are two computations, and a table that could disagree with the `.ics`
 * printed beneath it is worse than no table at all.
 *
 * This route is hand-written rather than wrapped in `defineRoute`: the wrapper
 * covers the postures that authenticate through the shared role gate, and a
 * signed-token posture is not one of them.
 */

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  const customerId = await verifyCalendarFeedToken(token);
  if (customerId === null) return notFound();

  const url = new URL(request.url);
  const options = parseCalendarFeedOptions(url.searchParams);

  const supabase = createAdminClient();
  const customer = await loadFeedCustomer(supabase, customerId);
  if (customer === null) return notFound();

  const rows = await loadFeedParticipations(supabase, customerId);
  const cancelEnds = await loadCancelingSubscriptionEnds(
    supabase,
    rows.map((row) => row.id),
  );

  const translate = await getCalendarFeedTranslator(customer.locale);
  const now = new Date();
  const events = buildCalendarFeedEvents({
    rows,
    cancelEnds,
    options,
    translate,
    locale: customer.locale,
    // Never the raw Host: this origin ends up inside a link a parent clicks
    // from their calendar, which is exactly the place a spoofed one does the
    // most damage.
    origin: getOrigin(request),
    now,
  });

  // Serialized before the branch, so the JSON rendering carries the very
  // document the `.ics` rendering would have served — same events, same poll,
  // same `DTSTAMP`.
  const ics = buildIcsCalendar({
    calendarName: options.calname,
    color: options.color === "on" ? BRAND.primary : null,
    refreshDuration: refreshDuration(options),
    method: options.method === "publish" ? "PUBLISH" : null,
    dtstamp: now,
    events: events.map((event) => toIcsEvent(event, options)),
  });

  if (url.searchParams.get("format") === "json") {
    // The same family schedule behind the same credential, so it gets the same
    // cache directive as the document — a different serialisation is not a
    // different secret.
    return NextResponse.json(toPreview(events, ics), {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  return icsResponse(ics);
}

function notFound(): Response {
  // Same directive as the success paths: whether a token resolves is itself
  // something no shared cache should be answering on our behalf.
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "private, no-store" } },
  );
}

function icsResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="school-of-gaming.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Which zone an event states its times in.
 *
 * A recurring event is always a wall clock in the product's zone — a weekly
 * rule on a UTC `DTSTART` drifts an hour across a DST transition, and the wall
 * clock is what the schedule actually promises. A discrete occurrence is an
 * absolute instant by default, which sidesteps zone handling entirely, and
 * takes the `TZID` form only when the `tz` option asks for it.
 */
function eventTzid(
  event: CalendarFeedEvent,
  options: CalendarFeedOptions,
): string | null {
  if (event.rrule !== null) return event.timezone;
  return options.tz === "tzid" ? event.timezone : null;
}

function toIcsEvent(
  event: CalendarFeedEvent,
  options: CalendarFeedOptions,
): IcsEvent {
  const tzid = eventTzid(event, options);
  const minutes = alarmMinutes(options);
  return {
    uid: event.uid,
    start: { instant: event.start, tzid },
    end: { instant: event.end, tzid },
    summary: event.summary,
    ...(event.description === null ? {} : { description: event.description }),
    ...(event.location === null ? {} : { location: event.location }),
    ...(event.url === null ? {} : { url: event.url }),
    ...(event.rrule === null ? {} : { rrule: event.rrule }),
    // A child's session is not the parent's own commitment, so by default it
    // does not block their free/busy.
    transparent: options.busy === "free",
    // The alarm says the event's own name back: it is what the reader needs on
    // a lock screen, and it is already in the reader's locale.
    ...(minutes === null
      ? {}
      : { alarm: { minutesBefore: minutes, description: event.summary } }),
  };
}

function toPreview(
  events: readonly CalendarFeedEvent[],
  ics: string,
): CalendarFeedPreviewResponse {
  return {
    ics,
    events: events.map((event) => ({
      uid: event.uid,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      summary: event.summary,
      gamerName: event.gamerName,
      productName: event.productName,
      productType: event.productType,
      location: event.location,
      recurring: event.rrule !== null,
    })),
  };
}
