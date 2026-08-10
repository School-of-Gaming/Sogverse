import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import {
  adminEnrollGamerRpcResult,
  adminRemoveParticipationRpcResult,
} from "@/services/participations/participations.contracts";

/**
 * `admin_enroll_gamer` / `admin_remove_participation` — the two RPCs Phase 3 of
 * the DB authorization refactor wrote so the admin comp-enroll and un-enroll
 * routes could stop holding the service-role client.
 *
 * The role gate itself is covered fixture-free by the spine's role × RPC matrix.
 * What needs fixtures — and therefore lives here — is everything the routes used
 * to enforce in TypeScript and now enforce in SQL: the product-membership check
 * that stops a participation id from another product being cancelled through the
 * wrong URL, the parent resolution, and the two refusals migration 00166
 * re-keyed off the product type — enrollment refuses a *paid* consumer club
 * (the one seat that needs a subscription this RPC cannot create), and removal
 * refuses only a live subscription, so a CASCADE can never orphan one that
 * keeps billing.
 *
 * The results are parsed through the contracts schemas the routes parse with, so
 * a shape change fails here rather than at runtime.
 *
 * Product UUIDs 5c8-5ca (see the product-helpers allocation registry).
 */

const CAMP = "00000000-0000-0000-0000-0000000005c8";
const CLUB = "00000000-0000-0000-0000-0000000005c9";
const FREE_CLUB = "00000000-0000-0000-0000-0000000005ca";

