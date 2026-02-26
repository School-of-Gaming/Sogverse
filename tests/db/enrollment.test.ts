import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAuthenticatedClient,
  resetEnrollmentState,
} from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS, SEED } from "./constants";

describe("Enrollment (enroll_gamer_in_group RPC)", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  beforeEach(async () => {
    await resetEnrollmentState(admin);
  });

  it("enrolls a gamer and deducts tokens", async () => {
    const { data, error } = await admin.rpc("enroll_gamer_in_group", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_gamer_id: TEST_IDS.GAMER,
      p_group_id: TEST_IDS.GROUP,
      p_session_date: "2026-03-04",
    });

    expect(error).toBeNull();
    const rows = data as { enrollment_id: string; transaction_id: string; new_balance: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].new_balance).toBe(SEED.CUSTOMER_TOKEN_BALANCE - SEED.PRODUCT_TOKEN_COST);
    expect(rows[0].enrollment_id).toBeTruthy();
    expect(rows[0].transaction_id).toBeTruthy();

    // Verify enrollment row
    const { data: enrollment } = await admin
      .from("group_enrollments")
      .select("*")
      .eq("id", rows[0].enrollment_id)
      .single();

    expect(enrollment!.status).toBe("active");
    expect(enrollment!.enrolled_by).toBe(TEST_IDS.CUSTOMER);
    expect(enrollment!.gamer_id).toBe(TEST_IDS.GAMER);
    expect(enrollment!.group_id).toBe(TEST_IDS.GROUP);

    // Verify charge record
    const { data: charges } = await admin
      .from("enrollment_charges")
      .select("*")
      .eq("enrollment_id", rows[0].enrollment_id);

    expect(charges).toHaveLength(1);
    expect(charges![0].amount).toBe(SEED.PRODUCT_TOKEN_COST);
    expect(charges![0].session_date).toBe("2026-03-04");
    expect(charges![0].transaction_id).toBe(rows[0].transaction_id);
  });

  it("prevents enrollment with insufficient balance", async () => {
    // Set balance to 1 (less than token_cost of 2)
    await admin
      .from("customer_profiles")
      .update({ token_balance: 1 })
      .eq("user_id", TEST_IDS.CUSTOMER);

    const { error } = await admin.rpc("enroll_gamer_in_group", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_gamer_id: TEST_IDS.GAMER,
      p_group_id: TEST_IDS.GROUP,
      p_session_date: "2026-03-04",
    });

    expect(error).not.toBeNull();
    // CHECK constraint violation on customer_profiles.token_balance
    expect(error!.code).toBe("23514");
  });

  it("prevents duplicate active enrollment in same product", async () => {
    // First enrollment succeeds
    const { error: err1 } = await admin.rpc("enroll_gamer_in_group", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_gamer_id: TEST_IDS.GAMER,
      p_group_id: TEST_IDS.GROUP,
      p_session_date: "2026-03-04",
    });
    expect(err1).toBeNull();

    // Second enrollment in same product fails
    const { error: err2 } = await admin.rpc("enroll_gamer_in_group", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_gamer_id: TEST_IDS.GAMER,
      p_group_id: TEST_IDS.GROUP,
      p_session_date: "2026-03-04",
    });

    expect(err2).not.toBeNull();
    expect(err2!.code).toBe("23505"); // unique_violation
  });

  it("allows re-enrollment after unenroll (C4 fix)", async () => {
    // Enroll
    const { data: enrollData } = await admin.rpc("enroll_gamer_in_group", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_gamer_id: TEST_IDS.GAMER,
      p_group_id: TEST_IDS.GROUP,
      p_session_date: "2026-03-04",
    });
    const rows = enrollData as { enrollment_id: string }[];

    // Unenroll
    await admin.rpc("unenroll_gamer", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_enrollment_id: rows[0].enrollment_id,
      p_refund: false,
    });

    // Re-enroll should succeed — only active enrollments block duplicates
    const { data: reEnrollData, error } = await admin.rpc("enroll_gamer_in_group", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_gamer_id: TEST_IDS.GAMER,
      p_group_id: TEST_IDS.GROUP,
      p_session_date: "2026-03-11",
    });

    expect(error).toBeNull();
    const reRows = reEnrollData as { enrollment_id: string }[];
    expect(reRows[0].enrollment_id).toBeTruthy();
    expect(reRows[0].enrollment_id).not.toBe(rows[0].enrollment_id);
  });

  it("rejects enrollment if customer is not parent of gamer", async () => {
    const { error } = await admin.rpc("enroll_gamer_in_group", {
      p_customer_id: TEST_IDS.CUSTOMER_2, // not linked to gamer
      p_gamer_id: TEST_IDS.GAMER,
      p_group_id: TEST_IDS.GROUP,
      p_session_date: "2026-03-04",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("Not authorized");
  });

  it("rejects enrollment for non-existent group", async () => {
    const { error } = await admin.rpc("enroll_gamer_in_group", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_gamer_id: TEST_IDS.GAMER,
      p_group_id: "00000000-0000-0000-0000-999999999999",
      p_session_date: "2026-03-04",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("Group not found");
  });

  it("looks up token cost from product, not caller (C2 fix)", async () => {
    // enroll_gamer_in_group no longer accepts p_token_cost — it looks up the
    // price internally. Verify the deducted amount matches the product's cost.
    const { data } = await admin.rpc("enroll_gamer_in_group", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_gamer_id: TEST_IDS.GAMER,
      p_group_id: TEST_IDS.GROUP,
      p_session_date: "2026-03-04",
    });

    const rows = data as { enrollment_id: string; new_balance: number }[];
    expect(rows[0].new_balance).toBe(SEED.CUSTOMER_TOKEN_BALANCE - SEED.PRODUCT_TOKEN_COST);

    // Verify the charge record has the correct amount from the product
    const { data: charge } = await admin
      .from("enrollment_charges")
      .select("amount")
      .eq("enrollment_id", rows[0].enrollment_id)
      .single();

    expect(charge!.amount).toBe(SEED.PRODUCT_TOKEN_COST);
  });

  it("denies authenticated browser client from calling enroll RPC (C3 fix)", async () => {
    const customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password
    );

    const { error } = await customerClient.rpc("enroll_gamer_in_group", {
      p_customer_id: TEST_IDS.CUSTOMER,
      p_gamer_id: TEST_IDS.GAMER,
      p_group_id: TEST_IDS.GROUP,
      p_session_date: "2026-03-04",
    });

    expect(error).not.toBeNull();
  });

  describe("get_customer_enrollments", () => {
    it("returns enrollments for the authenticated customer", async () => {
      // Create enrollment via admin (service role)
      await admin.rpc("enroll_gamer_in_group", {
        p_customer_id: TEST_IDS.CUSTOMER,
        p_gamer_id: TEST_IDS.GAMER,
        p_group_id: TEST_IDS.GROUP,
        p_session_date: "2026-03-04",
      });

      const customerClient = await createAuthenticatedClient(
        TEST_CREDENTIALS.CUSTOMER.email,
        TEST_CREDENTIALS.CUSTOMER.password
      );

      const { data, error } = await customerClient.rpc(
        "get_customer_enrollments",
        { p_customer_id: TEST_IDS.CUSTOMER }
      );

      expect(error).toBeNull();
      const rows = data as { gamer_id: string; status: string; product_name: string }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].gamer_id).toBe(TEST_IDS.GAMER);
      expect(rows[0].status).toBe("active");
      expect(rows[0].product_name).toBe(SEED.PRODUCT_NAME);
    });

    it("blocks customer from reading another customer's enrollments (C1 fix)", async () => {
      // Create enrollment for customer 1
      await admin.rpc("enroll_gamer_in_group", {
        p_customer_id: TEST_IDS.CUSTOMER,
        p_gamer_id: TEST_IDS.GAMER,
        p_group_id: TEST_IDS.GROUP,
        p_session_date: "2026-03-04",
      });

      // Customer 2 tries to read customer 1's enrollments
      const customer2Client = await createAuthenticatedClient(
        TEST_CREDENTIALS.CUSTOMER_2.email,
        TEST_CREDENTIALS.CUSTOMER_2.password
      );

      const { error } = await customer2Client.rpc("get_customer_enrollments", {
        p_customer_id: TEST_IDS.CUSTOMER,
      });

      expect(error).not.toBeNull();
      expect(error!.code).toBe("42501"); // Forbidden
    });
  });
});
