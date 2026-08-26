import { after } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  claimExpiredSeatOffers,
  sendSeatOfferStaffEmail,
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
 * groups panel calls this, and a family clicking a link that has already lapsed
 * triggers the same sweep from the public respond route.
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
    const claimed = await claimExpiredSeatOffers(admin);

    if (claimed.length > 0) {
      after(
        Promise.all(
          claimed.map((row) =>
            sendSeatOfferStaffEmail({
              client: admin,
              request,
              reason: "no_response",
              customerId: row.customer_id,
              participantId: row.participant_id,
              productId: row.product_id,
              sentAt: row.sent_at,
            }),
          ),
        ),
      );
    }

    return { claimed: claimed.length };
  },
});
