import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/constants/currency";
import type { PurchaseShape } from "@/types";

/**
 * Response of POST /api/checkout/products/create — the signup outcomes: paid
 * (redirect to Stripe Checkout), free (instantly active participation),
 * external/municipality (instantly active, invoiced off-platform), or product
 * full. `free_confirmed` and `external_confirmed` are distinct outcomes but the
 * client treats both the same way — navigate to the confirmation page.
 */
export const createParticipationResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("redirect"), checkoutUrl: z.string() }),
  z.object({ status: z.literal("free_confirmed"), participationId: z.string() }),
  z.object({
    status: z.literal("external_confirmed"),
    participationId: z.string(),
  }),
  z.object({ status: z.literal("full") }),
]);

export type CreateParticipationResponse = z.infer<
  typeof createParticipationResponse
>;

/**
 * Request body of POST /api/checkout/products/create. The purchase shape and
 * currency are enums rather than free strings so the route never has to ask
 * "is this one of the four we support?" after the fact — and the coherence
 * rules the shape must satisfy against the product's billing mode stay in the
 * route, because they need the product row to decide.
 */
export const createCheckoutBody = z.object({
  productId: z.string().min(1, "productId is required"),
  participantId: z.string().min(1, "participantId is required"),
  // Spelled out rather than derived so the compiler checks it against the
  // shared union below — adding a shape there fails the build until it is
  // decided here too.
  purchaseShape: z.enum([
    "subscription_monthly",
    "single_payment",
    "free",
    "external",
  ] as const satisfies readonly PurchaseShape[]),
  currency: z.enum(SUPPORTED_CURRENCIES),
});

/**
 * Request body of POST /api/participations/waitlist.
 *
 * `.uuid()` rather than `.min(1)` because these ids go straight into a `uuid`
 * RPC parameter: a merely non-empty string reaches Postgres, fails to cast, and
 * comes back as `22P02` — which is not a status the route maps, so a
 * malformed-input request is logged and answered as a 500 instead of the 400 it
 * is. Rejecting the shape here keeps the classification honest.
 */
export const joinWaitlistBody = z.object({
  productId: z.string().uuid("productId must be a UUID"),
  participantId: z.string().uuid("participantId must be a UUID"),
});

/**
 * Request body of DELETE /api/participations/waitlist — giving up a spot. The
 * participation is the only input; who may give it up is decided from
 * `auth.uid()` inside the RPC, never from the body. `.uuid()` for the same
 * 22P02 reason as the join body above.
 */
export const leaveWaitlistBody = z.object({
  participationId: z.string().uuid("participationId must be a UUID"),
});

/**
 * Response of DELETE /api/participations/waitlist. Only the outcome kind
 * crosses the wire: the client's three jobs — stop showing the card, keep the
 * button locked, refetch — are the same for every outcome, and the ids the RPC
 * echoes back are ones the caller already had.
 */
export const leaveWaitlistResponse = z.object({
  kind: z.enum(["left", "noop", "not_found"]),
});

export type LeaveWaitlistResponse = z.infer<typeof leaveWaitlistResponse>;

/** Response of POST /api/participations/waitlist. */
export const joinWaitlistResponse = z.object({
  participationId: z.string(),
  waitlistPosition: z.number(),
  status: z.string(),
});

export type JoinWaitlistResponse = z.infer<typeof joinWaitlistResponse>;

/**
 * `create_participation` RPC result (Json in codegen; structure from
 * supabase/schema.sql). `validated` is the paid outcome: every rule passed, but
 * no row was written — a paid participation is created at payment confirmation,
 * so an abandoned checkout leaves nothing behind. The no-charge shapes still
 * come back with a row. `participation_id` stays optional because the route
 * turns its absence into a controlled 500 per kind — the schema checks
 * structure, the route checks the per-kind invariants.
 */
export const createParticipationRpcResult = z.object({
  kind: z.enum(["free_active", "external_active", "validated", "full"]),
  participation_id: z.string().optional(),
});

/**
 * `confirm_paid_participation` RPC result (Json in codegen; structure from
 * supabase/schema.sql). Called from the Stripe webhook once payment lands:
 * `confirmed` carries the row it just created, `duplicate_payment` names the row
 * that was already there — the parent paid twice for one (product, gamer), and
 * the route records the charge and cancels a live subscription rather than
 * writing a second seat.
 *
 * `idempotent` is the axis a replay is told apart on, and it is why it is
 * modelled here rather than dropped as noise. Stripe redelivers, and both
 * deliveries answer `confirmed` with the same participation id — the second one
 * because this very Checkout Session already bought that row, not because a new
 * one was written. Anything that must happen exactly once per seat (a
 * confirmation email) keys on `idempotent === false`; anything that is naturally
 * idempotent can ignore it.
 */
export const confirmPaidParticipationRpcResult = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("confirmed"),
    participation_id: z.string(),
    /** False when this call created the row; true when it recognised its own. */
    idempotent: z.boolean(),
  }),
  z.object({
    kind: z.literal("duplicate_payment"),
    existing_participation_id: z.string(),
  }),
]);

