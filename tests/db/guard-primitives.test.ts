import { describe, it, expect } from "vitest";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";

/**
 * Behavioural cover for the §3.1 guard primitives (migration 00120).
 *
 * assert_role / assert_admin are granted to `authenticated` because
 * create_product and update_product are SECURITY INVOKER — their guard runs as
 * the caller. That grant is a new exposed surface, so it is tested directly
 * here rather than only through the eight RPCs that call it: the primitives
 * must refuse every role they don't name and pass the one they do — and, for
 * now, reproduce the hand-written guards' NULL-role pass-through verbatim.
 *
 * Which functions are *exposed* is pinned mechanically by access-control.test
 * .ts (assert_self and the two §3.2 predicates are deliberately absent from its
 * allowlist), so this file covers behaviour only.
 *
 * The wrong-role behaviour of the RPCs that call these guards is already
 * covered per-RPC (apply-group-changes, update-product, waitlist-admin,
 * get-gedu-assigned-product); the systematic role × RPC matrix is Phase 2.
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

    it("KNOWN GAP: lets a caller with no role through", async () => {
      // service_role carries no `sub` claim, so get_user_role() is NULL, and
      // `NULL <> 'admin'` is NULL — the IF never fires. The hand-written guards
      // this primitive replaces behaved the same way, and that pass-through is
      // load-bearing today: update-product.test.ts and gedu-registration.test.ts
      // drive admin-gated RPCs through the service-role client. Pinned here so
      // the hole is visible and Phase 2 closes it as a deliberate test change,
      // not a surprise.
      const admin = createAdminTestClient();

      const { error } = await admin.rpc("assert_admin");

      expect(error).toBeNull();
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
  });

  describe("ownership predicates", () => {
    it("answer false for a caller with no participation context", async () => {
      // service_role has no auth.uid(), so the predicates can only answer
      // false. Enough to pin the signature, the grant and the fail-closed
      // default until Phase 4 wires them into policies with real fixtures.
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
