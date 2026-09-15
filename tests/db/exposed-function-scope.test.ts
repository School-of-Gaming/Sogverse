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
 * Product UUIDs 5a1, 5a2, 5aa and 5af (see the product-helpers allocation
 * registry).
 */

/**
 * A term that ended long ago, in the helper's default UTC zone, so "this
 * product has ended" is true wherever and whenever this suite runs. Since the
 * 2026-09-15 ruling that is a fact about the product and not about who may read
 * it — every product stays readable by direct link forever — so the fixture is
 * here to prove exactly that, rather than to close anything.
 */
const FINISHED_END = "2020-01-31";

/** Published + listed: readable by the whole world, including anon. */
const PUBLIC_PRODUCT = "00000000-0000-0000-0000-0000000005a1";
/**
 * Long finished, unlisted, and carrying the group fixtures — the enrolled
 * gamer, the purchasing parent and the assigned gedu all hang off it. It used
 * to be this file's *unreadable* product, sitting on the two axes once thought
 * to close a read; neither closes one, so what it is now is the product the
 * party-to predicates are asserted on, and the ended product `can_read_product`
 * still answers true for.
 */
const ENROLLED_PRODUCT = "00000000-0000-0000-0000-0000000005a2";
const GROUP_ID = "00000000-0000-0000-0000-0000000005a3";
/**
 * Published but NOT listed: the shape 00168 exists for. Nobody is a party to
 * it, so nothing but the product's own existence can answer for it.
 */
const UNLISTED_PRODUCT = "00000000-0000-0000-0000-0000000005aa";
/**
 * An id no product has — the only input `can_read_product` still answers
 * `false` for. Allocated in this file's own sub-range (see the product-helpers
 * registry) so no other suite can create a product underneath it.
 */
