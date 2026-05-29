import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createV2TestProduct, deleteV2TestProducts } from "./v2-helpers";

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
 *   2. assignment gate — a gedu must have a gedu_group_assignments_v2 row on
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

interface AssignedProductResult {
  product: {
    id: string;
    product_type: string;
    is_remote: boolean;
    translations: Array<{ locale: string; name: string; description: string }>;
    schedule_slots: Array<unknown>;
  };
  my_group_id: string;
  groups: Array<{
    id: string;
    name: string;
    is_my_group: boolean;
    gamer_count: number;
    gedus: Array<{ id: string; first_name: string }>;
    roster:
      | Array<{
          gamer_id: string;
          first_name: string;
          date_of_birth: string | null;
          gender: string | null;
          minecraft_username: string | null;
          minecraft_uuid: string | null;
          parent_email: string | null;
        }>
      | null;
  }>;
}

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

    await deleteV2TestProducts(admin, ALL_PRODUCTS);
    for (const id of ALL_PRODUCTS) {
      await createV2TestProduct(admin, { id, seatCount: 50 });
    }

    // PRODUCT_GEDU_ON: Cohort A owned by GEDU, Cohort B a sister group with
    // no caller assignment.
    const created = await adminAuth.rpc("commit_group_changes_v2", {
      p_product_id: PRODUCT_GEDU_ON,
      p_added_groups: [
        { tempId: "tA", name: "Cohort A", geduIds: [TEST_IDS.GEDU] },
        { tempId: "tB", name: "Cohort B", geduIds: [] },
      ],
    });
    const tempMap = (created.data as { tempMap: Record<string, string> })
      .tempMap;
    myGroupId = tempMap.tA;
    sisterGroupId = tempMap.tB;

    // GAMER in the caller's own group; GAMER_2 in the sister group.
    await admin.from("participations_v2").insert([
      {
        product_id: PRODUCT_GEDU_ON,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        group_id: myGroupId,
        credits_remaining: 1,
      },
      {
        product_id: PRODUCT_GEDU_ON,
        gamer_id: TEST_IDS.GAMER_2,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        group_id: sisterGroupId,
        credits_remaining: 1,
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
      .from("participations_v2")
      .delete()
      .in("product_id", ALL_PRODUCTS);
    await admin
      .from("minecraft_accounts")
      .delete()
      .eq("user_id", TEST_IDS.GAMER);
    await deleteV2TestProducts(admin, ALL_PRODUCTS);
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
  // The product FK on gedu_group_assignments_v2 means an unknown id has no
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
  // Happy path — the assigned gedu sees the product they teach
  // ---------------------------------------------------------------------------

  describe("assigned gedu", () => {
    it("returns the product shell, my_group_id, and every group", async () => {
      const { data, error } = await geduAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT_GEDU_ON,
      });

      expect(error).toBeNull();
      const result = data as unknown as AssignedProductResult;

      expect(result.product.id).toBe(PRODUCT_GEDU_ON);
      expect(result.my_group_id).toBe(myGroupId);
      expect(result.groups).toHaveLength(2);
    });

    it("populates the roster ONLY for the caller's own group", async () => {
      const { data } = await geduAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT_GEDU_ON,
      });
      const result = data as unknown as AssignedProductResult;

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
      const result = data as unknown as AssignedProductResult;
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
          .from("participations_v2")
          .update({ status, ...extras })
          .eq("product_id", PRODUCT_GEDU_ON)
          .eq("gamer_id", TEST_IDS.GAMER);
        expect(updateErr).toBeNull();

        const { data, error } = await geduAuth.rpc(
          "get_gedu_assigned_product",
          { p_product_id: PRODUCT_GEDU_ON },
        );
        expect(error).toBeNull();
        const result = data as unknown as AssignedProductResult;
        const mine = result.groups.find((g) => g.id === myGroupId);
        expect(mine?.roster).toEqual([]);
        expect(mine?.gamer_count).toBe(0);
      }

      await admin
        .from("participations_v2")
        .update({ status: "active" })
        .eq("product_id", PRODUCT_GEDU_ON)
        .eq("gamer_id", TEST_IDS.GAMER);
    });
  });
});
