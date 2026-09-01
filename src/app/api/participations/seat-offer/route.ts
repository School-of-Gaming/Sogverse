import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  inAppSeatOfferRespondBody,
  seatOfferRespondResponse,
} from "@/services/participations/seat-offer.contracts";
import { settleSeatOfferAnswer } from "@/services/participations/seat-offer-answer.server";

/**
 * POST /api/participations/seat-offer — the same answer, given from inside My
 * SOG instead of from the inbox.
 *
 * **Two routes for one action, deliberately, because the credential differs.**
 * The public one is authorized by a signed token and has no session; this one
 * is authorized by the session and has no token. Collapsing them would mean one
 * handler that accepts either, which is one handler where a missing token can
 * be read as "must be the session path" — precisely the shape that turns two
 * safe doors into one unsafe one. What the two genuinely share starts after the
 * RPC has answered, and lives in `seat-offer-answer.server.ts`.
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

    // Everything the answer owes staff, and the sweep a lapsed one triggers,
    // decided in the one place both respond routes share.
    const settled = settleSeatOfferAnswer({
      client: admin,
      request,
      data,
      participationId: row.id,
      sentAt: row.seat_offer_sent_at,
    });

    // `stale` or `not_found` comes back as `invalid`, and here that is a plain
    // description rather than a disclosure decision: the caller has already
    // proved the row is theirs, so the only thing left to say is that the card
    // is showing something no longer true and a refetch is the fix.
    return { outcome: settled ?? ("invalid" as const) };
  },
});
