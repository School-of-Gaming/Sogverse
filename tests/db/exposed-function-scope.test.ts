import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * Scope tests for the self-scoping functions exposed to `authenticated` that had
 * no direct coverage before the §3.4 verification spine.
 *
 * These functions carry no role gate by design — every answer is keyed to
 * `auth.uid()`. That makes their failure mode *scope leakage* (answering about
 * someone else) rather than "wrong role got in", which no static check can see.
 * authorization-spine.test.ts's check 5 requires each one to name a scope test;
 * this file is that test for eight of them, and it is what makes their entry on
 * the self-scoping allowlist mean something.
 *
 * The others are covered where they already were:
 * parent-pin.test.ts (set_my_pin / verify_my_pin / pin_is_set),
 * waitlist-admin.test.ts (get_waitlist_position), and
 * get-my-participation-subscription-states.test.ts.
 *
 * Product UUIDs 5a1, 5a2 (see the product-helpers allocation registry).
 */

/** Published + visible: readable by the whole world, including anon. */
const PUBLIC_PRODUCT = "00000000-0000-0000-0000-0000000005a1";
/**
 * Draft + invisible, carrying the group fixtures. Nobody reaches it through the
 * public branch, so each remaining branch of can_read_product (admin, enrolled
 * gamer, purchasing parent, assigned gedu) is isolated on it.
 */
const PRIVATE_PRODUCT = "00000000-0000-0000-0000-0000000005a2";
const GROUP_ID = "00000000-0000-0000-0000-0000000005a3";