describe("admin participation RPCs", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;

  async function clearParticipations() {
    await admin
      .from("participations")
      .delete()
      .in("product_id", [CAMP, CLUB, FREE_CLUB]);
  }

  /** The participation id for a gamer on a product, read past RLS. */
  async function participationOn(
    productId: string,
    gamerId: string,
  ): Promise<string | null> {
    const { data } = await admin
      .from("participations")
      .select("id")
      .eq("product_id", productId)
      .eq("gamer_id", gamerId)
      .maybeSingle();
    return data?.id ?? null;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );

    await deleteTestProducts(admin, [CAMP, CLUB, FREE_CLUB]);
    await createTestProduct(admin, {
      id: CAMP,
      productType: "camp",
      seatCount: null,
      startDate: "2099-06-01",
      endDate: "2099-06-05",
    });
    await createTestProduct(admin, {
      id: CLUB,
      productType: "consumer_club",
      seatCount: null,
    });
    // The shape 00166 unlocked: a consumer club billed free. It has no
    // subscription behind any seat, so neither RPC has anything to protect.
    await createTestProduct(admin, {
      id: FREE_CLUB,
      productType: "consumer_club",
      billingMode: "free",
      seatCount: null,
    });
  });

  beforeEach(clearParticipations);
  afterAll(async () => {
    await deleteTestProducts(admin, [CAMP, CLUB, FREE_CLUB]);
  });

  describe("admin_enroll_gamer", () => {
    it("enrolls the gamer as active and resolves the customer from the parent link", async () => {
      const { data, error } = await adminAuth.rpc("admin_enroll_gamer", {
        p_product_id: CAMP,
        p_gamer_id: TEST_IDS.GAMER,
      });

      expect(error).toBeNull();
      const parsed = adminEnrollGamerRpcResult.parse(data);
      expect(parsed.customer_id).toBe(TEST_IDS.CUSTOMER);

      const { data: row } = await admin
        .from("participations")
        .select("status, customer_id, gamer_id, product_id")
        .eq("id", parsed.participation_id)
        .single();

      expect(row).toEqual({
        status: "active",
        customer_id: TEST_IDS.CUSTOMER,
        gamer_id: TEST_IDS.GAMER,
        product_id: CAMP,
      });
    });

    it("refuses a PAID consumer club — the seat there needs a subscription", async () => {
      // The refusal is the pair (consumer_club, paid), not the type: that is
      // the only combination whose seat cannot exist without a Stripe
      // subscription, and comp-enrollment has no way to create one.
      const { error } = await adminAuth.rpc("admin_enroll_gamer", {
        p_product_id: CLUB,
        p_gamer_id: TEST_IDS.GAMER,
      });

      expect(error?.code).toBe("23514");
      expect(await participationOn(CLUB, TEST_IDS.GAMER)).toBeNull();
    });

    it("enrolls onto a FREE consumer club, exactly like a free camp or event", async () => {
      // The other half of the same rule. Before 00166 the type alone refused
      // this, which would have made comp-enrollment impossible on a whole
      // product shape for no reason a free event does not share.
      const { data, error } = await adminAuth.rpc("admin_enroll_gamer", {
        p_product_id: FREE_CLUB,
        p_gamer_id: TEST_IDS.GAMER,
      });

      expect(error).toBeNull();
      const parsed = adminEnrollGamerRpcResult.parse(data);
      expect(parsed.customer_id).toBe(TEST_IDS.CUSTOMER);

      const { data: row } = await admin
        .from("participations")
        .select("status, product_id")
        .eq("id", parsed.participation_id)
        .single();
      expect(row).toEqual({ status: "active", product_id: FREE_CLUB });
    });

    it("refuses an unknown product", async () => {
      const { error } = await adminAuth.rpc("admin_enroll_gamer", {
        p_product_id: "00000000-0000-0000-0000-00000000dead",
        p_gamer_id: TEST_IDS.GAMER,
      });

      expect(error?.code).toBe("P0002");
    });

    it("refuses a gamer with no linked parent", async () => {
      // The admin account has no parent_gamer row, which is the same shape as an
      // orphaned gamer: there is no customer to attribute the seat to.
      const { error } = await adminAuth.rpc("admin_enroll_gamer", {
        p_product_id: CAMP,
        p_gamer_id: TEST_IDS.ADMIN,
      });

      expect(error?.code).toBe("23514");
    });

    it("refuses a second enrollment of the same gamer", async () => {
      await adminAuth.rpc("admin_enroll_gamer", {
        p_product_id: CAMP,
        p_gamer_id: TEST_IDS.GAMER,
      });

      const { error } = await adminAuth.rpc("admin_enroll_gamer", {
        p_product_id: CAMP,
        p_gamer_id: TEST_IDS.GAMER,
      });

      // The partial unique index is the source of truth, not a re-check in the
      // body — so the refusal is a constraint violation, and it is race-free.
      expect(error?.code).toBe("23505");
    });
  });

  describe("admin_remove_participation", () => {
    async function seatTheGamer(): Promise<string> {
      const { data } = await adminAuth.rpc("admin_enroll_gamer", {
        p_product_id: CAMP,
        p_gamer_id: TEST_IDS.GAMER,
      });
      return adminEnrollGamerRpcResult.parse(data).participation_id;
    }

    it("cancels the participation and reports what it removed", async () => {
      const participationId = await seatTheGamer();

      const { data, error } = await adminAuth.rpc(
        "admin_remove_participation",
        { p_product_id: CAMP, p_participation_id: participationId },
      );

      expect(error).toBeNull();
      const parsed = adminRemoveParticipationRpcResult.parse(data);
      expect(parsed.kind).toBe("cancelled");
      if (parsed.kind === "cancelled") {
        expect(parsed.product_id).toBe(CAMP);
        expect(parsed.previous_status).toBe("active");
        expect(parsed.reason).toBe("admin_cancelled");
      }

      expect(await participationOn(CAMP, TEST_IDS.GAMER)).toBeNull();
    });

    it("refuses a participation that is not on the named product", async () => {
      const participationId = await seatTheGamer();

      // The whole reason the product id is a parameter: without the pair check,
      // this call would cancel a participation belonging to another product.
      const { error } = await adminAuth.rpc("admin_remove_participation", {
        p_product_id: CLUB,
        p_participation_id: participationId,
      });

      expect(error?.code).toBe("P0002");
      expect(await participationOn(CAMP, TEST_IDS.GAMER)).toBe(participationId);
    });

    it("refuses an unknown participation", async () => {
      const { error } = await adminAuth.rpc("admin_remove_participation", {
        p_product_id: CAMP,
        p_participation_id: "00000000-0000-0000-0000-00000000dead",
      });

      expect(error?.code).toBe("P0002");
    });

    it("removes a participation from a free consumer club", async () => {
      // This is why the type refusal had to go: a free enrollment has no
      // parent-facing cancel — there is no subscription to cancel — so admin
      // removal is the only exit, and a hard-capped free club could otherwise
      // never free a seat.
      const { data } = await adminAuth.rpc("admin_enroll_gamer", {
        p_product_id: FREE_CLUB,
        p_gamer_id: TEST_IDS.GAMER,
      });
      const participationId =
        adminEnrollGamerRpcResult.parse(data).participation_id;

      const { error } = await adminAuth.rpc("admin_remove_participation", {
        p_product_id: FREE_CLUB,
        p_participation_id: participationId,
      });

      expect(error).toBeNull();
      expect(await participationOn(FREE_CLUB, TEST_IDS.GAMER)).toBeNull();
    });

    it("refuses a participation with a live Stripe subscription", async () => {
      // Since 00166 this is the ONLY thing standing between an admin and a
      // cancellation, on every product type — the consumer-club check that used
      // to shadow it is gone. The failure mode it prevents is a subscription
      // that keeps billing with no DB row behind it.
      const participationId = await seatTheGamer();
      await admin.from("family_subscriptions").insert({
        participation_id: participationId,
        customer_id: TEST_IDS.CUSTOMER,
        stripe_subscription_id: "sub_admin_rpc_test",
        stripe_customer_id: "cus_admin_rpc_test",
        currency: "eur",
        status: "active",
      });

      const { error } = await adminAuth.rpc("admin_remove_participation", {
        p_product_id: CAMP,
        p_participation_id: participationId,
      });

      expect(error?.code).toBe("55000");
      expect(await participationOn(CAMP, TEST_IDS.GAMER)).toBe(participationId);

      await admin
        .from("family_subscriptions")
        .delete()
        .eq("participation_id", participationId);
    });
  });
});
