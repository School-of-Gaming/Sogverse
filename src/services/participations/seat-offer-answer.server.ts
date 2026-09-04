import "server-only";
import { after } from "next/server";
import { ApiError } from "@/lib/api/api-error";
import { respondSeatOfferRpcResult } from "@/services/participations/seat-offer.contracts";
import { sendProductConfirmationEmail } from "@/services/participations/product-confirmation-email.server";
import {
  notifyExpiredSeatOffers,
  sendSeatOfferStaffEmail,
} from "@/services/participations/seat-offer-email.server";
import type { AppSupabaseClient } from "@/types";

/**
 * What happens after `respond_seat_offer` has answered — for both routes that
 * call it.
 *
 * **Two routes, one credential each, and one settle.** The emailed answer is
 * authorized by a signed token and the in-app answer by a session, and that
 * difference is real enough that the two handlers are deliberately separate
 * doors. It stops the moment the RPC returns: from there the family has been
 * accepted, deleted from the queue, or told the offer ran out, and everything
 * owed to staff is decided by the RPC's own result rather than by how the
 * answer arrived. Written twice, the declined arm's two-flag rule was two
 * copies of one paragraph that had to be kept in step by hand.
 *
 * What stays in the routes is what genuinely differs: how each establishes who
 * is answering, and what each says when the compare-and-swap refuses — the
 * emailed route re-reads the row to tell a spent link from a lapsed one, the
 * in-app route says `invalid`, because a caller who has already proved the row
 * is theirs is only being told their card is out of date.
 */

/**
 * The answer this settle reached, or `null` when the compare-and-swap refused.
 *
 * `null` is not an outcome — it is the settle handing the question back. Every
 * shape behind it (`stale`, `not_found`) means the row moved under the answer,
 * and what a family should be told about that depends on which door they came
 * through, so it is the one decision this function will not make for them.
 */
export type SettledSeatOfferAnswer = "accepted" | "declined" | "expired" | null;

export function settleSeatOfferAnswer({
  client,
  request,
  data,
  participationId,
  sentAt,
}: {
  /** The admin client both mails read through, and the one the RPC was called on. */
  client: AppSupabaseClient;
  /** The request the answer arrived on — the trusted origin and the locale chain. */
  request: Request;
  /** Whatever `respond_seat_offer` returned, still unparsed. */
  data: unknown;
  /**
   * The row this answer named. The expired arm's sweep is scoped to it, which
   * is the whole of what either credential authorizes.
   */
  participationId: string;
  /**
   * When the offer went out, for the line an admin reads to place it. The
   * emailed route has it from the token, the in-app route from the row — and
   * either way it is gone from the database by the time a declined mail is
   * built, because the decline deleted the row.
   */
  sentAt: string;
}): SettledSeatOfferAnswer {
  const parsed = respondSeatOfferRpcResult.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(
      `respond_seat_offer returned an unexpected shape: ${parsed.error.message}`,
      500,
    );
  }

  switch (parsed.data.kind) {
    case "accepted":
      // A family who answered yes now holds a seat, and the mail that follows a
      // seat is the signup confirmation — the same one the checkout route and
      // the Stripe webhook send, with the same schedule section and the same
      // `invite.ics`. Reaching a seat through a waitlist is a different door,
      // not a different outcome, and a family who came through it was the one
      // group being told least about the club they had just joined.
      //
      // The price shape is the sentinel: this arm has no idea what the product
      // costs, and the sender already reads the row that decides it. See
      // `ProductConfirmationSendMode`.
      after(
        sendProductConfirmationEmail({
          client,
          request,
          customerId: parsed.data.customer_id,
          participantId: parsed.data.participant_id,
          productId: parsed.data.product_id,
          participationId: parsed.data.participation_id,
          mode: "honoured-offer",
        }),
      );
      return "accepted";

    case "declined":
      // The answer that turns one family's no into the next family's
      // invitation. The row is already gone, which is why the RPC hands back
      // the four identifiers rather than leaving them to be read.
      //
      // **The mail is skipped only where the no-response mail demonstrably
      // went.** A late no lands after the offer was swept and staff were told
      // nobody answered, so mailing again would raise a family an admin has
      // finished dealing with — but that sweep is an OBSERVATION, not a
      // schedule, so "late" is no evidence at all that it ever happened. If
      // nobody opened a page between the fifth day and this answer, nobody was
      // told; the delete has just removed the row that said so, and this answer
      // would be the quietest thing that ever happened to the offer. So both
      // flags are read: in time, or nobody has heard yet (00209).
      if (parsed.data.within_window || !parsed.data.already_notified) {
        after(
          sendSeatOfferStaffEmail({
            client,
            request,
            reason: "declined",
            customerId: parsed.data.customer_id,
            participantId: parsed.data.participant_id,
            productId: parsed.data.product_id,
            sentAt,
          }),
        );
      }
      return "declined";

    case "expired":
      // The answer was rendered while the offer was live and ACCEPT was pressed
      // after it was not — the only answer the window still refuses, since
      // 00208 honours a decline for as long as the row exists.
      //
      // Reaching this is itself an observation that the offer lapsed, so it
      // does the sweep an admin opening a page would otherwise have done —
      // after the answer has gone out, because the family is owed a page and
      // not a wait on somebody else's mail. Scoped to the row the answer named,
      // on the rule that a credential naming one participation may claim only
      // that participation, whether it is a signed token or a session that has
      // just proved ownership.
      after(notifyExpiredSeatOffers({ client, request, participationId }));
      return "expired";

    default:
      // `stale` or `not_found`: the compare-and-swap refused, and the caller
      // owns what that is told to whoever asked.
      return null;
  }
}
