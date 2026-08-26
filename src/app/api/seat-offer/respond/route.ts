import { after } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isSeatOfferTokenExpired,
  readSeatOfferToken,
} from "@/lib/seat-offer-token";
import {
  respondSeatOfferRpcResult,
  seatOfferRespondBody,
  seatOfferRespondResponse,
} from "@/services/participations/seat-offer.contracts";
import {
  notifyExpiredSeatOffers,
  sendSeatOfferStaffEmail,
} from "@/services/participations/seat-offer-email.server";

/**
 * POST /api/seat-offer/respond — a family answering a seat offer from the link
 * in their inbox.
 *
 * **A POST behind two buttons, and never a GET.** The verification link one
 * page over acts during its own render, because that write is idempotent and
 * grants nothing; this one grants a seat and removes a family from a waitlist,
 * so an inbox scanner following the link must not be able to answer on their
 * behalf. The mail's buttons land on `/seat-offer`, which only renders; this
 * route is what the page's own buttons call.
 *
 * **Every unrecognised answer is `invalid`, and nothing distinguishes the ways
 * of being unrecognised.** A forged token, a token for a row that has gone, one
 * already answered and one superseded by a fresh offer all come back the same,
 * with a 200 — because the alternative is an endpoint that will tell an
 * unauthenticated caller which participation ids exist and what state they are
 * in. The family reads one sentence for all of them anyway.
 */
export const POST = defineRoute({
  posture: "public",
  reason:
    "the signed token in the body IS the authorization, and the reader has no usable session: a parent opens this from their inbox on the family tablet, where they are as likely to be signed in as their own child as signed in as themselves. The token names one participation and one exact offer instant, both HMAC'd, and the RPC behind it compares that instant against the row before writing — so possession of the link authorizes exactly one answer to exactly one offer, and nothing else. Every unrecognised token gets one generic answer, so the route confirms nothing about which ids exist",
  body: seatOfferRespondBody,
  response: seatOfferRespondResponse,

  handler: async ({ request, body }) => {
    const claims = await readSeatOfferToken(body.token);
    if (!claims) return { outcome: "invalid" as const };

    const admin = createAdminClient();

    // Signature good, window closed. The click is itself an observation that
    // this offer lapsed, so it does the sweep an admin opening a page would
    // otherwise have done — after the answer has gone out, because the family
    // is owed a page and not a wait on somebody else's mail. The RPC would
    // report `expired` for this row too; asking it first would only be a second
    // round trip to reach the same sentence.
    //
    // Scoped to the participation the TOKEN names, and that is the whole of
    // what this credential authorizes: the signature never expires, so a link
    // leaked out of an old inbox is a permanent trigger, and an unscoped claim
    // would let it write across the platform and fan staff mail out about
    // families it has nothing to do with.
    if (isSeatOfferTokenExpired(claims, Date.now())) {
      after(
        notifyExpiredSeatOffers({
          client: admin,
          request,
          participationId: claims.participationId,
        }),
      );
      return { outcome: "expired" as const };
    }

    const { data, error } = await admin.rpc("respond_seat_offer", {
      p_participation_id: claims.participationId,
      // The instant the token was signed over, back as an ISO string. It
      // survives the round trip only because the stamp was truncated to
      // milliseconds when it was written — see migration 00207.
      p_offer_sent_at: new Date(claims.sentAtMs).toISOString(),
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
        // The answer that turns one family's no into the next family's
        // invitation. The row is already gone, which is why the RPC hands back
        // the four identifiers rather than leaving them to be read.
        after(
          sendSeatOfferStaffEmail({
            client: admin,
            request,
            reason: "declined",
            customerId: parsed.data.customer_id,
            participantId: parsed.data.participant_id,
            productId: parsed.data.product_id,
            sentAt: new Date(claims.sentAtMs).toISOString(),
          }),
        );
        return { outcome: "declined" as const };
      case "expired":
        // The token said live and the row says lapsed — the five days ran out
        // between the page rendering and the button being pressed. Scoped to
        // the token's own participation for the same reason as above.
        after(
          notifyExpiredSeatOffers({
            client: admin,
            request,
            participationId: claims.participationId,
          }),
        );
        return { outcome: "expired" as const };
      default:
        return { outcome: "invalid" as const };
    }
  },
});
