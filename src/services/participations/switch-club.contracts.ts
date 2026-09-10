import { z } from "zod";

/**
 * Contracts for the admin club switch — the one action that moves a subscribed
 * participant's seat to another consumer club and swaps their Stripe
 * subscription onto that club's canonical price (docs/architecture/products.md,
 * "Billing"). Two handlers share one path,
 * `/api/admin/products/[id]/participations/[participationId]/switch`:
 *
 * - `GET ?target=<productId>` is the check: what the dialog shows, and whether
 *   the commit is allowed. It mints nothing in Stripe.
 * - `POST` is the commit: the same checks re-run, then the Stripe plan change,
 *   then the RPC that moves the row.
 *
 * The dialog and the routes are built against this file, so a field added here
 * is a field both sides agree on.
 */

/**
 * The hard refusals. Every one is a "nothing is written to either system"
 * answer; the soft gates (capacity, age range, region lock, consents, not
 * started) are picker warnings derived client-side and never appear here.
 *
 * The first three come from Stripe and the authored price table; the rest are
 * the RPC's own refusals pre-flighted with plain reads, so the database step
 * after the money has moved can fail only on a genuine outage.
 */
export const SWITCH_CLUB_REFUSALS = [
  /** The subscription's latest invoice is not `paid` with a positive amount. */
  "latest_invoice_not_paid",
  /** The subscription does not carry exactly one item, so there is no single price to swap. */
  "subscription_not_single_item",
  /** No authored `product_prices` row for the target in the subscription's currency. */
  "no_target_price_in_currency",
  /** The participation is not `active`. */
  "participation_not_active",
  /** No live (non-cancelled) `family_subscriptions` row for the participation. */
  "no_live_subscription",
  /** The target is not a paid, subscription-shaped product. */
  "target_not_paid_subscription_club",
  /** The target is the product the seat is already on. */
  "same_product",
  /**
   * The participant already holds a row on the target in a status the unique
   * index covers (active, waitlisted or completed).
   */
  "already_on_target",
] as const;

export const switchClubRefusal = z.enum(SWITCH_CLUB_REFUSALS);
export type SwitchClubRefusal = z.infer<typeof switchClubRefusal>;

/** Query of the check handler: `?target=<product id>`. */
export const switchClubCheckQuery = z.object({
  target: z.string().uuid(),
});

/**
 * Response of the check handler (200 whether or not the switch is allowed —
 * a refusal is an answer, not an error).
 *
 * `currentAmountCents` is the subscription item's actual unit amount read from
 * Stripe, not the source product's authored price: a subscriber keeps their
 * original amount when an admin later raises a club's price. It is null only
 * when the item carries no flat amount (a tiered price), which no club price
 * is today. `targetAmountCents` is the target's authored monthly price in the
 * subscription's currency, null when there is none — in which case
 * `no_target_price_in_currency` is among the refusals.
 */
export const switchClubCheckResponse = z.object({
  /** The subscription row's currency, lower-case ISO code. */
  currency: z.string(),
  currentAmountCents: z.number().int().nullable(),
  targetAmountCents: z.number().int().nullable(),
  /** Empty means the commit is allowed. */
  refusals: z.array(switchClubRefusal),
  /**
   * When the family has already cancelled — at period end, or at a named
   * instant — this is when the subscription runs out; null otherwise.
   *
   * Deliberately NOT a refusal: an admin may well be switching the club of a
   * family who cancelled and changed their mind, and owner's ruling is that the
   * flexibility stays. It is a FACT the sheet states, so the admin knows the
   * subscription they are re-pricing is on its way out and can say so to the
   * parent. The commit does not gate on it.
   */
  subscriptionEndsAt: z.string().datetime().nullable(),
  /**
   * The live Stripe subscription's currency disagrees with the
   * `family_subscriptions` row's. Present only when true, and never a refusal:
   * like a group that is not the target's, it is a records disagreement rather
   * than an answer about this seat, so the commit answers it with a plain 400
   * that says to check the subscription in Stripe.
   */
  currencyMismatch: z.boolean().optional(),
});

export type SwitchClubCheckResponse = z.infer<typeof switchClubCheckResponse>;

/**
 * Body of the commit handler. `requestId` is minted once per dialog open and
 * reused for every press in that dialog: together with the participation and
 * target ids it derives the Stripe idempotency key, so a retry after a timeout
 * or a failed database step replays the same Stripe request rather than
 * prorating twice.
 *
 * `groupId` is the admin's placement on the target: a group of the target
 * club, or null to leave the seat in the target's unassigned inbox (which is
 * where the shared placement rule puts a paid seat anyway). The RPC refuses a
 * group that is not the target's.
 */
export const switchClubCommitBody = z.object({
  targetProductId: z.string().uuid(),
  groupId: z.string().uuid().nullable(),
  // Bounded and alphabet-restricted because this value is concatenated into the
  // Stripe idempotency key: a caller-supplied string that could carry a colon,
  // a newline or unbounded length would let two different commits collide on
  // one key — the one place in this feature where money would move for the
  // wrong seat. The dialog mints `crypto.randomUUID()`, which conforms.
  requestId: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
});

export type SwitchClubCommitBody = z.infer<typeof switchClubCommitBody>;

/** Response of a successful commit (200). */
export const switchClubCommitResponse = z.object({
  participationId: z.string(),
  sourceProductId: z.string(),
  targetProductId: z.string(),
  /** Where the shared placement rule put the seat; null = unassigned. */
  groupId: z.string().nullable(),
  stripeSubscriptionId: z.string(),
  stripePriceId: z.string(),
});

export type SwitchClubCommitResponse = z.infer<typeof switchClubCommitResponse>;

/**
 * Error body of both handlers (4xx/5xx). `error` is always present and is the
 * fallback wording; the other two are what the dialog branches on, and they are
 * independent because the two questions they answer are:
 *
 * - `refusals` — WHY, in words the dialog owns. Present whenever the answer is
 *   one of the hard refusals above, whether the check found it or the write
 *   raced into it. Its presence means pressing again cannot help, so the
 *   confirm dies.
 * - `stripeUpdated` — whether the money already moved. True on every failure
 *   after the plan change, including the races, because an admin has to know
 *   the subscription is on the new price however the seat ended up.
 *
 * Both together is the worst case and a real one: the subscription bills for
 * the new club while the seat could not follow, and the fix is in Stripe, not
 * in another press. `stripeUpdated` alone is the retryable case the plan names.
 */
export const switchClubErrorResponse = z.object({
  error: z.string(),
  refusals: z.array(switchClubRefusal).optional(),
  stripeUpdated: z.boolean().optional(),
});

export type SwitchClubErrorResponse = z.infer<typeof switchClubErrorResponse>;
