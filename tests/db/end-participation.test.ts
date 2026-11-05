import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";
import { TEST_IDS } from "./constants";
import {
  createTestProduct,
  deleteTestProducts,
  eraseParticipations,
} from "./product-helpers";
import { adminRemoveParticipationRpcResult } from "@/services/participations/participations.contracts";

/**
 * A seat ends instead of disappearing: end_participation, the delete guard that
 * keeps a held seat from being deleted outside an erasure, and the terminal
 * state an ended subscription row is held in.
 *
 * Own UUID suffix (…05c2, registered in product-helpers.ts) so rows never
 * collide with another db test file when CI runs the suite in parallel.
 */

const PRODUCT = "00000000-0000-0000-0000-0000000005c2";
const GROUP = "00000000-0000-0000-0000-0000000015c2";

describe("end_participation", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    await deleteTestProducts(admin, [PRODUCT]);
    await createTestProduct(admin, { id: PRODUCT, seatCount: 5 });
    const { error } = await admin
      .from("product_groups")
      .insert({ id: GROUP, product_id: PRODUCT, name: "Cohort End" });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [PRODUCT]);
  });

  afterEach(async () => {
    await eraseParticipations(admin, (q) => q.eq("product_id", PRODUCT));
  });

  async function seat(
    status: "active" | "waitlisted",
    participantId: string = TEST_IDS.GAMER,
  ): Promise<string> {
    const { data, error } = await admin
      .from("participations")
      .insert({
        product_id: PRODUCT,
        participant_id: participantId,
        customer_id: TEST_IDS.CUSTOMER,
        status,
        group_id: status === "active" ? GROUP : null,
        waitlisted_at: status === "waitlisted" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data!.id;
  }

  async function subscribe(participationId: string, subId: string) {
    const { error } = await admin.from("family_subscriptions").insert({
      customer_id: TEST_IDS.CUSTOMER,
      participation_id: participationId,
      stripe_subscription_id: subId,
      stripe_customer_id: "cus_end_test",
      stripe_price_id: "price_end_test",
      currency: "eur",
      status: "active",
    });
    expect(error).toBeNull();
  }

  async function readSeat(id: string) {
    const { data } = await admin
      .from("participations")
      .select("status, ended_at, end_reason, group_id, group_joined_at")
      .eq("id", id)
      .maybeSingle();
    return data;
  }

  async function readSub(subId: string) {
    const { data } = await admin
      .from("family_subscriptions")
      .select("status, ended_at")
      .eq("stripe_subscription_id", subId)
      .maybeSingle();
    return data;
  }

  function end(id: string, reason: "subscription_cancelled" | "admin_removed") {
    return admin.rpc("end_participation", {
      p_participation_id: id,
      p_reason: reason,
    });
  }

  it("ends a held seat, keeps the row and its group, and ends its subscription", async () => {
    const id = await seat("active");
    await subscribe(id, "sub_end_test_1");

    const { data, error } = await end(id, "subscription_cancelled");
    expect(error).toBeNull();
    expect(adminRemoveParticipationRpcResult.parse(data)).toEqual({
      kind: "cancelled",
      product_id: PRODUCT,
      previous_status: "active",
      stripe_subscription_id: "sub_end_test_1",
      reason: "subscription_cancelled",
    });

    const row = await readSeat(id);
    expect(row).toMatchObject({
      status: "ended",
      end_reason: "subscription_cancelled",
      group_id: GROUP,
    });
    expect(row?.ended_at).not.toBeNull();
    expect(row?.group_joined_at).not.toBeNull();

    const sub = await readSub("sub_end_test_1");
    expect(sub?.status).toBe("cancelled");
    expect(sub?.ended_at).not.toBeNull();
  });

  it("answers noop to an ended seat and to a missing one, writing nothing", async () => {
    const id = await seat("active");
    await end(id, "admin_removed");
    const before = await readSeat(id);

    const again = await end(id, "subscription_cancelled");
    expect(again.data).toEqual({ kind: "noop" });
    expect(await readSeat(id)).toEqual(before);

    const missing = await end(
      "00000000-0000-0000-0000-000000000ffe",
      "subscription_cancelled",
    );
    expect(missing.data).toEqual({ kind: "noop" });
  });

  it("deletes a waitlisted row, which never held a seat", async () => {
    const id = await seat("waitlisted");
    const { data, error } = await end(id, "admin_removed");
    expect(error).toBeNull();
    expect(data).toMatchObject({ kind: "cancelled", previous_status: "waitlisted" });
    expect(await readSeat(id)).toBeNull();
  });

  it("lets the participant take a seat on the product again once it has ended", async () => {
    const first = await seat("active");
    await end(first, "subscription_cancelled");
    const second = await seat("active");
    expect(second).not.toBe(first);
    expect((await readSeat(second))?.status).toBe("active");
  });

  it("refuses an ended status without when and why", async () => {
    const { error } = await admin.from("participations").insert({
      product_id: PRODUCT,
      participant_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "ended",
    });
    expect(error?.code).toBe("23514");
  });

  describe("the delete guard", () => {
    it("refuses to delete a held seat or an ended one", async () => {
      const held = await seat("active");
      const ended = await seat("active", TEST_IDS.GAMER_2);
      await end(ended, "admin_removed");

      for (const id of [held, ended]) {
        const { error } = await admin.from("participations").delete().eq("id", id);
        expect(error?.code).toBe("23001");
        expect(await readSeat(id)).not.toBeNull();
      }
    });

    it("refuses the cascade from a product delete too", async () => {
      await seat("active");
      const { error } = await admin.from("products").delete().eq("id", PRODUCT);
      expect(error?.code).toBe("23001");
    });

    it("lets a waitlisted row go", async () => {
      const id = await seat("waitlisted");
      const { error } = await admin.from("participations").delete().eq("id", id);
      expect(error).toBeNull();
      expect(await readSeat(id)).toBeNull();
    });

    it("lets an erasure delete anything, subscription and all", async () => {
      const id = await seat("active");
      await subscribe(id, "sub_end_test_erase");
      const { data, error } = await admin.rpc("erase_participations", {
        p_participation_ids: [id],
      });
      expect(error).toBeNull();
      expect(data).toBe(1);
      expect(await readSeat(id)).toBeNull();
      expect(await readSub("sub_end_test_erase")).toBeNull();
    });
  });

  describe("an ended subscription is terminal", () => {
    it("refuses moving it off cancelled", async () => {
      const id = await seat("active");
      await subscribe(id, "sub_end_test_terminal");
      await end(id, "subscription_cancelled");

      const { error } = await admin
        .from("family_subscriptions")
        .update({ status: "active" })
        .eq("stripe_subscription_id", "sub_end_test_terminal");
      expect(error?.code).toBe("55000");
      expect((await readSub("sub_end_test_terminal"))?.status).toBe("cancelled");
    });

    it("leaves a cancelled row whose seat is still held updatable", async () => {
      const id = await seat("active");
      await subscribe(id, "sub_end_test_dunning");
      await admin
        .from("family_subscriptions")
        .update({ status: "cancelled" })
        .eq("stripe_subscription_id", "sub_end_test_dunning");

      const { error } = await admin
        .from("family_subscriptions")
        .update({ status: "active" })
        .eq("stripe_subscription_id", "sub_end_test_dunning");
      expect(error).toBeNull();
      expect((await readSub("sub_end_test_dunning"))?.status).toBe("active");
    });
  });
});
