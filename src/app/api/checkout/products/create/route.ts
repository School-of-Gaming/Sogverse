import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isSupportedCurrency,
  type SupportedCurrency,
} from "@/lib/constants/currency";
import type { ProductType, PurchaseShape } from "@/types";
import {
  bundleSizeFromShape,
  computeBundleAmount,
  computeSinglePaymentAmount,
  frequencyFromShape,
  getOrCreateStripeCustomer,
  getOrCreateSubscriptionPrice,
} from "@/lib/stripe/participation-prices";
import { RESERVATION_LIFETIME_MINUTES } from "@/lib/constants/participations";
import { getOrigin } from "@/lib/url";
import { resolveInternalPath } from "@/lib/navigation/internal-path";

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
    .from("products")
    .select(
      "id, product_type, billing_mode, seat_count, timezone, product_translations(locale, name)",
    )
    .eq("id", productId)
    .single();
  if (productErr) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  const productName = pickProductName(product.product_translations);

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

  // Each click is an independent reservation. If the parent abandoned a
  // previous Stripe session, that row stays in the seat-count until Stripe
  // fires `checkout.session.expired` (~30 min) and the webhook deletes it.
  // The schema's unique index on (product_id, gamer_id) excludes 'reserving',
  // so multiple held rows for the same parent/gamer coexist fine. Pay-twice
  // is bounded by the unique index firing on the second confirm — see the
  // webhook for the 23505 catch.
  const { data: rpcResult, error: rpcErr } = await admin.rpc(
    "create_participation",
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
  // Per docs/products-architecture.md §4.5b — one sub per (customer, frequency,
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
      .from("family_subscriptions")
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
        // The simplified RPC can no longer return a race-loss kind: status
        // alone holds the seat, and the reservation we created two RPCs ago
        // is still 'reserving' until we flip it here.
        const { error: confirmErr } = await admin.rpc(
          "confirm_reservation",
          { p_reservation_id: reservationId, p_credits_to_grant: 0 },
        );
        if (confirmErr) {
          throw new Error(`confirm_reservation failed: ${confirmErr.message}`);
        }

        // Link the participation to the family sub.
        await admin.from("family_subscription_items").insert({
          family_subscription_id: existingFamSub.id,
          participation_id: reservationId,
          stripe_subscription_item_id: newItem.id,
          stripe_price_id: priceRow.stripe_price_id,
        });

        // The webhook will record the proration invoice as a payments row
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

  const origin = getOrigin(request);
  // Resolve the caller-supplied return path to a safe same-origin path —
  // `resolveInternalPath` rejects every open-redirect variant (protocol-relative
  // `//evil.com`, backslash `/\evil.com`, absolute URLs, whitespace smuggling),
  // which a naïve `startsWith("/")` check would let through.
  //
  // The fallback is the homepage — never the product detail page. The
  // fallback only fires when something abnormal happened (broken frontend,
  // attacker forging the request body), so we don't try to deduce where
  // the user "should" have gone; we send them somewhere safe and familiar.
  // The success path is independently type-aware (see successPath below),
  // so happy-path users still land on the correct product page.
  const safeReturnPath = resolveInternalPath(returnPath, "/");
  // Success lands on the product detail page, which now branches to the
  // purchased-detail view (placeholder for now) once the webhook
  // flips the reservation to active. There's a 1–3s race window between
  // Stripe's redirect and the webhook landing — during that window the
  // detail page renders the signup panel briefly, then snaps to the
  // purchased view as soon as the participation queries refetch. The
  // `?signup=success` flag triggers the explicit invalidation in
  // ProductDetailPage's useEffect (and the realtime channel on
  // product_seat_counts covers the late-webhook case).
  const successPath = detailPathForType(product.product_type, productId);
  const successUrl = `${origin}${successPath}?signup=success`;
  // Cancel bounces back to the product page. We do NOT free the seat — the
  // reserving row stays held until either Stripe fires session.completed
  // (→ confirm) or session.expired (→ expire). A parent who clicks Sign Up
  // again creates a fresh reservation (their old row stays held until its
  // session expires). On the rare last-seat case they'd see "Fully booked"
  // and can join the waitlist instead.
  const cancelUrl = `${origin}${safeReturnPath}?signup=canceled`;

  const metadata = {
    reservationId,
    customerId: user.id,
    gamerId,
    productId,
    purchaseShape,
    currency,
  };

  // Stripe Checkout's session expiry IS our reservation lifetime: Stripe
  // refuses payment past `expires_at` and fires checkout.session.expired,
  // which our webhook turns into expire_reservation.
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

function detailPathForType(
  productType: ProductType,
  productId: string,
): string {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return `/clubs/${productId}`;
    case "camp":
      return `/camps/${productId}`;
    case "event":
      return `/events/${productId}`;
  }
}

async function rollbackReservation(
  admin: ReturnType<typeof createAdminClient>,
  reservationId: string,
): Promise<void> {
  const { error } = await admin.rpc("expire_reservation", {
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
