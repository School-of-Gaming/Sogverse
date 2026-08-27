import { after } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isSeatOfferTokenExpired,
  readSeatOfferToken,
} from "@/lib/seat-offer-token";
import { resolveSeatOfferDeadEnd } from "@/lib/seat-offer.server";
import {
  emailedSeatOfferRespondResponse,
  respondSeatOfferRpcResult,
  seatOfferRespondBody,
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
 * **The signature is the line, and the disclosure sits on one side of it.** A
 * token we cannot read is answered `invalid` and told nothing else, which is
 * what stops this endpoint from confirming to an unauthenticated prober that
 * any given participation id exists. A token whose HMAC checks out is one we
 * minted for one exact offer, so its holder may be told that offer is over:
 * every consumed shape — accepted, promoted, declined, withdrawn, superseded —
 * comes back as the single `used`, which says the link is spent without
 * narrating the family's history back at them from a page carrying no session.
 *
 * **A late DECLINE is honoured, and only a late ACCEPT is refused.** The window
 * exists to stop a seat being claimed after we have offered it elsewhere, so it
 * binds one direction (00208). A decline that beat the deadline mails staff,
 * because it is the news that turns one family's no into the next family's
 * invitation; a late one does not, because that mail already went when the
 * offer was swept and nobody is waiting on this answer any more.
 */
export const POST = defineRoute({
  posture: "public",
  reason:
    "the signed token in the body IS the authorization, and the reader has no usable session: a parent opens this from their inbox on the family tablet, where they are as likely to be signed in as their own child as signed in as themselves. The token names one participation and one exact offer instant, both HMAC'd, and the RPC behind it compares that instant against the row before writing — so possession of the link authorizes exactly one answer to exactly one offer, and nothing else. Every unrecognised token gets one generic answer, so the route confirms nothing about which ids exist",
  body: seatOfferRespondBody,
  response: emailedSeatOfferRespondResponse,

  handler: async ({ request, body }) => {
    const claims = await readSeatOfferToken(body.token);
    if (!claims) return { outcome: "invalid" as const };

    const admin = createAdminClient();

    // Signature good, window closed, and the answer is YES. The click is itself
    // an observation that this offer lapsed, so it does the sweep an admin
    // opening a page would otherwise have done — after the answer has gone out,
    // because the family is owed a page and not a wait on somebody else's mail.
    // The RPC would report `expired` for this row too; asking it first would
    // only be a second round trip to reach the same sentence.
    //
    // **`body.accept` is load-bearing here.** A NO past the deadline is still an
    // answer we want, so it must fall through to the RPC, which honours it and
    // deletes the row. Only the claim is short-circuited, and only for the one
    // direction the window actually governs.
    //
    // Scoped to the participation the TOKEN names, and that is the whole of
    // what this credential authorizes: the signature never expires, so a link
    // leaked out of an old inbox is a permanent trigger, and an unscoped claim
    // would let it write across the platform and fan staff mail out about
    // families it has nothing to do with.
    if (body.accept && isSeatOfferTokenExpired(claims, Date.now())) {
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
        //
        // **Only an in-window no is mailed.** A late one arrives after the
        // offer was swept and staff were already told nobody answered, so a
        // second mail would raise a family an admin has finished dealing with
        // and ask them to act on news they have already acted on. The row is
        // freed either way; `within_window` is the only thing that can tell the
        // two apart, and it is decided inside the RPC because that is where the
        // stamp and the clock are read together.
        if (parsed.data.within_window) {
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
        }
        return { outcome: "declined" as const };
      case "expired":
        // The token said live and the row says lapsed — the five days ran out
        // between the page rendering and Accept being pressed. Only an accept
        // can land here now, since the RPC honours a decline whenever the row
        // still exists. Scoped to the token's own participation for the same
        // reason as above.
        after(
          notifyExpiredSeatOffers({
            client: admin,
            request,
            participationId: claims.participationId,
          }),
        );
        return { outcome: "expired" as const };
      default: {
        // `stale` or `not_found`: the compare-and-swap refused. The reader
        // pressed from a tab that was live when it rendered, so the panel they
        // land on should say what re-opening the mail would have said — which
        // is the same read the landing page does, and the same three answers,
        // so the two surfaces cannot disagree about one link.
        const outcome = await resolveSeatOfferDeadEnd(claims, admin);
        return { outcome };
      }
    }
  },
});
