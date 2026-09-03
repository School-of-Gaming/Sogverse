import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";

/**
 * Parent-PIN RPCs (00075/00076, plus verify_pin_for_any from 00235) against
 * real Postgres. Verifies the auth.uid()-scoping, the 4-digit guard, and that
 * the two service-role-only functions are not reachable by authenticated users.
 * Seed PIN state is reset around each test.
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

  /**
   * `verify_pin_for_any` (00235) — the account-switch gate's check. A child in
   * a gamer session leaving it pays their PARENT's PIN, and a child may be
   * linked to more than one parent, so the question is "does this match ANY of
   * these" rather than "does this match theirs".
   *
   * Three answers, not two, and the third is the point: `not_set` says the
   * family has no PIN at all, which the route answers by sending them to set
   * one rather than by telling a child their PIN was wrong.
   */
  describe("verify_pin_for_any", () => {
    const FAMILY = [TEST_IDS.CUSTOMER, TEST_IDS.CUSTOMER_2];

    it("answers not_set when nobody in the set holds a PIN", async () => {
      // clearPins() ran in beforeEach, so neither has one.
      const { data, error } = await admin.rpc("verify_pin_for_any", {
        p_user_ids: FAMILY,
        p_pin: "1234",
      });
      expect(error).toBeNull();
      expect(data).toBe("not_set");
    });

    it("answers valid when the PIN matches ANY member of the set", async () => {
      // Only the SECOND user holds the PIN, which is what makes this about the
      // set rather than about the first id happening to match.
      await admin.rpc("set_pin_for_user", {
        p_user_id: TEST_IDS.CUSTOMER_2,
        p_pin: "4321",
      });

      const { data, error } = await admin.rpc("verify_pin_for_any", {
        p_user_ids: FAMILY,
        p_pin: "4321",
      });
      expect(error).toBeNull();
      expect(data).toBe("valid");
    });

    it("answers invalid for a wrong PIN when somebody in the set has one", async () => {
      await admin.rpc("set_pin_for_user", {
        p_user_id: TEST_IDS.CUSTOMER,
        p_pin: "1234",
      });

      const { data } = await admin.rpc("verify_pin_for_any", {
        p_user_ids: FAMILY,
        p_pin: "9999",
      });
      expect(data).toBe("invalid");
    });

    it("answers invalid — never an error — for a malformed PIN", async () => {
      // It sits on a credential path, so a mistyped digit must not become a 500
      // the client has to special-case.
      await admin.rpc("set_pin_for_user", {
        p_user_id: TEST_IDS.CUSTOMER,
        p_pin: "1234",
      });

      for (const pin of ["12", "abcd", "12345", ""]) {
        const { data, error } = await admin.rpc("verify_pin_for_any", {
          p_user_ids: FAMILY,
          p_pin: pin,
        });
        expect(error, `p_pin ${JSON.stringify(pin)} must not raise`).toBeNull();
        expect(data).toBe("invalid");
      }
    });

    it("asks about the family before it asks about the input", async () => {
      // `not_set` is a fact about the FAMILY and must not depend on what was
      // typed: a malformed PIN against a family with no PIN is still not_set,
      // or the route would send a child to retype instead of sending the parent
      // to set one.
      const { data } = await admin.rpc("verify_pin_for_any", {
        p_user_ids: FAMILY,
        p_pin: "nope",
      });
      expect(data).toBe("not_set");
    });

    it("answers not_set for an empty set rather than raising", async () => {
      const { data, error } = await admin.rpc("verify_pin_for_any", {
        p_user_ids: [],
        p_pin: "1234",
      });
      expect(error).toBeNull();
      expect(data).toBe("not_set");
    });

    it("is service-role only — an authenticated caller is refused", async () => {
      // No argument is checked against auth.uid(), so reachable by
      // `authenticated` this would be a PIN oracle pointable at any family.
      // Entitlement to ask about these users is the switch route's to establish.
      await admin.rpc("set_pin_for_user", {
        p_user_id: TEST_IDS.CUSTOMER,
        p_pin: "1234",
      });

      for (const client of [customer, gamer]) {
        const { error } = await client.rpc("verify_pin_for_any", {
          p_user_ids: FAMILY,
          p_pin: "1234",
        });
        expect(error).not.toBeNull();
      }
    });
  });
});
