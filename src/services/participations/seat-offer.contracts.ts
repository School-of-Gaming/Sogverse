import { z } from "zod";

/**
 * Wire shapes for the seat offer: an admin invites one waitlisted family to a
 * seat that has opened, and they answer from their inbox or from My SOG.
 *
 * The RPC-result schemas here are written from the function bodies in migration
 * 00207 (`send_seat_offer`, `respond_seat_offer`,
 * `claim_expired_seat_offer_notifications`), which return `Json` in codegen. The
 * db tests parse real RPC output through them in CI.
 */

/**
 * `send_seat_offer` result.
 *
 * `idempotent` is the same axis, with the same polarity, as `join_waitlist`'s:
 * false only on the call that actually stamped the row, true when a LIVE offer
 * was already standing. The mail keys on it, because a first send and a replay
 * are otherwise identical answers — and a replay deliberately reports the
 * ORIGINAL `sent_at`, so a second press of Invite cannot move a deadline the
 * family is already reading in their inbox.
 *
 * `noop` is the row having moved on (promoted, or gone) between the admin's
 * snapshot and the click. The panel refetches rather than arguing.
 */
export const sendSeatOfferRpcResult = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("offered"),
    participation_id: z.string(),
    product_id: z.string(),
    customer_id: z.string(),
    participant_id: z.string(),
    /**
     * The stamp the row actually holds — never the caller's idea of it. The
     * emailed token is signed over this instant, so a value invented anywhere
     * but inside the RPC would mint a link that can never be redeemed.
     */
    sent_at: z.string(),
    idempotent: z.boolean(),
  }),
  z.object({ kind: z.literal("noop"), status: z.string() }),
]);

export type SendSeatOfferRpcResult = z.infer<typeof sendSeatOfferRpcResult>;

/**
 * `respond_seat_offer` result.
 *
 * Five outcomes, and the split between the last three is what the landing page
 * and the family card both read:
 *
 * - `accepted` — the seat is theirs, placed in the product's single group (or
 *   unassigned, if the product stopped having exactly one while they decided —
 *   the seat is granted either way).
 * - `declined` — the row is gone, and the identifiers ride back because the
 *   staff mail names them and they cannot be read after the delete.
 * - `expired` — the offer was real and the five days ran out.
 * - `stale` — the stamp no longer matches: already answered, superseded by a
 *   re-offer, or an old link. Deliberately one kind rather than three, because
 *   the family-facing answer is the same sentence.
 * - `not_found` — no such participation. Same shape a stranger's id produces.
 */
export const respondSeatOfferRpcResult = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("accepted"),
    participation_id: z.string(),
    product_id: z.string(),
    group_id: z.string().nullable(),
    customer_id: z.string(),
    participant_id: z.string(),
  }),
  z.object({
    kind: z.literal("declined"),
    participation_id: z.string(),
    product_id: z.string(),
    customer_id: z.string(),
    participant_id: z.string(),
  }),
  z.object({
    kind: z.literal("expired"),
    participation_id: z.string(),
    product_id: z.string(),
  }),
  z.object({ kind: z.literal("stale") }),
  z.object({ kind: z.literal("not_found") }),
]);

export type RespondSeatOfferRpcResult = z.infer<
  typeof respondSeatOfferRpcResult
>;

/**
 * `claim_expired_seat_offer_notifications` result — one entry per offer this
 * call claimed, and an empty array whenever another caller got there first.
 * The claim and the mark are one statement, so the array *is* the set this
 * caller owes a mail for.
 */
export const claimedSeatOfferExpiries = z.array(
  z.object({
    participation_id: z.string(),
    product_id: z.string(),
    customer_id: z.string(),
    participant_id: z.string(),
    sent_at: z.string(),
  }),
);

export type ClaimedSeatOfferExpiries = z.infer<typeof claimedSeatOfferExpiries>;

/**
 * Body of POST /api/seat-offer/respond — the public, token-authorized answer.
 *
 * The token is the whole credential: it names the participation and the exact
 * offer, and the reader may be signed out or signed in as somebody else. So the
 * body carries no participation id at all — one that disagreed with the token
 * would just be a second thing to reconcile.
 */
export const seatOfferRespondBody = z.object({
  token: z.string().min(1, "token is required"),
  accept: z.boolean(),
});

/**
 * Body of POST /api/participations/seat-offer — the same answer from inside My
 * SOG, where the session is the credential and there is no token. The route
 * proves the participation belongs to the caller before it reads the stored
 * stamp, so the body names only the row.
 */
export const inAppSeatOfferRespondBody = z.object({
  participationId: z.string().uuid("participationId must be a UUID"),
  accept: z.boolean(),
});

/**
 * The answer both respond routes give, and the states the landing page renders.
 *
 * `stale` and `not_found` collapse into `invalid` on the wire on purpose: a
 * public endpoint that distinguished "this offer was answered" from "no such
 * offer" would answer questions about rows the caller has shown no right to
 * ask about. The family reads the same sentence for both anyway.
 */
export const seatOfferRespondResponse = z.object({
  outcome: z.enum(["accepted", "declined", "expired", "invalid"]),
});

export type SeatOfferRespondResponse = z.infer<typeof seatOfferRespondResponse>;

/**
 * Response of POST /api/admin/seat-offers/sweep. Only the count crosses the
 * wire: the caller's job is to know whether anything happened, and the rows
 * themselves are staff mail rather than data any UI renders.
 */
export const seatOfferSweepResponse = z.object({
  claimed: z.number().int().nonnegative(),
});

export type SeatOfferSweepResponse = z.infer<typeof seatOfferSweepResponse>;
