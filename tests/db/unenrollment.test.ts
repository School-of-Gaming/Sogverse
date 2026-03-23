import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAuthenticatedClient,
  resetEnrollmentState,
} from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS, SEED } from "./constants";

/** Enroll the test gamer and return the enrollment result. */
async function enrollTestGamer(admin: SupabaseClient<Database>) {
  const { data, error } = await admin.rpc("enroll_gamer_in_group", {
    p_customer_id: TEST_IDS.CUSTOMER,
    p_gamer_id: TEST_IDS.GAMER,
    p_group_id: TEST_IDS.GROUP,
    p_session_date: "2026-03-04",
  });

  if (error) throw new Error(`Enrollment setup failed: ${error.message}`);
  const rows = data as {
    enrollment_id: string;
    transaction_id: string;
    new_balance: number;
  }[];
  return rows[0];
}

describe("Unenrollment (unenroll_gamer RPC)", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  beforeEach(async () => {
    await resetEnrollmentState(admin);
  });

  it("unenrolls with refund — updates status, balance, and charge", async () => {
    const enrollment = await enrollTestGamer(admin);
    const balanceAfterEnroll = enrollment.new_balance; // 20 - 2 = 18

    const { data, error } = await admin.rpc("unenroll_gamer", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_enrollment_id: enrollment.enrollment_id,
      p_refund: true,
    });

    expect(error).toBeNull();
    const rows = data as { new_balance: number; refund_transaction_id: string }[];
    expect(rows[0].new_balance).toBe(balanceAfterEnroll + SEED.PRODUCT_TOKEN_COST);
    expect(rows[0].refund_transaction_id).toBeTruthy();

    // Verify enrollment status
    const { data: enrollRow } = await admin
      .from("group_enrollments")
      .select("status, unenrolled_at")
      .eq("id", enrollment.enrollment_id)
      .single();

    expect(enrollRow!.status).toBe("unenrolled");
    expect(enrollRow!.unenrolled_at).not.toBeNull();

    // Verify charge marked as refunded
    const { data: charge } = await admin
      .from("enrollment_charges")
      .select("refunded_at, refund_transaction_id")
      .eq("enrollment_id", enrollment.enrollment_id)
      .single();

    expect(charge!.refunded_at).not.toBeNull();
    expect(charge!.refund_transaction_id).toBe(rows[0].refund_transaction_id);
  });

  it("unenrolls without refund — status changes, balance unchanged", async () => {
    const enrollment = await enrollTestGamer(admin);
    const balanceAfterEnroll = enrollment.new_balance;

    const { data, error } = await admin.rpc("unenroll_gamer", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_enrollment_id: enrollment.enrollment_id,
      p_refund: false,
    });

    expect(error).toBeNull();
    const rows = data as { new_balance: number; refund_transaction_id: string | null }[];
    expect(rows[0].new_balance).toBe(balanceAfterEnroll);
    expect(rows[0].refund_transaction_id).toBeNull();
  });

  it("rejects unenrollment by wrong customer", async () => {
    const enrollment = await enrollTestGamer(admin);

    const { error } = await admin.rpc("unenroll_gamer", {
      p_customer_id: TEST_IDS.CUSTOMER_2,
      p_enrollment_id: enrollment.enrollment_id,
      p_refund: false,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("Not authorized");
  });

  it("rejects unenrollment of already-unenrolled enrollment", async () => {
    const enrollment = await enrollTestGamer(admin);

    // First unenroll succeeds
    await admin.rpc("unenroll_gamer", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_enrollment_id: enrollment.enrollment_id,
      p_refund: false,
    });

    // Second unenroll fails
    const { error } = await admin.rpc("unenroll_gamer", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_enrollment_id: enrollment.enrollment_id,
      p_refund: false,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("not active");
  });

  it("refund amount comes from products.token_cost, not historical charge", async () => {
    // Enroll at original cost (2 Sorgs)
    const enrollment = await enrollTestGamer(admin);

    // Admin changes product price to 5 after enrollment
    await admin
      .from("products")
      .update({ token_cost: 5 })
      .eq("id", TEST_IDS.PRODUCT);

    // Unenroll with refund — RPC should refund at NEW price (5), not charge amount (2)
    const { data, error } = await admin.rpc("unenroll_gamer", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_enrollment_id: enrollment.enrollment_id,
      p_refund: true,
    });

    expect(error).toBeNull();
    const rows = data as { new_balance: number; refund_transaction_id: string }[];
    // Balance: 20 - 2 (enroll) + 5 (refund at new price) = 23
    expect(rows[0].new_balance).toBe(
      SEED.CUSTOMER_TOKEN_BALANCE - SEED.PRODUCT_TOKEN_COST + 5
    );
    expect(rows[0].refund_transaction_id).toBeTruthy();

    // Verify the refund transaction has the correct amount (5, not 2)
    const { data: tx } = await admin
      .from("token_transactions")
      .select("amount")
      .eq("id", rows[0].refund_transaction_id)
      .single();

    expect(tx!.amount).toBe(5);
  });

  it("denies authenticated browser client from calling unenroll RPC (C3 fix)", async () => {
    const enrollment = await enrollTestGamer(admin);

    const customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password
    );

    const { error } = await customerClient.rpc("unenroll_gamer", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_enrollment_id: enrollment.enrollment_id,
      p_refund: false,
    });

    expect(error).not.toBeNull();
  });
});
