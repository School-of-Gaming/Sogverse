import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isSupportedCurrency,
  type SupportedCurrency,
} from "@/lib/constants/currency";
import type { PurchaseShape } from "@/types";
import {
  bundleSizeFromShape,
  computeBundleAmount,
  computeSinglePaymentAmount,
  frequencyFromShape,
  getOrCreateStripeCustomer,
  getOrCreateSubscriptionPrice,
} from "@/lib/stripe/participation-prices";
import { RESERVATION_LIFETIME_MINUTES } from "@/lib/constants/participations";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Discriminated success bodies. Client switches on `status`.
//
//   redirect       — bundle / single-payment / first-ever sub at this
//                    (frequency, currency). Send the parent to Stripe Checkout.
//   subscribed     — inline-add to an existing family sub. Already paid.
//   free_confirmed — free event; no Stripe involvement.
//   full           — seat gone; UI flips to waitlist CTA.
type CreateResponseBody =
  | { status: "redirect"; checkoutUrl: string }
  | { status: "subscribed"; participationId: string }
  | { status: "free_confirmed"; participationId: string }
  | { status: "full" };

const ALLOWED_SHAPES: ReadonlySet<PurchaseShape> = new Set<PurchaseShape>([
  "bundle_1",
  "bundle_4",
  "bundle_10",
  "subscription_monthly",
  "subscription_quarterly",
  "subscription_yearly",
  "single_payment",
  "free",
]);

