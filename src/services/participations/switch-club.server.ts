import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { ApiError } from "@/lib/api/api-error";
import { isSubscriptionShaped } from "@/lib/constants/billing";
import {
  DEFAULT_CURRENCY,
  isSupportedCurrency,
  type SupportedCurrency,
} from "@/lib/constants/currency";
import { DEFAULT_LOCALE, resolveLocale } from "@/lib/constants/locales";
import { ROUTES } from "@/lib/constants";
import { getOrigin } from "@/lib/url";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { stripe } from "@/lib/stripe/client";
import {
  getOrCreateSubscriptionPrice,
  type StripeProductSource,
} from "@/lib/stripe/participation-prices";
import type {
  AppSupabaseClient,
  BillingMode,
  Database,
  ProductType,
  SpokenLanguageCode,
} from "@/types";
import { adminMoveParticipationRpcResult } from "@/services/participations/participations.contracts";
import type {
  SwitchClubCheckResponse,
  SwitchClubRefusal,
} from "@/services/participations/switch-club.contracts";

/**
 * The admin club switch, server half — shared by both handlers of
 * `/api/admin/products/[id]/participations/[participationId]/switch`.
 *
 * The check IS the whole decision: the commit re-runs it and refuses on
 * anything it finds, so by the time Stripe is called every database refusal has
 * already been answered with a plain read. That is what makes "money moves
 * once, ever" true — the database step after the price change can fail only on
 * a genuine outage, and the answer to that is to press commit again rather than
 * to compensate in Stripe.
 *
 * Both halves live here rather than in the route file so the sequence reads as
 * one module and the route stays a declaration of its posture.
 */

/** The statuses the participations unique index covers, per migration 00245. */
const OCCUPIED_STATUSES = ["active", "waitlisted", "completed"] as const;

/** The target product columns every step of the switch needs. */
const TARGET_PRODUCT_COLUMNS =
  "id, product_type, billing_mode, spoken_language_code, start_date, end_date, product_translations(locale, name)";

/**
 * The last resort of both name resolves below. It reaches Stripe — a receipt,
 * the hosted portal — never `messages/`, so no locale sweep will translate it,
 * and the brand name is the right shape for a string in that position. The same
 * string the checkout route falls back to, for the same reason.
 */
const FALLBACK_PRODUCT_NAME = "School of Gaming product";

interface TargetProduct extends StripeProductSource {
  product_type: ProductType;
  billing_mode: BillingMode;
  spoken_language_code: SpokenLanguageCode;
}

/**
 * What the commit needs from the check, present only when the check found no
 * refusal at all. Nothing here is re-read by the commit: the two halves of one
 * request must not be able to disagree about which subscription is moving.
 */
export interface SwitchClubCommitFacts {
  participantId: string;
  customerId: string;
  sourceProductId: string;
  currency: SupportedCurrency;
  subscriptionId: string;
  subscriptionItemId: string;
  targetProduct: TargetProduct;
}

export interface SwitchClubCheck extends SwitchClubCheckResponse {
  /** Non-null exactly when `refusals` is empty. */
  commitFacts: SwitchClubCommitFacts | null;
}

export interface SwitchClubCheckInput {
  /** The caller's own client. Admin RLS covers every table read below. */
  supabase: AppSupabaseClient;
  /** The product the URL path names — the seat's current home. */
  productId: string;
  participationId: string;
  targetProductId: string;
}

/**
 * Every refusal that applies, not the first one found: the dialog lists them,
 * and an admin who fixes one should not have to press again to discover the
 * next.
 *
 * Throws a 404 for the two "this URL names nothing" cases — a participation
 * that is not on this product (the same IDOR guard the sibling route makes) and
 * an unknown target — because those are missing resources rather than answers
 * about a switch.
 */
