import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isSupportedCurrency,
  type SupportedCurrency,
} from "@/lib/constants/currency";
import {
  isSupportedLocale,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { PurchaseShape } from "@/types";
import { ROUTES } from "@/lib/constants";
import {
  computeSinglePaymentAmount,
  getOrCreateSubscriptionPrice,
} from "@/lib/stripe/participation-prices";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { RESERVATION_LIFETIME_MINUTES } from "@/lib/constants/participations";
import { getOrigin } from "@/lib/url";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Discriminated success bodies. Client switches on `status`.
//
//   redirect       — paid signup (single-payment OR subscription). Always send
//                    the parent to Stripe Checkout — even with a saved card —
//                    for the trust/safety moment. Each subscription is its own
//                    Stripe sub (one per gamer×club), so there is no inline add.
//   free_confirmed — free event; no Stripe involvement.
//   full           — seat gone; UI flips to waitlist CTA.
type CreateResponseBody =
  | { status: "redirect"; checkoutUrl: string }
  | { status: "free_confirmed"; participationId: string }
  | { status: "full" };

const ALLOWED_SHAPES: ReadonlySet<PurchaseShape> = new Set<PurchaseShape>([
  "subscription_monthly",
  "single_payment",
  "free",
]);

export async function POST(request: Request) {
  const result = await requireRole("customer", {
    forbiddenMessage: "Only customers can sign gamers up for products",
  });
  if (result instanceof NextResponse) return result;
  const { user, profile } = result;

  let body: {
    productId?: string;
    gamerId?: string;
    purchaseShape?: PurchaseShape;
    currency?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { productId, gamerId, purchaseShape, currency: rawCurrency } = body;

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
  // Prefer the parent's locale for every customer-facing name we control on
  // the Checkout page: the single-payment line item (inline price_data) and the
  // subscription description both use this. `resolveLocale` coerces the nullable
  // profile locale to a SupportedLocale (→ 'en' when absent), and
  // `resolveTranslation` walks the shared fallback chain (locale → en → first).
  // The subscription line item itself is the one name we can't localize here —
  // it's the cached Stripe Product's name, shared across all locales (see
  // getOrCreateSubscriptionPrice).
  const productName =
    resolveTranslation(
      product.product_translations,
      resolveLocale(profile.locale),
    )?.name ?? "School of Gaming product";

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
  const isSubscription = purchaseShape.startsWith("subscription_");
  const isSinglePayment = purchaseShape === "single_payment";

  if (isSinglePayment && product.product_type === "consumer_club") {
    return NextResponse.json(
      { error: "Consumer clubs use subscriptions, not single-payment" },
      { status: 400 },
    );
  }
  if (isSubscription && product.product_type !== "consumer_club") {
    return NextResponse.json(
      { error: "Only consumer clubs accept subscriptions" },
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

  // Every paid signup — single-payment AND subscription — goes through Stripe
  // Checkout. Each consumer-club subscription is its own Stripe subscription
  // (one per gamer×club), created fresh below in `mode: "subscription"`. There
  // is no inline `subscriptions.update`: a parent with a card on file still
  // sees Checkout (the trust moment), and one sub per club means each is
  // independently cancelable from the Stripe portal. See
  // docs/products-architecture.md §4.5b / §4.5c.

  const origin = getOrigin(request);
  // Success lands on the dedicated purchase-confirmation page, keyed by this
  // reservation id. By the time Stripe redirects, the `checkout.session.completed`
  // webhook has already run `confirm_reservation` (Stripe waits up to 10s for
  // our endpoint to respond before redirecting), so the row is 'active' — but
  // every field the page shows lives on the row from creation, so the page
  // renders correctly even in the rare case the redirect beats the webhook. No
  // polling, no `?signup=` flag.
  const successUrl = `${origin}${ROUTES.shopConfirmation(reservationId)}`;
  // Cancel bounces straight back to the product page so the parent can retry.
  // We do NOT free the seat — the reserving row stays held until either Stripe
  // fires session.completed (→ confirm) or session.expired (→ expire). A parent
  // who clicks Sign Up again creates a fresh reservation (their old row stays
  // held until its session expires). On the rare last-seat case they'd see
  // "Fully booked" and can join the waitlist instead.
  const cancelUrl = `${origin}${ROUTES.shopProduct(productId)}`;

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

  // Adaptive Pricing presents each customer their local currency and lets
  // Stripe convert, while the Session/PaymentIntent still report our EUR
  // integration currency and settle us in EUR at the price we set. That's
  // how "buy in another currency" works without us modelling other
  // currencies internally. See src/lib/constants/currency.ts.
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: stripeCustomerId,
    adaptive_pricing: { enabled: true },
    // Render Stripe's own chrome ("Subscribe", "Pay", field labels) in the
    // parent's app locale. Falls back to 'auto' (browser Accept-Language) for
    // locales Stripe doesn't support — e.g. Klingon.
    locale: stripeCheckoutLocale(profile.locale),
    // Show the "Add promotion code" field. Codes themselves are created and
    // managed in the Stripe dashboard (per mode — test and live separately);
    // nothing in our DB models them. With Adaptive Pricing, percent-off
    // coupons convert cleanly; amount_off coupons are currency-bound, so
    // prefer percent-off when creating codes.
    allow_promotion_codes: true,
    expires_at: expiresAt,
    metadata,
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [],
  };

  if (isSinglePayment) {
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
    // Offer to save the card for future purchases. Checked = saved with
    // `allow_redisplay: always`, so it's offered/prefilled on the customer's
    // next Checkout and manageable from the billing portal. Subscriptions
    // (the other branch) already save the card by necessity.
    sessionParams.saved_payment_method_options = {
      payment_method_save: "enabled",
    };
  } else {
    const priceRow = await getOrCreateSubscriptionPrice(
      admin,
      productId,
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
    // Describe the sub as "{Club} — {Child}". A family has one Stripe sub per
    // gamer×club, all listed together in the hosted portal; without a per-sub
    // description they'd be indistinguishable there (and two kids in the same
    // club would show as two identical rows). This is the label the parent
    // reads when deciding which one to cancel.
    sessionParams.subscription_data = {
      metadata,
      description: `${productName} — ${await pickGamerName(admin, gamerId)}`,
    };
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

// Resolve a short display name for the gamer, for the Stripe subscription
// description (what the parent sees in the billing portal). Falls back through
// username to a generic label so the description is never blank.
async function pickGamerName(
  admin: ReturnType<typeof createAdminClient>,
  gamerId: string,
): Promise<string> {
  const { data } = await admin
    .from("profiles")
    .select("first_name, username")
    .eq("id", gamerId)
    .maybeSingle();
  return data?.first_name || data?.username || "your child";
}

// Stripe Checkout's `locale` is its own fixed enum, not our SUPPORTED_LOCALES.
// This map is `Record<SupportedLocale, …>`, so the compiler forces an entry for
// every app locale — add one to SUPPORTED_LOCALES and the build fails here until
// it's mapped (no silent fall-through to the wrong language). Use Stripe's
// matching locale where it has one; 'auto' (Stripe reads Accept-Language) for
// locales Stripe doesn't speak, like Klingon.
const APP_TO_STRIPE_LOCALE: Record<
  SupportedLocale,
  Stripe.Checkout.SessionCreateParams.Locale
> = {
  en: "en",
  fi: "fi",
  sv: "sv",
  tlh: "auto",
};

function stripeCheckoutLocale(
  appLocale: string | null,
): Stripe.Checkout.SessionCreateParams.Locale {
  return isSupportedLocale(appLocale) ? APP_TO_STRIPE_LOCALE[appLocale] : "auto";
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
