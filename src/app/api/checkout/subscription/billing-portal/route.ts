import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireRole } from "@/lib/auth";
import { ROUTES } from "@/lib/constants";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    const result = await requireRole("customer", {
      forbiddenMessage: "Only customers can access the billing portal",
    });
    if (result instanceof NextResponse) return result;
    const { user, supabase } = result;

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
