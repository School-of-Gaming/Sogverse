import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  geduAssignedProduct,
  myAssignedProductRows,
} from "@/services/assignments/assignments.contracts";
import { applyGroupChangesResult } from "@/services/groups/groups.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * Auth + return-shape coverage for `get_gedu_assigned_product` (migrations
 * 00064 / 00065 / 00066). The RPC is SECURITY DEFINER and hands back gamer
 * first names, dates of birth, gender, Minecraft identifiers, AND the
 * primary parent's email — so this file is the regression gate for "who can
 * call it" and, just as important, "whose roster they can see."
 *
 * The two guards being pinned (both raise 42501):
 *   1. role gate     — only `gedu` passes; admin/customer/gamer are refused
 *                      (admin is NOT trusted here — the body hard-requires
 *                      role = 'gedu').
 *   2. assignment gate — a gedu must have a gedu_group_assignments row on
 *                      the product. Wrong product / unknown product → 42501.
 *
 * The privacy invariant being pinned:
 *   - `roster` (names, DOB, gender, Minecraft, parent_email) is populated
 *     ONLY for the caller's own group. Every sister group comes back with
 *     `roster: null` even when it has active participants — a gedu can copy
 *     parent emails for the kids they teach, not for a peer's group.
 *
 * Layout:
 *   - PRODUCT_GEDU_ON: GEDU assigned to "Cohort A" (their own group) with
 *     GAMER participating; "Cohort B" is a sister group (no caller
 *     assignment) with GAMER_2 participating.
 *   - PRODUCT_GEDU_OFF: a product GEDU is NOT assigned to — exercises the
 *     assignment-gate 42501 path.
 */

const PRODUCT_GEDU_ON = "00000000-0000-0000-0000-0000000007d1";
const PRODUCT_GEDU_OFF = "00000000-0000-0000-0000-0000000007d2";
const ALL_PRODUCTS = [PRODUCT_GEDU_ON, PRODUCT_GEDU_OFF];

const NONEXISTENT_PRODUCT_ID = "00000000-0000-0000-0000-0000000007df";

const GAMER_MINECRAFT_USERNAME = "TestGamerMC";
const GAMER_MINECRAFT_UUID = "11111111-2222-3333-4444-555555555555";

