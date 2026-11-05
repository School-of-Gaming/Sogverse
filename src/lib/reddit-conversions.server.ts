import "server-only";
import { cookieValueFromHeader, parseConsentCookieHeader } from "@/lib/consent";
import { clientIpFrom, sha256Hex } from "@/lib/conversion-request.server";
import {
  isValidRedditPixelId,
  REDDIT_CONVERSION_EVENTS,
  REDDIT_CUSTOM_CONVERSION_EVENTS,
  type ConversionAccount,
  type ReportedEnrolmentOutcome,
  type RedditProductDetails,
} from "@/lib/marketing-events";
import { getOrigin } from "@/lib/url";
import { clickIdFromCookieHeader } from "@/lib/utm";

/**
 * The conversions we report to Reddit from our own servers, through its
 * Conversions API (v3) — the same moments, the same gates and the same
 * promises as Meta's report (`@/lib/meta-conversions.server`), in Reddit's
 * vocabulary. Why the server rather than the pixel, how the browser's own
 * moments arrive here as twins, why a Stripe handoff is not among them, and
 * why a lost report is the safe failure are all reasoned out there and hold
 * here unchanged.
 *
 * **What is sent about a person, exhaustively:** the user agent, the IP address
 * the request arrived from, Reddit's own `_rdt_uuid` (its browser id) and
 * `_rdt_cid` (the click that brought the visitor) cookies if this browser
 * carries them — or, where it has no `_rdt_cid`, the `rdt_cid` our own
 * attribution cookie kept from the ad click (`@/lib/utm`), a SHA-256 hash of the parent's own account email in Reddit's
 * canonical form, and a SHA-256 hash of the parent's own account id
 * (`external_id`). Neither the address nor the id itself is ever sent or
 * logged. No phone number, no name, no participation id, and nothing about a
 * child beyond the product named and, on the child-added event, the fact that
 * one was added — not their name, age, account or its id, nor how many there
 * are.
 * This list is the promise the privacy policy makes; a field added here is a
 * policy edit.
 *
 * **What is sent about the conversion** is the product in Reddit's product
 * fields — its id, English name and topic — with its price only on a seat
 * taken. Reddit's event has no field for our own words, so unlike Meta's
 * report a seat and a queue place are not told apart by an `outcome`; the
 * missing value on a queue place is the only difference Reddit sees. A page
 * view names nothing but the page; a product view and a checkout start name
 * the product with its price — and, like Meta's, none of the three carries an
 * account or its hashes, even from a signed-in parent.
 *
 * **A child added** goes out as Reddit's custom event `ChildProfileCreated`
 * (`tracking_type` `CUSTOM`) beside the parent's hashes, for every child a
 * parent adds — naming, without a price, the product whose sign-up panel the
 * child was added from only when that is an advertised product, otherwise none,
 * as an account creation does. Nothing about the child goes with it.
 *
 * **Gated on the request's own consent cookie**, decided here from the cookie
 * the browser actually sent, so a report for someone who refused is impossible
 * rather than merely unlikely. **It never throws**: every failure is logged and
 * swallowed, so neither the response nor Meta's report can be touched by it.
 */

const REDDIT_API_BASE = "https://ads-api.reddit.com/api/v3";

/** Ten seconds, then give up: nothing is waiting on this call. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * What happened, in our own words — the same moments Meta is told about, with
 * the product already described in Reddit's fields. `sourcePath` is the path
 * the conversion happened on, stated by the caller and never taken from the
 * request's own URL: a public page's, or the parent dashboard's fixed path for
 * a child added there, as Meta's report says. `eventId` is Reddit's `conversion_id`, its
 * dedup key — the id the browser pushed its own event for the same moment
 * under, untrusted and read by nothing else.
 */
export type RedditConversion =
  | {
      event: "account_created" | "child_added";
      product?: RedditProductDetails;
      sourcePath: string;
      eventId: string;
    }
  | {
      event: "enrolment";
      outcome: ReportedEnrolmentOutcome;
      product: RedditProductDetails;
      sourcePath: string;
      eventId: string;
    }
  | { event: "page_view"; sourcePath: string; eventId: string }
  | {
      event: "product_view" | "checkout_start";
      product: RedditProductDetails;
      sourcePath: string;
      eventId: string;
    };

/**
 * The event's `type`: a standard event is its `tracking_type` alone, and a
 * custom one is `CUSTOM` with its own name beside it.
 */
function eventTypeFor(
  conversion: RedditConversion,
): { tracking_type: string; custom_event_name?: string } {
  switch (conversion.event) {
    case "account_created":
      return { tracking_type: REDDIT_CONVERSION_EVENTS.accountCreated };
    case "child_added":
      return {
        tracking_type: "CUSTOM",
        custom_event_name: REDDIT_CUSTOM_CONVERSION_EVENTS.childAdded,
      };
    case "enrolment":
      return { tracking_type: REDDIT_CONVERSION_EVENTS.enrolment };
    case "page_view":
      return { tracking_type: REDDIT_CONVERSION_EVENTS.pageView };
    case "product_view":
      return { tracking_type: REDDIT_CONVERSION_EVENTS.productView };
    case "checkout_start":
      return { tracking_type: REDDIT_CONVERSION_EVENTS.checkoutStart };
  }
}

