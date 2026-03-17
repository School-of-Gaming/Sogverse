import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid") break;

        const userId = session.metadata?.userId;
        const tokenAmount = Number(session.metadata?.tokenAmount);
        const packageType = session.metadata?.packageType;

        if (!userId || !tokenAmount) break;

        // Idempotency: check if this session was already processed
        const { data: existing } = await admin
          .from("token_transactions")
          .select("id")
          .eq("stripe_session_id", session.id)
          .limit(1);

        if (existing && existing.length > 0) break;

        // Credit tokens
        const txType = packageType === "subscription" ? "subscription" : "purchase";
        const sessionCurrency = session.metadata?.currency || undefined;
        const { error: rpcError } = await admin.rpc("adjust_token_balance", {
          p_user_id: userId,
          p_amount: tokenAmount,
          p_type: txType as "purchase" | "subscription",
          p_description: `Purchased ${tokenAmount} Sorgs`,
          p_stripe_session_id: session.id,
          p_stripe_subscription_id:
            (session.subscription as string) || undefined,
          p_currency: sessionCurrency,
        });

        if (rpcError) {
          // UNIQUE constraint on stripe_session_id — concurrent request already
          // credited tokens for this session. Safe to ignore.
          if (rpcError.code === "23505") break;
          console.error("Token credit failed:", rpcError);
          return NextResponse.json(
            { error: "Failed to credit tokens" },
            { status: 500 }
          );
        }

        // Store Stripe customer ID on customer profile
        if (session.customer) {
          await admin
            .from("customer_profiles")
            .update({ stripe_customer_id: session.customer as string })
            .eq("user_id", userId);
        }

        // For subscriptions, store subscription ID and tier
        if (packageType === "subscription" && session.subscription) {
          const stripeProductId = session.metadata?.stripeProductId || null;
          await admin
            .from("customer_profiles")
            .update({
              stripe_subscription_id: session.subscription as string,
              subscription_status: "active",
              subscription_tier: stripeProductId,
            })
            .eq("user_id", userId);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        // Only process subscription renewal invoices (not the first one — that's handled by checkout.session.completed)
        if (!invoice.subscription || invoice.billing_reason === "subscription_create") break;

        const subscription = await stripe.subscriptions.retrieve(
          invoice.subscription as string
        );
        const userId = subscription.metadata.userId;
        const tokenAmount = Number(subscription.metadata.tokenAmount);

        if (!userId || !tokenAmount) break;

        // Idempotency: check if this invoice was already processed
        const { data: existing } = await admin
          .from("token_transactions")
          .select("id")
          .eq("stripe_session_id", invoice.id)
          .limit(1);

        if (existing && existing.length > 0) break;

        const invoiceCurrency = (invoice.currency as string) || undefined;
        const { error: rpcError } = await admin.rpc("adjust_token_balance", {
          p_user_id: userId,
          p_amount: tokenAmount,
          p_type: "subscription" as const,
          p_description: `Monthly subscription — ${tokenAmount} Sorgs`,
          p_stripe_session_id: invoice.id,
          p_stripe_subscription_id: invoice.subscription as string,
          p_currency: invoiceCurrency,
        });

        if (rpcError) {
          // UNIQUE constraint on stripe_session_id — concurrent request already
          // credited tokens for this invoice. Safe to ignore.
          if (rpcError.code === "23505") break;
          console.error("Token credit failed:", rpcError);
          return NextResponse.json(
            { error: "Failed to credit tokens" },
            { status: 500 }
          );
        }

        // Ensure subscription_status is "active" after a successful renewal.
        // If the subscription was past_due and customer.subscription.updated
        // is delayed or lost, this keeps the customer profile consistent.
        await admin
          .from("customer_profiles")
          .update({ subscription_status: "active" })
          .eq("user_id", userId);

        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata.userId;
        if (!userId) break;

        // Stripe keeps status "active" when cancel_at_period_end is true.
        // Store "canceling" so the DB alone reflects the full lifecycle.
        const status =
          subscription.status === "active" && subscription.cancel_at_period_end
            ? "canceling"
            : subscription.status;

        // Update tier from subscription metadata (set by tier switch or initial checkout)
        const stripeProductId = subscription.metadata.stripeProductId || null;

        await admin
          .from("customer_profiles")
          .update({
            subscription_status: status,
            subscription_tier: stripeProductId,
          })
          .eq("user_id", userId);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata.userId;
        if (!userId) break;

        await admin
          .from("customer_profiles")
          .update({
            stripe_subscription_id: null,
            subscription_status: null,
            subscription_tier: null,
          })
          .eq("user_id", userId);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
