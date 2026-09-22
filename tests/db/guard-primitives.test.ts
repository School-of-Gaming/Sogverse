import { describe, it, expect } from "vitest";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";

/**
 * Behavioural cover for the §3.1 guard primitives.
 *
 * assert_role / assert_admin are granted to `authenticated` because
 * create_product is SECURITY INVOKER — its guard runs as the caller. (Its
 * cousin update_product is SECURITY DEFINER, so it can delete a switched-off
 * product's waitlist; a definer's body checks
 * EXECUTE as the definer, so it does not need the grant.) That grant is a
 * live exposed surface, so it is tested directly
 * here rather than only through the eight RPCs that call it: the primitives
 * must refuse every role they don't name, pass the one they do, and refuse a
 * caller who holds no role at all.
 *
 * Which functions are *exposed* is pinned mechanically by
 * authorization-spine.test.ts's completeness check (assert_self and the two §3.2
 * predicates are deliberately absent from its classifications, so they must
 * stay unexposed), so this file covers behaviour only. The systematic role × RPC
 * matrix — including these primitives — lives in that file too; what is here is
 * the primitives' own edge cases, which the matrix's all-NULL convention cannot
 * express.
 */
describe("guard primitives", () => {
  describe("assert_admin", () => {
    it("passes for an admin", async () => {
      const client = await createAuthenticatedClient(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password
      );

      const { error } = await client.rpc("assert_admin");

      expect(error).toBeNull();
    });

    it.each([
      ["customer", TEST_CREDENTIALS.CUSTOMER],
      ["gedu", TEST_CREDENTIALS.GEDU],
      ["gamer", TEST_CREDENTIALS.GAMER],
    ])("raises 42501 for a %s", async (_role, credentials) => {
      const client = await createAuthenticatedClient(
        credentials.email,
        credentials.password
      );

      const { error } = await client.rpc("assert_admin");

      expect(error?.code).toBe("42501");
    });

    it("refuses a caller with no role", async () => {
      // service_role carries no `sub` claim, so get_user_role() is NULL. Under
      // a plain `<>` comparison `NULL <> 'admin'` is
      // NULL, the IF never fires, and the caller goes straight through. The
      // primitive compares with IS DISTINCT FROM, so a roleless caller
      // is refused like any other non-admin, and this case is what holds it
      // there.
      const admin = createAdminTestClient();

      const { error } = await admin.rpc("assert_admin");

      expect(error?.code).toBe("42501");
    });
  });

  describe("assert_role", () => {
    it("passes when the caller holds the named role", async () => {
      const client = await createAuthenticatedClient(
        TEST_CREDENTIALS.GEDU.email,
        TEST_CREDENTIALS.GEDU.password
      );

      const { error } = await client.rpc("assert_role", { p_role: "gedu" });

      expect(error).toBeNull();
    });

    it("raises 42501 when the caller holds a different role", async () => {
      const client = await createAuthenticatedClient(
        TEST_CREDENTIALS.CUSTOMER.email,
        TEST_CREDENTIALS.CUSTOMER.password
      );

      const { error } = await client.rpc("assert_role", { p_role: "gedu" });

      expect(error?.code).toBe("42501");
    });

    it("refuses a caller with no role, even for a role that exists", async () => {
      // The direct test of IS DISTINCT FROM rather than `<>`: a real role
      // name, a caller whose get_user_role() is NULL. The matrix in
      // authorization-spine.test.ts only ever hands this primitive a NULL role
      // name, so this case is only assertable here.
      const admin = createAdminTestClient();

      const { error } = await admin.rpc("assert_role", { p_role: "gedu" });

      expect(error?.code).toBe("42501");
    });
  });

  describe("assert_self", () => {
    it("refuses a caller who is not the referenced user", async () => {
      // service_role only (no SECURITY INVOKER consumer yet), so the service-role
      // client is the caller here. auth.uid() is NULL, which IS DISTINCT FROM any
      // user id — the fail-closed default the primitive shipped with.
      const admin = createAdminTestClient();

      const { error } = await admin.rpc("assert_self", {
        p_user_id: TEST_IDS.CUSTOMER,
      });

      expect(error?.code).toBe("42501");
    });
  });

  describe("ownership predicates", () => {
    it("answer false for a caller with no participation context", async () => {
      // service_role has no auth.uid(), so the predicates can only answer
      // false. That fail-closed default is what this pins; the fixture-bearing
      // scope tests (exposed-function-scope.test.ts) cover the true answers now
      // that three policies compose from them.
      const admin = createAdminTestClient();

      const onProduct = await admin.rpc("has_active_participation_on_product", {
        p_product_id: TEST_IDS.ADMIN,
      });
      const inGroup = await admin.rpc("has_active_participation_in_group", {
        p_group_id: TEST_IDS.ADMIN,
      });

      expect(onProduct.error).toBeNull();
      expect(onProduct.data).toBe(false);
      expect(inGroup.error).toBeNull();
      expect(inGroup.data).toBe(false);
    });
  });
});
