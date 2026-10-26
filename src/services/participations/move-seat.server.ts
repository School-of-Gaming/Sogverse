import "server-only";
import type { z } from "zod";
import { ApiError } from "@/lib/api/api-error";
import { isSubscriptionShaped } from "@/lib/constants/billing";
import { DEFAULT_CURRENCY } from "@/lib/constants/currency";
import type { AppSupabaseClient, BillingMode } from "@/types";
import { adminMoveUnsubscribedParticipationRpcResult } from "@/services/participations/participations.contracts";
import {
  sendProductConfirmationEmail,
  type ProductConfirmationSendMode,
} from "@/services/participations/product-confirmation-email.server";
import type { SwitchClubRefusal } from "@/services/participations/switch-club.contracts";

/**
 * The no-subscription move, server half: an active seat no live subscription
 * stands behind, moved onto any product that is not subscription-shaped. The
 * sibling of `switch-club.server.ts`, and a file of its own because nothing in
 * it touches Stripe — no price, no plan change, no idempotency key — so the two
 * sequences share only the route they are served from.
 *
 * The check is the whole decision here as it is there: every refusal the RPC
 * raises is pre-flighted with a plain read, so the commit's RPC can fail only on
 * a race or an outage. Nothing has moved anywhere when it does.
 */

/** The statuses the participations unique index covers. */
const OCCUPIED_STATUSES = ["active", "waitlisted", "completed"] as const;

/**
 * Whether a live subscription stands behind the seat, in exactly the sense both
 * RPCs mean it: a `family_subscriptions` row whose status is anything but
 * `cancelled`. It is what decides which of the route's two moves a seat gets —
 * read from the seat itself, never from the client's idea of it.
 */
