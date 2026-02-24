import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET() {
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
      .select("role")
      .eq("id", user.id)
      .single();

    const typedProfile = profile as { role: string } | null;

    if (typedProfile?.role !== "customer") {
      return NextResponse.json(
        { error: "Only customers can view subscriptions" },
        { status: 403 }
      );
    }

    const { data: customerProfile } = await supabase
      .from("customer_profiles")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .single();

    const typedCustomerProfile = customerProfile as { stripe_subscription_id: string | null } | null;

    if (!typedCustomerProfile?.stripe_subscription_id) {
      return NextResponse.json({ subscription: null });
    }

    const subscription = await stripe.subscriptions.retrieve(
      typedCustomerProfile.stripe_subscription_id
    );

    return NextResponse.json({
      subscription: {
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: subscription.current_period_end,
        amount: subscription.items.data[0]?.price.unit_amount ?? null,
        currency: subscription.items.data[0]?.price.currency ?? "usd",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
