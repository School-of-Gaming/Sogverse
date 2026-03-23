import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireRole } from "@/lib/auth";
import { getProductByPriceId, getStripeProducts } from "@/lib/stripe/products";
import { isSupportedCurrency } from "@/lib/constants/currency";
import type { SupportedCurrency } from "@/lib/constants/currency";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  try {
    const result = await requireRole("customer", {
      forbiddenMessage: "Only customers can switch subscriptions",
    });
    if (result instanceof NextResponse) return result;
    const { user, supabase } = result;

    const { priceId } = await request.json();

    if (!priceId || typeof priceId !== "string") {
      return NextResponse.json(
        { error: "priceId is required" },
        { status: 400 }
      );
    }

    // Validate priceId belongs to an active subscription product
    const productInfo = await getProductByPriceId(priceId);
    if (!productInfo || productInfo.type !== "subscription") {
      return NextResponse.json(
        { error: "Invalid subscription price" },
        { status: 400 }
      );
    }

    // Get current subscription
    const { data: customerProfile } = await supabase
      .from("customer_profiles")
      .select("stripe_subscription_id, subscription_tier")
      .eq("user_id", user.id)
      .single();

    if (!customerProfile?.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription to switch" },
        { status: 400 }
      );
    }

    // Prevent switching to the same tier
    if (customerProfile.subscription_tier === productInfo.stripeProductId) {
      return NextResponse.json(
        { error: "Already on this tier" },
        { status: 409 }
      );
    }

    // Retrieve the subscription to get the subscription item ID
    const subscription = await stripe.subscriptions.retrieve(
      customerProfile.stripe_subscription_id
    );

    const itemId = subscription.items.data[0]?.id;
    if (!itemId) {
      return NextResponse.json(
        { error: "Subscription has no items" },
        { status: 500 }
      );
    }

    // Stripe locks a subscription's currency at creation. The client sends a
    // priceId based on the user's display currency, which may differ from the
    // subscription's currency. Resolve the correct price for the target product
    // in the subscription's actual currency.
    const subCurrency = subscription.currency as SupportedCurrency;
    if (!isSupportedCurrency(subCurrency)) {
      return NextResponse.json(
        { error: "Subscription currency is not supported" },
        { status: 400 }
      );
    }

    const { subscriptionPackages } = await getStripeProducts();
    const targetPkg = subscriptionPackages.find(
      (p) => p.stripeProductId === productInfo.stripeProductId,
    );
    const resolvedPriceId = targetPkg?.prices[subCurrency].priceId;
    if (!resolvedPriceId) {
      return NextResponse.json(
        { error: "Price not available in subscription currency" },
        { status: 400 }
      );
    }

    // Switch tier — no proration, new tier starts on next billing cycle
    await stripe.subscriptions.update(customerProfile.stripe_subscription_id, {
      items: [{ id: itemId, price: resolvedPriceId }],
      proration_behavior: "none",
      metadata: {
        ...subscription.metadata,
        tokenAmount: String(productInfo.tokenAmount),
        stripeProductId: productInfo.stripeProductId,
      },
    });

    // DB update is handled by the customer.subscription.updated webhook,
    // consistent with cancel/resume routes. Client optimistically updates
    // the query cache for instant UI feedback.
    return NextResponse.json({ switched: true });
  } catch (err) {
    console.error("Subscription switch error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