export async function hasLiveSubscription(
  supabase: AppSupabaseClient,
  participationId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("family_subscriptions")
    .select("stripe_subscription_id")
    .eq("participation_id", participationId)
    .neq("status", "cancelled")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** What the commit needs from the check, present only when nothing refused. */
export interface NoSubscriptionMoveFacts {
  participantId: string;
  customerId: string;
  sourceProductId: string;
  targetBillingMode: BillingMode;
}

export interface NoSubscriptionMoveCheck {
  /** Every refusal that applies; empty means the move is allowed. */
  refusals: SwitchClubRefusal[];
  /** Non-null exactly when `refusals` is empty. */
  commitFacts: NoSubscriptionMoveFacts | null;
  /**
   * The commit named a group that is not the target's. Not a refusal, for the
   * reason the club switch gives: a malformed request from a client the sheet
   * built, answered with a plain 400.
   */
  groupNotOnTarget: boolean;
}

export interface NoSubscriptionMoveCheckInput {
  supabase: AppSupabaseClient;
  /** The product the URL path names — the seat's current home. */
  productId: string;
  participationId: string;
  targetProductId: string;
  /** The commit's placement on the target; the check handler passes none. */
  groupId?: string | null;
}

/**
 * Throws a 404 for the two "this URL names nothing" cases, as the club switch's
 * check does: a participation that is not on this product, or an unknown target.
 */
export async function checkNoSubscriptionMove({
  supabase,
  productId,
  participationId,
  targetProductId,
  groupId,
}: NoSubscriptionMoveCheckInput): Promise<NoSubscriptionMoveCheck> {
  const refusals: SwitchClubRefusal[] = [];

  const { data: participation, error: participationError } = await supabase
    .from("participations")
    .select("id, product_id, participant_id, customer_id, status")
    .eq("id", participationId)
    .maybeSingle();
  if (participationError) throw participationError;
  if (!participation || participation.product_id !== productId) {
    throw new ApiError("Participation not found on this product", 404);
  }

  const { data: target, error: targetError } = await supabase
    .from("products")
    .select("id, product_type, billing_mode, for_gamers, for_parents")
    .eq("id", targetProductId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) {
    throw new ApiError("Target product not found", 404);
  }

  // The audience is decided from the participant's ROLE, exactly as the RPC
  // and admin enrolment decide it: a `customer` is an adult on their own
  // account, every other role a child.
  const { data: participant, error: participantError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", participation.participant_id)
    .maybeSingle();
  if (participantError) throw participantError;
  // A participation's participant is a profile by foreign key.
  if (!participant) {
    throw new ApiError("The seat holder's profile could not be read", 500);
  }

  // In the RPC's own firing order, so the list reads the way the database
  // would refuse.
  if (targetProductId === participation.product_id) {
    refusals.push("same_product");
  }
  if (participation.status !== "active") {
    refusals.push("participation_not_active");
  }
  if (isSubscriptionShaped(target.product_type, target.billing_mode)) {
    refusals.push("target_is_subscription_club");
  }
  if (participant.role === "customer") {
    if (!target.for_parents) refusals.push("target_not_open_to_parents");
  } else if (!target.for_gamers) {
    refusals.push("target_not_open_to_gamers");
  }

  // The unique index the RPC lets raise rather than pre-checking, asked here so
  // the dialog can say it before the press. Excluding this participation's own
  // id matters only for the same-product case, already refused above.
  const { data: occupied, error: occupiedError } = await supabase
    .from("participations")
    .select("id")
    .eq("product_id", targetProductId)
    .eq("participant_id", participation.participant_id)
    .in("status", OCCUPIED_STATUSES)
    .neq("id", participationId)
    .maybeSingle();
  if (occupiedError) throw occupiedError;
  if (occupied) refusals.push("already_on_target");

  let groupNotOnTarget = false;
  if (groupId) {
    const { data: group, error: groupError } = await supabase
      .from("product_groups")
      .select("id")
      .eq("id", groupId)
      .eq("product_id", targetProductId)
      .maybeSingle();
    if (groupError) throw groupError;
    groupNotOnTarget = !group;
  }

  return {
    refusals,
    commitFacts:
      refusals.length === 0
        ? {
            participantId: participation.participant_id,
            customerId: participation.customer_id,
            sourceProductId: participation.product_id,
            targetBillingMode: target.billing_mode,
          }
        : null,
    groupNotOnTarget,
  };
}

export interface NoSubscriptionMoveCommitInput {
  supabase: AppSupabaseClient;
  request: Request;
  participationId: string;
  targetProductId: string;
  groupId: string | null;
  facts: NoSubscriptionMoveFacts;
}

export type NoSubscriptionMoveCommitOutcome =
  | {
      kind: "ok";
      result: z.infer<typeof adminMoveUnsubscribedParticipationRpcResult>;
    }
  | {
      /** The RPC refused or failed. Nothing moved anywhere. */
      kind: "db_failed";
      code: string | null;
      message: string;
    };

/**
 * The confirmation mail's mode for the product the seat landed on, chosen the
 * way a signup onto it would choose: a free product's mail, a municipality
 * club's, or — the only paid shape this move reaches — the paid-once mail of a
 * camp or event.
 */
export function confirmationModeForMove(
  billingMode: BillingMode,
): ProductConfirmationSendMode {
  switch (billingMode) {
    case "free":
      return "free";
    case "external_contract":
      return "external";
    case "paid":
      return "upfront";
  }
}

/** Move the row, then tell the family the way a signup onto the target would. */
export async function commitNoSubscriptionMove({
  supabase,
  request,
  participationId,
  targetProductId,
  groupId,
  facts,
}: NoSubscriptionMoveCommitInput): Promise<NoSubscriptionMoveCommitOutcome> {
  const { data, error } = await supabase.rpc(
    "admin_move_unsubscribed_participation",
    {
      p_participation_id: participationId,
      p_target_product_id: targetProductId,
      // The state the check read, so a seat moved by someone else in the gap
      // is refused rather than moved again from wherever it now is.
      p_expected_source_product_id: facts.sourceProductId,
      // `undefined` omits the argument, so the SQL DEFAULT — the shared
      // placement rule — decides where an unplaced seat lands.
      p_group_id: groupId ?? undefined,
    },
  );
  if (error) {
    return { kind: "db_failed", code: error.code, message: error.message };
  }

  const parsed = adminMoveUnsubscribedParticipationRpcResult.safeParse(data);
  if (!parsed.success) {
    return {
      kind: "db_failed",
      code: null,
      message: `admin_move_unsubscribed_participation returned an unexpected shape: ${parsed.error.message}`,
    };
  }

  // The family's mail is the target's own confirmation, unchanged: the one a
  // signup onto it sends. The participation id travels with the move, so the
  // calendar invitation updates the entry the family already holds. Awaited
  // safely — the sender logs and swallows every failure by contract.
  await sendProductConfirmationEmail({
    client: supabase,
    request,
    customerId: parsed.data.customer_id,
    participantId: parsed.data.participant_id,
    productId: targetProductId,
    participationId,
    mode: confirmationModeForMove(facts.targetBillingMode),
    // A paid camp or event is priced in our integration currency, the one
    // checkout sells in; the no-charge modes never read it.
    currency: DEFAULT_CURRENCY,
  });

  return { kind: "ok", result: parsed.data };
}
