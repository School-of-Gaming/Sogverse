import {
  findKlaviyoEmailMarketing,
  subscribeKlaviyoProfile,
  unsubscribeKlaviyoProfile,
} from "@/lib/klaviyo";
import { defineRoute } from "@/lib/api/define-route";
import { marketingConsentListId } from "@/lib/klaviyo-sync/lists.server";
import { emailMarketingStanding } from "@/services/email-marketing/email-marketing.contracts";

/** The source Klaviyo records on a consent given in Settings. */
const SETTINGS_CUSTOM_SOURCE = "Sogverse account settings";

/**
 * GET/PUT /api/parent/email-marketing — the caller's own School of Gaming
 * email marketing, read from and written to Klaviyo live. Klaviyo owns the
 * consent, so Sogverse stores nothing here.
 *
 * Parents only: the consent is the adult's about their own mailbox. The
 * profile and address are the verified session's, never the request's, so a
 * caller can reach no one else's standing.
 */

export const GET = defineRoute({
  posture: "role-gated",
  roles: ["customer"],
  forbiddenMessage: "Only parents have email marketing",
  response: emailMarketingStanding,

  handler: async ({ profile }) => {
    // The sync writes every parent's profile under their Sogverse id; the
    // address finds one Klaviyo already held before it did, or one the sync
    // has not reached yet. Neither found: never subscribed.
    const marketing =
      (await findKlaviyoEmailMarketing({ externalId: profile.id })) ??
      (await findKlaviyoEmailMarketing({ email: profile.email }));
    return {
      subscribed: marketing !== null && marketing.consent === "SUBSCRIBED" && !marketing.suppressed,
    };
  },
});

export const PUT = defineRoute({
  posture: "role-gated",
  roles: ["customer"],
  forbiddenMessage: "Only parents have email marketing",
  body: emailMarketingStanding,
  response: emailMarketingStanding,

  handler: async ({ profile, body }) => {
    if (!body.subscribed) {
      await unsubscribeKlaviyoProfile(profile.email);
      return { subscribed: false };
    }
    // The marketing-consent list every subscription joins, registration's
    // and the landing page's alike. One who unsubscribed in Klaviyo is
    // subscribed again: ticking the box is them asking for it. An unset list
    // id throws, so the save fails rather than subscribing to no list.
    await subscribeKlaviyoProfile({
      email: profile.email,
      listId: marketingConsentListId(),
      customSource: SETTINGS_CUSTOM_SOURCE,
    });
    return { subscribed: true };
  },
});
