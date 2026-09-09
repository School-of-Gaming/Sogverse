import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  switchClubCheckQuery,
  switchClubCheckResponse,
  switchClubCommitBody,
  switchClubCommitResponse,
  type SwitchClubRefusal,
} from "@/services/participations/switch-club.contracts";
import {
  checkSwitchClub,
  commitSwitchClub,
} from "@/services/participations/switch-club.server";

/**
 * The admin club switch — one path, two handlers.
 *
 *   GET  ?target=<product id>  the check: what the dialog shows, and whether
 *                              the commit is allowed. Mints nothing.
 *   POST                       the commit: the same checks re-run, then the
 *                              Stripe plan change, then the RPC that moves the
 *                              row.
 *
 * Both are role-gated admin like the sibling handlers on
 * `[participationId]/route.ts`, and both run the reads on the CALLER's client:
 * every table involved carries an admin-full-access policy, and
 * `admin_move_participation` re-checks the caller's role internally
 * (`assert_admin`), so a service-role call would have no `auth.uid()` to read
 * and would be refused. The one service-role use is the price cache — see the
 * commit handler.
 *
 * The sequence and every refusal live in `switch-club.server.ts`; what is here
 * is the posture, the shapes, and the mapping from a refusal to a status.
 */
const routeParams = z.object({
  id: z.string().uuid(),
  participationId: z.string().uuid(),
});

/**
 * GET /api/admin/products/[id]/participations/[participationId]/switch?target=…
 *
 * Answers 200 whether or not the switch is allowed: a refusal is an answer, not
 * an error, and the dialog words every one of them. The two 404s it can raise
 * are the URL naming nothing — a participation that is not on this product, or
 * an unknown target.
 */
export const GET = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can switch a gamer's club",
  params: routeParams,
  query: switchClubCheckQuery,
  response: switchClubCheckResponse,

  handler: async ({ supabase, params, query }) => {
    const check = await checkSwitchClub({
      supabase,
      productId: params.id,
      participationId: params.participationId,
      targetProductId: query.target,
    });

    // `commitFacts` is the commit's private half of the same answer and is not
    // part of the wire contract; the response schema would strip it anyway, and
    // dropping it here says so deliberately.
    return {
      currency: check.currency,
      currentAmountCents: check.currentAmountCents,
      targetAmountCents: check.targetAmountCents,
      refusals: check.refusals,
      // Stated, not gated on: a family who cancelled and changed their mind is
      // exactly who an admin switches, and what the sheet needs is the fact.
      subscriptionEndsAt: check.subscriptionEndsAt,
      // Present only when true, like every flag that is normally absent — and
      // never a refusal, because the two records disagreeing about one
      // subscription is a thing to fix in Stripe rather than an answer about
      // this seat.
      ...(check.currencyMismatch ? { currencyMismatch: true } : {}),
    };
  },
});

