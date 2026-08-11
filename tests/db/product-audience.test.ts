import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { geduGroupFeed } from "@/services/gedu-sessions/gedu-sessions.contracts";
import { geduAssignedProduct } from "@/services/assignments/assignments.contracts";
import { productGroupsSnapshot } from "@/services/groups/groups.contracts";
import {
  callRpcRaw,
  createAdminTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * A product's AUDIENCE, and the seat a parent may take on their own account
 * (00173).
 *
 * Three things are settled here, and they fail in different ways:
 *
 *   1. **The CHECKs.** At least one audience, and an age range present exactly
 *      when there is a gamer audience. These are the guarantees the generated
 *      TypeScript cannot see — `min_age` reads as merely nullable there — so a
 *      test is the only thing that keeps "null iff no gamer audience" true.
 *   2. **The pre-money gates.** `create_participation`, `join_waitlist` (via
 *      its guarded wrapper) and `admin_enroll_gamer` all decide the same two
 *      questions: is this the payer's own seat, and does the product admit that
 *      audience. Each is asserted in BOTH directions, because a gate that
 *      refuses everything passes a one-sided test.
 *   3. **The after-money recorder is deliberately ungated.**
 *      `confirm_paid_participation` records a seat whatever the product's
 *      audience says. That is not an oversight to be tidied up later: an admin
 *      unticking a flag between checkout and webhook would otherwise make the
 *      webhook refuse forever, and the charge would already have happened. The
 *      test below pins the decision so nobody "fixes" it.
 *
 * Plus the roster shape: an adult seat carries the participant's own email and
 * no parent name; a child seat carries the parent's and no participant email.
 * Both are parsed through the same zod contracts the app parses with, which is
 * what makes this file the coverage those contract changes need.
 */

const PRODUCT_GAMERS = "00000000-0000-0000-0000-000000000610";
const PRODUCT_PARENTS = "00000000-0000-0000-0000-000000000611";
const PRODUCT_BOTH = "00000000-0000-0000-0000-000000000612";
const GROUP_ROSTER = "00000000-0000-0000-0000-000000000613";
const PRODUCT_ROSTER = "00000000-0000-0000-0000-000000000614";
const PRODUCT_AGE_PROBE = "00000000-0000-0000-0000-000000000615";

const ALL_PRODUCTS = [
  PRODUCT_GAMERS,
  PRODUCT_PARENTS,
  PRODUCT_BOTH,
  PRODUCT_ROSTER,
  PRODUCT_AGE_PROBE,
];

describe("product audience", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    geduAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);

    // FREE consumer clubs: the free branch of create_participation writes the
    // row immediately, so a gate's verdict is observable without Stripe, and
    // admin_enroll_gamer accepts them (it refuses only PAID consumer clubs,
    // whose seat needs a subscription it cannot create). No dates, so nothing
    // here depends on how effective_status reads a calendar.
    const common = {
      productType: "consumer_club" as const,
      billingMode: "free" as const,
      seatCount: null,
      waitlistEnabled: true,
    };

    await createTestProduct(admin, {
      ...common,
      id: PRODUCT_GAMERS,
      forGamers: true,
      forParents: false,
    });
    await createTestProduct(admin, {
      ...common,
      id: PRODUCT_PARENTS,
      forGamers: false,
      forParents: true,
    });
    await createTestProduct(admin, {
      ...common,
      id: PRODUCT_BOTH,
      forGamers: true,
      forParents: true,
    });
    await createTestProduct(admin, {
      ...common,
      id: PRODUCT_ROSTER,
      forGamers: true,
      forParents: true,
    });

    for (const id of ALL_PRODUCTS.filter((p) => p !== PRODUCT_AGE_PROBE)) {
      await admin.from("product_translations").insert({
        product_id: id,
        locale: "en",
        name: "Audience fixture",
        short_description: "Seeded by product-audience.test.ts",
      });
    }

    // The roster fixture: one adult seat and one child seat in the same group,
    // so the two row shapes are compared side by side rather than in isolation.
    await admin
      .from("product_groups")
      .insert({ id: GROUP_ROSTER, product_id: PRODUCT_ROSTER, name: "Mixed" });
    await admin.from("gedu_group_assignments").insert({
      group_id: GROUP_ROSTER,
      gedu_id: TEST_IDS.GEDU,
      product_id: PRODUCT_ROSTER,
    });
    await admin.from("participations").insert([
      {
        product_id: PRODUCT_ROSTER,
        group_id: GROUP_ROSTER,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
      // The self seat: participant IS the customer. Before 00173 this row could
      // not exist — chk_participations_no_self_signup forbade it — so its
      // presence here is also the proof that the CHECK is gone.
      {
        product_id: PRODUCT_ROSTER,
        group_id: GROUP_ROSTER,
        participant_id: TEST_IDS.CUSTOMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
    ]);
  });

  afterAll(async () => {
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  /** Everything except the roster fixture, which the roster block relies on. */
  beforeEach(async () => {
    await admin
      .from("participations")
      .delete()
      .in("product_id", [PRODUCT_GAMERS, PRODUCT_PARENTS, PRODUCT_BOTH]);
  });

  // -------------------------------------------------------------------------
  // The CHECKs
  // -------------------------------------------------------------------------

  describe("the audience and age constraints", () => {
    // Every case writes the same id, so each starts from "the row is not
    // there" rather than from whatever the previous case left behind.
    beforeEach(async () => {
      await deleteTestProducts(admin, [PRODUCT_AGE_PROBE]);
    });

    afterAll(async () => {
      await deleteTestProducts(admin, [PRODUCT_AGE_PROBE]);
    });

    /** A products row with everything but the audience/age columns decided. */
    function probeRow(fields: {
      for_gamers: boolean;
      for_parents: boolean;
      min_age: number | null;
      max_age: number | null;
    }) {
      return {
        id: PRODUCT_AGE_PROBE,
        product_type: "consumer_club" as const,
        billing_mode: "free" as const,
        topic: "minecraft_java" as const,
        status: "pending" as const,
        is_remote: true,
        is_visible: false,
        timezone: "UTC",
        spoken_language_code: "en",
        registration_opens_at: new Date().toISOString(),
        created_by: TEST_IDS.ADMIN,
        ...fields,
      };
    }

    it("refuses a product with no audience at all", async () => {
      const { error } = await admin.from("products").insert(
        probeRow({
          for_gamers: false,
          for_parents: false,
          min_age: null,
          max_age: null,
        }),
      );
      expect(error?.message).toMatch(/chk_products_has_an_audience/);
    });

    it("requires an age range when there is a gamer audience", async () => {
      const { error } = await admin.from("products").insert(
        probeRow({
          for_gamers: true,
          for_parents: false,
          min_age: null,
          max_age: null,
        }),
      );
      expect(error?.message).toMatch(/chk_products_ages_iff_for_gamers/);
    });

    it("refuses half an age range", async () => {
      const { error } = await admin.from("products").insert(
        probeRow({
          for_gamers: true,
          for_parents: false,
          min_age: 7,
          max_age: null,
        }),
      );
      expect(error?.message).toMatch(/chk_products_ages_iff_for_gamers/);
    });

    it("forbids an age range when there is no gamer audience", async () => {
      // The other direction, and the one that keeps "18+" out of the data: an
      // adults-only product says who it is for through its audience, never
      // through an age.
      const { error } = await admin.from("products").insert(
        probeRow({
          for_gamers: false,
          for_parents: true,
          min_age: 18,
          max_age: 99,
        }),
      );
      expect(error?.message).toMatch(/chk_products_ages_iff_for_gamers/);
    });

    it("accepts an adults-only product with no ages", async () => {
      // Without this the four refusals above would be satisfied by a CHECK that
      // rejects everything.
      const { error } = await admin.from("products").insert(
        probeRow({
          for_gamers: false,
          for_parents: true,
          min_age: null,
          max_age: null,
        }),
      );
      expect(error).toBeNull();
    });

    it("still refuses an inverted range on a gamer product", async () => {
      const { error } = await admin.from("products").insert(
        probeRow({
          for_gamers: true,
          for_parents: false,
          min_age: 12,
          max_age: 7,
        }),
      );
      expect(error?.message).toMatch(/chk_products_age_range/);
    });
  });

  // -------------------------------------------------------------------------
  // create_participation — the pre-money signup gate
  // -------------------------------------------------------------------------

  describe("create_participation", () => {
    /**
     * Service-role only, so the admin client is the caller — which is exactly
     * how the checkout route reaches it. There is no auth.uid() inside, so the
     * "self" invariant it can express is participant = p_customer_id, and the
     * route is what pins p_customer_id to the session user.
     */
    function signup(productId: string, participantId: string, customerId: string) {
      return admin.rpc("create_participation", {
        p_product_id: productId,
        p_participant_id: participantId,
        p_customer_id: customerId,
        p_purchase_shape: "free",
        p_currency: "eur",
      });
    }

    it("lets a parent take their own seat on a for-parents product", async () => {
      const { data, error } = await signup(
        PRODUCT_PARENTS,
        TEST_IDS.CUSTOMER,
        TEST_IDS.CUSTOMER,
      );
      expect(error).toBeNull();
      expect(data).toMatchObject({ kind: "free_active" });

      const { data: row } = await admin
        .from("participations")
        .select("participant_id, customer_id")
        .eq("product_id", PRODUCT_PARENTS)
        .single();
      expect(row?.participant_id).toBe(TEST_IDS.CUSTOMER);
      expect(row?.customer_id).toBe(TEST_IDS.CUSTOMER);
    });

    it("refuses a parent's own seat on a gamers-only product", async () => {
      const { error } = await signup(
        PRODUCT_GAMERS,
        TEST_IDS.CUSTOMER,
        TEST_IDS.CUSTOMER,
      );
      expect(error?.message).toMatch(/not open to parents/);
    });

    it("refuses a child's seat on a parents-only product", async () => {
      const { error } = await signup(
        PRODUCT_PARENTS,
        TEST_IDS.GAMER,
        TEST_IDS.CUSTOMER,
      );
      expect(error?.message).toMatch(/not open to gamers/);
    });

    it("refuses enrolling another adult, on any audience", async () => {
      // The parent-link requirement is what makes this impossible, and it is
      // unchanged by 00173 — an unlinked adult fails it exactly as an unlinked
      // child does. Asserted on the for-parents product, where the audience
      // itself would not have stopped them.
      const { error } = await signup(
        PRODUCT_PARENTS,
        TEST_IDS.CUSTOMER_2,
        TEST_IDS.CUSTOMER,
      );
      expect(error?.message).toMatch(/is not the parent of/);
    });

    it("still enrolls a child on a gamers-only product", async () => {
      const { data, error } = await signup(
        PRODUCT_GAMERS,
        TEST_IDS.GAMER,
        TEST_IDS.CUSTOMER,
      );
      expect(error).toBeNull();
      expect(data).toMatchObject({ kind: "free_active" });
    });

    it("takes both a parent and a child on a mixed-audience product", async () => {
      const parent = await signup(
        PRODUCT_BOTH,
        TEST_IDS.CUSTOMER,
        TEST_IDS.CUSTOMER,
      );
      const child = await signup(
        PRODUCT_BOTH,
        TEST_IDS.GAMER,
        TEST_IDS.CUSTOMER,
      );
      expect(parent.error).toBeNull();
      expect(child.error).toBeNull();

      // A parent seat consumes a seat like any other, so both rows are here.
      const { count } = await admin
        .from("participations")
        .select("id", { count: "exact", head: true })
        .eq("product_id", PRODUCT_BOTH);
      expect(count).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // join_waitlist, through its guarded wrapper
  // -------------------------------------------------------------------------

  describe("join_product_waitlist", () => {
    // The engine takes no auth.uid() and has no grants; the wrapper is what
    // pins the customer to the session, so a customer client is the only way
    // to exercise the self case as the product actually meets it.
    it("lets a parent queue for their own seat on a for-parents product", async () => {
      const { data, error } = await customerAuth.rpc("join_product_waitlist", {
        p_product_id: PRODUCT_PARENTS,
        p_participant_id: TEST_IDS.CUSTOMER,
      });
      expect(error).toBeNull();
      expect(data).toMatchObject({ status: "waitlisted", waitlist_position: 1 });

      const { data: row } = await admin
        .from("participations")
        .select("participant_id, customer_id, status")
        .eq("product_id", PRODUCT_PARENTS)
        .single();
      expect(row).toMatchObject({
        participant_id: TEST_IDS.CUSTOMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "waitlisted",
      });
    });

    it("refuses a parent's own queue spot on a gamers-only product", async () => {
      const { error } = await customerAuth.rpc("join_product_waitlist", {
        p_product_id: PRODUCT_GAMERS,
        p_participant_id: TEST_IDS.CUSTOMER,
      });
      expect(error?.message).toMatch(/not open to parents/);
    });

    it("refuses a child's queue spot on a parents-only product", async () => {
      const { error } = await customerAuth.rpc("join_product_waitlist", {
        p_product_id: PRODUCT_PARENTS,
        p_participant_id: TEST_IDS.GAMER,
      });
      expect(error?.message).toMatch(/not open to gamers/);
    });

    it("still queues a child on a gamers-only product", async () => {
      const { data, error } = await customerAuth.rpc("join_product_waitlist", {
        p_product_id: PRODUCT_GAMERS,
        p_participant_id: TEST_IDS.GAMER,
      });
      expect(error).toBeNull();
      expect(data).toMatchObject({ status: "waitlisted" });
    });
  });

  // -------------------------------------------------------------------------
  // NULL ids are nobody — the fail-closed operator, pinned
  // -------------------------------------------------------------------------

  describe("NULL participant/customer ids", () => {
    /**
     * The gates test "self" with plain `=`, chosen over IS NOT DISTINCT FROM
     * precisely so that a NULL id falls through to the parent-link arm and is
     * refused, instead of two NULLs reading as a self seat (00173 documents
     * the choice at the gate itself). These cases make that operator swap fail
     * loudly: under IS NOT DISTINCT FROM, both calls below would pass the
     * audience gate as "self seats" rather than raising the parent-link
     * refusal asserted here. Typed clients and the routes already forbid null
     * ids — the raw HTTP caller is the point: the DB gate is the last line,
     * and it must hold for a caller that skips all of them.
     */
    it("create_participation refuses NULL/NULL as nobody's seat", async () => {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is unset");
      const result = await callRpcRaw(serviceKey, "create_participation", {
        p_product_id: PRODUCT_PARENTS,
        p_participant_id: null,
        p_customer_id: null,
        p_purchase_shape: "free",
        p_currency: "eur",
      });
      expect(result.message).toMatch(/is not the parent of/);
    });

    it("join_product_waitlist refuses a NULL participant", async () => {
      const { data } = await customerAuth.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("customer session has no access token");
      const result = await callRpcRaw(token, "join_product_waitlist", {
        p_product_id: PRODUCT_PARENTS,
        p_participant_id: null,
      });
      expect(result.message).toMatch(/is not the parent of/);
    });
  });

  // -------------------------------------------------------------------------
  // admin_enroll_gamer — the comp-enrollment path
  // -------------------------------------------------------------------------

  describe("admin_enroll_gamer", () => {
    it("comp-enrolls an adult as their own customer on a for-parents product", async () => {
      // This RPC is told no customer — it derives one. For a `customer` profile
      // that derivation is "themselves", which is the whole self case.
      const { data, error } = await adminAuth.rpc("admin_enroll_gamer", {
        p_product_id: PRODUCT_PARENTS,
        p_participant_id: TEST_IDS.CUSTOMER_2,
      });
      expect(error).toBeNull();
      expect(data).toMatchObject({ customer_id: TEST_IDS.CUSTOMER_2 });
    });

    it("refuses an adult on a gamers-only product", async () => {
      const { error } = await adminAuth.rpc("admin_enroll_gamer", {
        p_product_id: PRODUCT_GAMERS,
        p_participant_id: TEST_IDS.CUSTOMER_2,
      });
      expect(error?.message).toMatch(/not open to parents/);
    });

    it("refuses a child on a parents-only product", async () => {
      const { error } = await adminAuth.rpc("admin_enroll_gamer", {
        p_product_id: PRODUCT_PARENTS,
        p_participant_id: TEST_IDS.GAMER,
      });
      expect(error?.message).toMatch(/not open to gamers/);
    });

    it("still resolves a child's customer through the parent link", async () => {
      const { data, error } = await adminAuth.rpc("admin_enroll_gamer", {
        p_product_id: PRODUCT_GAMERS,
        p_participant_id: TEST_IDS.GAMER,
      });
      expect(error).toBeNull();
      expect(data).toMatchObject({ customer_id: TEST_IDS.CUSTOMER });
    });
  });

  // -------------------------------------------------------------------------
  // confirm_paid_participation — deliberately ungated
  // -------------------------------------------------------------------------

  describe("confirm_paid_participation", () => {
    it("records a parent's own seat on a GAMERS-ONLY product, with no audience check", async () => {
      // Not a bug, and not an oversight to be fixed by a later change. This is
      // the after-money recorder: it is reached only through the
      // signature-verified Stripe webhook, with metadata our own server wrote
      // after create_participation had already validated the same tuple. An
      // audience gate here would defend against no attacker and would create a
      // charged-without-seat failure the moment an admin edited a flag mid-
      // checkout. The refusal belongs before the money, and it is asserted
      // above; this test exists so nobody adds a second one after it.
      const { data, error } = await admin.rpc("confirm_paid_participation", {
        p_product_id: PRODUCT_GAMERS,
        p_participant_id: TEST_IDS.CUSTOMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_checkout_session_id: "cs_test_audience_00173",
      });
      expect(error).toBeNull();
      expect(data).toMatchObject({ kind: "confirmed", idempotent: false });

      const { data: row } = await admin
        .from("participations")
        .select("participant_id, customer_id, status")
        .eq("product_id", PRODUCT_GAMERS)
        .single();
      expect(row).toMatchObject({
        participant_id: TEST_IDS.CUSTOMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      });
    });
  });

  // -------------------------------------------------------------------------
  // The roster RPCs' contact fields
  // -------------------------------------------------------------------------

  describe("roster contact fields", () => {
    it("gives the gedu feed an own-email for the adult and a parent email for the child", async () => {
      const { data, error } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_ROSTER,
      });
      expect(error).toBeNull();

      const feed = geduGroupFeed.parse(data);
      const adult = feed.roster.find((r) => r.gamer_id === TEST_IDS.CUSTOMER);
      const child = feed.roster.find((r) => r.gamer_id === TEST_IDS.GAMER);

      expect(adult?.participant_email).toBe(TEST_CREDENTIALS.CUSTOMER.email);
      // A gamer's own profile email is the synthetic
      // @gamer.sogverse.internal handle, which is why the field is emitted for
      // adults only rather than for "the participant, whoever they are".
      expect(child?.participant_email).toBeNull();
      expect(child?.parent_email).toBe(TEST_CREDENTIALS.CUSTOMER.email);
    });

    it("carries the same field on the assigned-product roster", async () => {
      const { data, error } = await geduAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT_ROSTER,
      });
      expect(error).toBeNull();

      const result = geduAssignedProduct.parse(data);
      const mine = result.groups.find((g) => g.id === GROUP_ROSTER);
      const adult = mine?.roster?.find((r) => r.gamer_id === TEST_IDS.CUSTOMER);
      const child = mine?.roster?.find((r) => r.gamer_id === TEST_IDS.GAMER);

      expect(adult?.participant_email).toBe(TEST_CREDENTIALS.CUSTOMER.email);
      expect(child?.participant_email).toBeNull();
    });

    it("gives the admin groups snapshot an email where a child row has a parent name", async () => {
      const { data, error } = await adminAuth.rpc(
        "get_product_groups_with_details",
        { p_product_id: PRODUCT_ROSTER },
      );
      expect(error).toBeNull();

      const snapshot = productGroupsSnapshot.parse(data);
      const group = snapshot.groups.find((g) => g.id === GROUP_ROSTER);
      const adult = group?.participations.find(
        (p) => p.gamer_id === TEST_IDS.CUSTOMER,
      );
      const child = group?.participations.find(
        (p) => p.gamer_id === TEST_IDS.GAMER,
      );

      // An adult has no linked parent, so the two name fields are empty and the
      // email is the only contact the chip can show. The child row is the exact
      // mirror.
      expect(adult?.participant_email).toBe(TEST_CREDENTIALS.CUSTOMER.email);
      expect(adult?.gamer_parent_first_name).toBeNull();
      expect(child?.participant_email).toBeNull();
      expect(child?.gamer_parent_first_name).not.toBeNull();
    });
  });
});
