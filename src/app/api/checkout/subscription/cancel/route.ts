import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
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
      .select("role, stripe_subscription_id")
      .eq("id", user.id)
      .single();

    const typedProfile = profile as { role: string; stripe_subscription_id: string | null } | null;

    if (typedProfile?.role !== "customer") {
      return NextResponse.json(
        { error: "Only customers can cancel subscriptions" },
        { status: 403 }
      );
    }

    if (!typedProfile.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 }
      );
    }

    const subscription = await stripe.subscriptions.update(
      typedProfile.stripe_subscription_id,
      { cancel_at_period_end: true }
    );

    return NextResponse.json({
      canceledAt: subscription.current_period_end,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
