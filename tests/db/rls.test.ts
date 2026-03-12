import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAuthenticatedClient,
  resetTokenState,
  resetEnrollmentState,
  seedEnrollment,
} from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

describe("Row Level Security", () => {
  // Service-role client — bypasses RLS. Use only for setup/teardown.
  let admin: SupabaseClient<Database>;
  // Authenticated clients — respect RLS policies.
  let adminClient: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;
  let customer2Client: SupabaseClient<Database>;
  let gamerClient: SupabaseClient<Database>;
  let geduClient: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password
    );
    customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password
    );
    customer2Client = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password
    );
    gamerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password
    );
    geduClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password
    );
  });

  afterAll(async () => {
    await resetTokenState(admin);
  });

  // =========================================================================
  // Profiles
  // =========================================================================

  describe("profiles", () => {
    it("customer can read own profile", async () => {
      const { data, error } = await customerClient
        .from("profiles")
        .select("id, role, display_name")
        .eq("id", TEST_IDS.CUSTOMER)
        .single();

      expect(error).toBeNull();
      expect(data!.role).toBe("customer");
      expect(data!.display_name).toBe("Test Customer");
    });

    it("customer cannot read another customer's profile", async () => {
      const { data } = await customerClient
        .from("profiles")
        .select("id")
        .eq("id", TEST_IDS.CUSTOMER_2);

      // RLS filters it out — returns empty array, not an error
      expect(data).toEqual([]);
    });

    it("customer can read linked gamer's profile", async () => {
      const { data, error } = await customerClient
        .from("profiles")
        .select("id, role")
        .eq("id", TEST_IDS.GAMER)
        .single();

      expect(error).toBeNull();
      expect(data!.role).toBe("gamer");
    });

    it("customer cannot read unlinked gamer or gedu profiles", async () => {
      // Customer 2 has no linked gamers
      const { data: gamerData } = await customer2Client
        .from("profiles")
        .select("id")
        .eq("id", TEST_IDS.GAMER);

      expect(gamerData).toEqual([]);

      const { data: geduData } = await customerClient
        .from("profiles")
        .select("id")
        .eq("id", TEST_IDS.GEDU);

      expect(geduData).toEqual([]);
    });

    it("admin can read all profiles", async () => {
      const { data, error } = await adminClient
        .from("profiles")
        .select("id")
        .in("id", [
          TEST_IDS.ADMIN,
          TEST_IDS.CUSTOMER,
          TEST_IDS.CUSTOMER_2,
          TEST_IDS.GEDU,
          TEST_IDS.GAMER,
        ]);

      expect(error).toBeNull();
      expect(data).toHaveLength(5);
    });

    it("gamer can read own profile", async () => {
      const { data, error } = await gamerClient
        .from("profiles")
        .select("id, role, username")
        .eq("id", TEST_IDS.GAMER)
        .single();

      expect(error).toBeNull();
      expect(data!.role).toBe("gamer");
      expect(data!.username).toBe("testgamer");
    });

    it("customer cannot insert a profile", async () => {
      const { error } = await customerClient.from("profiles").insert({
        id: "00000000-0000-0000-0000-000000000099",
        role: "customer",
        display_name: "Injected",
      });

      expect(error).not.toBeNull();
    });

    it("customer cannot delete a profile", async () => {
      // PostgREST silently returns 0 rows when RLS filters out the target
      await customerClient
        .from("profiles")
        .delete()
        .eq("id", TEST_IDS.CUSTOMER);

      // Verify the profile still exists
      const { data } = await admin
        .from("profiles")
        .select("id")
        .eq("id", TEST_IDS.CUSTOMER)
        .single();

      expect(data).not.toBeNull();
    });
  });

  // =========================================================================
  // Customer Profiles
  // =========================================================================

  describe("customer_profiles", () => {
    it("customer can read own customer_profile", async () => {
      const { data, error } = await customerClient
        .from("customer_profiles")
        .select("user_id, token_balance")
        .eq("user_id", TEST_IDS.CUSTOMER)
        .single();

      expect(error).toBeNull();
      expect(data!.token_balance).toBeGreaterThanOrEqual(0);
    });

    it("customer cannot read another customer's profile", async () => {
      const { data } = await customerClient
        .from("customer_profiles")
        .select("user_id")
        .eq("user_id", TEST_IDS.CUSTOMER_2);

      expect(data).toEqual([]);
    });

    it("customer cannot update own token_balance directly", async () => {
      // PostgREST silently returns 0 rows when RLS filters out the target
      await customerClient
        .from("customer_profiles")
        .update({ token_balance: 999999 })
        .eq("user_id", TEST_IDS.CUSTOMER);

      // Verify balance was not changed
      const { data } = await admin
        .from("customer_profiles")
        .select("token_balance")
        .eq("user_id", TEST_IDS.CUSTOMER)
        .single();

      expect(data!.token_balance).not.toBe(999999);
    });
  });

  // =========================================================================
  // Gamer Profiles
  // =========================================================================

  describe("gamer_profiles", () => {
    it("gamer can read own gamer_profile", async () => {
      const { data, error } = await gamerClient
        .from("gamer_profiles")
        .select("user_id, date_of_birth, gender")
        .eq("user_id", TEST_IDS.GAMER)
        .single();

      expect(error).toBeNull();
      expect(data!.date_of_birth).toBe("2015-06-15");
      expect(data!.gender).toBe("boy");
    });

    it("parent can read linked gamer's gamer_profile", async () => {
      const { data, error } = await customerClient
        .from("gamer_profiles")
        .select("user_id, date_of_birth")
        .eq("user_id", TEST_IDS.GAMER)
        .single();

      expect(error).toBeNull();
      expect(data!.user_id).toBe(TEST_IDS.GAMER);
    });

    it("unlinked customer cannot read gamer's gamer_profile", async () => {
      const { data } = await customer2Client
        .from("gamer_profiles")
        .select("user_id")
        .eq("user_id", TEST_IDS.GAMER);

      expect(data).toEqual([]);
    });

    it("customer cannot delete a gamer_profile", async () => {
      // PostgREST silently returns 0 rows when RLS filters out the target
      await customerClient
        .from("gamer_profiles")
        .delete()
        .eq("user_id", TEST_IDS.GAMER);

      // Verify the gamer profile still exists
      const { data } = await admin
        .from("gamer_profiles")
        .select("user_id")
        .eq("user_id", TEST_IDS.GAMER)
        .single();

      expect(data).not.toBeNull();
    });
  });

  // =========================================================================
  // Token Transactions
  // =========================================================================

  describe("token_transactions", () => {
    it("customer can read own transactions", async () => {
      // Create a transaction via service-role so there's something to read
      await admin.rpc("adjust_token_balance", {
        p_user_id: TEST_IDS.CUSTOMER,
        p_amount: 1,
        p_type: "admin_adjustment",
        p_description: "RLS test transaction",
      });

      const { data, error } = await customerClient
        .from("token_transactions")
        .select("id, user_id, amount")
        .eq("user_id", TEST_IDS.CUSTOMER);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
      expect(data!.every((tx) => tx.user_id === TEST_IDS.CUSTOMER)).toBe(true);
    });

    it("customer cannot read another customer's transactions", async () => {
      const { data } = await customerClient
        .from("token_transactions")
        .select("id")
        .eq("user_id", TEST_IDS.CUSTOMER_2);

      expect(data).toEqual([]);
    });

    it("customer cannot insert a token_transaction directly", async () => {
      const { error } = await customerClient
        .from("token_transactions")
        .insert({
          user_id: TEST_IDS.CUSTOMER,
          amount: 999,
          type: "purchase",
          balance_after: 999,
        });

      expect(error).not.toBeNull();
    });
  });

  // =========================================================================
  // Products (visible products are public)
  // =========================================================================

  describe("products", () => {
    it("any authenticated user can read visible products", async () => {
      const { data, error } = await gamerClient
        .from("products")
        .select("id, name, is_visible")
        .eq("id", TEST_IDS.PRODUCT)
        .single();

      expect(error).toBeNull();
      expect(data!.is_visible).toBe(true);
      expect(data!.name).toBe("Test Product");
    });

    it("non-admin cannot read hidden products", async () => {
      // Create a hidden product via service-role
      await admin
        .from("products")
        .insert({
          id: "00000000-0000-0000-0000-000000000099",
          name: "Hidden Product",
          description: "Should not be visible",
          image_url: "https://example.com/hidden.png",
          is_visible: false,
          created_by: TEST_IDS.ADMIN,
          game_id: TEST_IDS.GAME,
          day_of_week: 1,
          start_time: "10:00",
          timezone: "Europe/Helsinki",
          duration_minutes: 60,
          min_age: 6,
          max_age: 12,
          token_cost: 1,
        })
        .select("id")
        .single();

      const { data } = await customerClient
        .from("products")
        .select("id")
        .eq("id", "00000000-0000-0000-0000-000000000099");

      expect(data).toEqual([]);

      // Cleanup
      await admin
        .from("products")
        .delete()
        .eq("id", "00000000-0000-0000-0000-000000000099");
    });

    it("customer cannot insert a product", async () => {
      const { error } = await customerClient.from("products").insert({
        name: "Injected",
        description: "Should be denied",
        image_url: "https://example.com/x.png",
        created_by: TEST_IDS.CUSTOMER,
        game_id: TEST_IDS.GAME,
        day_of_week: 1,
        start_time: "10:00",
        timezone: "Europe/Helsinki",
        duration_minutes: 60,
        min_age: 6,
        max_age: 12,
        token_cost: 1,
      });

      expect(error).not.toBeNull();
    });

    it("admin can read hidden products", async () => {
      // Create a hidden product via service-role
      await admin.from("products").insert({
        id: "00000000-0000-0000-0000-000000000098",
        name: "Admin-Only Product",
        description: "Hidden from non-admins",
        image_url: "https://example.com/hidden2.png",
        is_visible: false,
        created_by: TEST_IDS.ADMIN,
        game_id: TEST_IDS.GAME,
        day_of_week: 2,
        start_time: "11:00",
        timezone: "Europe/Helsinki",
        duration_minutes: 60,
        min_age: 6,
        max_age: 12,
        token_cost: 1,
      });

      const { data, error } = await adminClient
        .from("products")
        .select("id")
        .eq("id", "00000000-0000-0000-0000-000000000098")
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBe("00000000-0000-0000-0000-000000000098");

      // Cleanup
      await admin
        .from("products")
        .delete()
        .eq("id", "00000000-0000-0000-0000-000000000098");
    });
  });

  // =========================================================================
  // Product Groups & Enrollments
  // =========================================================================

  describe("product_groups", () => {
    it("gedu can read own groups", async () => {
      const { data, error } = await geduClient
        .from("product_groups")
        .select("id, product_id, gedu_id")
        .eq("gedu_id", TEST_IDS.GEDU);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
      expect(data!.every((g) => g.gedu_id === TEST_IDS.GEDU)).toBe(true);
    });

    it("authenticated users can read groups for visible products", async () => {
      const { data, error } = await customerClient
        .from("product_groups")
        .select("id, product_id")
        .eq("product_id", TEST_IDS.PRODUCT);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
    });

    it("customer cannot insert a product_group", async () => {
      const { error } = await customerClient.from("product_groups").insert({
        product_id: TEST_IDS.PRODUCT,
        gedu_id: TEST_IDS.GEDU,
        display_order: 99,
      });

      expect(error).not.toBeNull();
    });
  });

  describe("group_enrollments", () => {
    // Enrollment is not seeded — create it here for read-only assertions
    beforeAll(async () => {
      await resetEnrollmentState(admin);
      await seedEnrollment(admin);
    });

    afterAll(async () => {
      await resetEnrollmentState(admin);
    });

    it("gamer can read own enrollments", async () => {
      const { data, error } = await gamerClient
        .from("group_enrollments")
        .select("id, group_id, gamer_id")
        .eq("gamer_id", TEST_IDS.GAMER);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
      expect(data!.every((e) => e.gamer_id === TEST_IDS.GAMER)).toBe(true);
    });

    it("gedu can read enrollments for own groups", async () => {
      const { data, error } = await geduClient
        .from("group_enrollments")
        .select("id, group_id, gamer_id")
        .eq("group_id", TEST_IDS.GROUP);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
    });

    it("customer can read enrollments for visible product groups", async () => {
      const { data, error } = await customerClient
        .from("group_enrollments")
        .select("id, group_id")
        .eq("group_id", TEST_IDS.GROUP);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
    });

    it("customer cannot insert an enrollment", async () => {
      const { error } = await customerClient
        .from("group_enrollments")
        .insert({
          group_id: TEST_IDS.GROUP,
          gamer_id: TEST_IDS.GAMER,
          enrolled_by: TEST_IDS.CUSTOMER,
        });

      expect(error).not.toBeNull();
    });

    it("gamer cannot delete own enrollment", async () => {
      // PostgREST silently returns 0 rows when RLS filters out the target
      await gamerClient
        .from("group_enrollments")
        .delete()
        .eq("id", TEST_IDS.ENROLLMENT);

      // Verify the enrollment still exists
      const { data } = await admin
        .from("group_enrollments")
        .select("id")
        .eq("id", TEST_IDS.ENROLLMENT)
        .single();

      expect(data).not.toBeNull();
    });
  });

  // =========================================================================
  // Enrollment Charges
  // =========================================================================

  describe("enrollment_charges", () => {
    // These tests create enrollment data, so clean up afterward
    afterAll(async () => {
      await resetEnrollmentState(admin);
    });

    it("customer can read charges for own enrollments", async () => {
      // Create an enrollment (via service-role) for customer 1
      await resetEnrollmentState(admin);
      const { data: enrollData } = await admin.rpc("enroll_gamer_in_group", {
        p_customer_id: TEST_IDS.CUSTOMER,
        p_gamer_id: TEST_IDS.GAMER,
        p_group_id: TEST_IDS.GROUP,
        p_session_date: "2026-03-04",
      });

      const rows = enrollData as { enrollment_id: string }[];
      const enrollmentId = rows[0].enrollment_id;

      const { data, error } = await customerClient
        .from("enrollment_charges")
        .select("enrollment_id, amount")
        .eq("enrollment_id", enrollmentId);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
    });

    it("customer cannot read charges for another customer's enrollments", async () => {
      // Customer 2 should see no charges (enrollment belongs to customer 1)
      const { data } = await customer2Client
        .from("enrollment_charges")
        .select("id");

      expect(data).toEqual([]);
    });

    it("customer cannot insert an enrollment_charge directly", async () => {
      const { error } = await customerClient
        .from("enrollment_charges")
        .insert({
          enrollment_id: TEST_IDS.ENROLLMENT,
          amount: 999,
          transaction_id: "00000000-0000-0000-0000-000000000000",
          session_date: "2026-03-04",
        });

      expect(error).not.toBeNull();
    });

    it("customer cannot delete enrollment_charges", async () => {
      // Get any existing charge via admin
      const { data: charges } = await admin
        .from("enrollment_charges")
        .select("id")
        .limit(1);

      if (charges && charges.length > 0) {
        // Attempt to delete via customer client — RLS should block
        await customerClient
          .from("enrollment_charges")
          .delete()
          .eq("id", charges[0].id);

        // Verify charge still exists
        const { data: stillExists } = await admin
          .from("enrollment_charges")
          .select("id")
          .eq("id", charges[0].id)
          .single();

        expect(stillExists).not.toBeNull();
      }
    });
  });

  // =========================================================================
  // Feedback Submissions
  // =========================================================================

  describe("feedback_submissions", () => {
    const FEEDBACK_ID_1 = "00000000-0000-0000-0000-000000000050";
    const FEEDBACK_ID_2 = "00000000-0000-0000-0000-000000000051";

    beforeAll(async () => {
      // Insert test feedback via admin client (bypasses RLS)
      await admin.from("feedback_submissions").insert([
        { id: FEEDBACK_ID_1, user_id: TEST_IDS.CUSTOMER, message: "Feedback from customer 1" },
        { id: FEEDBACK_ID_2, user_id: TEST_IDS.CUSTOMER_2, message: "Feedback from customer 2" },
      ]);
    });

    afterAll(async () => {
      await admin
        .from("feedback_submissions")
        .delete()
        .in("id", [FEEDBACK_ID_1, FEEDBACK_ID_2]);
    });

    it("customer can read own feedback submissions", async () => {
      const { data, error } = await customerClient
        .from("feedback_submissions")
        .select("id, message")
        .eq("user_id", TEST_IDS.CUSTOMER);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
      expect(data!.some((f) => f.id === FEEDBACK_ID_1)).toBe(true);
    });

    it("customer cannot read another customer's feedback", async () => {
      const { data } = await customerClient
        .from("feedback_submissions")
        .select("id")
        .eq("user_id", TEST_IDS.CUSTOMER_2);

      expect(data).toEqual([]);
    });

    it("customer cannot insert a feedback_submission directly", async () => {
      const { error } = await customerClient
        .from("feedback_submissions")
        .insert({
          user_id: TEST_IDS.CUSTOMER,
          message: "Should be denied by grant revocation",
        });

      expect(error).not.toBeNull();
    });

    it("admin can read all feedback submissions", async () => {
      const { data, error } = await adminClient
        .from("feedback_submissions")
        .select("id")
        .in("id", [FEEDBACK_ID_1, FEEDBACK_ID_2]);

      expect(error).toBeNull();
      expect(data).toHaveLength(2);
    });
  });

  // =========================================================================
  // submit_feedback RPC
  // =========================================================================

  describe("submit_feedback RPC", () => {
    afterEach(async () => {
      // Clean up rows created by RPC tests — use CUSTOMER_2 to avoid colliding with seed data
      await admin
        .from("feedback_submissions")
        .delete()
        .eq("user_id", TEST_IDS.CUSTOMER_2);
    });

    it("inserts feedback and returns true via admin client", async () => {
      const { data, error } = await admin.rpc("submit_feedback", {
        p_user_id: TEST_IDS.CUSTOMER_2,
        p_message: "Test feedback from RPC",
      });

      expect(error).toBeNull();
      expect(data).toBe(true);

      // Verify the row was inserted
      const { data: rows } = await admin
        .from("feedback_submissions")
        .select("message")
        .eq("user_id", TEST_IDS.CUSTOMER_2)
        .eq("message", "Test feedback from RPC");

      expect(rows).toHaveLength(1);
    });

    it("returns false when rate limit is reached (6 per hour)", async () => {
      // Insert 6 submissions to hit the limit
      for (let i = 0; i < 6; i++) {
        await admin.rpc("submit_feedback", {
          p_user_id: TEST_IDS.CUSTOMER_2,
          p_message: `Rate limit test ${i}`,
        });
      }

      // 7th should be rejected
      const { data, error } = await admin.rpc("submit_feedback", {
        p_user_id: TEST_IDS.CUSTOMER_2,
        p_message: "Should be rate limited",
      });

      expect(error).toBeNull();
      expect(data).toBe(false);

      // Verify only 6 rows exist
      const { data: rows } = await admin
        .from("feedback_submissions")
        .select("id")
        .eq("user_id", TEST_IDS.CUSTOMER_2);

      expect(rows).toHaveLength(6);
    });

    it("authenticated users cannot call submit_feedback directly", async () => {
      const { error } = await customerClient.rpc("submit_feedback", {
        p_user_id: TEST_IDS.CUSTOMER,
        p_message: "Should be denied",
      });

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied/i);
    });
  });

  describe("parent_gamer", () => {
    it("customer can read own parent-gamer links", async () => {
      const { data, error } = await customerClient
        .from("parent_gamer")
        .select("parent_id, gamer_id")
        .eq("parent_id", TEST_IDS.CUSTOMER);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
      expect(data![0].gamer_id).toBe(TEST_IDS.GAMER);
    });

    it("customer cannot read another customer's links", async () => {
      const { data } = await customer2Client
        .from("parent_gamer")
        .select("parent_id")
        .eq("parent_id", TEST_IDS.CUSTOMER);

      expect(data).toEqual([]);
    });

    it("gamer can read own parent links", async () => {
      const { data, error } = await gamerClient
        .from("parent_gamer")
        .select("parent_id, gamer_id")
        .eq("gamer_id", TEST_IDS.GAMER);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
    });

    it("customer cannot insert a parent_gamer link", async () => {
      const { error } = await customerClient
        .from("parent_gamer")
        .insert({
          parent_id: TEST_IDS.CUSTOMER,
          gamer_id: TEST_IDS.GAMER,
        });

      expect(error).not.toBeNull();
      expect(error!.message).toContain("permission denied");
    });

    it("service-role client can insert a parent_gamer link", async () => {
      // The /api/gamers/create route uses the service-role client to link
      // parent → gamer. Verify this still works after revoking INSERT
      // from authenticated.
      const { error } = await admin.from("parent_gamer").insert({
        parent_id: TEST_IDS.CUSTOMER_2,
        gamer_id: TEST_IDS.GAMER,
      });

      expect(error).toBeNull();

      // Cleanup
      await admin
        .from("parent_gamer")
        .delete()
        .eq("parent_id", TEST_IDS.CUSTOMER_2)
        .eq("gamer_id", TEST_IDS.GAMER);
    });

    describe("delete and orphan trigger", () => {
      const TEMP_GAMER_ID = "00000000-0000-0000-0000-000000000090";

      beforeAll(async () => {
        // Create a temporary gamer to avoid destroying seed data.
        // admin.auth.admin.createUser fires handle_new_user → creates customer profile.
        await admin.auth.admin.createUser({
          id: TEMP_GAMER_ID,
          email: "temp-gamer@gamer.sogverse.internal",
          password: "testpassword123",
          email_confirm: true,
          user_metadata: { display_name: "Temp Gamer" },
        });

        // Promote to gamer (same pattern as seed.sql)
        await admin
          .from("profiles")
          .update({ role: "gamer", email: null, username: "tempgamer" })
          .eq("id", TEMP_GAMER_ID);
        await admin
          .from("customer_profiles")
          .delete()
          .eq("user_id", TEMP_GAMER_ID);
        await admin.from("gamer_profiles").insert({
          user_id: TEMP_GAMER_ID,
          date_of_birth: "2016-01-01",
          gender: "girl",
        });

        // Link customer → temp gamer (via admin client, bypasses RLS)
        await admin.from("parent_gamer").insert({
          parent_id: TEST_IDS.CUSTOMER,
          gamer_id: TEMP_GAMER_ID,
        });
      });

      afterAll(async () => {
        // Clean up in case the orphan trigger didn't fire or a test failed.
        // Ignore errors — rows may already be gone.
        await admin
          .from("parent_gamer")
          .delete()
          .eq("gamer_id", TEMP_GAMER_ID);
        await admin.auth.admin.deleteUser(TEMP_GAMER_ID);
      });

      it("customer can delete own parent_gamer link", async () => {
        const { error } = await customerClient
          .from("parent_gamer")
          .delete()
          .eq("parent_id", TEST_IDS.CUSTOMER)
          .eq("gamer_id", TEMP_GAMER_ID);

        expect(error).toBeNull();

        // Verify link is gone
        const { data } = await admin
          .from("parent_gamer")
          .select("id")
          .eq("parent_id", TEST_IDS.CUSTOMER)
          .eq("gamer_id", TEMP_GAMER_ID);

        expect(data).toEqual([]);
      });

      it("orphan trigger deletes gamer when last parent link is removed", async () => {
        // The delete above removed the only link to TEMP_GAMER_ID.
        // The handle_orphaned_gamer trigger should have deleted the auth user.
        const { data } = await admin.auth.admin.getUserById(TEMP_GAMER_ID);

        expect(data.user).toBeNull();
      });
    });
  });
});
