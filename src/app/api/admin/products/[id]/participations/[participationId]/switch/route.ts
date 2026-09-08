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
    });

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
      requestId: body.requestId,
      facts: check.commitFacts,
    });

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
      // already moved. The three codes below are races the check just ruled
      // out — another admin moving the same seat in the gap — so they are the
      // caller's answer rather than a fault, and only the status differs.
      const status = statusForFailedMove(outcome.code);
      return NextResponse.json(
        { error: messageForFailedMove(outcome.code), stripeUpdated: true },
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
function statusForFailedMove(code: string | null): number {
  // 23505 — the unique index over (product, participant): somebody else put
  // this participant on the target between the check and the write.
  if (code === "23505") return 409;
  // 23514 (check violation) and 55000 (no live subscription) are the RPC's
  // other refusals; reaching one means the seat changed underneath us, which is
  // a bad request rather than a fault.
  if (code === "23514" || code === "55000") return 400;
  return 500;
}

function messageForFailedMove(code: string | null): string {
  const tail =
    "The Stripe subscription is already on the new club's price — press Switch again to finish the move.";
  if (code === "23505") {
    return `This gamer already holds a seat on the target club. ${tail}`;
  }
  if (code === "23514" || code === "55000") {
    return `The seat changed while the switch was running. ${tail}`;
  }
  return `The seat could not be moved in the database. ${tail}`;
}