const NO_SUCH_PRODUCT = "00000000-0000-0000-0000-0000000005af";

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

    await deleteTestProducts(admin, [
      PUBLIC_PRODUCT,
      ENROLLED_PRODUCT,
      UNLISTED_PRODUCT,
    ]);

    await createTestProduct(admin, {
      id: PUBLIC_PRODUCT,
      isVisible: true,
      seatCount: null,
    });
    await createTestProduct(admin, {
      id: ENROLLED_PRODUCT,
      endDate: FINISHED_END,
      isVisible: false,
      seatCount: null,
    });
    await createTestProduct(admin, {
      id: UNLISTED_PRODUCT,
      isVisible: false,
      seatCount: null,
    });
    // A direct link needs more than the products row: the name and the price
    // live in satellite tables whose SELECT policies are this same predicate.
    // Seed one of each so the assertion can prove they follow it.
    const unlistedTranslation = await admin
      .from("product_translations")
      .insert({
        product_id: UNLISTED_PRODUCT,
        locale: "en",
        name: "Unlisted by design",
        short_description: "Reachable by direct link, absent from the shop.",
      });
    if (unlistedTranslation.error) throw unlistedTranslation.error;
    const unlistedPrice = await admin.from("product_prices").insert({
      product_id: UNLISTED_PRODUCT,
      currency: "eur",
      price_cents: 1000,
    });
    if (unlistedPrice.error) throw unlistedPrice.error;

    await admin
      .from("product_groups")
      .insert({ id: GROUP_ID, product_id: ENROLLED_PRODUCT, name: "Scope" });
    await admin.from("gedu_group_assignments").insert({
      group_id: GROUP_ID,
      gedu_id: TEST_IDS.GEDU,
      product_id: ENROLLED_PRODUCT,
    });
    await admin.from("participations").insert({
      product_id: ENROLLED_PRODUCT,
      group_id: GROUP_ID,
      participant_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
    });
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [
      PUBLIC_PRODUCT,
      ENROLLED_PRODUCT,
      UNLISTED_PRODUCT,
    ]);
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

  /**
   * The owner's 2026-09-15 ruling, stated as a test: every product that exists
   * is readable by everybody, and the only `false` the predicate has left is
   * for an id no product has. Listing is decided by `is_visible` and the browse
   * queries; buying is decided by the term dates, the seat cap and the
   * registration window. Neither is this predicate's business.
   *
   * **Three assertions were deleted here when the ruling landed**, each of them
   * a claim that some caller could NOT read a product: an ended product
   * answering `false` for an unrelated customer, the same for anon, and the
   * products row failing to arrive for anon. No caller is refused any more, so
   * there was nothing left for them to prove. What stands in their place is the
   * positive form — every caller gets the identical answer — which is also what
   * keeps this a scope test worth the name: a predicate that answers every
   * caller the same has no scope to leak.
   */
  describe("can_read_product", () => {
    it("is true for every caller on a product that exists, listed or not, ended or not", async () => {
      for (const product of [
        PUBLIC_PRODUCT,
        UNLISTED_PRODUCT,
        ENROLLED_PRODUCT,
      ]) {
        for (const client of [
          anon,
          customer,
          customer2,
          gamer,
          gedu,
          adminAuth,
        ]) {
          const { data } = await client.rpc("can_read_product", {
            p_product_id: product,
          });
          expect(data).toBe(true);
        }
      }
    });

    it("is false for every caller on an id no product has", async () => {
      // Non-vacuity: the id really is absent, read with RLS bypassed. A `false`
      // from a product that quietly exists would prove the opposite of this.
      const absent = await admin
        .from("products")
        .select("id")
        .eq("id", NO_SUCH_PRODUCT);
      expect(absent.data).toEqual([]);

      for (const client of [anon, customer, customer2, gamer, gedu, adminAuth]) {
        const { data } = await client.rpc("can_read_product", {
          p_product_id: NO_SUCH_PRODUCT,
        });
        // A plain `false`, not NULL. anon has no profiles row, and the
        // predicate is wrapped in COALESCE so it answers a total boolean for a
        // caller who has none — a predicate that can answer NULL is a trap for
        // the next consumer, which may not be a policy's USING clause.
        expect(data).toBe(false);
      }
    });

    it("carries the row and its satellites to a stranger, unlisted or ended", async () => {
      // This is the read a parent following last spring's link actually makes,
      // and the one a link-preview crawler makes with no session at all. The
      // products row alone is not enough: the name and the price live in
      // satellite tables whose SELECT policies are this same predicate, and
      // without them a direct link lands on a page with no content and a
      // preview card falls back to the site default.
      const unlisted = await anon
        .from("products")
        .select(
          "id, is_visible, product_translations(locale), product_prices(currency)",
        )
        .eq("id", UNLISTED_PRODUCT)
        .maybeSingle();
      expect(unlisted.error).toBeNull();
      expect(unlisted.data?.id).toBe(UNLISTED_PRODUCT);
      // Non-vacuity: the row really is the unlisted one.
      expect(unlisted.data?.is_visible).toBe(false);
      expect(unlisted.data?.product_translations.length).toBeGreaterThan(0);
      expect(unlisted.data?.product_prices.length).toBeGreaterThan(0);

      const ended = await anon
        .from("products")
        .select("id, end_date")
        .eq("id", ENROLLED_PRODUCT)
        .maybeSingle();
      expect(ended.error).toBeNull();
      expect(ended.data?.id).toBe(ENROLLED_PRODUCT);
      // Non-vacuity again: the term really has ended, years ago.
      expect(ended.data?.end_date).toBe(FINISHED_END);
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
          p_product_id: ENROLLED_PRODUCT,
        });
        expect(data).toBe(true);
      }

      // The assigned gedu and the admin are not *parties* — they reach the
      // product by other routes entirely, which is precisely why this predicate
      // is not the same question as can_read_product (which now answers true
      // for all three of them, and for everybody else).
      for (const client of [customer2, gedu, adminAuth]) {
        const { data } = await client.rpc("has_active_participation_on_product", {
          p_product_id: ENROLLED_PRODUCT,
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
