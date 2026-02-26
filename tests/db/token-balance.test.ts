import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, resetTokenState } from "./helpers";
import { TEST_IDS, SEED } from "./constants";

describe("Token Balance (adjust_token_balance RPC)", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  afterAll(async () => {
    await resetTokenState(admin);
  });

  it("credits tokens and creates a transaction record", async () => {
    const { data, error } = await admin.rpc("adjust_token_balance", {
      p_user_id: TEST_IDS.CUSTOMER,
      p_amount: 5,
      p_type: "purchase",
      p_description: "Test credit",
      p_stripe_session_id: "cs_test_credit_001",
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].new_balance).toBe(SEED.CUSTOMER_TOKEN_BALANCE + 5);
    expect(data![0].transaction_id).toBeTruthy();

    // Verify the transaction record exists
    const { data: tx } = await admin
      .from("token_transactions")
      .select("*")
      .eq("id", data![0].transaction_id)
      .single();

    expect(tx).not.toBeNull();
    expect(tx!.amount).toBe(5);
    expect(tx!.type).toBe("purchase");
    expect(tx!.balance_after).toBe(SEED.CUSTOMER_TOKEN_BALANCE + 5);
    expect(tx!.stripe_session_id).toBe("cs_test_credit_001");
  });

  it("debits tokens and decreases balance", async () => {
    // First, get current balance after the credit test
    const { data: before } = await admin
      .from("customer_profiles")
      .select("token_balance")
      .eq("user_id", TEST_IDS.CUSTOMER)
      .single();

    const currentBalance = before!.token_balance;

    const { data, error } = await admin.rpc("adjust_token_balance", {
      p_user_id: TEST_IDS.CUSTOMER,
      p_amount: -3,
      p_type: "admin_adjustment",
      p_description: "Test debit",
    });

    expect(error).toBeNull();
    expect(data![0].new_balance).toBe(currentBalance - 3);
  });

  it("prevents overdraft via CHECK constraint", async () => {
    // Reset to known state first
    await resetTokenState(admin);

    // Try to debit more than the balance (20 tokens)
    const { error } = await admin.rpc("adjust_token_balance", {
      p_user_id: TEST_IDS.CUSTOMER,
      p_amount: -(SEED.CUSTOMER_TOKEN_BALANCE + 1),
      p_type: "admin_adjustment",
      p_description: "Should fail — overdraft",
    });

    expect(error).not.toBeNull();
    // CHECK constraint violation
    expect(error!.code).toBe("23514");
  });

  it("enforces idempotency via stripe_session_id UNIQUE constraint", async () => {
    await resetTokenState(admin);

    const sessionId = "cs_test_idempotent_001";

    // First call succeeds
    const { error: err1 } = await admin.rpc("adjust_token_balance", {
      p_user_id: TEST_IDS.CUSTOMER,
      p_amount: 10,
      p_type: "purchase",
      p_stripe_session_id: sessionId,
    });
    expect(err1).toBeNull();

    // Second call with same session ID fails (UNIQUE violation)
    const { error: err2 } = await admin.rpc("adjust_token_balance", {
      p_user_id: TEST_IDS.CUSTOMER,
      p_amount: 10,
      p_type: "purchase",
      p_stripe_session_id: sessionId,
    });

    expect(err2).not.toBeNull();
    expect(err2!.code).toBe("23505");
  });

  it("raises error for non-existent user", async () => {
    const { error } = await admin.rpc("adjust_token_balance", {
      p_user_id: "00000000-0000-0000-0000-999999999999",
      p_amount: 5,
      p_type: "purchase",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("User not found");
  });
});