describe("self-scoping exposed functions", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let customer2: SupabaseClient<Database>;
  let gedu: SupabaseClient<Database>;
  let gamer: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    anon = createAnonTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    customer2 = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );
    gedu = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
    gamer = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );

    await deleteTestProducts(admin, [PUBLIC_PRODUCT, PRIVATE_PRODUCT]);

    await createTestProduct(admin, {
      id: PUBLIC_PRODUCT,
      status: "pending",
      isVisible: true,
      seatCount: null,
    });
    await createTestProduct(admin, {
      id: PRIVATE_PRODUCT,
      status: "draft",
      isVisible: false,
      seatCount: null,
    });

    await admin
      .from("product_groups")
      .insert({ id: GROUP_ID, product_id: PRIVATE_PRODUCT, name: "Scope" });
    await admin.from("gedu_group_assignments").insert({
      group_id: GROUP_ID,
      gedu_id: TEST_IDS.GEDU,
      product_id: PRIVATE_PRODUCT,
    });
    await admin.from("participations").insert({
      product_id: PRIVATE_PRODUCT,
      group_id: GROUP_ID,
      gamer_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
    });
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [PUBLIC_PRODUCT, PRIVATE_PRODUCT]);
  });

  describe("get_user_role", () => {
    it("returns the caller's own role and no one else's", async () => {
      expect((await adminAuth.rpc("get_user_role")).data).toBe("admin");
      expect((await customer.rpc("get_user_role")).data).toBe("customer");
      expect((await gedu.rpc("get_user_role")).data).toBe("gedu");
      expect((await gamer.rpc("get_user_role")).data).toBe("gamer");
    });
  });

  describe("is_admin", () => {
    it("is true only for the admin", async () => {
      expect((await adminAuth.rpc("is_admin")).data).toBe(true);
      expect((await customer.rpc("is_admin")).data).toBe(false);
      expect((await gedu.rpc("is_admin")).data).toBe(false);
      expect((await gamer.rpc("is_admin")).data).toBe(false);
    });
  });

  describe("is_parent_of", () => {
    it("answers about the caller's own links only", async () => {
      const own = await customer.rpc("is_parent_of", {
        gamer_uuid: TEST_IDS.GAMER,
      });
      expect(own.data).toBe(true);

      // The second customer is parent to nobody — the same gamer, asked by a
      // different caller, must not come back true.
      const other = await customer2.rpc("is_parent_of", {
        gamer_uuid: TEST_IDS.GAMER,
      });
      expect(other.data).toBe(false);

      // And a gamer is not their own parent.
      const self = await gamer.rpc("is_parent_of", {
        gamer_uuid: TEST_IDS.GAMER,
      });
      expect(self.data).toBe(false);
    });
  });

  /**
   * The links as the database sees them, read with RLS bypassed. Comparing
   * against this rather than against a hardcoded list keeps the assertion exact
   * without coupling it to whatever links other db-test files have created and
   * cleaned up around it.
   */
  async function linkedGamersOf(parentId: string): Promise<string[]> {
    const { data } = await admin
      .from("parent_gamer")
      .select("gamer_id")
      .eq("parent_id", parentId);
    return (data ?? []).map((row) => row.gamer_id).sort();
  }

  describe("get_my_gamers", () => {
    it("returns the caller's own linked gamers only", async () => {
      const expected = await linkedGamersOf(TEST_IDS.CUSTOMER);
      // Non-vacuity: an empty expectation would make the equality below hold
      // even if the function returned nothing at all.
      expect(expected).toContain(TEST_IDS.GAMER);

      const mine = await customer.rpc("get_my_gamers");
      expect(mine.error).toBeNull();
      expect((mine.data ?? []).map((row) => row.id).sort()).toEqual(expected);

      const theirs = await customer2.rpc("get_my_gamers");
      expect((theirs.data ?? []).map((row) => row.id).sort()).toEqual(
        await linkedGamersOf(TEST_IDS.CUSTOMER_2),
      );

      // A gamer has no children of their own, however many they are linked to.
      const asGamer = await gamer.rpc("get_my_gamers");
      expect(asGamer.data).toEqual([]);
    });
  });

  describe("get_my_parents", () => {
    it("returns the caller's own linked parents only", async () => {
      const mine = await gamer.rpc("get_my_parents");
      expect(mine.error).toBeNull();
      expect((mine.data ?? []).map((row) => row.id)).toEqual([
        TEST_IDS.CUSTOMER,
      ]);

      const asCustomer = await customer.rpc("get_my_parents");
      expect(asCustomer.data).toEqual([]);
    });
  });

  describe("can_read_product", () => {
    it("is true for everyone, session or not, on a published visible product", async () => {
      for (const client of [anon, customer2, gamer, gedu, adminAuth]) {
        const { data } = await client.rpc("can_read_product", {
          p_product_id: PUBLIC_PRODUCT,
        });
        expect(data).toBe(true);
      }
    });

    it("is true on an unpublished product only for parties to it", async () => {
      // admin (sees everything), the enrolled gamer, the purchasing parent, and
      // the assigned gedu — one branch of the predicate each.
      for (const client of [adminAuth, gamer, customer, gedu]) {
        const { data } = await client.rpc("can_read_product", {
          p_product_id: PRIVATE_PRODUCT,
        });
        expect(data).toBe(true);
      }

      // An unrelated customer is not a party to it.
      const asCustomer2 = await customer2.rpc("can_read_product", {
        p_product_id: PRIVATE_PRODUCT,
      });
      expect(asCustomer2.data).toBe(false);

      // anon answers a real `false`, and that is worth pinning: anon has no
      // profiles row, so `get_user_role() = 'admin'` is NULL and the whole OR
      // chain evaluates to NULL under SQL's three-valued logic. Phase 4 wrapped
      // the chain in COALESCE(…, false) so the predicate is a total boolean.
      // The deny was never in doubt — a policy's USING clause treats NULL as
      // deny too, which is what read_products relied on and what the read below
      // proves — but a predicate that can answer NULL is a trap for the next
      // consumer, which may not be a USING clause.
      const asAnon = await anon.rpc("can_read_product", {
        p_product_id: PRIVATE_PRODUCT,
      });
      expect(asAnon.data).toBe(false);

      const visible = await anon
        .from("products")
        .select("id")
        .eq("id", PRIVATE_PRODUCT);
      expect(visible.data).toEqual([]);
    });
  });

  /**
   * The two §3.2 party-to predicates. They unify the customer and gamer columns
   * into one question — "am I a party to an active participation here" — which
   * is what makes them reusable across the customer-side and gamer-side
   * policies that used to inline the subquery separately. So the scoping claim
   * has two halves: both parties get `true`, and nobody else does.
   */
  describe("has_active_participation_on_product", () => {
    it("is true for both parties to the participation and no one else", async () => {
      for (const client of [customer, gamer]) {
        const { data } = await client.rpc("has_active_participation_on_product", {
          p_product_id: PRIVATE_PRODUCT,
        });
        expect(data).toBe(true);
      }

      // The assigned gedu and the admin are not *parties* — they reach the
      // product by other routes, which is precisely why this predicate is not
      // the same question as can_read_product.
      for (const client of [customer2, gedu, adminAuth]) {
        const { data } = await client.rpc("has_active_participation_on_product", {
          p_product_id: PRIVATE_PRODUCT,
        });
        expect(data).toBe(false);
      }
    });

    it("is false for a product the caller is a party to nothing on", async () => {
      const { data } = await customer.rpc("has_active_participation_on_product", {
        p_product_id: PUBLIC_PRODUCT,
      });
      expect(data).toBe(false);
    });
  });

  describe("has_active_participation_in_group", () => {
    it("is true for both parties to the participation and no one else", async () => {
      for (const client of [customer, gamer]) {
        const { data } = await client.rpc("has_active_participation_in_group", {
          p_group_id: GROUP_ID,
        });
        expect(data).toBe(true);
      }

      for (const client of [customer2, gedu, adminAuth]) {
        const { data } = await client.rpc("has_active_participation_in_group", {
          p_group_id: GROUP_ID,
        });
        expect(data).toBe(false);
      }
    });
  });

  describe("is_voice_group_member", () => {
    it("is true only for the admin, the enrolled gamer and the assigned gedu", async () => {
      for (const client of [adminAuth, gamer, gedu]) {
        const { data } = await client.rpc("is_voice_group_member", {
          p_group_id: GROUP_ID,
        });
        expect(data).toBe(true);
      }

      // The purchasing parent is not a room member — membership is the gamer's,
      // not the family's.
      for (const client of [customer, customer2]) {
        const { data } = await client.rpc("is_voice_group_member", {
          p_group_id: GROUP_ID,
        });
        expect(data).toBe(false);
      }
    });
  });

  describe("is_voice_group_moderator", () => {
    it("is true only for the admin and the assigned gedu", async () => {
      for (const client of [adminAuth, gedu]) {
        const { data } = await client.rpc("is_voice_group_moderator", {
          p_group_id: GROUP_ID,
        });
        expect(data).toBe(true);
      }

      // A member is not a moderator: the enrolled gamer must not moderate.
      for (const client of [gamer, customer, customer2]) {
        const { data } = await client.rpc("is_voice_group_moderator", {
          p_group_id: GROUP_ID,
        });
        expect(data).toBe(false);
      }
    });
  });
});