/**
 * POST /api/admin/products/[id]/participations/[participationId]/switch
 *
 * Re-runs the check, moves the Stripe subscription onto the target club's
 * canonical price with `create_prorations`, then moves the row.
 *
 * **If the database step fails, nothing is undone in Stripe.** The answer names
 * that state (`stripeUpdated: true`) and the same commit is safe to press
 * again: with the dialog's request id unchanged Stripe replays the original
 * request, and from a fresh dialog the item update is a no-op that prorates
 * nothing. A compensating second Stripe call is the one thing this route must
 * never make — it would be the only place money moves twice.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can switch a gamer's club",
  params: routeParams,
  body: switchClubCommitBody,

  handler: async ({ request, supabase, user, params, body }) => {
    const { id: productId, participationId } = params;

    const check = await checkSwitchClub({
      supabase,
      productId,
      participationId,
      targetProductId: body.targetProductId,
      groupId: body.groupId,
    });

    // Answered first, and separately from the refusals: a group that is not the
    // target's is a malformed request from a client the dialog itself built,
    // not something an admin can be told about this seat. Plain 400, no
    // `refusals` — widening the enum would put a client bug in the vocabulary
    // the dialog words for a human.
    if (check.groupNotOnTarget) {
      return NextResponse.json(
        { error: "That group is not a group of the target club." },
        { status: 400 },
      );
    }

    // The same posture as the group answer above, for the same reason: the
    // Stripe subscription and our own row disagreeing about the currency is a
    // records problem, not one of the things an admin is told about this seat.
    // It is answered before the refusals because minting a price in a currency
    // the subscription does not bill is the mistake it prevents.
    if (check.currencyMismatch) {
      return NextResponse.json(
        {
          error:
            "Stripe and our records disagree about this subscription's currency — check the subscription in Stripe before switching.",
        },
        { status: 400 },
      );
    }

    if (check.refusals.length > 0 || !check.commitFacts) {
      return NextResponse.json(
        {
          error:
            "This seat can't be switched to that club — the dialog lists why.",
          refusals: check.refusals,
        },
        { status: 400 },
      );
    }

    const outcome = await commitSwitchClub({
      supabase,
      // The one service-role use on this route, and it is the price cache's
      // own requirement: `getOrCreateSubscriptionPrice` writes
      // `product_subscription_prices` and reconciles the Stripe Product behind
      // it. The admin's identity is established by this route's role gate, and
      // the RPC that actually moves the seat still runs on the user client.
      admin: createAdminClient(),
      request,
      participationId,
      targetProductId: body.targetProductId,
      groupId: body.groupId,
      requestId: body.requestId,
      adminId: user.id,
      facts: check.commitFacts,
    });

    // Stripe answered, but the subscription is not on the price we asked for —
    // an idempotency replay of an earlier, now-stale request is how that
    // happens. NOTHING has moved, so there is no `stripeUpdated` to report and
    // the RPC was never called; a fresh dialog mints a new request id and its
    // request is no longer a replay.
    if (outcome.kind === "stripe_not_applied") {
      console.error(
        JSON.stringify({
          event: "admin_switch_club_stripe_not_applied",
          admin_id: user.id,
          participation_id: participationId,
          source_product_id: check.commitFacts.sourceProductId,
          target_product_id: body.targetProductId,
          stripe_subscription_id: outcome.stripeSubscriptionId,
          stripe_price_id: outcome.stripePriceId,
          observed_price_ids: outcome.observedPriceIds,
          request_id: body.requestId,
          at: new Date().toISOString(),
        }),
      );
      return NextResponse.json(
        {
          error:
            "Stripe did not apply the price change, so nothing was moved. Close this sheet and start the switch again from a fresh open.",
        },
        { status: 409 },
      );
    }

    if (outcome.kind === "db_failed") {
      console.error(
        JSON.stringify({
          event: "admin_switch_club_db_failed",
          admin_id: user.id,
          participation_id: participationId,
          source_product_id: check.commitFacts.sourceProductId,
          target_product_id: body.targetProductId,
          stripe_subscription_id: outcome.stripeSubscriptionId,
          stripe_price_id: outcome.stripePriceId,
          code: outcome.code,
          detail: outcome.message,
          at: new Date().toISOString(),
        }),
      );

      // Every one of these carries `stripeUpdated: true`, because the money has
      // already moved and the admin has to know that whatever else is true.
      // The three codes below are races the check just ruled out — another
      // admin moving the same seat in the gap — so they are the caller's answer
      // rather than a fault, and the answer is NAMED: a race carries the
      // matching refusal, which is what tells the dialog to word the reason and
      // kill the confirm instead of inviting a retry that can never succeed.
      // Only a genuine outage is retryable, and it is the only failure that is
      // BOTH a 500 and refusal-free — the group guard is refusal-free too, and
      // its 400 is what tells the sheet not to offer a press it cannot use.
      const status = statusForFailedMove(outcome.code, outcome.message);
      const refusal = refusalForFailedMove(outcome.code, outcome.message);
      return NextResponse.json(
        {
          error: messageForFailedMove(outcome.code, outcome.message),
          stripeUpdated: true,
          ...(refusal ? { refusals: [refusal] } : {}),
        },
        { status },
      );
    }

    // Audit trail, in the shape of the comp-enrolment and removal lines: the
    // one record of who moved which seat between which clubs, and on which
    // subscription. Hosted log aggregation picks this up; no DB write.
    console.info(
      JSON.stringify({
        event: "admin_switch_club",
        admin_id: user.id,
        participation_id: outcome.result.participation_id,
        source_product_id: outcome.result.source_product_id,
        target_product_id: outcome.result.target_product_id,
        stripe_subscription_id: outcome.result.stripe_subscription_id,
        stripe_price_id: outcome.stripePriceId,
        request_id: body.requestId,
        at: new Date().toISOString(),
      }),
    );

    const response = {
      participationId: outcome.result.participation_id,
      sourceProductId: outcome.result.source_product_id,
      targetProductId: outcome.result.target_product_id,
      groupId: outcome.result.group_id,
      stripeSubscriptionId: outcome.result.stripe_subscription_id,
      stripePriceId: outcome.stripePriceId,
    };
    const parsed = switchClubCommitResponse.safeParse(response);
    if (!parsed.success) {
      throw new ApiError("Failed to switch club", 500);
    }
    return NextResponse.json(parsed.data);
  },
});

/**
 * The RPC's own refusals, mapped where they could still occur as a race the
 * pre-flight could not have seen. Everything else is a genuine outage, which is
 * the 500 the plan names.
 */
