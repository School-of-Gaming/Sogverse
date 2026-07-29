import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import {
  joinWaitlistRpcResult,
  leaveWaitlistRpcResult,
  myWaitlistPositions,
} from "@/services/participations/participations.contracts";

/**
 * The parent/gamer side of the waitlist (migration 00131): the set-valued
 * position read behind the dashboard band, and the owner-authorized leave.
 *
 * Both are self-scoping — no role gate, every answer keyed to `auth.uid()` —
 * which makes *scope leakage* their failure mode rather than "wrong role got
 * in". This file is the scope test the authorization spine's check 5 requires
 * them to name, so the cases that matter most are the ones proving each
 * refuses to answer about, or act on, someone else's row.
 *
 * Product UUIDs 5f4, 5f5 (see the product-helpers allocation registry). The
 * muni products point at LOCATION_MUNICIPALITY to satisfy the online-muni
 * location constraints, and both seeded gamers (GAMER, GAMER_2) are children of
 * CUSTOMER — so CUSTOMER_2 is the "other family" throughout.
 *
 * Two products, not one: a position is per-product, and a single product can
 * only ever show a rank of 1 for a family with one child in line — which is
 * exactly the number that would still look right if the derivation were wrong.
 */

const PRODUCT_A = "00000000-0000-0000-0000-0000000005f4";
const PRODUCT_B = "00000000-0000-0000-0000-0000000005f5";
const FAR_FUTURE = "2099-12-31";

