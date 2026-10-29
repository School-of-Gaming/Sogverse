import "server-only";
import { cookieValueFromHeader, parseConsentCookieHeader } from "@/lib/consent";
import { clientIpFrom, sha256Hex } from "@/lib/conversion-request.server";
import {
  isValidRedditPixelId,
  REDDIT_CONVERSION_EVENTS,
  type ConversionAccount,
  type MetaEnrolmentOutcome,
  type RedditProductDetails,
} from "@/lib/marketing-events";
import { getOrigin } from "@/lib/url";

/**
 * The conversions we report to Reddit from our own servers, through its
 * Conversions API (v3) — the same moments, the same gates and the same
 * promises as Meta's report (`@/lib/meta-conversions.server`), in Reddit's
 * vocabulary. Why the server rather than the pixel, why a checkout start is
 * not among them, and why a lost report is the safe failure are all reasoned
 * out there and hold here unchanged.
 *
 * **What is sent about a person, exhaustively:** the user agent, the IP address
 * the request arrived from, Reddit's own `_rdt_uuid` (its browser id) and
 * `_rdt_cid` (the click that brought the visitor) cookies if this browser
 * carries them, a SHA-256 hash of the parent's own account email in Reddit's
 * canonical form, and a SHA-256 hash of the parent's own account id
 * (`external_id`). Neither the address nor the id itself is ever sent or
 * logged. No phone number, no name, no participation id, and nothing about a
 * child beyond the product named — not their name, age, account or its id.
 * This list is the promise the privacy policy makes; a field added here is a
 * policy edit.
 *
 * **What is sent about the conversion** is the product in Reddit's product
 * fields — its id, English name and topic — with its price only on a seat
 * taken. Reddit's event has no field for our own words, so unlike Meta's
 * report a seat and a queue place are not told apart by an `outcome`; the
 * missing value on a queue place is the only difference Reddit sees.
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
 * What happened, in our own words — the same two moments Meta is told about,
 * with the product already described in Reddit's fields. `sourcePath` is the
 * public path the conversion happened on, stated by the caller and never taken
 * from the request's own URL.
 */
export type RedditConversion =
  | {
      event: "account_created";
      product?: RedditProductDetails;
      sourcePath: string;
    }
  | {
      event: "enrolment";
      outcome: MetaEnrolmentOutcome;
      product: RedditProductDetails;
      sourcePath: string;
    };

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
 * queue place and an account creation name the product but drop the price,
 * whatever the caller passed — the same rule, for the same reason, as Meta's
 * report. An account creation that did not start from a product page names
 * none.
 */
function productMetadataFor(
  conversion: RedditConversion,
): Record<string, unknown> {
  const { product } = conversion;
  if (!product) return {};
  const unpriced = { item_count: product.itemCount, products: product.products };
  if (conversion.event === "account_created") return unpriced;
  if (conversion.outcome === "waitlisted") return unpriced;
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
    // The pixel id is the switch for both halves, as Meta's is: unset, or a
    // placeholder, and our servers report nothing either. Read at call time so
    // a deployment's environment decides.
    const pixelId = process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID;
    const accessToken = process.env.REDDIT_CONVERSIONS_API_ACCESS_TOKEN;
    if (!isValidRedditPixelId(pixelId) || !accessToken) return;

    const cookieHeader = request.headers.get("cookie");
    if (parseConsentCookieHeader(cookieHeader)?.marketing !== true) return;

    const userAgent = request.headers.get("user-agent") ?? undefined;
    const clientIp = clientIpFrom(request.headers);
    // Reddit's own identifiers, if this browser has them — what lets the
    // server event be recognised as the same person the pixel saw.
    const uuid = cookieValueFromHeader(cookieHeader, "_rdt_uuid");
    const clickId = cookieValueFromHeader(cookieHeader, "_rdt_cid");
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
      type: {
        tracking_type:
          conversion.event === "account_created"
            ? REDDIT_CONVERSION_EVENTS.accountCreated
            : REDDIT_CONVERSION_EVENTS.enrolment,
      },
      ...(clickId && { click_id: clickId }),
      user: {
        ...(userAgent && { user_agent: userAgent }),
        ...(clientIp && { ip_address: clientIp }),
        ...(uuid && { uuid }),
        ...(emailHash && { email: emailHash }),
        ...(accountIdHash && { external_id: accountIdHash }),
      },
      metadata: {
        // A random id per report. The browser never sends these events, so
        // there is nothing to deduplicate against; Reddit recommends one anyway.
        conversion_id: crypto.randomUUID(),
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
