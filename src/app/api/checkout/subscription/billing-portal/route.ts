import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/constants";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
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
        { error: "Only customers can access the billing portal" },
        { status: 403 }
      );
    }

    const { data: customerProfile } = await supabase
      .from("customer_profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    const typedCustomerProfile = customerProfile as { stripe_customer_id: string | null } | null;

    if (!typedCustomerProfile?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No billing account found" },
        { status: 400 }
      );
    }

    const origin =
      request.headers.get("origin") ||
      `https://${request.headers.get("host")}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: typedCustomerProfile.stripe_customer_id,
      return_url: `${origin}${ROUTES.customer.sorg}`,
    });

    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