describe("waitlist — self-service positions + leave", () => {
  let admin: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let customer2: SupabaseClient<Database>;
  let gamer: SupabaseClient<Database>;
  let adminUser: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    customer2 = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );
    gamer = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
    adminUser = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );

    await deleteTestProducts(admin, [PRODUCT_A, PRODUCT_B]);
    for (const id of [PRODUCT_A, PRODUCT_B]) {
      await createTestProduct(admin, {
        id,
        productType: "municipality_club",
        billingMode: "external_contract",
        locationId: TEST_IDS.LOCATION_MUNICIPALITY,
        endDate: FAR_FUTURE,
        seatCount: 1,
        waitlistEnabled: true,
      });
    }
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [PRODUCT_A, PRODUCT_B]);
  });

  afterEach(async () => {
    await admin
      .from("participations")
      .delete()
      .in("product_id", [PRODUCT_A, PRODUCT_B]);
  });

  /** Puts one of CUSTOMER's gamers on a product's waitlist; returns the id. */
  async function joinWaitlist(
    productId: string,
    gamerId: string,
  ): Promise<string> {
    const res = await customer.rpc("join_product_waitlist", {
      p_product_id: productId,
      p_gamer_id: gamerId,
    });
    expect(res.error).toBeNull();
    return joinWaitlistRpcResult.parse(res.data).participation_id;
  }

  // -------------------------------------------------------------------------
  // get_my_waitlist_positions
  // -------------------------------------------------------------------------

  describe("get_my_waitlist_positions", () => {
    it("returns one 1-based position per waitlisted row, across products", async () => {
      const a = await joinWaitlist(PRODUCT_A, TEST_IDS.GAMER);
      const b = await joinWaitlist(PRODUCT_B, TEST_IDS.GAMER_2);

      const res = await customer.rpc("get_my_waitlist_positions");
      expect(res.error).toBeNull();

      const rows = myWaitlistPositions.parse(res.data);
      const byId = new Map(
        rows.map((r) => [r.participation_id, r.waitlist_position]),
      );
      // Each is alone on its own product's waitlist, so both are #1 — the
      // position is per-product, not a rank across the parent's whole list.
      expect(byId.get(a)).toBe(1);
      expect(byId.get(b)).toBe(1);
    });

    it("ranks by join order within a product and closes the gap when someone ahead leaves", async () => {
      const first = await joinWaitlist(PRODUCT_A, TEST_IDS.GAMER);
      const second = await joinWaitlist(PRODUCT_A, TEST_IDS.GAMER_2);

      const before = new Map(
        myWaitlistPositions
          .parse((await customer.rpc("get_my_waitlist_positions")).data)
          .map((r) => [r.participation_id, r.waitlist_position]),
      );
      expect(before.get(first)).toBe(1);
      expect(before.get(second)).toBe(2);

      // The position is recomputed live, not read from a stamped-at-join value.
      await customer.rpc("leave_my_waitlist_spot", {
        p_participation_id: first,
      });

      const after = myWaitlistPositions.parse(
        (await customer.rpc("get_my_waitlist_positions")).data,
      );
      expect(after).toHaveLength(1);
      expect(after[0].participation_id).toBe(second);
      expect(after[0].waitlist_position).toBe(1);
    });

    it("counts people ahead who belong to other families", async () => {
      // CUSTOMER_2's child joins first, so CUSTOMER's child is #2 — a rank the
      // caller's own RLS cannot see, which is why the function is DEFINER.
      const { data: other } = await admin
        .from("participations")
        .insert({
          product_id: PRODUCT_A,
          gamer_id: TEST_IDS.GAMER_2,
          customer_id: TEST_IDS.CUSTOMER_2,
          status: "waitlisted",
          waitlisted_at: new Date(Date.now() - 60_000).toISOString(),
        })
        .select("id")
        .single();
      const mine = await joinWaitlist(PRODUCT_A, TEST_IDS.GAMER);

      const rows = myWaitlistPositions.parse(
        (await customer.rpc("get_my_waitlist_positions")).data,
      );
      // Only the caller's own row comes back — the other family's is counted,
      // never returned.
      expect(rows).toHaveLength(1);
      expect(rows[0].participation_id).toBe(mine);
      expect(rows[0].waitlist_position).toBe(2);
      expect(rows.some((r) => r.participation_id === other!.id)).toBe(false);
    });

    it("answers the gamer about their own spot and nobody else's", async () => {
      const mine = await joinWaitlist(PRODUCT_A, TEST_IDS.GAMER);
      // A sibling's spot on another product: the parent sees it, the gamer
      // must not.
      const siblings = await joinWaitlist(PRODUCT_B, TEST_IDS.GAMER_2);

      const rows = myWaitlistPositions.parse(
        (await gamer.rpc("get_my_waitlist_positions")).data,
      );
      expect(rows.map((r) => r.participation_id)).toEqual([mine]);
      expect(rows.some((r) => r.participation_id === siblings)).toBe(false);

      // The purchasing parent sees both.
      const parentRows = myWaitlistPositions.parse(
        (await customer.rpc("get_my_waitlist_positions")).data,
      );
      expect(parentRows.map((r) => r.participation_id).sort()).toEqual(
        [mine, siblings].sort(),
      );
    });

    it("returns nothing for a signed-in stranger, and drops promoted rows", async () => {
      const mine = await joinWaitlist(PRODUCT_A, TEST_IDS.GAMER);

      expect(
        myWaitlistPositions.parse(
          (await customer2.rpc("get_my_waitlist_positions")).data,
        ),
      ).toEqual([]);

      // Only 'waitlisted' rows have a position; a promotion removes the card.
      await adminUser.rpc("promote_from_waitlist", {
        p_participation_id: mine,
      });
      expect(
        myWaitlistPositions.parse(
          (await customer.rpc("get_my_waitlist_positions")).data,
        ),
      ).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // leave_my_waitlist_spot
  // -------------------------------------------------------------------------

  describe("leave_my_waitlist_spot", () => {
    it("deletes the purchasing parent's own waitlisted row", async () => {
      const mine = await joinWaitlist(PRODUCT_A, TEST_IDS.GAMER);

      const res = await customer.rpc("leave_my_waitlist_spot", {
        p_participation_id: mine,
      });
      expect(res.error).toBeNull();
      const parsed = leaveWaitlistRpcResult.parse(res.data);
      expect(parsed.kind).toBe("left");

      const { data: row } = await admin
        .from("participations")
        .select("id")
        .eq("id", mine)
        .maybeSingle();
      expect(row).toBeNull();

      // The seat-count rollup follows the delete, so the queue behind them
      // really does get shorter.
      const { data: counts } = await admin
        .from("product_seat_counts")
        .select("waitlist_count")
        .eq("product_id", PRODUCT_A)
        .single();
      expect(counts?.waitlist_count).toBe(0);
    });

    it("refuses another family's row, and says so the same way it says 'no such row'", async () => {
      const mine = await joinWaitlist(PRODUCT_A, TEST_IDS.GAMER);

      const stranger = await customer2.rpc("leave_my_waitlist_spot", {
        p_participation_id: mine,
      });
      expect(stranger.error).toBeNull();
      expect(leaveWaitlistRpcResult.parse(stranger.data).kind).toBe(
        "not_found",
      );

      const nonexistent = await customer2.rpc("leave_my_waitlist_spot", {
        p_participation_id: "00000000-0000-0000-0000-0000000000ff",
      });
      // Identical answers: a prober learns nothing from which id they aim at.
      expect(leaveWaitlistRpcResult.parse(nonexistent.data).kind).toBe(
        "not_found",
      );

      const { data: row } = await admin
        .from("participations")
        .select("id")
        .eq("id", mine)
        .maybeSingle();
      expect(row?.id).toBe(mine);
    });

    it("refuses the gamer their own spot — it is the parent's to give up", async () => {
      const mine = await joinWaitlist(PRODUCT_A, TEST_IDS.GAMER);

      const res = await gamer.rpc("leave_my_waitlist_spot", {
        p_participation_id: mine,
      });
      expect(res.error).toBeNull();
      expect(leaveWaitlistRpcResult.parse(res.data).kind).toBe("not_found");

      const { data: row } = await admin
        .from("participations")
        .select("id")
        .eq("id", mine)
        .maybeSingle();
      expect(row?.id).toBe(mine);
    });

    it("noops on a row that has already been promoted, without deleting the seat", async () => {
      const mine = await joinWaitlist(PRODUCT_A, TEST_IDS.GAMER);
      await adminUser.rpc("promote_from_waitlist", {
        p_participation_id: mine,
      });

      const res = await customer.rpc("leave_my_waitlist_spot", {
        p_participation_id: mine,
      });
      expect(res.error).toBeNull();
      const parsed = leaveWaitlistRpcResult.parse(res.data);
      expect(parsed.kind).toBe("noop");
      if (parsed.kind === "noop") expect(parsed.status).toBe("active");

      // The seat the family now holds survives — the confirm dialog was about
      // a waitlist spot, not about cancelling an enrollment.
      const { data: row } = await admin
        .from("participations")
        .select("status")
        .eq("id", mine)
        .maybeSingle();
      expect(row?.status).toBe("active");
    });

    it("is idempotent — leaving twice reports not_found the second time", async () => {
      const mine = await joinWaitlist(PRODUCT_A, TEST_IDS.GAMER);

      expect(
        leaveWaitlistRpcResult.parse(
          (
            await customer.rpc("leave_my_waitlist_spot", {
              p_participation_id: mine,
            })
          ).data,
        ).kind,
      ).toBe("left");

      expect(
        leaveWaitlistRpcResult.parse(
          (
            await customer.rpc("leave_my_waitlist_spot", {
              p_participation_id: mine,
            })
          ).data,
        ).kind,
      ).toBe("not_found");
    });

    it("frees the (product, gamer) pair so the family can join the line again", async () => {
      const first = await joinWaitlist(PRODUCT_A, TEST_IDS.GAMER);
      await customer.rpc("leave_my_waitlist_spot", {
        p_participation_id: first,
      });

      // uq_participations_active_or_waitlisted covers only active/waitlisted
      // rows, so the delete really does clear the way — and the rejoin starts
      // at the back of whatever line exists, per the dialog's warning.
      const second = await joinWaitlist(PRODUCT_A, TEST_IDS.GAMER);
      expect(second).not.toBe(first);
    });
  });
});