export async function checkSwitchClub({
  supabase,
  productId,
  participationId,
  targetProductId,
}: SwitchClubCheckInput): Promise<SwitchClubCheck> {
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
    .select(TARGET_PRODUCT_COLUMNS)
    // Embedded translations come back unordered, so the fallback chain's last
    // step ("first row present") would otherwise pick an arbitrary name — the
    // same ordering the checkout route states, for the same reason.
    .order("locale", { referencedTable: "product_translations" })
    .eq("id", targetProductId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) {
    throw new ApiError("Target product not found", 404);
  }

  const { data: subscriptionRow, error: subscriptionError } = await supabase
    .from("family_subscriptions")
    .select("stripe_subscription_id, currency")
    .eq("participation_id", participationId)
    // "Live" in exactly the sense the RPC means it, and the same predicate
    // admin_remove_participation refuses ON: anything but `cancelled`.
    .neq("status", "cancelled")
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;

  if (participation.status !== "active") {
    refusals.push("participation_not_active");
  }
  if (!subscriptionRow) refusals.push("no_live_subscription");
  if (targetProductId === participation.product_id) {
    refusals.push("same_product");
  }
  if (
    target.billing_mode !== "paid" ||
    !isSubscriptionShaped(target.product_type, target.billing_mode)
  ) {
    refusals.push("target_not_paid_subscription_club");
  }

  // The unique index over (product, participant) covers completed rows too, so
  // a child who once finished the target club collides on it. Excluding this
  // participation's own id matters only when the target IS the source, which
  // `same_product` has already refused — without it that case would report two
  // refusals for one fact.
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

  // With no subscription there is no currency to price the target in, so the
  // catalogue is read at the platform currency for DISPLAY only and the
  // currency refusal is withheld — `no_live_subscription` is the answer that
  // seat needs, and a refusal derived from a guessed currency would be noise.
  const currency = subscriptionRow?.currency ?? DEFAULT_CURRENCY;

  const { data: targetPrice, error: targetPriceError } = await supabase
    .from("product_prices")
    .select("price_cents")
    .eq("product_id", targetProductId)
    .eq("currency", currency)
    .maybeSingle();
  if (targetPriceError) throw targetPriceError;
  if (subscriptionRow && !targetPrice) {
    refusals.push("no_target_price_in_currency");
  }

  // ONE Stripe read, and only when there is something to read about. The check
  // mints nothing: browsing targets must not create Stripe objects.
  let currentAmountCents: number | null = null;
  let item: Stripe.SubscriptionItem | null = null;
  if (subscriptionRow) {
    const subscription = await stripe.subscriptions.retrieve(
      subscriptionRow.stripe_subscription_id,
      { expand: ["latest_invoice"] },
    );

    if (subscription.items.data.length === 1) {
      item = subscription.items.data[0];
      // The item's ACTUAL amount, not the source product's authored price: a
      // subscriber keeps their original amount when an admin later raises a
      // club's price. Null only for a price with no flat amount.
      currentAmountCents = item.price.unit_amount;
    } else {
      refusals.push("subscription_not_single_item");
    }

    // Classic billing mode credits unused time at the CURRENT price whether or
    // not it was ever paid, so a subscription whose latest invoice is open,
    // past due or zero would yield a proration credit for money we never took.
    // That is why this gate is hard rather than a picker warning.
    const invoice = subscription.latest_invoice;
    const invoicePaid =
      invoice !== null &&
      typeof invoice === "object" &&
      invoice.status === "paid" &&
      invoice.amount_paid > 0;
    if (!invoicePaid) refusals.push("latest_invoice_not_paid");
  }

  // `isSupportedCurrency` is the type-level guard the price cache needs, not a
  // second refusal: products are authored in EUR only, so a subscription in a
  // currency it cannot narrow has no authored target price either and
  // `no_target_price_in_currency` has already fired above.
  const commitFacts =
    refusals.length === 0 &&
    subscriptionRow !== null &&
    item !== null &&
    isSupportedCurrency(subscriptionRow.currency)
      ? {
          participantId: participation.participant_id,
          customerId: participation.customer_id,
          sourceProductId: participation.product_id,
          currency: subscriptionRow.currency,
          subscriptionId: subscriptionRow.stripe_subscription_id,
          subscriptionItemId: item.id,
          targetProduct: target,
        }
      : null;

  return {
    currency,
    currentAmountCents,
    targetAmountCents: targetPrice?.price_cents ?? null,
    refusals,
    commitFacts,
  };
}

export interface SwitchClubCommitInput {
  supabase: AppSupabaseClient;
  /** The service-role client, for the price cache alone. */
  admin: SupabaseClient<Database>;
  request: Request;
  participationId: string;
  targetProductId: string;
  /** Minted once per dialog open; derives the Stripe idempotency key. */
  requestId: string;
  facts: SwitchClubCommitFacts;
}

export type SwitchClubCommitOutcome =
  | {
      kind: "ok";
      result: z.infer<typeof adminMoveParticipationRpcResult>;
      stripePriceId: string;
    }
  | {
      /**
       * The one failure the plan names: Stripe is already on the new price and
       * the database step did not land. Nothing is compensated — re-running the
       * commit sets the item to the price it already holds, which prorates
       * nothing, and then re-runs the RPC.
       */
      kind: "db_failed";
      code: string | null;
      message: string;
      stripePriceId: string;
      stripeSubscriptionId: string;
    };

/**
 * Mint the target price, move the Stripe subscription onto it, then move the
 * row. In that order and never the reverse: a database row pointing at a club
 * the subscription does not bill for is the exact state this feature exists to
 * stop being created by hand.
 */
