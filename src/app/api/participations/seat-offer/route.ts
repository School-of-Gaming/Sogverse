import { after } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  inAppSeatOfferRespondBody,
  respondSeatOfferRpcResult,
  seatOfferRespondResponse,
} from "@/services/participations/seat-offer.contracts";
import {
  notifyExpiredSeatOffers,
  sendSeatOfferStaffEmail,
} from "@/services/participations/seat-offer-email.server";

/**
 * POST /api/participations/seat-offer — the same answer, given from inside My
 * SOG instead of from the inbox.
 *
 * **Two routes for one action, deliberately, because the credential differs.**
 * The public one is authorized by a signed token and has no session; this one
 * is authorized by the session and has no token. Collapsing them would mean one
 * handler that accepts either, which is one handler where a missing token can
 * be read as "must be the session path" — precisely the shape that turns two
 * safe doors into one unsafe one.
 *
 * **The ownership check runs on the CALLER'S own client, before the RPC.** The
 * write itself has to go through the service-role client (`respond_seat_offer`
 * is granted to nobody else, because its public sibling has no session to
 * guard on), so the caller's identity would otherwise vanish at the boundary.
 * Reading the row under the caller's own RLS is what puts it back: a parent
 * aiming this at another family's participation id gets the same 404 as they
 * would for an id that never existed, because their policies simply do not
 * return the row.
 *
 * The stored stamp is read here rather than taken from the body for the same
 * reason: the in-app path has no token to bind an offer instant, so the row's
 * own value is the only honest input to the RPC's compare-and-swap. What that
 * costs is the CAS cannot catch a stale *tab* on this path — it can only catch
 * one on the emailed path — and the window check inside the RPC is what covers
 * the case that actually matters.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  forbiddenMessage: "Only customers can answer a seat offer",
  body: inAppSeatOfferRespondBody,
  response: seatOfferRespondResponse,

  handler: async ({ request, supabase, body }) => {
    // The caller's own client, and the whole of the authorization: RLS gives a
    // customer their own participations and nobody else's.
    const { data: row, error: rowError } = await supabase
      .from("participations")
      .select("id, product_id, status, seat_offer_sent_at")
      .eq("id", body.participationId)
      .maybeSingle();
    if (rowError) throw rowError;

    // No row, or one carrying no offer. Both answer `invalid`, and both answer
    // it the same way a stranger's id would — the card that offered this button
    // is showing something that is no longer true, and a refetch is the fix.
    if (!row?.seat_offer_sent_at) return { outcome: "invalid" as const };

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("respond_seat_offer", {
      p_participation_id: row.id,
      p_offer_sent_at: row.seat_offer_sent_at,
      p_accept: body.accept,
    });
    if (error) throw error;

    const parsed = respondSeatOfferRpcResult.safeParse(data);
    if (!parsed.success) {
      throw new ApiError(
        `respond_seat_offer returned an unexpected shape: ${parsed.error.message}`,
        500,
      );
    }

    switch (parsed.data.kind) {
      case "accepted":
        return { outcome: "accepted" as const };
      case "declined":
        after(
          sendSeatOfferStaffEmail({
            client: admin,
            request,
            reason: "declined",
            customerId: parsed.data.customer_id,
            participantId: parsed.data.participant_id,
            productId: parsed.data.product_id,
            sentAt: row.seat_offer_sent_at,
          }),
        );
        return { outcome: "declined" as const };
      case "expired":
        // The card was rendered while the offer was live and pressed after it
        // was not. The sweep runs on the observation, exactly as it does when a
        // family clicks a lapsed link — and it is scoped to this row on the
        // same rule: a credential that names one participation may claim only
        // that participation, whether it is a signed token or a session that
        // has just proved ownership of exactly this row.
        after(
          notifyExpiredSeatOffers({
            client: admin,
            request,
            participationId: row.id,
          }),
        );
        return { outcome: "expired" as const };
      default:
        return { outcome: "invalid" as const };
    }
  },
});