export async function POST(request: Request) {
  const result = await requireRole("customer", {
    forbiddenMessage: "Only customers can sign gamers up for products",
  });
  if (result instanceof NextResponse) return result;
  const { user } = result;

  let body: {
    productId?: string;
    gamerId?: string;
    purchaseShape?: PurchaseShape;
    currency?: string;
    returnPath?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { productId, gamerId, purchaseShape, currency: rawCurrency, returnPath } = body;

  if (!productId || !gamerId || !purchaseShape) {
    return NextResponse.json(
      { error: "productId, gamerId and purchaseShape are required" },
      { status: 400 },
    );
  }

  if (!ALLOWED_SHAPES.has(purchaseShape)) {
    return NextResponse.json(
      { error: `Unsupported purchaseShape: ${purchaseShape}` },
      { status: 400 },
    );
  }

  if (!isSupportedCurrency(rawCurrency)) {
    return NextResponse.json(
      { error: "Unsupported currency" },
      { status: 400 },
    );
  }
  const currency: SupportedCurrency = rawCurrency;

  const admin = createAdminClient();

  const { data: product, error: productErr } = await admin
    .from("products_v2")
    .select(
      "id, product_type, billing_mode, seat_count, timezone, product_translations_v2(locale, name)",
    )
    .eq("id", productId)
    .single();
  if (productErr) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  const productName = pickProductName(product.product_translations_v2);

  if (purchaseShape === "free" && product.billing_mode !== "free") {
    return NextResponse.json(
      { error: "Only free products accept the 'free' purchase shape" },
      { status: 400 },
    );
  }
  if (purchaseShape !== "free" && product.billing_mode !== "paid") {
    return NextResponse.json(
      { error: "Paid purchase shapes only apply to paid products" },
      { status: 400 },
    );
  }
  const isBundle = purchaseShape.startsWith("bundle_");
  const isSubscription = purchaseShape.startsWith("subscription_");
  const isSinglePayment = purchaseShape === "single_payment";

  if (isSinglePayment && product.product_type === "consumer_club") {
    return NextResponse.json(
      { error: "Consumer clubs use bundles or subscriptions, not single-payment" },
      { status: 400 },
    );
  }
  if ((isBundle || isSubscription) && product.product_type !== "consumer_club") {
    return NextResponse.json(
      { error: "Only consumer clubs accept bundles or subscriptions" },
      { status: 400 },
    );
  }

  // RPC takes the gate lock, validates parent-gamer link / effective status /
  // seat count, and either inserts a reserving row, returns full, or (free)
  // inserts active. SECURITY DEFINER bypasses RLS for the read.
  const { data: rpcResult, error: rpcErr } = await admin.rpc(
    "create_participation_v2",
    {
      p_product_id: productId,
      p_gamer_id: gamerId,
      p_customer_id: user.id,
      p_purchase_shape: purchaseShape,
      p_currency: currency,
    },
  );

  if (rpcErr) {
    return NextResponse.json(
      { error: rpcErr.message },
      { status: rpcErr.code === "23505" ? 409 : 400 },
    );
  }

  const rpcJson = rpcResult as {
    kind: "free_active" | "reserving" | "full";
    participation_id?: string;
    reserved_until?: string;
  };

  if (rpcJson.kind === "full") {
    const respBody: CreateResponseBody = { status: "full" };
    return NextResponse.json(respBody);
  }

  if (rpcJson.kind === "free_active") {
    if (!rpcJson.participation_id) {
      return NextResponse.json(
        { error: "RPC returned no participation id" },
        { status: 500 },
      );
    }
    const respBody: CreateResponseBody = {
      status: "free_confirmed",
      participationId: rpcJson.participation_id,
    };
    return NextResponse.json(respBody);
  }

  // kind === 'reserving'
  if (!rpcJson.participation_id) {
    return NextResponse.json(
      { error: "RPC returned no reservation id" },
      { status: 500 },
    );
  }
  const reservationId = rpcJson.participation_id;

  const stripeCustomerId = await getOrCreateStripeCustomer(admin, user.id);

  // Subscription branch: find-or-create the family Stripe sub.
  // Per docs/products-redesign.md §4.5b — one sub per (customer, frequency,
  // currency); items per (gamer, club). If a sub already exists at this
  // (frequency, currency), add an item to it inline. No Stripe Checkout.
  if (isSubscription) {
    const frequency = frequencyFromShape(purchaseShape);
    const priceRow = await getOrCreateSubscriptionPrice(
      admin,
      productId,
      frequency,
      currency,
    );
    if (!priceRow) {
      await rollbackReservation(admin, reservationId);
      return NextResponse.json(
        { error: `Product is not sold in ${currency}` },
        { status: 400 },
      );
    }

    const { data: existingFamSub } = await admin
      .from("family_subscriptions_v2")
      .select("id, stripe_subscription_id, status")
      .eq("customer_id", user.id)
      .eq("frequency", frequency)
      .eq("currency", currency)
      .maybeSingle();

    // Treat anything other than active / canceling / past_due as "no live
    // sub" — a cancelled row from a prior life shouldn't block a new sub.
    const hasLiveSub = existingFamSub !== null
      && ["active", "canceling", "past_due"].includes(existingFamSub.status);

    if (hasLiveSub) {
      // Inline add: subscriptions.update with always_invoice +
      // error_if_incomplete so this call FAILS if the card declines.
      // No Stripe Checkout, no redirect.
      try {
        const updated = await stripe.subscriptions.update(
          existingFamSub.stripe_subscription_id,
          {
            items: [{ price: priceRow.stripe_price_id }],
            proration_behavior: "always_invoice",
            payment_behavior: "error_if_incomplete",
            metadata: {
              customerId: user.id,
              gamerId,
              productId,
              purchaseShape,
              currency,
              reservationId,
            },
          },
        );

        // Find the newly-added item (the one matching our Stripe Price).
        const newItem = updated.items.data.find(
          (it) => it.price.id === priceRow.stripe_price_id,
        );
        if (!newItem) {
          throw new Error("Stripe sub update did not include the new item");
        }

        // Confirm reservation synchronously — flips reserving → active.
        const { data: confirmResult, error: confirmErr } = await admin.rpc(
          "confirm_reservation_v2",
          { p_reservation_id: reservationId, p_credits_to_grant: 0 },
        );
        if (confirmErr) {
          throw new Error(`confirm_reservation_v2 failed: ${confirmErr.message}`);
        }
        const confirmJson = confirmResult as { kind: "confirmed" | "lost_seat" };
        if (confirmJson.kind === "lost_seat") {
          // Rare race: the seat went between RPC reserve and Stripe call.
          // Roll back the Stripe item and refund the prorated charge.
          try {
            await stripe.subscriptionItems.del(newItem.id, {
              proration_behavior: "always_invoice",
            });
          } catch (rollbackErr) {
            console.error(
              "[checkout/products] could not roll back inline sub item:",
              rollbackErr,
            );
          }
          return NextResponse.json({ status: "full" } satisfies CreateResponseBody);
        }

        // Link the participation to the family sub.
        await admin.from("family_subscription_items_v2").insert({
          family_subscription_id: existingFamSub.id,
          participation_id: reservationId,
          stripe_subscription_item_id: newItem.id,
          stripe_price_id: priceRow.stripe_price_id,
        });

        // The webhook will record the proration invoice as a payments_v2 row
        // when invoice.paid fires; we don't insert one here to avoid
        // duplicate-event-id collisions.

        return NextResponse.json({
          status: "subscribed",
          participationId: reservationId,
        } satisfies CreateResponseBody);
      } catch (err) {
        await rollbackReservation(admin, reservationId);
        const message =
          err instanceof Stripe.errors.StripeCardError
            ? err.message
            : "Could not add to your subscription. Please try again.";
        return NextResponse.json(
          { error: message },
          { status: err instanceof Stripe.errors.StripeCardError ? 402 : 502 },
        );
      }
    }
    // No live sub at this (frequency, currency) — fall through to the
    // Stripe Checkout flow below.
  }

  const origin =
    request.headers.get("origin") ||
    `https://${request.headers.get("host")}`;
  const safeReturnPath =
    typeof returnPath === "string" && returnPath.startsWith("/")
      ? returnPath
      : `/clubs/${productId}`;
  const successUrl = `${origin}${safeReturnPath}?signup=success&pid=${reservationId}`;
  const cancelUrl = `${origin}${safeReturnPath}?signup=canceled`;

  const metadata = {
    reservationId,
    customerId: user.id,
    gamerId,
    productId,
    purchaseShape,
    currency,
  };

  // Stripe Checkout sessions expire matched to the reservation — guarantees
  // we never land in "completed-but-expired" because Stripe accepted payment
  // after our reservation lapsed.
  const expiresAt = Math.floor(Date.now() / 1000) + RESERVATION_LIFETIME_MINUTES * 60;

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: stripeCustomerId,
    adaptive_pricing: { enabled: false },
    expires_at: expiresAt,
    metadata,
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [],
  };

  if (isBundle) {
    const bundleSize = bundleSizeFromShape(purchaseShape);
    const amount = await computeBundleAmount(admin, productId, bundleSize, currency);
    if (amount === null) {
      await rollbackReservation(admin, reservationId);
      return NextResponse.json(
        { error: `Product is not sold in ${currency}` },
        { status: 400 },
      );
    }
    sessionParams.mode = "payment";
    sessionParams.line_items = [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amount,
          product_data: {
            name: `${productName} — ${bundleSize}-session bundle`,
          },
        },
      },
    ];
  } else if (isSinglePayment) {
    const amount = await computeSinglePaymentAmount(admin, productId, currency);
    if (amount === null) {
      await rollbackReservation(admin, reservationId);
      return NextResponse.json(
        { error: `Product is not sold in ${currency}` },
        { status: 400 },
      );
    }
    sessionParams.mode = "payment";
    sessionParams.line_items = [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amount,
          product_data: { name: productName },
        },
      },
    ];
  } else {
    // First-time subscription — went through the inline-add branch's
    // `getOrCreateSubscriptionPrice` failure check already.
    const frequency = frequencyFromShape(purchaseShape);
    const priceRow = await getOrCreateSubscriptionPrice(
      admin,
      productId,
      frequency,
      currency,
    );
    if (!priceRow) {
      await rollbackReservation(admin, reservationId);
      return NextResponse.json(
        { error: `Product is not sold in ${currency}` },
        { status: 400 },
      );
    }
    sessionParams.mode = "subscription";
    sessionParams.line_items = [{ quantity: 1, price: priceRow.stripe_price_id }];
    sessionParams.subscription_data = { metadata };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  if (!session.url) {
    await rollbackReservation(admin, reservationId);
    return NextResponse.json(
      { error: "Stripe did not return a Checkout URL" },
      { status: 502 },
    );
  }

  const respBody: CreateResponseBody = { status: "redirect", checkoutUrl: session.url };
  return NextResponse.json(respBody);
}

function pickProductName(
  translations: { locale: string; name: string }[],
): string {
  const en = translations.find((t) => t.locale === "en");
  if (en) return en.name;
  const fi = translations.find((t) => t.locale === "fi");
  if (fi) return fi.name;
  if (translations.length > 0) return translations[0].name;
  return "School of Gaming product";
}

async function rollbackReservation(
  admin: ReturnType<typeof createAdminClient>,
  reservationId: string,
): Promise<void> {
  const { error } = await admin.rpc("expire_reservation_v2", {
    p_reservation_id: reservationId,
  });
  if (error) {
    console.error(
      "[checkout/products] failed to roll back reservation:",
      reservationId,
      error,
    );
  }
}