/**
 * `join_waitlist` RPC result (Json in codegen; structure from schema.sql).
 *
 * `idempotent` is the same axis, with the same polarity, as
 * `confirm_paid_participation`'s above, and for the same reason: the RPC returns
 * an existing waitlisted/reserving/active row shape-identically to a fresh
 * insert, so this flag is the only thing that tells a replay apart. False only
 * on the call that ran the INSERT. Required rather than optional — an optional
 * flag would let `!idempotent` pass vacuously on a shape that had lost it.
 *
 * `status` is the row's status, not necessarily `waitlisted`: a second parent
 * joining a gamer who already holds a seat gets `active` (with position 0)
 * rather than a place in line, which is why anything wording itself as "on the
 * waitlist" has to read this too.
 */
export const joinWaitlistRpcResult = z.object({
  participation_id: z.string(),
  waitlist_position: z.number(),
  status: z.string(),
  /** False when this call created the row; true when it recognised an existing one. */
  idempotent: z.boolean(),
});

/**
 * Body of POST /api/admin/products/[id]/participations — admin comp-enrollment.
 * The product comes from the URL path, so the body names only the participant.
 */
export const adminEnrollParticipantBody = z.object({
  participantId: z.string().min(1, "participantId is required"),
});

/**
 * Body of PATCH /api/admin/products/[id]/participations/[participationId] — the
 * admin waitlist status transitions driven by the groups-panel drag UI.
 * `promote` carries the drop target (`groupId` null = unassigned inbox);
 * `demote` sends an active gamer to the back of the waitlist (no target).
 */
export const waitlistTransitionBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("promote"), groupId: z.string().nullable() }),
  z.object({ action: z.literal("demote") }),
]);

export type WaitlistTransitionBody = z.infer<typeof waitlistTransitionBody>;

/**
 * `get_waitlist_position` RPC result. Codegen types it as a bare `number`, but
 * the function returns NULL when the row is unknown, not waitlisted, or not
 * owned by the caller — so the live shape is nullable. Parsing through this
 * schema restores the truth the generator drops (see supabase/CLAUDE.md).
 */
export const waitlistPositionResult = z.number().int().positive().nullable();

/**
 * `get_my_waitlist_positions` RPC result — the set-valued sibling of the above,
 * one row per waitlisted participation the caller is party to. Codegen types
 * the `RETURNS TABLE` columns as non-null, which the function body does
 * guarantee (`id` is the primary key and the position is a `COUNT`), so this
 * schema is not correcting nullability — it pins the *contents*: a position is
 * a 1-based rank, and a zero or negative one would mean the derivation had gone
 * three-valued against a NULL `waitlisted_at`. The db test parses live RPC
 * output through it.
 */
export const myWaitlistPositions = z.array(
  z.object({
    participation_id: z.string(),
    waitlist_position: z.number().int().positive(),
  }),
);

/**
 * `leave_my_waitlist_spot` RPC result (Json in codegen; structure from
 * schema.sql). `left` when the row was waitlisted and is now gone; `noop` when
 * it had already moved on (an admin promotion landing first); `not_found` when
 * no row with that id belongs to the caller — deliberately the same answer for
 * a stranger's id and a nonexistent one.
 */
export const leaveWaitlistRpcResult = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("left"),
    participation_id: z.string(),
    product_id: z.string(),
  }),
  z.object({ kind: z.literal("noop"), status: z.string() }),
  z.object({ kind: z.literal("not_found") }),
]);

/**
 * `promote_from_waitlist` RPC result (Json in codegen; structure from
 * schema.sql). `promoted` on success; `noop` when the row wasn't waitlisted
 * (already seated / cancelled) — the admin UI treats both as success and lets
 * the snapshot refetch reconcile.
 */
export const promoteFromWaitlistRpcResult = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("promoted"),
    participation_id: z.string(),
    product_id: z.string(),
    group_id: z.string().nullable(),
  }),
  z.object({ kind: z.literal("noop"), status: z.string() }),
]);

/**
 * `demote_to_waitlist` RPC result (Json in codegen; structure from schema.sql).
 * `demoted` on success; `noop` when the row was already waitlisted.
 */
export const demoteToWaitlistRpcResult = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("demoted"),
    participation_id: z.string(),
    product_id: z.string(),
  }),
  z.object({ kind: z.literal("noop"), status: z.string() }),
]);

/**
 * `admin_enroll_participant` RPC result (Json in codegen; structure from
 * schema.sql). The customer id is resolved inside the function — from the
 * child's parent link, or from the participant themselves on an adult's own
 * seat — so the route learns it from the result rather than looking it up.
 */
export const adminEnrollParticipantRpcResult = z.object({
  participation_id: z.string(),
  customer_id: z.string(),
});

/**
 * `admin_remove_participation` RPC result. It delegates to
 * `cancel_participation`, so the shape is that function's: `cancelled` with the
 * details the audit line needs, or `noop` when the row had already gone.
 */
export const adminRemoveParticipationRpcResult = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cancelled"),
    product_id: z.string(),
    previous_status: z.string(),
    stripe_subscription_id: z.string().nullable(),
    reason: z.string(),
  }),
  z.object({ kind: z.literal("noop") }),
]);
