import { after } from "next/server";
import {
  reportAdConversion,
  type AdConversion,
} from "@/lib/ad-conversions.server";
import { advertisedProductFor } from "@/lib/advertised-product.server";
import { GTM_EVENTS } from "@/lib/gtm-events";
import { reportableMarketingPage } from "@/lib/marketing-pages";
import {
  pageEventBody,
  type PageEventBody,
} from "@/lib/page-events.contracts";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/page-events
 *
 * **The server half of the browser's three moments** — a marketing page
 * reached, a product page's product shown, the click into the sign-up flow.
 * The browser decides each one and pushes it for the container's Meta and
 * Reddit tags; it then posts the same moment here under the push's own id,
 * and this reports it through each platform's Conversions API
 * (`@/lib/ad-conversions.server`): Meta's `PageView`, `ViewContent` and
 * `InitiateCheckout`, Reddit's `PAGE_VISIT`, `VIEW_CONTENT` and `ADD_TO_CART`.
 * Each platform counts the pair once, and a tag whose vendor library the
 * browser blocked still has its event arrive. A push that never went out — no
 * container, a gate shut — has no twin either: the browser posts only after
 * pushing.
 *
 * **Nothing in the body is trusted; every gate the browser passed is passed
 * again here**, from what the server can see for itself:
 *
 *   - **marketing consent**, from this request's own consent cookie — decided
 *     by each platform's reporter, which already refuses without it;
 *   - **never a signed-in gamer.** Anonymous is fine and a signed-in non-gamer
 *     is fine; a session whose role cannot be read is refused, which is the
 *     browser's own rule and resolves the doubt the same safe way;
 *   - **a marketing page with a query that may travel**, checked on the stated
 *     page's locale-stripped internal path by the helpers the browser uses
 *     (`@/lib/marketing-pages`). The report's `event_source_url` is the
 *     trusted origin and that vetted page, never this request's URL or its
 *     Referer;
 *   - **for the two product events, an advertised product on its own page.**
 *     The page has to be the shop page of the product the body names, and the
 *     product is re-read as a stranger would read it; its fields come from
 *     that row, never from the body.
 *
 * **One answer, whatever happened: 204, at once.** The gates and the report run
 * after the response, so neither its status nor its timing says whether
 * anything was reported, and a malformed body gets the same answer as a
 * refused one. The browser fires this and forgets it.
 *
 * **It names nobody.** No report from here carries an account — no hashed
 * address, no hashed account id — even when a parent is signed in: a twin
 * tells a platform that this browser reached a page or a product, never that
 * an identifiable parent did, which the privacy policy does not describe. The
 * session is read only to refuse a gamer.
 */
export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return noContent();
  }
  const parsed = pageEventBody.safeParse(raw);
  if (parsed.success) {
    const body = parsed.data;
    after(async () => {
      try {
        await reportPageEvent(request, body);
      } catch (error) {
        console.error("[page-events] could not report the event", error);
      }
    });
  }
  return noContent();
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

/** Re-apply every gate, then report — or return having reported nothing. */
async function reportPageEvent(
  request: Request,
  body: PageEventBody,
): Promise<void> {
  const page = reportableMarketingPage(body.pagePath);
  if (page === null) return;

  if (!(await sessionMayBeReported())) return;

  const conversion = await conversionFor(body, page.internalPath);
  if (conversion === null) return;

  await reportAdConversion(request, conversion, { id: null, email: null });
}

/**
 * The page event in the reporters' words, with a product event's product read
 * from its row — or `null` when the product is not an advertised product on
 * its own page.
 */
async function conversionFor(
  body: PageEventBody,
  internalPath: string,
): Promise<AdConversion | null> {
  // The vetted page, as the address bar held it: the URL the browser's pixel
  // reports for the same moment, so the two sides name one page.
  const sourcePath = body.pagePath;
  if (body.event === GTM_EVENTS.pageView) {
    return { event: "page_view", sourcePath, eventId: body.eventId };
  }

  // The product is the one its page names, or nothing is reported. The browser
  // pushes a product event only from that product's own shop page, so any
  // other pairing is a body nobody's page produced.
  if (internalPath !== `/shop/${body.productId}`) return null;
  const product = await advertisedProductFor(body.productId);
  if (product === undefined) return null;

  return {
    event:
      body.event === GTM_EVENTS.productView ? "product_view" : "checkout_start",
    product,
    sourcePath,
    eventId: body.eventId,
  };
}

/**
 * Whether anything may be reported for this session.
 *
 * Read from the session cookie, never the body. No session is an anonymous
 * visitor and may be reported. A session is refused when its claims fail to
 * verify, when its profile cannot be read, and when it is a gamer's — the
 * browser's gate, which reports nothing for anyone it cannot prove is not a
 * child. Every other role may be reported, and none is named.
 */
async function sessionMayBeReported(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) return false;
  const userId = data?.claims.sub;
  if (!userId) return true;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile) return false;
  return profile.role !== "gamer";
}
