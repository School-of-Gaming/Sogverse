import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";

/**
 * Parent-PIN RPCs (00075/00076) against real Postgres. Verifies the
 * auth.uid()-scoping, 4-digit guard, and that the admin-only setter is not
 * reachable by authenticated users. Seed PIN state is reset around each test.
 */
describe("Parent PIN RPCs", () => {
  let admin: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let gamer: SupabaseClient<Database>;

  async function clearPins() {
    await admin
      .from("customer_profiles")
      .update({ pin_hash: null })
      .in("user_id", [TEST_IDS.CUSTOMER, TEST_IDS.CUSTOMER_2]);
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    gamer = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
  });

  beforeEach(clearPins);
  afterAll(clearPins);

  it("pin_is_set reflects whether a PIN is configured", async () => {
    expect((await customer.rpc("pin_is_set")).data).toBe(false);
    await customer.rpc("set_my_pin", { p_pin: "1234" });
    expect((await customer.rpc("pin_is_set")).data).toBe(true);
  });

  it("verify_my_pin matches only the correct PIN", async () => {
    await customer.rpc("set_my_pin", { p_pin: "1234" });
    expect((await customer.rpc("verify_my_pin", { p_pin: "1234" })).data).toBe(true);
    expect((await customer.rpc("verify_my_pin", { p_pin: "9999" })).data).toBe(false);
  });

  it("set_my_pin rejects a non-4-digit PIN", async () => {
    expect((await customer.rpc("set_my_pin", { p_pin: "12" })).error).not.toBeNull();
    expect((await customer.rpc("set_my_pin", { p_pin: "abcd" })).error).not.toBeNull();
  });

  it("returns false for a non-customer caller (no customer_profiles row)", async () => {
    expect((await gamer.rpc("pin_is_set")).data).toBe(false);
    expect((await gamer.rpc("verify_my_pin", { p_pin: "1234" })).data).toBe(false);
  });

  it("set_my_pin only touches the caller's own row", async () => {
    await customer.rpc("set_my_pin", { p_pin: "1234" });
    const { data } = await admin
      .from("customer_profiles")
      .select("pin_hash")
      .eq("user_id", TEST_IDS.CUSTOMER_2)
      .single();
    expect(data?.pin_hash).toBeNull();
  });

  it("set_pin_for_user is admin-only (not callable by an authenticated user)", async () => {
    const { error } = await customer.rpc("set_pin_for_user", {
      p_user_id: TEST_IDS.CUSTOMER,
      p_pin: "1234",
    });
    expect(error).not.toBeNull();
  });
});
