import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmBookingRpcResult } from "@/services/participations/participations.contracts";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import {
  createTestProduct,
  deleteTestProducts,
  eraseParticipations,
  payForBooking,
} from "./product-helpers";

/**
 * A payment names the seat and the product it paid for in columns of its own,
 * and outlives the seat; the webhook's "event finished" mark lives in its own
 * table, which only the service role reaches.
 */
describe("payments stand on their own", () => {
  const admin = createAdminTestClient();
  const RUN = crypto.randomUUID().slice(0, 8);
  let productId = "";
  let participationId = "";
  const paymentIds: string[] = [];
  const eventIds: string[] = [];

  beforeAll(async () => {
    productId = await createTestProduct(admin);
    const paid = await payForBooking(
      admin,
      productId,
      TEST_IDS.GAMER,
      TEST_IDS.CUSTOMER,
      `cs_payments_${RUN}`,
    );
    const confirmed = confirmBookingRpcResult.parse(paid.data);
    if (confirmed.kind !== "settled" || confirmed.participation_id === null) {
      throw new Error("the fixture seat was not created");
    }
    participationId = confirmed.participation_id;
  });

  afterAll(async () => {
    if (paymentIds.length > 0) {
      await admin.from("payments").delete().in("id", paymentIds);
    }
    if (eventIds.length > 0) {
      await admin
        .from("stripe_processed_events")
        .delete()
        .in("stripe_event_id", eventIds);
    }
    await deleteTestProducts(admin, [productId]);
  });

  async function insertPayment() {
    const { data, error } = await admin
      .from("payments")
      .insert({
        customer_id: TEST_IDS.CUSTOMER,
        amount_cents: 4900,
        currency: "eur",
        purpose: "subscription_invoice",
        participation_id: participationId,
        product_id: productId,
        stripe_event_id: `evt_payments_${RUN}_${paymentIds.length}`,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    paymentIds.push(data?.id ?? "");
    return data?.id ?? "";
  }

  it("refuses a €0 payment: a payment is money that moved", async () => {
    // The migration that tightened this deleted the €0 rows written before it,
    // which a test running on the migrated database cannot stage; the CHECK is
    // what keeps them gone.
    const { error } = await admin.from("payments").insert({
      customer_id: TEST_IDS.CUSTOMER,
      amount_cents: 0,
      currency: "eur",
      purpose: "subscription_invoice",
      participation_id: participationId,
      product_id: productId,
      stripe_event_id: `evt_payments_${RUN}_zero`,
    });
    expect(error?.code).toBe("23514");
  });

  it("refuses deleting a product money was taken for", async () => {
    await insertPayment();
    // Its seat erased first, so only the payment stands in the way.
    await eraseParticipations(admin, (q) => q.eq("id", participationId));

    const deleted = await admin.from("products").delete().eq("id", productId);
    expect(deleted.error?.code).toBe("23503");
  });

  it("keeps the payment when its seat is erased, naming no seat", async () => {
    // The seat was erased above; the payment is the accounting record.
    const { data, error } = await admin
      .from("payments")
      .select("participation_id, product_id, amount_cents")
      .in("id", paymentIds);
    expect(error).toBeNull();
    expect(data).toEqual([
      { participation_id: null, product_id: productId, amount_cents: 4900 },
    ]);

    // Cleared here so afterAll's product delete is not refused.
    await admin.from("payments").delete().in("id", paymentIds);
    paymentIds.length = 0;
  });

  describe("stripe_processed_events", () => {
    it("records an event once", async () => {
      const id = `evt_processed_${RUN}`;
      eventIds.push(id);
      const first = await admin
        .from("stripe_processed_events")
        .insert({ stripe_event_id: id, event_type: "invoice.paid" });
      expect(first.error).toBeNull();

      const again = await admin
        .from("stripe_processed_events")
        .insert({ stripe_event_id: id, event_type: "invoice.paid" });
      expect(again.error?.code).toBe("23505");

      const read = await admin
        .from("stripe_processed_events")
        .select("event_type, processed_at")
        .eq("stripe_event_id", id)
        .single();
      expect(read.data?.event_type).toBe("invoice.paid");
      expect(read.data?.processed_at).toBeTruthy();
    });

    it("is out of reach of every browser role", async () => {
      const customer = await createAuthenticatedClient(
        TEST_CREDENTIALS.CUSTOMER.email,
        TEST_CREDENTIALS.CUSTOMER.password,
      );
      const staff = await createAuthenticatedClient(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
      );
      for (const client of [createAnonTestClient(), customer, staff]) {
        const read = await client
          .from("stripe_processed_events")
          .select("stripe_event_id");
        expect(read.error?.code).toBe("42501");
        const write = await client
          .from("stripe_processed_events")
          .insert({ stripe_event_id: `evt_forged_${RUN}`, event_type: "x" });
        expect(write.error?.code).toBe("42501");
      }
    });
  });
});
