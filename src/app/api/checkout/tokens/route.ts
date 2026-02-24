import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { getTokenPackage, getPackagePrice } from "@/lib/constants/tokens";
import { isSupportedCurrency, DEFAULT_CURRENCY } from "@/lib/constants/currency";
import { ROUTES } from "@/lib/constants";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, email")
      .eq("id", user.id)
      .single();

    const typedProfile = profile as {
      role: string;
      email: string | null;
    } | null;

    if (typedProfile?.role !== "customer") {
      return NextResponse.json(
        { error: "Only customers can purchase tokens" },
        { status: 403 }
      );
    }

    const { data: customerProfile } = await supabase
      .from("customer_profiles")
      .select("stripe_customer_id, subscription_status")
      .eq("user_id", user.id)
      .single();

    const typedCustomerProfile = customerProfile as {
      stripe_customer_id: string | null;
      subscription_status: string | null;
    } | null;

    const { packageId, currency: rawCurrency, returnPath } = await request.json();

    const currency = isSupportedCurrency(rawCurrency) ? rawCurrency : DEFAULT_CURRENCY;

    // Only two known return destinations — allowlist instead of validating arbitrary paths
    const safePath =
      returnPath === ROUTES.customer.sorg ? ROUTES.customer.sorg : ROUTES.sorg;

    const tokenPackage = getTokenPackage(packageId);
    if (!tokenPackage) {
      return NextResponse.json(
        { error: "Invalid package ID" },
        { status: 400 }
      );
    }

    if (
      tokenPackage.type === "subscription" &&
      (typedCustomerProfile?.subscription_status === "active" ||
        typedCustomerProfile?.subscription_status === "past_due")
    ) {
      return NextResponse.json(
        { error: "You already have an active subscription" },
        { status: 409 }
      );
    }

    const origin =
      request.headers.get("origin") ||
      `https://${request.headers.get("host")}`;

    // Reuse existing Stripe customer to avoid creating duplicates
    const customerParams: Pick<
      Stripe.Checkout.SessionCreateParams,
      "customer" | "customer_email"
    > = typedCustomerProfile?.stripe_customer_id
      ? { customer: typedCustomerProfile.stripe_customer_id }
      : { customer_email: typedProfile?.email || undefined };

    const unitAmount = getPackagePrice(tokenPackage, currency);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: tokenPackage.type === "subscription" ? "subscription" : "payment",
      ...customerParams,
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: `${tokenPackage.name} — ${tokenPackage.tokens} Sorgs`,
              description: tokenPackage.description,
            },
            unit_amount: unitAmount,
            ...(tokenPackage.type === "subscription" && {
              recurring: { interval: "month" as const },
            }),
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: user.id,
        packageId: tokenPackage.id,
        tokenAmount: String(tokenPackage.tokens),
        packageType: tokenPackage.type,
        currency,
      },
      success_url: `${origin}${safePath}?success=true`,
      cancel_url: `${origin}${safePath}?canceled=true`,
    };

    if (tokenPackage.type === "subscription") {
      sessionParams.subscription_data = {
        metadata: {
          userId: user.id,
          packageId: tokenPackage.id,
          tokenAmount: String(tokenPackage.tokens),
          currency,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Checkout tokens error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
