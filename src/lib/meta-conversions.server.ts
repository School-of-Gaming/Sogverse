import "server-only";
import { cookieValueFromHeader, parseConsentCookieHeader } from "@/lib/consent";
import { clientIpFrom, sha256Hex } from "@/lib/conversion-request.server";
import {
  isValidPixelId,
  META_CONVERSION_EVENTS,
  type ConversionAccount,
  type ReportedEnrolmentOutcome,
  type MetaProductDetails,
} from "@/lib/marketing-events";
import { getOrigin } from "@/lib/url";
import { clickIdFromCookieHeader, type ClickId } from "@/lib/utm";

/**
 * The conversions we report to Meta from our own servers, through the
 * Conversions API.
 *
 * **Why the server and not the pixel.** A conversion happens where the decision
 * is committed — an account is created, a seat is taken, a queue place is
 * accepted — and every one of those is a route handler. Reporting them from the
 * browser meant telling the browser what had happened and trusting it to say so
 * on the next page it loaded: a marker cookie,
 * a script that read it, and a report that was lost if the visitor closed the tab
 * or gained if anything else set the cookie. The handler that committed the
 * outcome is the only place that knows it happened, exactly once.
 *
 * **The browser's own moments come here too, as twins.** A page view, a product
 * view and the click into the sign-up flow (Meta's `InitiateCheckout`, which
 * commits nothing and is reported for free products as well as paid ones) are
 * decided in the browser, which pushes them for the container's Meta tag and
 * then hands each to `/api/page-events` under the same id; that route re-checks
 * every gate and reports it from here, and Meta counts the pair once. Handing a
 * parent to Stripe is reported from nowhere on this side, because the
 * checkout start is that earlier click and a second report would count every
 * paid attempt twice under one name.
 *
 * **What is sent about a person, exhaustively:** the user agent, the IP address
 * the request arrived from, Meta's own `_fbp` / `_fbc` cookies if this browser
 * carries them — or, where it has no `_fbc`, the same value built from the
 * `fbclid` our own attribution cookie kept from the ad click (`@/lib/utm`), a
 * SHA-256 hash of the parent's own account email, and a SHA-256
 * hash of the parent's own account id (Meta's `external_id`). Both are hashed
 * here, so neither the address nor the id itself is ever sent or logged; the
 * address is sent whether or not it has been verified (standard practice,
 * accepted as such). The id hash is stable for the account, which is what lets
 * Meta recognise the same parent across visits and devices. No phone number,
 * no name, no participation id, and nothing about a child beyond the product
 * named below and, on the child-added event, the fact that one was added — not
 * their name, not their age, not their account or its id, not their address,
 * not how many children the family has. This list is the promise the privacy policy makes; a
 * field added here is a policy edit.
 *
 * **What is sent about the enrolment** is `outcome`, one of two fixed words,
 * and the product it was for in Meta's standard product fields — its id, name,
 * topic and price (no price on a queue place), the same facts the product's
 * public page shows anyone. On the same event as the two hashes, so Meta
 * learns that an identifiable parent signed up for that named club, camp or
 * event — which the privacy policy states. Nothing about the child goes with
 * it: not their name, age, account or anything else.
 *
 * **What is sent about the account creation** is nothing, unless the sign-up
 * started from an advertised product's page: then the same product fields,
 * without a price, so Meta learns that an identifiable parent opened an
 * account from that named club, camp or event's page.
 *
 * **What is sent about a child added** is the product whose sign-up panel the
 * parent added the child from, in the same fields without a price, under the
 * custom name `ChildProfileCreated` — so Meta learns that an identifiable
 * parent added a child while signing up for that named club, camp or event.
 * Only for an advertised product's panel; a child added anywhere else is not
 * reported. Nothing about the child goes with it: not their name, age, account
 * or its id, not how many there now are.
 *
 * **What is sent about a page view** is nothing but the page; about a product
 * view or a checkout start, the product in the same fields with its price, the
 * facts its public page shows anyone. None of these carries an account, even
 * from a signed-in parent, so neither hash goes with them: Meta learns that a
 * browser looked at, or stepped into signing up for, that named product, never
 * that an identifiable parent did.
 *
 * **Gated on the request's own consent cookie.** The send is refused unless the
 * request that triggered it carried marketing consent — decided here, on the
 * server, from the cookie the browser actually sent, so a report for someone who
 * refused is impossible rather than merely unlikely. No role check is made on
 * this side: the conversion routes are customer-only, and the page-event route
 * refuses a gamer — or a session whose role it cannot read — before it calls.
 * A report handed no account — an anonymous visitor's, or any page event —
 * carries neither hash.
 *
 * **It never throws and never delays anything.** It is reached through the
 * one fan-out to every platform (`@/lib/ad-conversions.server`), which callers
 * hand to `after()`, so the response has already gone out; and every failure — a missing variable,
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
 * (`@/lib/marketing-events`), so a caller can only say what it committed. The
 * outcome type has no word for "went to Stripe" at all: reporting that as an
 * enrolment is the single error in this area that would cost real money,
 * because it would train a campaign on abandoned checkouts, and the browser
 * already reports the checkout start under its own name.
 *
 * `sourcePath` is the public path the conversion happened on, supplied by the
 * caller: a marketing page's own path, so the URL Meta is told is one of the
 * pages the browser pixel is already allowed to report. It is never taken from
 * the request's own URL — that is an API route, and on some of these flows it
 * would carry a query string nobody vetted.
 *
 * `product` is built by `metaProductDetails()`, from the same product facts
 * the browser's pushes are built from (`gtmEcommerce()`), so the two sides
 * cannot describe a product differently. On an account creation it is optional: the product page the
 * sign-up started from, when that was an advertised product's page.
 *
 * `eventId` is Meta's `event_id`, the key it deduplicates on: the id the
 * browser pushed its own event for the same moment under, so a container tag
 * sending that event and this report are counted once. Untrusted when it came
 * from a request body, and nothing but this field ever reads it.
 */