describe("get_gedu_assigned_product", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  let myGroupId: string;
  let sisterGroupId: string;
  let parentEmail: string | null;

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
    gamerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);
    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, { id, seatCount: 50 });
    }

    // createTestProduct seeds only the products row. Give PRODUCT_GEDU_ON one
    // translation and one schedule slot so the RPCs' embedded jsonb arrays are
    // non-empty — that's what exercises the nested productTranslationSummary /
    // scheduleSlotSummary element schemas against real Postgres output. Both
    // cascade-delete with the product in afterAll.
    await admin.from("product_translations").insert({
      product_id: PRODUCT_GEDU_ON,
      locale: "en",
      name: "Gedu Cohort Club",
      short_description: "A club the assigned gedu teaches.",
    });
    await createScheduleSlot(admin, PRODUCT_GEDU_ON, {
      weekday: 2,
      startTime: "16:00",
      durationMinutes: 90,
    });

    // PRODUCT_GEDU_ON: Cohort A owned by GEDU, Cohort B a sister group with
    // no caller assignment.
    const created = await adminAuth.rpc("apply_group_changes", {
      p_product_id: PRODUCT_GEDU_ON,
      p_added_groups: [
        { tempId: "tA", name: "Cohort A", geduIds: [TEST_IDS.GEDU] },
        { tempId: "tB", name: "Cohort B", geduIds: [] },
      ],
    });
    const { tempMap } = applyGroupChangesResult.parse(created.data);
    myGroupId = tempMap.tA;
    sisterGroupId = tempMap.tB;

    // GAMER in the caller's own group; GAMER_2 in the sister group.
    await admin.from("participations").insert([
      {
        product_id: PRODUCT_GEDU_ON,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        group_id: myGroupId,
      },
      {
        product_id: PRODUCT_GEDU_ON,
        gamer_id: TEST_IDS.GAMER_2,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        group_id: sisterGroupId,
      },
    ]);

    // Give GAMER a verified Minecraft account (username + uuid) so the
    // roster's minecraft columns are exercised end-to-end.
    await admin.from("minecraft_accounts").upsert({
      user_id: TEST_IDS.GAMER,
      minecraft_username: GAMER_MINECRAFT_USERNAME,
      minecraft_uuid: GAMER_MINECRAFT_UUID,
    });

    // parent_email is resolved from the parent's profile, not hardcoded —
    // fetch the seed value so the assertion can't drift if seed email changes.
    const { data: parent } = await admin
      .from("profiles")
      .select("email")
      .eq("id", TEST_IDS.CUSTOMER)
      .single();
    parentEmail = parent?.email ?? null;
  });

  afterAll(async () => {
    await admin
      .from("participations")
      .delete()
      .in("product_id", ALL_PRODUCTS);
    await admin
      .from("minecraft_accounts")
      .delete()
      .eq("user_id", TEST_IDS.GAMER);
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  // ---------------------------------------------------------------------------
  // Role gate (first guard in the function body)
  // ---------------------------------------------------------------------------

  describe("role gate", () => {
    it("admin gets 42501 (only gedus pass the role check)", async () => {
      const { error } = await adminAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT_GEDU_ON,
      });
      expect(error?.code).toBe("42501");
    });

    it("customer gets 42501", async () => {
      const { error } = await customerAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT_GEDU_ON,
      });
      expect(error?.code).toBe("42501");
    });

    it("gamer gets 42501", async () => {
      const { error } = await gamerAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT_GEDU_ON,
      });
      expect(error?.code).toBe("42501");
    });
  });

  // ---------------------------------------------------------------------------
  // Assignment gate (second guard — same 42501 code, different reason).
  // The product FK on gedu_group_assignments means an unknown id has no
  // assignment row either, so the dedicated P0002 branch is unreachable for
  // legitimate callers; we still pin both shapes refuse access.
  // ---------------------------------------------------------------------------

  describe("assignment gate", () => {
    it("gedu calling for a product they aren't assigned to → 42501", async () => {
      const { error } = await geduAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT_GEDU_OFF,
      });
      expect(error?.code).toBe("42501");
    });

    it("gedu calling for a non-existent product → 42501 (no assignment row)", async () => {
      const { error } = await geduAuth.rpc("get_gedu_assigned_product", {
        p_product_id: NONEXISTENT_PRODUCT_ID,
      });
      expect(error?.code).toBe("42501");
    });
  });

  // ---------------------------------------------------------------------------
  // get_my_assigned_products contract — reuses this file's gedu/assignment
  // fixture (GEDU owns Cohort A in PRODUCT_GEDU_ON). The gedu dashboard calls
  // myAssignedProductRows.parse() on this RPC's output; parse real output
  // here so a schema/Postgres drift fails CI instead of throwing and blanking
  // the dashboard in production.
  // ---------------------------------------------------------------------------

  describe("get_my_assigned_products", () => {
    it("returns the caller's assigned product, parsed through the contract schema", async () => {
      const { data, error } = await geduAuth.rpc("get_my_assigned_products");
      expect(error).toBeNull();

      const rows = myAssignedProductRows.parse(data);
      const mine = rows.find((r) => r.product_id === PRODUCT_GEDU_ON);
      expect(mine).toBeDefined();
      // The caller owns exactly Cohort A on this product.
      expect(mine?.group_id).toBe(myGroupId);
      // Both groups exist on the product; one active gamer sits in each.
      expect(mine?.group_count).toBe(2);
      expect(mine?.gamer_count).toBe(2);
      expect(mine?.product_translations.length).toBeGreaterThan(0);
      expect(mine?.schedule_slots.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Happy path — the assigned gedu sees the product they teach
  // ---------------------------------------------------------------------------

  describe("assigned gedu", () => {
    it("returns the product shell, my_group_id, and every group", async () => {
      const { data, error } = await geduAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT_GEDU_ON,
      });

      expect(error).toBeNull();
      const result = geduAssignedProduct.parse(data);

      expect(result.product.id).toBe(PRODUCT_GEDU_ON);
      expect(result.my_group_id).toBe(myGroupId);
      expect(result.groups).toHaveLength(2);
    });

    it("populates the roster ONLY for the caller's own group", async () => {
      const { data } = await geduAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT_GEDU_ON,
      });
      const result = geduAssignedProduct.parse(data);

      const mine = result.groups.find((g) => g.id === myGroupId);
      const sister = result.groups.find((g) => g.id === sisterGroupId);

      // Own group: flagged, roster present with the one active gamer.
      expect(mine?.is_my_group).toBe(true);
      expect(mine?.gamer_count).toBe(1);
      expect(mine?.roster).toHaveLength(1);
      expect(mine?.gedus.map((g) => g.id)).toEqual([TEST_IDS.GEDU]);

      // Sister group: NOT flagged, roster withheld even though it has an
      // active participant. This is the privacy guarantee.
      expect(sister?.is_my_group).toBe(false);
      expect(sister?.gamer_count).toBe(1);
      expect(sister?.roster).toBeNull();
    });

    it("returns full roster detail (name, DOB, gender, Minecraft, parent email) for the own group", async () => {
      const { data } = await geduAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT_GEDU_ON,
      });
      const result = geduAssignedProduct.parse(data);
      const mine = result.groups.find((g) => g.id === myGroupId);
      const entry = mine?.roster?.[0];

      expect(entry?.gamer_id).toBe(TEST_IDS.GAMER);
      expect(entry?.first_name).toBe("Test");
      expect(entry?.date_of_birth).toBe("2015-06-15");
      expect(entry?.gender).toBe("boy");
      expect(entry?.minecraft_username).toBe(GAMER_MINECRAFT_USERNAME);
      expect(entry?.minecraft_uuid).toBe(GAMER_MINECRAFT_UUID);
      // parent_email comes from the parent's profile (the gamer's own
      // profile email is null), and is the primary (oldest) parent link.
      expect(entry?.parent_email).toBe(parentEmail);
      expect(entry?.parent_email).not.toBeNull();
    });

    it("excludes non-active participations from the roster and gamer_count", async () => {
      // Flip GAMER's own-group participation through every non-active status
      // and assert it disappears. Pins the `status = 'active'` filter shared
      // by the roster sub-aggregate and the gamer_count sub-select.
      //
      // CHECK constraints require companion columns: waitlisted needs a
      // waitlist_position, reserving needs a reserved_until. The admin
      // (service-role) client bypasses RLS but NOT CHECK constraints.
      const fixtures = [
        { status: "waitlisted" as const, extras: { waitlist_position: 1 } },
        {
          status: "reserving" as const,
          extras: {
            reserved_until: new Date(Date.now() + 60_000).toISOString(),
          },
        },
        { status: "completed" as const, extras: {} },
      ];

      for (const { status, extras } of fixtures) {
        const { error: updateErr } = await admin
          .from("participations")
          .update({ status, ...extras })
          .eq("product_id", PRODUCT_GEDU_ON)
          .eq("gamer_id", TEST_IDS.GAMER);
        expect(updateErr).toBeNull();

        const { data, error } = await geduAuth.rpc(
          "get_gedu_assigned_product",
          { p_product_id: PRODUCT_GEDU_ON },
        );
        expect(error).toBeNull();
        const result = geduAssignedProduct.parse(data);
        const mine = result.groups.find((g) => g.id === myGroupId);
        expect(mine?.roster).toEqual([]);
        expect(mine?.gamer_count).toBe(0);
      }

      await admin
        .from("participations")
        .update({ status: "active" })
        .eq("product_id", PRODUCT_GEDU_ON)
        .eq("gamer_id", TEST_IDS.GAMER);
    });
  });
});
