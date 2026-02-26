import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

describe("Row Level Security", () => {
  let admin: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;
  let customer2Client: SupabaseClient<Database>;
  let gamerClient: SupabaseClient<Database>;
  let geduClient: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
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
      const { data, error } = await admin
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
  });

  // =========================================================================
  // Token Transactions
  // =========================================================================

  describe("token_transactions", () => {
    it("customer can read own transactions", async () => {
      // Create a transaction via admin so there's something to read
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
      // Create a hidden product via admin
      const { data: hidden } = await admin
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
  });
});
