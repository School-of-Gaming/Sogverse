import { after } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  claimExpiredSeatOffers,
  mailClaimedSeatOfferExpiries,
} from "@/services/participations/seat-offer-email.server";
import { seatOfferSweepResponse } from "@/services/participations/seat-offer.contracts";

/**
 * POST /api/admin/seat-offers/sweep — tell staff about the offers that ran out.
 *
 * **This is the whole of the "no cron job" decision, and it is worth being
 * explicit about what it buys and what it costs.** A seat offer expires by the
 * clock, and nothing in a database notices a clock. The two ways to notice are
 * a scheduled job, which has to be provisioned, monitored and reasoned about at
 * three in the morning, or an observation — somebody looking at a page that
 * would care. We take the second: an admin opening the dashboard or a product's
 * groups panel calls this, and a family answering an offer that has already
 * lapsed triggers the same claim from one of the two respond routes.
 *
 * **The two triggers claim different amounts, deliberately.** This route claims
 * platform-wide, because an admin is entitled to observe the whole platform. A
 * family's trigger claims only the row their own credential names — an emailed
 * link's signature never expires, so an unscoped claim behind it would be a
 * permanent, unthrottled trigger for a platform-wide write. The consequence is
 * that a lapsed offer nobody's own click has touched waits for an admin to
 * look, which is the latency this whole design already accepts.
 *
 * What it costs is latency. If nobody looks for a week, staff hear about a
 * silent family a week late. What it buys is that the notification cannot drift
 * out of sync with the thing it is about, because there is only one predicate
 * and it is evaluated at the moment somebody asks.
 *
 * **Exactly-once is the RPC's job, not this route's.** The claim and the mark
 * are one statement, so two admins loading the dashboard in the same second
 * produce one mail each for disjoint sets, and usually one empty set. Nothing
 * here holds a lock across a Brevo call.
 *
 * The count is claimed in the handler rather than after it, because the caller
 * asked what happened; only the mails go in `after()`, since nothing waits on
 * them and each swallows its own failures.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can sweep seat offers",
  response: seatOfferSweepResponse,

  handler: async ({ request }) => {
    const admin = createAdminClient();
    // No scope argument, and this is the ONLY caller entitled to omit one. An
    // admin is entitled to observe the whole platform, which is what a sweep on
    // mount is for; every family-triggered observation claims only the row its
    // own credential names.
    const claimed = await claimExpiredSeatOffers(admin);

    if (claimed.length > 0) {
      // Bounded batches rather than one unbounded Promise.all: a platform
      // nobody has looked at for a fortnight can claim any number of offers at
      // once, and each mail is a Brevo call with two Supabase reads behind it.
      after(mailClaimedSeatOfferExpiries({ client: admin, request, claimed }));
    }

    return { claimed: claimed.length };
  },
});