export type MetaConversion =
  | {
      event: "account_created";
      product?: MetaProductDetails;
      sourcePath: string;
      eventId: string;
    }
  | {
      event: "child_added";
      product: MetaProductDetails;
      sourcePath: string;
      eventId: string;
    }
  | {
      event: "enrolment";
      outcome: ReportedEnrolmentOutcome;
      product: MetaProductDetails;
      sourcePath: string;
      eventId: string;
    }
  | { event: "page_view"; sourcePath: string; eventId: string }
  | {
      event: "product_view" | "checkout_start";
      product: MetaProductDetails;
      sourcePath: string;
      eventId: string;
    };

/**
 * Meta's advanced-matching form of an email: trimmed, lowercased, SHA-256,
 * lowercase hex. Meta compares it with the hashes of its own users' addresses;
 * the plain address never leaves this function.
 */
function hashEmailForMeta(email: string): string {
  return sha256Hex(email.trim().toLowerCase());
}

/**
 * The account id as Meta's `external_id`: trimmed, lowercased, SHA-256,
 * lowercase hex. Meta never sees the id itself, only a value that is the same
 * every time this parent converts — so it joins their events to one another,
 * and to nothing of ours it could read back.
 */
function hashAccountIdForMeta(id: string): string {
  return sha256Hex(id.trim().toLowerCase());
}

/**
 * Meta's `fbc` for a click our attribution cookie kept, in the format Meta's own
 * `_fbc` cookie holds: version `fb`, subdomain index `1`, the time the click id
 * was first seen in milliseconds, and the `fbclid` exactly as the link carried
 * it.
 */
function fbcForClick(click: ClickId): string {
  return `fb.1.${click.landedAt}.${click.id}`;
}

function eventNameFor(conversion: MetaConversion): string {
  switch (conversion.event) {
    case "account_created":
      return META_CONVERSION_EVENTS.accountCreated;
    case "child_added":
      return META_CONVERSION_EVENTS.childAdded;
    case "enrolment":
      return META_CONVERSION_EVENTS.enrolment;
    case "page_view":
      return META_CONVERSION_EVENTS.pageView;
    case "product_view":
      return META_CONVERSION_EVENTS.productView;
    case "checkout_start":
      return META_CONVERSION_EVENTS.checkoutStart;
  }
}

/** A product's fields without its price. */
function unpriced(product: MetaProductDetails): Record<string, unknown> {
  const { value: _value, currency: _currency, ...rest } = product;
  return rest;
}