/**
 * Reddit's canonical form of an email, which is not Meta's: trimmed and
 * lowercased, and then in the local part every `.` removed and everything from
 * the first `+` on dropped — so `Al.ice+Apple@Example.Com` is `alice@example.com`.
 * Then SHA-256, lowercase hex; the plain address never leaves this function.
 */
function hashEmailForReddit(email: string): string {
  const normalised = email.trim().toLowerCase();
  const at = normalised.lastIndexOf("@");
  const local = normalised.slice(0, at).split("+")[0].replaceAll(".", "");
  return sha256Hex(`${local}${normalised.slice(at)}`);
}

/** The account id as `external_id`, hashed exactly as Meta's is. */
function hashAccountIdForReddit(id: string): string {
  return sha256Hex(id.trim().toLowerCase());
}

/**
 * The event's `metadata` product fields. **Only a seat carries a value**: a
 * queue place, an account creation and a child added name the product but drop the price,
 * whatever the caller passed — the same rule, for the same reason, as Meta's
 * report. An account creation that did not start from a product page names
 * none, nor does a child added anywhere but an advertised product's sign-up
 * panel, nor a page view. A product view and a checkout start
 * carry the price, as the browser's own pushes of them do.
 */
function productMetadataFor(
  conversion: RedditConversion,
): Record<string, unknown> {
  if (conversion.event === "page_view") return {};
  const { product } = conversion;
  if (!product) return {};
  const unpriced = { item_count: product.itemCount, products: product.products };
  if (
    conversion.event === "account_created" ||
    conversion.event === "child_added"
  ) {
    return unpriced;
  }
  if (conversion.event === "enrolment" && conversion.outcome === "waitlisted") {
    return unpriced;
  }
  return {
    ...unpriced,
    ...(product.value !== undefined && { value: product.value }),
    ...(product.currency !== undefined && { currency: product.currency }),
  };
}

export async function reportRedditConversion(
  request: Request,
  conversion: RedditConversion,
  account: ConversionAccount,
): Promise<void> {
  try {
    // The pixel the reports go to, and the switch for them, as Meta's is:
    // unset, or a placeholder, and our servers report nothing to Reddit. Read
    // on the server only, under a name kept from when the browser read it too.
    // Read at call time so a deployment's environment decides.
    const pixelId = process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID;
    const accessToken = process.env.REDDIT_CONVERSIONS_API_ACCESS_TOKEN;
    if (!isValidRedditPixelId(pixelId) || !accessToken) return;

    const cookieHeader = request.headers.get("cookie");
    if (parseConsentCookieHeader(cookieHeader)?.marketing !== true) return;

    const userAgent = request.headers.get("user-agent") ?? undefined;
    const clientIp = clientIpFrom(request.headers);
    // Reddit's own identifiers, if this browser has them — what lets the
    // server event be recognised as the same person the pixel saw. Reddit's
    // click id is the `rdt_cid` its ad appended to the link, unmodified, which
    // its pixel keeps in `_rdt_cid` only if it loaded while that was still in
    // the address bar. Where the pixel's cookie is missing, the `rdt_cid` our
    // own cookie kept from that landing is sent in its place; the pixel's wins
    // where there is one.
    const uuid = cookieValueFromHeader(cookieHeader, "_rdt_uuid");
    const clickId =
      cookieValueFromHeader(cookieHeader, "_rdt_cid") ??
      clickIdFromCookieHeader(cookieHeader, "reddit")?.id;
    const email = account.email?.trim();
    const emailHash = email ? hashEmailForReddit(email) : undefined;
    const accountId = account.id?.trim();
    const accountIdHash = accountId
      ? hashAccountIdForReddit(accountId)
      : undefined;

    const event = {
      // Milliseconds, unlike Meta's seconds.
      event_at: Date.now(),
      action_source: "WEBSITE",
      // Built from the TRUSTED origin and a path the caller states, never from
      // the incoming request's URL or a raw Host header.
      event_source_url: `${getOrigin(request)}${conversion.sourcePath}`,
      type: eventTypeFor(conversion),
      ...(clickId && { click_id: clickId }),
      user: {
        ...(userAgent && { user_agent: userAgent }),
        ...(clientIp && { ip_address: clientIp }),
        ...(uuid && { uuid }),
        ...(emailHash && { email: emailHash }),
        ...(accountIdHash && { external_id: accountIdHash }),
      },
      metadata: {
        // Shared with the browser's event for the same moment, so a container
        // tag's pixel event and this report are deduplicated into one.
        conversion_id: conversion.eventId,
        ...productMetadataFor(conversion),
      },
    };

    // Present only when configured, and only ever on a preview deployment: it
    // routes the event into Events Manager's event testing view, where it
    // counts towards nothing.
    const testId = process.env.REDDIT_CONVERSIONS_API_TEST_ID;

    const response = await fetch(
      `${REDDIT_API_BASE}/pixels/${pixelId}/conversion_events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          data: { ...(testId && { test_id: testId }), events: [event] },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      // Reddit's own body, because the status alone does not say which field
      // or which token it refused.
      const body = await response.text().catch(() => "");
      console.error(
        "[reddit-conversions] Reddit refused the event",
        response.status,
        body,
      );
    }
  } catch (error) {
    console.error("[reddit-conversions] could not report the event", error);
  }
}
