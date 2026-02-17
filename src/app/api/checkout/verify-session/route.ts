import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  try {
    // Authenticate the request
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await request.json();
    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session ID" },
        { status: 400 }
      );
    }

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify this session belongs to the authenticated user
    if (session.metadata?.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Payment not completed" },
        { status: 400 }
      );
    }

    const tokenAmount = Number(session.metadata?.tokenAmount);
    const packageType = session.metadata?.packageType;

    if (!tokenAmount) {
      return NextResponse.json(
        { error: "Invalid session metadata" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Idempotency: check if this session was already processed
    const { data: existing } = await admin
      .from("token_transactions")
      .select("id")
      .eq("stripe_session_id", session.id)
      .limit(1);

    if (existing && existing.length > 0) {
      // Already processed — return success without double-crediting
      return NextResponse.json({ status: "already_processed" });
    }

    // Credit tokens
    const txType = packageType === "subscription" ? "subscription" : "purchase";
    await admin.rpc("adjust_token_balance", {
      p_user_id: user.id,
      p_amount: tokenAmount,
      p_type: txType,
      p_description: `Purchased ${tokenAmount} Sorgs`,
      p_stripe_session_id: session.id,
      p_stripe_subscription_id:
        (session.subscription as string) || undefined,
    });

    // Store Stripe customer ID on profile
    if (session.customer) {
      await admin
        .from("profiles")
        .update({ stripe_customer_id: session.customer as string })
        .eq("id", user.id);
    }

    // For subscriptions, store subscription ID
    if (packageType === "subscription" && session.subscription) {
      await admin
        .from("profiles")
        .update({
          stripe_subscription_id: session.subscription as string,
          subscription_status: "active",
        })
        .eq("id", user.id);
    }

    return NextResponse.json({ status: "fulfilled" });
  } catch (err) {
    console.error("Verify session error:", err);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