/**
 * The event's `custom_data`: for an enrolment its outcome and the product it
 * was for; for an account creation the product its sign-up started from, if
 * any, and otherwise none at all; for a child added the product whose panel it
 * was added from.
 *
 * **Only a seat carries a value.** A waitlisted report, an account creation and
 * a child added keep the product's id, name, topic and type but drop `value` and `currency`,
 * whatever the caller passed: nobody has paid or committed to pay, and a price
 * on any of them would teach the campaign that a queue place, a new account or
 * a new child is revenue. Decided here rather than by each caller, so no route can get it
 * wrong.
 *
 * A product view and a checkout start name their product with its price, as
 * the browser's own pushes of them do — the price the page shows anyone, on a
 * moment that is not a conversion. A page view names nothing.
 */
function customDataFor(
  conversion: MetaConversion,
): Record<string, unknown> | undefined {
  switch (conversion.event) {
    case "account_created":
      return conversion.product && unpriced(conversion.product);
    case "child_added":
      return unpriced(conversion.product);
    case "enrolment": {
      const { outcome, product } = conversion;
      if (outcome === "waitlisted") return { outcome, ...unpriced(product) };
      return { outcome, ...product };
    }
    case "page_view":
      return undefined;
    case "product_view":
    case "checkout_start":
      return { ...conversion.product };
  }
}

export async function reportMetaConversion(
  request: Request,
  conversion: MetaConversion,
  account: ConversionAccount,
): Promise<void> {
  try {
    // The dataset the reports go to, and the switch for them: unset, or a
    // placeholder, and our servers report nothing to Meta. Read on the server
    // only — the browser's Meta pixel is configured in the Tag Manager
    // container and reads no variable of ours — so the `NEXT_PUBLIC_` prefix is
    // a name kept to spare every environment a change, and no client bundle
    // carries the value. Read at call time rather than at module load, so a
    // deployment's environment is what decides.
    const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
    const accessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN;
    if (!isValidPixelId(pixelId) || !accessToken) return;

    const cookieHeader = request.headers.get("cookie");
    if (parseConsentCookieHeader(cookieHeader)?.marketing !== true) return;

    const userAgent = request.headers.get("user-agent") ?? undefined;
    const clientIp = clientIpFrom(request.headers);
    // Meta's own identifiers, if this browser has them: `_fbp` is the pixel's
    // browser id and `_fbc` records the click that brought the visitor here.
    // Passing them is what lets a server-side event be recognised as the same
    // person as the browser's page view instead of counted as a stranger.
    //
    // `_fbc` exists only if the pixel loaded while the `fbclid` was still in
    // the address bar, which a parent who answers the banner a few pages in
    // misses. The `fbclid` our own cookie kept from that landing then stands
    // in for it; the pixel's own cookie wins where there is one, because it is
    // the value Meta's browser events already carry.
    const fbp = cookieValueFromHeader(cookieHeader, "_fbp");
    const keptClick = clickIdFromCookieHeader(cookieHeader, "meta");
    const fbc =
      cookieValueFromHeader(cookieHeader, "_fbc") ??
      (keptClick === null ? undefined : fbcForClick(keptClick));
    // Advanced matching: the hash, never the address, and only when there is
    // an address to hash.
    const email = account.email?.trim();
    const emailHash = email ? hashEmailForMeta(email) : undefined;
    // The same for the account id, as Meta's `external_id`.
    const accountId = account.id?.trim();
    const accountIdHash = accountId
      ? hashAccountIdForMeta(accountId)
      : undefined;

    const customData = customDataFor(conversion);
    const event = {
      event_name: eventNameFor(conversion),
      event_time: Math.floor(Date.now() / 1000),
      // Shared with the browser's event for the same moment, which is how
      // Meta reconciles the two into one conversion — and how it deduplicates
      // a retry.
      event_id: conversion.eventId,
      action_source: "website",
      // Built from the TRUSTED origin and a path the caller states, never from
      // the incoming request's URL or a raw Host header.
      event_source_url: `${getOrigin(request)}${conversion.sourcePath}`,
      user_data: {
        ...(userAgent && { client_user_agent: userAgent }),
        ...(clientIp && { client_ip_address: clientIp }),
        ...(fbp && { fbp }),
        ...(fbc && { fbc }),
        ...(emailHash && { em: [emailHash] }),
        ...(accountIdHash && { external_id: [accountIdHash] }),
      },
      ...(customData && { custom_data: customData }),
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