export async function commitSwitchClub({
  supabase,
  admin,
  request,
  participationId,
  targetProductId,
  requestId,
  facts,
}: SwitchClubCommitInput): Promise<SwitchClubCommitOutcome> {
  const priceRow = await getOrCreateSubscriptionPrice(
    admin,
    facts.targetProduct,
    facts.currency,
  );
  // The check has already refused a target with no authored price in this
  // currency, so a null here is the cache failing on a target the catalogue
  // says is for sale — a server fault, not an answer about the switch.
  if (!priceRow) {
    throw new ApiError(
      `Could not mint a ${facts.currency.toUpperCase()} subscription price for the target club`,
      500,
    );
  }

  await stripe.subscriptions.update(
    facts.subscriptionId,
    {
      items: [
        { id: facts.subscriptionItemId, price: priceRow.stripe_price_id },
      ],
      // Stripe credits unused time at the old price and debits the remainder at
      // the new one on the SAME next invoice, so a price difference is settled
      // by the mechanism built for it and no customer balance is created.
      proration_behavior: "create_prorations",
      metadata: rewrittenSubscriptionMetadata(request, facts),
      description: await rewrittenSubscriptionDescription(supabase, facts),
    },
    {
      // Deterministic in the three things that identify this commit, so every
      // press inside one dialog replays the first Stripe request rather than
      // prorating again. Stripe dedupes byte-identical requests for about a
      // day, which is why the no-op item update (same price, no proration) is
      // the second line of defence for a retry from a fresh dialog.
      idempotencyKey: switchClubIdempotencyKey({
        participationId,
        targetProductId,
        requestId,
      }),
    },
  );

  const { data, error } = await supabase.rpc("admin_move_participation", {
    p_participation_id: participationId,
    p_target_product_id: targetProductId,
    p_stripe_price_id: priceRow.stripe_price_id,
  });

  if (error) {
    return {
      kind: "db_failed",
      code: error.code,
      message: error.message,
      stripePriceId: priceRow.stripe_price_id,
      stripeSubscriptionId: facts.subscriptionId,
    };
  }

  const parsed = adminMoveParticipationRpcResult.safeParse(data);
  if (!parsed.success) {
    // Same posture as the failure above: Stripe has already moved, so the
    // caller is told the money is where it should be and the retry is the fix.
    return {
      kind: "db_failed",
      code: null,
      message: `admin_move_participation returned an unexpected shape: ${parsed.error.message}`,
      stripePriceId: priceRow.stripe_price_id,
      stripeSubscriptionId: facts.subscriptionId,
    };
  }

  return {
    kind: "ok",
    result: parsed.data,
    stripePriceId: priceRow.stripe_price_id,
  };
}

/** Stripe accepts 255 characters; three ids and a label fit inside it. */
export function switchClubIdempotencyKey({
  participationId,
  targetProductId,
  requestId,
}: {
  participationId: string;
  targetProductId: string;
  requestId: string;
}): string {
  return `club-switch:${participationId}:${targetProductId}:${requestId}`;
}

/**
 * Every subscription metadata key that NAMES a product, rewritten for the
 * target. The set is exactly what the checkout route writes onto
 * `subscription_data.metadata` (the session's camelCase keys plus the
 * snake_case finance snapshot); the keys naming the payer, the participant, the
 * purchase shape and the currency are untouched, because none of those moved.
 *
 * Stripe MERGES a metadata update into what is already there, so an absent
 * value has to be sent as `""` — its spelling for "remove this key" — or a
 * target with no delivery dates would silently inherit the source club's.
 */
function rewrittenSubscriptionMetadata(
  request: Request,
  facts: SwitchClubCommitFacts,
): Record<string, string> {
  const target = facts.targetProduct;
  // The staff links a Stripe Workflow drops into Slack. Off getOrigin(), never
  // the raw Host, for the reason the checkout route states: our own purchase
  // alert is the worst place for a spoofed origin.
  const origin = getOrigin(request);
  const defaultLocaleName =
    resolveTranslation(target.product_translations, DEFAULT_LOCALE)?.name ??
    FALLBACK_PRODUCT_NAME;

  return {
    productId: target.id,
    product_id: target.id,
    productName: defaultLocaleName,
    productType: target.product_type,
    adminProductUrl: `${origin}${ROUTES.admin.product(target.product_type, target.id)}`,
    shopProductUrl: `${origin}${ROUTES.shopProduct(target.id)}`,
    spoken_language_code: target.spoken_language_code,
    delivery_start: target.start_date ?? "",
    delivery_end: target.end_date ?? "",
  };
}

/**
 * The label the parent reads in the hosted billing portal, rebuilt for the
 * target: `{club} — {who holds the seat}`. Only the club half changes, but the
 * description is one string, so both halves are resolved the way checkout
 * resolved them — the club in the PAYER's locale, since the payer is who reads
 * it in the portal.
 */
async function rewrittenSubscriptionDescription(
  supabase: AppSupabaseClient,
  facts: SwitchClubCommitFacts,
): Promise<string> {
  const ids = Array.from(new Set([facts.participantId, facts.customerId]));
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, locale")
    .in("id", ids);
  if (error) throw error;

  const participant = data.find((row) => row.id === facts.participantId);
  const customer = data.find((row) => row.id === facts.customerId);
  const isSelfSeat = facts.participantId === facts.customerId;

  const name =
    resolveTranslation(
      facts.targetProduct.product_translations,
      resolveLocale(customer?.locale ?? null),
    )?.name ?? FALLBACK_PRODUCT_NAME;
  // The same audience-aware fallback checkout uses: a parent buying for a child
  // reads "your child", a parent holding the seat themselves reads "you".
  const who = participant?.first_name || (isSelfSeat ? "you" : "your child");

  return `${name} — ${who}`;
}
