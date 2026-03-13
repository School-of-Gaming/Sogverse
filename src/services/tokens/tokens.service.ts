import type { SupabaseClient } from "@supabase/supabase-js";
import type { TokenTransaction, Database } from "@/types";

export class TokensService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async getBalance(userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("customer_profiles")
      .select("token_balance")
      .eq("user_id", userId)
      .single();

    if (error) throw error;
    return data.token_balance;
  }

  async getTransactions(userId: string): Promise<TokenTransaction[]> {
    const { data, error } = await this.supabase
      .from("token_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  }

  async getSubscription(userId: string): Promise<{
    stripe_subscription_id: string | null;
    subscription_status: string | null;
  }> {
    const { data, error } = await this.supabase
      .from("customer_profiles")
      .select("stripe_subscription_id, subscription_status")
      .eq("user_id", userId)
      .single();

    if (error) throw error;
    return data;
  }

  async getSubscriptionDetails(): Promise<{
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: number;
    amount: number | null;
    currency: string;
  } | null> {
    const response = await fetch("/api/checkout/subscription");

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to fetch subscription details");
    }

    const { subscription } = await response.json();
    return subscription;
  }

  async adjustBalance(
    userId: string,
    amount: number,
    description: string
  ): Promise<{ newBalance: number; transactionId: string }> {
    const response = await fetch("/api/admin/adjust-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, amount, description }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to adjust token balance");
    }

    return response.json();
  }

  async cancelSubscription(): Promise<{ canceledAt: number }> {
    const response = await fetch("/api/checkout/subscription/cancel", {
      method: "POST",
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to cancel subscription");
    }

    return response.json();
  }

  async resumeSubscription(): Promise<{ resumed: boolean }> {
    const response = await fetch("/api/checkout/subscription/resume", {
      method: "POST",
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to resume subscription");
    }

    return response.json();
  }
}
