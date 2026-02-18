import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { getTokenPackage } from "@/lib/constants/tokens";
import { isSafeRedirectPath } from "@/lib/utils";

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
      .select("role, email, subscription_status")
      .eq("id", user.id)
      .single();

    const typedProfile = profile as {
      role: string;
      email: string | null;
      subscription_status: string | null;
    } | null;

    if (typedProfile?.role !== "customer") {
      return NextResponse.json(
        { error: "Only customers can purchase tokens" },
        { status: 403 }
      );
    }

    const { packageId, returnPath } = await request.json();

    const safePath =
      typeof returnPath === "string" && isSafeRedirectPath(returnPath)
        ? returnPath
        : "/sorg";

    const tokenPackage = getTokenPackage(packageId);
    if (!tokenPackage) {
      return NextResponse.json(
        { error: "Invalid package ID" },
        { status: 400 }
      );
    }

    if (
      tokenPackage.type === "subscription" &&
      (typedProfile.subscription_status === "active" ||
        typedProfile.subscription_status === "past_due")
    ) {
      return NextResponse.json(
        { error: "You already have an active subscription" },
        { status: 409 }
      );
    }

    const origin = request.headers.get("origin") || "";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: tokenPackage.type === "subscription" ? "subscription" : "payment",
      customer_email: typedProfile?.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${tokenPackage.name} — ${tokenPackage.tokens} Sorgs`,
              description: tokenPackage.description,
            },
            unit_amount: tokenPackage.priceCents,
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
