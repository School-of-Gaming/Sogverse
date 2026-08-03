import { NextResponse } from "next/server";
import Stripe from "stripe";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupportedCurrency } from "@/lib/constants/currency";
import { resolveLocale, stripeLocaleOrAuto } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  createCheckoutBody,
  createParticipationResponse,
  createParticipationRpcResult,
} from "@/services/participations/participations.contracts";
import { ROUTES } from "@/lib/constants";
import {
  computeSinglePaymentAmount,
  getOrCreateSubscriptionPrice,
} from "@/lib/stripe/participation-prices";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { CHECKOUT_SESSION_LIFETIME_MINUTES } from "@/lib/constants/participations";
import { getOrigin } from "@/lib/url";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/checkout/products/create
 *
 * Discriminated success bodies; the client switches on `status`.
 *
 *   redirect           — paid signup (single-payment OR subscription). Always
 *                        send the parent to Stripe Checkout — even with a saved
 *                        card — for the trust/safety moment. Each subscription
 *                        is its own Stripe sub (one per gamer x club), so there
 *                        is no inline add.
 *   free_confirmed     — free event; no Stripe involvement.
 *   external_confirmed — municipality club; invoiced off-platform, no Stripe.
 *   full               — seat gone; UI flips to the waitlist CTA.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  forbiddenMessage: "Only customers can sign gamers up for products",
  // The body used to be read as a bag of optional strings and checked field by
  // field. The schema states the same rules once, and `purchaseShape` and
  // `currency` arrive as the supported enums rather than as strings the handler
  // has to re-test.
  body: createCheckoutBody,
  response: createParticipationResponse,

  // `no_data_found`: the RPC raises it for a product that does not exist, which
  // is the same call the waitlist route makes and gets the same answer — the
  // parent named a product from a page they were browsing, so the shop surface
  // treats it as bad input beside the signup button rather than sending them to
  // a not-found page. Every other code the RPC raises (its check violations,
  // the already-enrolled unique violation) already lands where this route put
  // it by hand.
  errorStatus: { P0002: 400 },

  // The RPC's refusals are written for the parent to read — "registration has
  // not yet opened", "product is not accepting signups" — and the shop renders
  // them verbatim beside the signup button.
  discloseErrorMessages:
    "create_participation's messages are the user-facing explanation of a refused signup, and the shop surface renders them as-is",

  handler: async ({ request, user, profile, body }) => {
    const { productId, gamerId, purchaseShape } = body;
    const currency: SupportedCurrency = body.currency;

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
    // the Checkout page: the single-payment line item (inline price_data) and
    // the subscription description both use this. The subscription line item
    // itself is the one name we can't localize here — it's the cached Stripe
    // Product's name, shared across all locales.
    const productName =
      resolveTranslation(
        product.product_translations,
        resolveLocale(profile.locale),
      )?.name ?? "School of Gaming product";

    // Shape x billing_mode must agree. Each billing mode has exactly one valid
    // shape family: free→'free', external_contract→'external', paid→
    // subscription/single_payment. Mismatches are rejected up front so the RPC
    // only ever sees a coherent (shape, product) pair. These stay in the route
    // rather than in the body schema because they need the product row.
    if (purchaseShape === "free" && product.billing_mode !== "free") {
      return NextResponse.json(
        { error: "Only free products accept the 'free' purchase shape" },
        { status: 400 },
      );
    }
    if (
      purchaseShape === "external" &&
      product.billing_mode !== "external_contract"
    ) {
      return NextResponse.json(
        {
          error:
            "Only externally-contracted products accept the 'external' purchase shape",
        },
        { status: 400 },
      );
    }
    if (
      purchaseShape !== "free" &&
      purchaseShape !== "external" &&
      product.billing_mode !== "paid"
    ) {
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

    // For a paid shape this call only *validates* — it runs every signup rule
    // (parent-of, lifecycle, registration window, currency, already-enrolled,
    // seat cap) under the product gate lock and writes nothing. The row is
    // created from the Stripe webhook once payment lands, so a parent who
    // abandons Checkout leaves nothing behind and there is no seat to release.
    // The no-charge shapes (free, external) still activate here and now.
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

    if (rpcErr) throw rpcErr;

    const rpcParsed = createParticipationRpcResult.safeParse(rpcResult);
    if (!rpcParsed.success) {
      console.error(
        "create_participation returned an unexpected shape:",
        rpcParsed.error.message,
      );
      throw new ApiError("Failed to start checkout", 500);
    }
    const rpcJson = rpcParsed.data;

    if (rpcJson.kind === "full") {
      return { status: "full" as const };
    }

    if (rpcJson.kind === "free_active" || rpcJson.kind === "external_active") {
      if (!rpcJson.participation_id) {
        throw new ApiError(
          `create_participation returned ${rpcJson.kind} with no participation id`,
          500,
        );
      }
      // Municipality clubs are invoiced off-platform, so like the free flow the
      // participation is already active and we never touch Stripe. Both land on
      // the same confirmation page.
      return rpcJson.kind === "free_active"
        ? {
            status: "free_confirmed" as const,
            participationId: rpcJson.participation_id,
          }
        : {
            status: "external_confirmed" as const,
            participationId: rpcJson.participation_id,
          };
    }

    // kind === 'validated' — the signup is acceptable and nothing was written.
    // Nothing below this line needs unwinding on failure: an escape from the
    // block leaves the database exactly as it was, so the try/catch exists only
    // to keep raw Stripe/PostgREST text away from a parent (this route
    // discloses its error messages) and to answer with a deliberate status.
    try {
      const stripeCustomerId = await getOrCreateStripeCustomer(admin, user.id);

      // Every paid signup — single-payment AND subscription — goes through Stripe
      // Checkout. Each consumer-club subscription is its own Stripe subscription
      // (one per gamer x club), created fresh below in `mode: "subscription"`.
      // There is no inline subscription update: a parent with a card on file
      // still sees Checkout (the trust moment), and one sub per club means each
      // is independently cancelable from the Stripe portal.

      const origin = getOrigin(request);
      // Success lands on the confirmation page keyed by the Checkout Session,
      // not by a participation — there is no participation yet, and the session
      // id is the only handle both ends share. `{CHECKOUT_SESSION_ID}` is
      // Stripe's literal placeholder, substituted at redirect time; it must
      // reach Stripe unencoded. The page resolves it back to the row the webhook
      // wrote (Stripe waits up to 10s on our endpoint before redirecting, so it
      // is almost always there) and shows a finalizing state if it is not.
      const successUrl = `${origin}${ROUTES.shopPaidConfirmation("{CHECKOUT_SESSION_ID}")}`;
      // Cancel bounces straight back to the product page so the parent can
      // retry. Nothing to undo — no row was written.
      const cancelUrl = `${origin}${ROUTES.shopProduct(productId)}`;

      // The metadata IS the link between this session and the participation the
      // webhook will create. Nothing else carries it, so every field here is
      // load-bearing rather than informational.
      const metadata = {
        customerId: user.id,
        gamerId,
        productId,
        purchaseShape,
        currency,
      };

      // This no longer pins a reservation lifetime — nothing is held, and the
      // expiry event isn't even handled. It bounds a *stale tab*: the Session
      // freezes the amount at creation, so leaving it payable for Stripe's
      // 24h default means a forgotten tab can pay yesterday's price and create
      // a participation long after the parent last looked at the product.
      const expiresAt =
        Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_LIFETIME_MINUTES * 60;

      // Adaptive Pricing presents each customer their local currency and lets
      // Stripe convert, while the Session/PaymentIntent still report our EUR
      // integration currency and settle us in EUR at the price we set.
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        customer: stripeCustomerId,
        adaptive_pricing: { enabled: true },
        // Render Stripe's own chrome ("Subscribe", "Pay", field labels) in the
        // parent's app locale. Falls back to 'auto' (browser Accept-Language) for
        // locales Stripe doesn't support — e.g. Klingon.
        locale: stripeLocaleOrAuto(profile.locale),
        // Show the "Add promotion code" field. Codes themselves are created and
        // managed in the Stripe dashboard (per mode — test and live separately);
        // nothing in our DB models them. With Adaptive Pricing, percent-off
        // coupons convert cleanly; amount_off coupons are currency-bound, so
        // prefer percent-off when creating codes.
        allow_promotion_codes: true,
        // Enable Stripe Tax so new signups get VAT itemized like the migrated
        // subs do. `customer_update: { address: "auto" }` is required by Stripe
        // whenever a `customer` is pre-set on the session with automatic_tax on;
        // it also makes Checkout collect the billing address and persist it back
        // onto the Customer, which Stripe Tax needs to locate the customer.
        automatic_tax: { enabled: true },
        customer_update: { address: "auto" },
        expires_at: expiresAt,
        metadata,
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: [],
      };

      if (isSinglePayment) {
        const amount = await computeSinglePaymentAmount(
          admin,
          productId,
          currency,
        );
        if (amount === null) {
          throw new ApiError(`Product is not sold in ${currency}`, 400);
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
          throw new ApiError(`Product is not sold in ${currency}`, 400);
        }
        sessionParams.mode = "subscription";
        sessionParams.line_items = [
          { quantity: 1, price: priceRow.stripe_price_id },
        ];
        // Describe the sub as "{Club} — {Child}". A family has one Stripe sub per
        // gamer x club, all listed together in the hosted portal; without a
        // per-sub description they'd be indistinguishable there (and two kids in
        // the same club would show as two identical rows). This is the label the
        // parent reads when deciding which one to cancel.
        sessionParams.subscription_data = {
          metadata,
          description: `${productName} — ${await pickGamerName(admin, gamerId)}`,
        };
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      if (!session.url) {
        throw new ApiError("Stripe did not return a Checkout URL", 502);
      }

      return { status: "redirect" as const, checkoutUrl: session.url };
    } catch (error) {
      // Deliberate status and message. This route discloses error text to the
      // parent, so a raw PostgREST or Stripe string must not reach them — and a
      // driver's error code would otherwise be mapped to a misleading status.
      if (error instanceof ApiError) throw error;
      console.error("[checkout/products] checkout failed:", error);
      throw new ApiError("Could not start checkout", 500);
    }
  },
});

// Resolve a short display name for the gamer, for the Stripe subscription
// description (what the parent sees in the billing portal). Falls back to a
// generic label so the description is never blank.
async function pickGamerName(
  admin: ReturnType<typeof createAdminClient>,
  gamerId: string,
): Promise<string> {
  const { data } = await admin
    .from("profiles")
    .select("first_name")
    .eq("id", gamerId)
    .maybeSingle();
  return data?.first_name || "your child";
}
