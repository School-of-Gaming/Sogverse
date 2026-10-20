import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { landingPageSubscribedPath } from "@/components/landing-pages/landing-page-address";
import { defineRoute } from "@/lib/api/define-route";
import { createDoubleOptInContact, type BrevoAttributeValue } from "@/lib/brevo";
import { parseConsentCookieHeader } from "@/lib/consent";
import {
  readSubscribeConfig,
  SIGNUP_ATTRIBUTES,
  utmAttributeName,
} from "@/lib/landing-pages/subscribe-config.server";
import { clientIpFrom, clientNetwork } from "@/lib/request-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";
import { getOrigin } from "@/lib/url";
import { UTM_FIELDS, UTM_QUERY_PARAMS, utmMetadataForConsent } from "@/lib/utm";
import { localizeLandingPage } from "@/services/landing-pages/landing-pages.contracts";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";
import {
  LANDING_SUBSCRIBE_HONEYPOT,
  LANDING_SUBSCRIBE_RATE_LIMITED,
  landingSubscribeBody,
  landingSubscribeResponse,
} from "@/services/landing-pages/landing-subscribe.contracts";

/**
 * The rate limit's key: the request's network — the address itself for IPv4,
 * its /64 for IPv6 — hashed, so no address is stored.
 */
function clientKey(request: Request): string {
  const ip = clientIpFrom(request.headers);
  const network = ip === undefined ? "unknown" : clientNetwork(ip);
  return createHash("sha256").update(`landing-signup:${network}`).digest("hex");
}

/**
 * POST /api/landing-pages/subscribe
 *
 * **A landing page's email sign-up, passed one way to Brevo.** The reader
 * leaves an address and a first name and ticks the consent box;
 * this asks Brevo to confirm the address by double opt-in, and Brevo sends the
 * confirmation mail, records the consent when the link is followed, adds the
 * contact to the list and handles every unsubscribe from then on. **Nothing
 * about the person is stored here** and nothing is ever read back from Brevo:
 * a sign-up is not an account, and it does not touch an account's marketing
 * consent.
 *
 * **One answer for every sign-up that is not refused.** A new address, one
 * Brevo already holds and a bot's all get the same 200, so the form cannot be
 * used to learn who is on the list; Brevo answers the first two differently
 * (201 and 204) and the Brevo client collapses them.
 *
 * **What is passed with the address**: the first name, which page it came
 * from (its slug as the reader saw it, and its id, which never changes), the
 * page's locale, and the visit's UTM values only when the request's own
 * consent cookie grants marketing — the registration route's rule, through the
 * same helper (`src/lib/utm.ts`), since counsel's ruling covers any write of
 * them. The confirmation link brings the reader back to the page in its
 * locale, scrolled to the form, which then thanks them.
 *
 * **Spam**: a filled honeypot field gets the success answer and nothing else;
 * every other sign-up spends one of ten an hour from its address, counted in
 * the database. A misconfigured deployment (no list or template id) refuses
 * every sign-up rather than accepting it into nowhere.
 */
export const POST = defineRoute({
  posture: "public",
  reason:
    "a landing page's reader signs up for email with no account and no session. It stores nothing about them and hands the address to Brevo's double opt-in, so the one thing it can do is make Brevo send a confirmation mail to the address typed — rate limited per requesting address, with a honeypot in front, and answering a new address and a known one identically so it reveals nothing about who is subscribed",
  body: landingSubscribeBody,
  response: landingSubscribeResponse,

  handler: async ({ request, body }) => {
    // A person never sees the field, so anything in it is a bot. It is told
    // what a person would be told, and nothing is sent or counted.
    if ((body[LANDING_SUBSCRIBE_HONEYPOT] ?? "") !== "") {
      return { success: true as const };
    }

    const configured = readSubscribeConfig(body.locale);
    if (!configured.ok) {
      console.error(
        "[landing-pages/subscribe] Sign-ups are refused: not configured:",
        configured.missing.join(", "),
      );
      return NextResponse.json(
        { error: "Email sign-up is not available right now." },
        { status: 503 },
      );
    }

    const { data: allowed, error: limitError } = await createAdminClient().rpc(
      "take_landing_signup_allowance",
      { p_client_key: clientKey(request) },
    );
    if (limitError) throw limitError;
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many sign-ups. Please try again later.", code: LANDING_SUBSCRIBE_RATE_LIMITED },
        { status: 429 },
      );
    }

    // The page as a stranger reads it: live, and still holding the form the
    // reader filled in. A page unpublished or rewritten under an open tab is
    // a dead form, not a sign-up from a page that no longer asks for one.
    const page = await new LandingPageService(createAnonClient()).getPublishedPage(
      body.pageId,
    );
    const hasForm =
      page?.sections.some(
        (section) => section.id === body.sectionId && section.type === "subscribe",
      ) ?? false;
    const shown = page === null ? null : localizeLandingPage(page, body.locale);
    if (page === null || shown === null || !hasForm) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const utm = utmMetadataForConsent(
      parseConsentCookieHeader(request.headers.get("cookie")),
      body.utm,
    );
    const attributes: Record<string, BrevoAttributeValue> = {
      [SIGNUP_ATTRIBUTES.page]: shown.slug,
      [SIGNUP_ATTRIBUTES.pageId]: page.id,
      [SIGNUP_ATTRIBUTES.locale]: body.locale,
      [SIGNUP_ATTRIBUTES.firstName]: body.firstName,
    };
    for (const field of UTM_FIELDS) {
      const param = UTM_QUERY_PARAMS[field];
      if (Object.hasOwn(utm, param)) attributes[utmAttributeName(param)] = utm[param];
    }

    try {
      await createDoubleOptInContact({
        email: body.email,
        attributes,
        listIds: [configured.config.listId],
        templateId: configured.config.templateId,
        // The trusted origin, never the request's own: this link is mailed.
        redirectionUrl: `${getOrigin(request)}${landingPageSubscribedPath(page.id, body.locale, body.sectionId)}`,
      });
    } catch (error) {
      // The Brevo client has logged Brevo's own answer; the address is not logged.
      console.error("[landing-pages/subscribe] Brevo refused the sign-up for page", page.id, error);
      return NextResponse.json(
        { error: "Could not sign you up. Please try again later." },
        { status: 502 },
      );
    }

    return { success: true as const };
  },
});
