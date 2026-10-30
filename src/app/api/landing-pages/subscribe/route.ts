import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { parseConsentCookieHeader } from "@/lib/consent";
import { subscribeKlaviyoProfile, upsertKlaviyoProfile } from "@/lib/klaviyo";
import { newsletterProperties } from "@/lib/klaviyo-sync/contract";
import {
  readSubscribeConfig,
  SIGNUP_CUSTOM_SOURCE,
} from "@/lib/landing-pages/subscribe-config.server";
import { createAnonClient } from "@/lib/supabase/anon";
import { utmFromCookieHeader, utmMetadataForConsent } from "@/lib/utm";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";
import {
  landingSubscribeBody,
  landingSubscribeResponse,
} from "@/services/landing-pages/landing-subscribe.contracts";

/**
 * POST /api/landing-pages/subscribe
 *
 * **A landing page's email sign-up, sent one way to Klaviyo.** The reader
 * leaves an address, optionally a first and last name, and ticks the consent
 * box; this writes the profile to Klaviyo and subscribes it to the newsletter
 * list, which is single opt-in, so the reader is on the list as soon as this
 * answers. Klaviyo records the consent and handles every unsubscribe from then
 * on. **Nothing about the person is stored here** and nothing is ever read
 * back: a sign-up is not an account, and it does not touch an account's
 * marketing consent. An address that had unsubscribed is subscribed again,
 * which is what Klaviyo's subscribe call does.
 *
 * **One answer for every sign-up that is not refused.** A new address and one
 * already on the list get the same 200, so the form cannot be
 * used to learn who is on the list.
 *
 * **What is passed with the address**: the names that were given, the
 * landing page's id, the page's locale, and the attribution cookie's UTM values
 * only when the request's own consent cookie grants marketing — the registration route's
 * rule, through the same helper (`src/lib/utm.ts`), since counsel's ruling
 * covers any write of them. Nothing else. The property names are the Klaviyo
 * contract's newsletter ones (`src/lib/klaviyo-sync/contract.ts`), apart from
 * the names the parent sync writes, since one address can be both.
 *
 * **Two calls, both upserts**: the profile first, since the subscribe call
 * carries no name or property, then the subscription. Either failing — refused,
 * or unanswered within the client's timeout — answers 502, and a retry repeats both harmlessly. A misconfigured deployment (no key or list id)
 * refuses every sign-up rather than accepting it into nowhere.
 */
export const POST = defineRoute({
  posture: "public",
  reason:
    "a landing page's reader signs up for email with no account and no session. It stores nothing about them and writes the address to Klaviyo's single opt-in newsletter list, answering a new address and one already on the list identically so it reveals nothing about who is subscribed",
  body: landingSubscribeBody,
  response: landingSubscribeResponse,

  handler: async ({ request, body }) => {
    const configured = readSubscribeConfig();
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
    if (page === null || !hasForm) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const cookieHeader = request.headers.get("cookie");
    const utm = utmMetadataForConsent(
      parseConsentCookieHeader(cookieHeader),
      utmFromCookieHeader(cookieHeader),
    );

    try {
      await upsertKlaviyoProfile({
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        locale: body.locale,
        properties: newsletterProperties(page.id, utm),
      });
      await subscribeKlaviyoProfile({
        email: body.email,
        listId: configured.config.listId,
        customSource: SIGNUP_CUSTOM_SOURCE,
      });
    } catch (error) {
      // A refusal (logged by the Klaviyo client as its status and error codes,
      // and thrown as a fixed message), a timeout or a network failure. None of
      // them carries anything the visitor typed, and neither does this line:
      // the page id is the live page's own.
      console.error("[landing-pages/subscribe] Klaviyo refused the sign-up for page", page.id, error);
      return NextResponse.json(
        { error: "Could not sign you up. Please try again later." },
        { status: 502 },
      );
    }

    return { success: true as const };
  },
});
