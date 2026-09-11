import "server-only";
import { cookieValueFromHeader, parseConsentCookieHeader } from "@/lib/consent";
import {
  ENROLMENT_EVENTS,
  isValidPixelId,
  PIXEL_EVENTS,
  type EnrolmentOutcome,
} from "@/lib/marketing-events";
import { getOrigin } from "@/lib/url";

/**
 * The conversions we report to Meta from our own servers, through the
 * Conversions API.
 *
 * **Why the server and not the pixel.** A conversion happens where the decision
 * is committed — an account is created, a seat is taken, a queue place is
 * accepted, a parent is handed to Stripe — and every one of those is a route
 * handler. Reporting them from the browser meant telling the browser what had
 * happened and trusting it to say so on the next page it loaded: a marker cookie,
 * a script that read it, and a report that was lost if the visitor closed the tab
 * or gained if anything else set the cookie. The handler that committed the
 * outcome is the only place that knows it happened, exactly once.
 *
 * **What is sent about a person, exhaustively:** the user agent, the IP address
 * the request arrived from, and Meta's own `_fbp` / `_fbc` cookies if this
 * browser carries them. No email, no phone number, no name, no user id, no
 * participation id, and nothing whatsoever about a child — not their name, not
 * their age, not which product they joined. The enrolment events carry one
 * custom field, `outcome`, which is one of three fixed words. This list is the
 * promise the privacy policy makes; a field added here is a policy edit.
 *
 * **Gated on the request's own consent cookie.** The send is refused unless the
 * request that triggered it carried marketing consent — decided here, on the
 * server, from the cookie the browser actually sent, so a report for someone who
 * refused is impossible rather than merely unlikely. The routes that call this
 * are all customer-only, so a gamer cannot reach one and no role check is needed
 * on this side.
 *
 * **It never throws and never delays anything.** Callers hand it to `after()`,
 * so the response has already gone out; and every failure — a missing variable,
 * a refusal from Meta, a network fault, a timeout — is logged and swallowed. A
 * lost conversion report under-measures a campaign, which is the safe direction
 * to fail in.
 */

/**
 * The Graph API version the events endpoint is addressed at. Pinned rather than
 * left to Meta's default because an unversioned call follows whatever they have
 * promoted to current, and a field's meaning can change with it. v25.0 is
 * current and is supported until July 2028.
 */
const GRAPH_API_VERSION = "v25.0";

/** Ten seconds, then give up: nothing is waiting on this call. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * What happened, in our own words rather than Meta's.
 *
 * **The caller names the event, never the event *name*.** The mapping from an
 * outcome to the name Meta optimises on lives in one place
 * (`@/lib/marketing-events`), so a caller cannot pair "went to Stripe" with the
 * enrolment name by mistake — which is the single error in this area that would
 * cost real money, because it would train a campaign on abandoned checkouts.
 *
 * `sourcePath` is the public path the conversion happened on, supplied by the
 * caller: a marketing page's own path, so the URL Meta is told is one of the
 * pages the browser pixel is already allowed to report. It is never taken from
 * the request's own URL — that is an API route, and on some of these flows it
 * would carry a query string nobody vetted.
 */
export type MetaConversion =
  | { event: "account_created"; sourcePath: string }
  | { event: "enrolment"; outcome: EnrolmentOutcome; sourcePath: string };

function eventNameFor(conversion: MetaConversion): string {
  return conversion.event === "account_created"
    ? PIXEL_EVENTS.accountCreated
    : ENROLMENT_EVENTS[conversion.outcome];
}

/**
 * The address the request came from, as Meta's `client_ip_address`.
 *
 * `x-forwarded-for` is a list appended to by each hop, so the first entry is the
 * client; `x-real-ip` is the single-value form some proxies send instead.
 * Absent on a request that has no proxy in front of it at all, and then the
 * field is simply omitted — a fabricated address would be worse than none.
 */
function clientIpFrom(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || undefined;
}

export async function reportMetaConversion(
  request: Request,
  conversion: MetaConversion,
): Promise<void> {
  try {
    const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
    const accessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN;
    // Read at call time rather than at module load, so a deployment's
    // environment is what decides and no build carries the answer.
    if (!isValidPixelId(pixelId) || !accessToken) return;

    const cookieHeader = request.headers.get("cookie");
    if (parseConsentCookieHeader(cookieHeader)?.marketing !== true) return;

    const userAgent = request.headers.get("user-agent") ?? undefined;
    const clientIp = clientIpFrom(request.headers);
    // Meta's own identifiers, if this browser has them: `_fbp` is the pixel's
    // browser id and `_fbc` records the click that brought the visitor here.
    // Passing them is what lets a server-side event be recognised as the same
    // person as the browser's page view instead of counted as a stranger.
    const fbp = cookieValueFromHeader(cookieHeader, "_fbp");
    const fbc = cookieValueFromHeader(cookieHeader, "_fbc");

    const event = {
      event_name: eventNameFor(conversion),
      event_time: Math.floor(Date.now() / 1000),
      // A random id per report, which is how Meta deduplicates a retry — and
      // how it would reconcile a browser event with this one, if we ever sent
      // both for the same conversion.
      event_id: crypto.randomUUID(),
      action_source: "website",
      // Built from the TRUSTED origin and a path the caller states, never from
      // the incoming request's URL or a raw Host header.
      event_source_url: `${getOrigin(request)}${conversion.sourcePath}`,
      user_data: {
        ...(userAgent && { client_user_agent: userAgent }),
        ...(clientIp && { client_ip_address: clientIp }),
        ...(fbp && { fbp }),
        ...(fbc && { fbc }),
      },
      ...(conversion.event === "enrolment" && {
        custom_data: { outcome: conversion.outcome },
      }),
    };

    // Present only when configured, and only ever on a preview deployment: it
    // routes the event into Events Manager's Test Events tab, where it can be
    // watched live and counts towards nothing.
    const testEventCode = process.env.META_CONVERSIONS_API_TEST_EVENT_CODE;

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [event],
          access_token: accessToken,
          ...(testEventCode && { test_event_code: testEventCode }),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      // Meta's own body, because its refusals are specific and the status alone
      // says nothing: an expired access token, a pixel the token cannot post
      // to, and a malformed field all arrive as the same 400.
      const body = await response.text().catch(() => "");
      console.error(
        "[meta-conversions] Meta refused the event",
        response.status,
        body,
      );
    }
  } catch (error) {
    console.error("[meta-conversions] could not report the event", error);
  }
}