function statusForFailedMove(code: string | null, message: string): number {
  // 23505 — the unique index over (product, participant): somebody else put
  // this participant on the target between the check and the write.
  if (code === "23505") return 409;
  // The two expected-state guards (00247). A conflict rather than a bad
  // request: the seat or the subscription is no longer what the sheet was
  // looking at, and no press can make it so again.
  if (isExpectedStateLost(code, message)) return 409;
  // 23514 (check violation) and 55000 (no live subscription) are the RPC's
  // other refusals; reaching one means the seat changed underneath us, which is
  // a bad request rather than a fault.
  if (code === "23514" || code === "55000") return 400;
  return 500;
}

function messageForFailedMove(code: string | null, message: string): string {
  // The two shapes are deliberately different sentences. A race is permanent —
  // pressing again cannot change the fact the write collided with — so its
  // wording states the state Stripe is in and stops there; only the outage
  // wording invites a retry.
  const moved = "The Stripe subscription is already on the new club's price";
  if (code === "23514" && message.includes("the seat has moved")) {
    return `The seat is no longer on the club this switch was checked against, so it was not moved. ${moved}, and that has to be sorted out in Stripe.`;
  }
  if (code === "23514" && message.includes("the price has changed")) {
    return `The subscription's price changed underneath this switch, so the seat was not moved. ${moved}, and that has to be sorted out in Stripe.`;
  }
  if (isGroupNotOnTarget(code, message)) {
    return `That group is not a group of the target club, so the seat could not be moved. ${moved}, and that has to be sorted out in Stripe.`;
  }
  if (code === "23505") {
    return `This gamer already holds a seat on the target club, so the seat could not be moved. ${moved}, and that has to be sorted out in Stripe.`;
  }
  if (code === "23514" || code === "55000") {
    return `The seat changed while the switch was running. ${moved}, and that has to be sorted out in Stripe.`;
  }
  return `The seat could not be moved in the database. ${moved} — press Switch again to finish the move.`;
}

/**
 * The race codes, mapped back onto the contract's refusals so the dialog words
 * the reason itself. Only the RPC's own guards are named here: everything else
 * is an outage with no refusal to give, which is exactly the case the dialog
 * offers a retry for.
 *
 * `23514` covers four of the RPC's guards, and Postgres gives a raised
 * `check_violation` no constraint name, so the raised message is what separates
 * them — the substrings below are the load-bearing halves of those
 * `RAISE EXCEPTION` lines (migration 00246). An unrecognised one falls back to
 * no refusal, which degrades to the generic wording rather than to a wrong one.
 *
 * The fourth — a group that is not the target's — deliberately maps to no
 * refusal. It is a malformed request from a client the sheet itself built, not
 * a fact about this seat an admin is told in the refusal vocabulary, so the
 * enum stays as it is and the answer is a plain 400 carrying
 * `stripeUpdated: true` and its own sentence. `statusForFailedMove` already
 * gives every `23514` a 400, which is what separates it from the retryable
 * outage: only a 500 with no refusals invites another press.
 */
function refusalForFailedMove(
  code: string | null,
  message: string,
): SwitchClubRefusal | null {
  if (code === "23505") return "already_on_target";
  if (code === "55000") return "no_live_subscription";
  // The expected-state guards, named before the substring matching below so
  // their wording can never be read as one of the refusals by accident.
  if (isExpectedStateLost(code, message)) return null;
  if (code === "23514" && !isGroupNotOnTarget(code, message)) {
    if (message.includes("(same product)")) return "same_product";
    if (message.includes("not active")) return "participation_not_active";
    if (message.includes("not a paid subscription club")) {
      return "target_not_paid_subscription_club";
    }
  }
  return null;
}

/**
 * The one `23514` with no refusal to give: the RPC's group guard, raised when
 * the chosen group does not belong to the target club. The pre-flight answers
 * this before Stripe is touched, so reaching it here means the group stopped
 * being the target's while the switch was running — the money has moved, and
 * the admin has to be told that in its own words rather than through a refusal
 * the vocabulary does not carry.
 */
function isGroupNotOnTarget(code: string | null, message: string): boolean {
  return code === "23514" && message.includes("is not a group of the target");
}

/**
 * The RPC's two expected-state guards (00247): the seat is no longer on the
 * product the check read it on, or the subscription row is no longer on the
 * price the check read. Both mean the world moved between the check and the
 * write, and neither has a refusal to give — the refusal vocabulary answers
 * "why can this seat not be switched", while these answer "what you were
 * looking at is gone". A 409 with no refusal is that distinction: permanent,
 * because `statusForFailedMove` reserves the retryable answer for the 500.
 */
function isExpectedStateLost(code: string | null, message: string): boolean {
  return (
    code === "23514" &&
    (message.includes("the seat has moved") ||
      message.includes("the price has changed"))
  );
}
