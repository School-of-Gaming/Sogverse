import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireRole } from "@/lib/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET() {
  try {
    const result = await requireRole("customer", {
      forbiddenMessage: "Only customers can view subscriptions",
    });
    if (result instanceof NextResponse) return result;
    const { user, supabase } = result;

    const { data: customerProfile } = await supabase
      .from("customer_profiles")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .single();

    if (!customerProfile?.stripe_subscription_id) {
      return NextResponse.json({ subscription: null });
    }

    const subscription = await stripe.subscriptions.retrieve(
      customerProfile.stripe_subscription_id
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
