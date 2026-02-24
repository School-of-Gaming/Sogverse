import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireRole } from "@/lib/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  try {
    const result = await requireRole("customer", {
      forbiddenMessage: "Only customers can manage subscriptions",
    });
    if (result instanceof NextResponse) return result;
    const { user, supabase } = result;

    const { data: customerProfile } = await supabase
      .from("customer_profiles")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .single();

    const typedCustomerProfile = customerProfile as { stripe_subscription_id: string | null } | null;

    if (!typedCustomerProfile?.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 }
      );
    }

    await stripe.subscriptions.update(
      typedCustomerProfile.stripe_subscription_id,
      { cancel_at_period_end: false }
    );

    return NextResponse.json({ resumed: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
