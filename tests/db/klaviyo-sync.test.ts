import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  klaviyoEventRow,
  klaviyoParentSnapshotRow,
} from "@/lib/klaviyo-sync/snapshot.contracts";
import { REGISTRATION_CONSENT_DOCUMENTS } from "@/lib/constants/consent-documents";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { SEED, TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * Parents announce their changes to Klaviyo: the triggers that file a parent in
 * the profile outbox and an event in the event outbox, the lease the sync works
 * both under, and the two reads it sends from.
 *
 * The kick cannot be seen from here: it reads its URL and secret from Vault,
 * which is empty on every local stack and in CI, so it returns before queueing
 * anything. What these cases prove about it is that every write reaching it
 * still succeeds.
 *
 * Other suites write to the seeded families all the time, so every case clears
 * the outbox rows it is about before it acts, and claims only the parents it
 * names.
 *
 * Products 930-931 (see the product-helpers allocation registry): CLUB, a club
 * starting tomorrow, and ENDED, one that ended long ago.
 */

const CLUB = "00000000-0000-0000-0000-000000000930";
const ENDED = "00000000-0000-0000-0000-000000000931";

const FORBIDDEN = "42501";

type ProfileOutbox = Database["public"]["Tables"]["klaviyo_profile_outbox"]["Row"];
type EventOutbox = Database["public"]["Tables"]["klaviyo_event_outbox"]["Row"];
type EventKind = Database["public"]["Enums"]["klaviyo_event_kind"];

describe("the Klaviyo sync", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  const paymentIds: string[] = [];

  async function profileRow(customerId: string): Promise<ProfileOutbox | null> {
    const { data, error } = await admin
      .from("klaviyo_profile_outbox")
      .select("*")
      .eq("customer_id", customerId)
      .maybeSingle();
    expect(error).toBeNull();
    return data;
  }

  async function eventRow(kind: EventKind, sourceId: string): Promise<EventOutbox | null> {
    const { data, error } = await admin
      .from("klaviyo_event_outbox")
      .select("*")
      .eq("kind", kind)
      .eq("source_id", sourceId)
      .maybeSingle();
    expect(error).toBeNull();
    return data;
  }

  async function clearProfiles(customerIds: string[]) {
    const { error } = await admin
      .from("klaviyo_profile_outbox")
      .delete()
      .in("customer_id", customerIds);
    expect(error).toBeNull();
  }

  async function clearEvents(customerIds: string[]) {
    const { error } = await admin
      .from("klaviyo_event_outbox")
      .delete()
      .in("customer_id", customerIds);
    expect(error).toBeNull();
  }

  async function seat(
    productId: string,
    status: "active" | "waitlisted" | "completed",
  ): Promise<string> {
    const { data, error } = await admin
      .from("participations")
      .insert({
        product_id: productId,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status,
        ...(status === "waitlisted" ? { waitlisted_at: new Date().toISOString() } : {}),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data?.id ?? "";
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    anon = createAnonTestClient();
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    await deleteTestProducts(admin, [CLUB, ENDED]);
    await createTestProduct(admin, { id: CLUB, seatCount: null, topic: "roblox_studio" });
    await createTestProduct(admin, {
      id: ENDED,
      seatCount: null,
      productType: "camp",
      startDate: "2020-01-01",
      endDate: "2020-01-05",
    });
    const { error } = await admin.from("product_translations").insert([
      { product_id: CLUB, locale: "en", name: "Klaviyo Club", short_description: "A club." },
      { product_id: CLUB, locale: "fi", name: "Klaviyo-kerho", short_description: "Kerho." },
    ]);
    expect(error).toBeNull();
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [CLUB, ENDED]);
    if (paymentIds.length > 0) await admin.from("payments").delete().in("id", paymentIds);
    await admin.from("gamer_profiles").update({ gender: "boy" }).eq("user_id", TEST_IDS.GAMER);
    await admin.from("minecraft_accounts").delete().eq("user_id", TEST_IDS.GAMER);
    await admin.from("roblox_accounts").delete().eq("user_id", TEST_IDS.GAMER);
    await clearProfiles([TEST_IDS.CUSTOMER, TEST_IDS.CUSTOMER_2]);
    await clearEvents([TEST_IDS.CUSTOMER, TEST_IDS.CUSTOMER_2]);
  });

  // -------------------------------------------------------------------------
  // Access
  // -------------------------------------------------------------------------

  describe("access", () => {
    it("tells no browser role anything about either outbox", async () => {
      for (const client of [anon, customer]) {
        expect((await client.from("klaviyo_profile_outbox").select("customer_id")).error).not.toBeNull();
        expect((await client.from("klaviyo_event_outbox").select("id")).error).not.toBeNull();
      }
    });

    it("keeps the sync's functions to the service role", async () => {
      const calls = [
        customer.rpc("claim_klaviyo_profile_jobs", { p_limit: 1 }),
        customer.rpc("claim_klaviyo_event_jobs", { p_limit: 1 }),
        customer.rpc("finish_klaviyo_profile_job", { p_customer_id: TEST_IDS.CUSTOMER, p_seq: 1 }),
        customer.rpc("finish_klaviyo_event_job", { p_event_id: TEST_IDS.CUSTOMER }),
        customer.rpc("get_klaviyo_parent_snapshots", { p_customer_ids: [TEST_IDS.CUSTOMER] }),
        customer.rpc("get_klaviyo_events", { p_event_ids: [] }),
        customer.rpc("kick_klaviyo_sync_if_due"),
        anon.rpc("get_klaviyo_parent_snapshots", { p_customer_ids: [TEST_IDS.CUSTOMER] }),
      ];
      for (const { error } of await Promise.all(calls)) {
        expect(error?.code).toBe(FORBIDDEN);
      }
    });

    it("lets the service role kick when a row is due, which with Vault empty sends nothing", async () => {
      const { error } = await admin.rpc("kick_klaviyo_sync_if_due");
      expect(error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // What files a parent
  // -------------------------------------------------------------------------

  describe("the profile outbox", () => {
    it("files the parent when a column the snapshot reads changes, and bumps the seq on the next", async () => {
      await clearProfiles([TEST_IDS.CUSTOMER]);
      expect((await admin.from("profiles").update({ phone: "358401234567" }).eq("id", TEST_IDS.CUSTOMER)).error).toBeNull();
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(1);

      expect((await admin.from("profiles").update({ phone: null }).eq("id", TEST_IDS.CUSTOMER)).error).toBeNull();
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(2);
    });

    it("files nothing for a write that changes nothing the snapshot reads", async () => {
      await clearProfiles([TEST_IDS.CUSTOMER]);
      const { data: before } = await admin.from("profiles").select("first_name, registration_completed_at").eq("id", TEST_IDS.CUSTOMER).single();
      // The same name again, and the bookkeeping stamp.
      await admin
        .from("profiles")
        .update({
          first_name: before?.first_name ?? "",
          registration_completed_at: before?.registration_completed_at ?? null,
        })
        .eq("id", TEST_IDS.CUSTOMER);
      expect(await profileRow(TEST_IDS.CUSTOMER)).toBeNull();
    });

    it("files nobody for a write to an account that is not a parent", async () => {
      await clearProfiles([TEST_IDS.GEDU, TEST_IDS.ADMIN]);
      await admin.from("profiles").update({ phone: "358401234567" }).eq("id", TEST_IDS.GEDU);
      await admin.from("profiles").update({ phone: null }).eq("id", TEST_IDS.GEDU);
      expect(await profileRow(TEST_IDS.GEDU)).toBeNull();
    });

    it("files each parent of a gamer whose name, gender or linked games change", async () => {
      await clearProfiles([TEST_IDS.CUSTOMER]);
      const { data: gamer } = await admin.from("profiles").select("first_name").eq("id", TEST_IDS.GAMER).single();
      await admin.from("profiles").update({ first_name: "Renamed" }).eq("id", TEST_IDS.GAMER);
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(1);
      await admin.from("profiles").update({ first_name: gamer?.first_name ?? "" }).eq("id", TEST_IDS.GAMER);

      await admin.from("gamer_profiles").update({ gender: "girl" }).eq("user_id", TEST_IDS.GAMER);
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(3);
      await admin.from("gamer_profiles").update({ gender: "boy" }).eq("user_id", TEST_IDS.GAMER);

      await admin.from("roblox_accounts").delete().eq("user_id", TEST_IDS.GAMER);
      await clearProfiles([TEST_IDS.CUSTOMER]);
      const linked = await admin
        .from("roblox_accounts")
        .insert({ user_id: TEST_IDS.GAMER, roblox_username: SEED.ROBLOX_USERNAME_GAMER });
      expect(linked.error).toBeNull();
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(1);
      await admin.from("roblox_accounts").delete().eq("user_id", TEST_IDS.GAMER);
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(2);
    });

    it("files every parent with a seat in a product whose name or dates change", async () => {
      const participationId = await seat(CLUB, "active");
      await clearProfiles([TEST_IDS.CUSTOMER]);

      await admin.from("product_translations").update({ name: "Klaviyo Club II" }).eq("product_id", CLUB).eq("locale", "en");
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(1);
      await admin.from("products").update({ topic: "minecraft_java" }).eq("id", CLUB);
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(2);

      await admin.from("participations").delete().eq("id", participationId);
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // What files an event
  // -------------------------------------------------------------------------

  describe("the event outbox", () => {
    it("files the account opening on a parent's first terms acceptance, and never on the bare insert", async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `klaviyo-new-parent-${Date.now()}@test.local`,
        password: "testpassword123",
        email_confirm: true,
        user_metadata: { first_name: "Klaviyo", last_name: "Parent" },
      });
      expect(error).toBeNull();
      const userId = data.user?.id ?? "";

      // Every gamer and gedu is a customer row for a moment, so the insert
      // alone says nothing about being a parent.
      expect(await profileRow(userId)).toBeNull();
      expect(await eventRow("account_created", userId)).toBeNull();

      const terms = await admin.rpc("record_account_consents", {
        p_customer_id: userId,
        p_document_slugs: [...REGISTRATION_CONSENT_DOCUMENTS],
      });
      expect(terms.error).toBeNull();
      expect((await profileRow(userId))?.seq).toBe(1);
      const event = await eventRow("account_created", userId);
      expect(event).toMatchObject({ customer_id: userId, product_id: null, facts: {} });

      // Deleted: still filed, so the sync deletes the Klaviyo profile; its
      // waiting event is gone with it; and the snapshot says nothing.
      expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
      expect((await profileRow(userId))?.seq).toBe(2);
      expect(await eventRow("account_created", userId)).toBeNull();
      const snapshots = await admin.rpc("get_klaviyo_parent_snapshots", { p_customer_ids: [userId] });
      expect(snapshots.error).toBeNull();
      expect(snapshots.data).toEqual([]);
      await clearProfiles([userId]);
    });

    it("files a seat taken, a waitlist joined and a seat offered, once each", async () => {
      await clearEvents([TEST_IDS.CUSTOMER]);
      const active = await seat(CLUB, "active");
      expect(await eventRow("enrolled", active)).toMatchObject({ product_id: CLUB, facts: { status: "active" } });

      const waiting = await seat(ENDED, "waitlisted");
      expect(await eventRow("waitlisted", waiting)).toMatchObject({ product_id: ENDED });
      expect(await eventRow("enrolled", waiting)).toBeNull();

      const offeredAt = new Date().toISOString();
      await admin.from("participations").update({ seat_offer_sent_at: offeredAt }).eq("id", waiting);
      const offered = await eventRow("seat_offered", waiting);
      expect(new Date(offered?.occurred_at ?? "").getTime()).toBe(new Date(offeredAt).getTime());

      // Off the waitlist into the seat: that is an enrolment too.
      await admin.from("participations").update({ status: "active", seat_offer_sent_at: null }).eq("id", waiting);
      expect(await eventRow("enrolled", waiting)).not.toBeNull();

      await admin.from("participations").delete().in("id", [active, waiting]);
    });

    it("files a payment with its facts and product, and never a refunded duplicate", async () => {
      await clearEvents([TEST_IDS.CUSTOMER]);
      const { data, error } = await admin
        .from("payments")
        .insert([
          {
            customer_id: TEST_IDS.CUSTOMER,
            amount_cents: 4900,
            currency: "eur",
            purpose: "single_payment",
            stripe_event_id: `evt_klaviyo_${Date.now()}_a`,
            metadata: { productId: CLUB },
          },
          {
            customer_id: TEST_IDS.CUSTOMER,
            amount_cents: 4900,
            currency: "eur",
            purpose: "reservation_duplicate",
            stripe_event_id: `evt_klaviyo_${Date.now()}_b`,
            metadata: { productId: CLUB },
          },
        ])
        .select("id, purpose");
      expect(error).toBeNull();
      for (const row of data ?? []) paymentIds.push(row.id);
      const paid = data?.find((row) => row.purpose === "single_payment")?.id ?? "";
      const duplicate = data?.find((row) => row.purpose === "reservation_duplicate")?.id ?? "";

      expect(await eventRow("payment", paid)).toMatchObject({
        product_id: CLUB,
        facts: { amount_cents: 4900, currency: "eur", purpose: "single_payment" },
      });
      expect(await eventRow("payment", duplicate)).toBeNull();
    });

    it("files a subscription's cancellation once, at the first cancelled state", async () => {
      await clearEvents([TEST_IDS.CUSTOMER]);
      const participationId = await seat(CLUB, "active");
      const { data, error } = await admin
        .from("family_subscriptions")
        .insert({
          customer_id: TEST_IDS.CUSTOMER,
          participation_id: participationId,
          stripe_subscription_id: `sub_klaviyo_${Date.now()}`,
          stripe_customer_id: "cus_klaviyo",
          currency: "eur",
          status: "active",
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      const subscriptionId = data?.id ?? "";
      expect(await eventRow("subscription_cancelled", subscriptionId)).toBeNull();

      await admin.from("family_subscriptions").update({ status: "canceling" }).eq("id", subscriptionId);
      const first = await eventRow("subscription_cancelled", subscriptionId);
      expect(first).toMatchObject({ product_id: CLUB, facts: { status: "canceling" } });

      // The end of the same cancellation is not a second one.
      await admin.from("family_subscriptions").update({ status: "cancelled" }).eq("id", subscriptionId);
      expect((await eventRow("subscription_cancelled", subscriptionId))?.id).toBe(first?.id);

      await admin.from("family_subscriptions").delete().eq("id", subscriptionId);
      await admin.from("participations").delete().eq("id", participationId);
    });
  });

  // -------------------------------------------------------------------------
  // The lease
  // -------------------------------------------------------------------------

  describe("the lease", () => {
    it("claims a due row once, and a finish against a moved seq hands it back", async () => {
      await clearProfiles([TEST_IDS.CUSTOMER_2]);
      await admin.from("profiles").update({ phone: "358401234568" }).eq("id", TEST_IDS.CUSTOMER_2);

      const claimed = await admin.rpc("claim_klaviyo_profile_jobs", { p_limit: 10, p_customer_ids: [TEST_IDS.CUSTOMER_2] });
      expect(claimed.error).toBeNull();
      expect(claimed.data).toEqual([{ customer_id: TEST_IDS.CUSTOMER_2, seq: 1 }]);
      // Leased: a second claim skips it.
      const again = await admin.rpc("claim_klaviyo_profile_jobs", { p_limit: 10, p_customer_ids: [TEST_IDS.CUSTOMER_2] });
      expect(again.data).toEqual([]);

      // The parent changes mid-sync: the finish answers "run it again".
      await admin.from("profiles").update({ phone: null }).eq("id", TEST_IDS.CUSTOMER_2);
      const moved = await admin.rpc("finish_klaviyo_profile_job", { p_customer_id: TEST_IDS.CUSTOMER_2, p_seq: 1 });
      expect(moved.data).toBe(true);
      expect((await profileRow(TEST_IDS.CUSTOMER_2))?.leased_until).toBeNull();

      const rerun = await admin.rpc("claim_klaviyo_profile_jobs", { p_limit: 10, p_customer_ids: [TEST_IDS.CUSTOMER_2] });
      expect(rerun.data).toEqual([{ customer_id: TEST_IDS.CUSTOMER_2, seq: 2 }]);
      const done = await admin.rpc("finish_klaviyo_profile_job", { p_customer_id: TEST_IDS.CUSTOMER_2, p_seq: 2 });
      expect(done.data).toBe(false);
      expect(await profileRow(TEST_IDS.CUSTOMER_2)).toBeNull();
    });

    it("backs a failure off, parks it after twelve, and an enqueue re-arms it", async () => {
      await clearProfiles([TEST_IDS.CUSTOMER_2]);
      await admin.from("profiles").update({ phone: "358401234568" }).eq("id", TEST_IDS.CUSTOMER_2);
      await admin.rpc("claim_klaviyo_profile_jobs", { p_limit: 10, p_customer_ids: [TEST_IDS.CUSTOMER_2] });

      await admin.rpc("finish_klaviyo_profile_job", { p_customer_id: TEST_IDS.CUSTOMER_2, p_seq: 1, p_error: "Klaviyo said 503" });
      const backedOff = await profileRow(TEST_IDS.CUSTOMER_2);
      expect(backedOff).toMatchObject({ attempts: 1, last_error: "Klaviyo said 503", leased_until: null });
      // 2^1 minutes.
      expect(new Date(backedOff?.next_attempt_at ?? "").getTime()).toBeGreaterThan(Date.now() + 60_000);

      await admin.from("klaviyo_profile_outbox").update({ attempts: 12 }).eq("customer_id", TEST_IDS.CUSTOMER_2);
      await admin.rpc("finish_klaviyo_profile_job", { p_customer_id: TEST_IDS.CUSTOMER_2, p_seq: 1, p_error: "again" });
      expect((await profileRow(TEST_IDS.CUSTOMER_2))?.next_attempt_at).toBe("infinity");

      await admin.from("profiles").update({ phone: null }).eq("id", TEST_IDS.CUSTOMER_2);
      const rearmed = await profileRow(TEST_IDS.CUSTOMER_2);
      expect(rearmed).toMatchObject({ seq: 2, attempts: 0 });
      expect(new Date(rearmed?.next_attempt_at ?? "").getTime()).toBeLessThanOrEqual(Date.now() + 5_000);
      await clearProfiles([TEST_IDS.CUSTOMER_2]);
    });

    it("claims, sends and finishes an event", async () => {
      await clearEvents([TEST_IDS.CUSTOMER]);
      const participationId = await seat(CLUB, "active");
      const claimed = await admin.rpc("claim_klaviyo_event_jobs", { p_limit: 10, p_customer_ids: [TEST_IDS.CUSTOMER] });
      expect(claimed.error).toBeNull();
      expect(claimed.data).toHaveLength(1);
      const eventId = claimed.data?.[0]?.event_id ?? "";
      expect(claimed.data?.[0]).toMatchObject({ kind: "enrolled", customer_id: TEST_IDS.CUSTOMER });

      const failed = await admin.rpc("finish_klaviyo_event_job", { p_event_id: eventId, p_error: "boom" });
      expect(failed.error).toBeNull();
      expect(await eventRow("enrolled", participationId)).toMatchObject({ attempts: 1, last_error: "boom" });

      await admin.rpc("finish_klaviyo_event_job", { p_event_id: eventId });
      expect(await eventRow("enrolled", participationId)).toBeNull();
      await admin.from("participations").delete().eq("id", participationId);
    });
  });

  // -------------------------------------------------------------------------
  // The reads
  // -------------------------------------------------------------------------

  describe("the reads", () => {
    it("snapshots an existing parent through the contract, and nobody else", async () => {
      const active = await seat(CLUB, "active");
      const past = await seat(ENDED, "active");
      await admin.from("minecraft_accounts").delete().eq("user_id", TEST_IDS.GAMER);
      await admin.from("roblox_accounts").delete().eq("user_id", TEST_IDS.GAMER);
      const minecraft = await admin
        .from("minecraft_accounts")
        .insert({ user_id: TEST_IDS.GAMER, minecraft_username: SEED.MINECRAFT_USERNAME_GAMER });
      expect(minecraft.error).toBeNull();

      const { data, error } = await admin.rpc("get_klaviyo_parent_snapshots", {
        p_customer_ids: [TEST_IDS.CUSTOMER, TEST_IDS.GAMER, TEST_IDS.GEDU],
      });
      expect(error).toBeNull();
      const rows = (data ?? []).map((row) => klaviyoParentSnapshotRow.parse(row));
      expect(rows.map((row) => row.customer_id)).toEqual([TEST_IDS.CUSTOMER]);

      const snapshot = rows[0].snapshot;
      expect(snapshot.profile.id).toBe(TEST_IDS.CUSTOMER);
      const gamer = snapshot.gamers.find((g) => g.id === TEST_IDS.GAMER);
      expect(gamer).toMatchObject({
        ...SEED.GAMER_BIRTH,
        gender: "boy",
        minecraft: true,
        roblox: false,
      });

      const byId = new Map(snapshot.participations.map((p) => [p.id, p]));
      // State is read now, from the product's dates in its own zone.
      expect(byId.get(active)?.state).toBe("active");
      expect(byId.get(past)?.state).toBe("past");
      expect(byId.get(active)?.product.names).toEqual(
        expect.arrayContaining([expect.objectContaining({ locale: "fi", name: "Klaviyo-kerho" })]),
      );

      await admin.from("participations").delete().in("id", [active, past]);
      await admin.from("minecraft_accounts").delete().eq("user_id", TEST_IDS.GAMER);
    });

    it("reads a claimed event through the contract, with its unique id and product", async () => {
      await clearEvents([TEST_IDS.CUSTOMER]);
      const participationId = await seat(CLUB, "active");
      const event = await eventRow("enrolled", participationId);

      const { data, error } = await admin.rpc("get_klaviyo_events", { p_event_ids: [event?.id ?? ""] });
      expect(error).toBeNull();
      const rows = (data ?? []).map((row) => klaviyoEventRow.parse(row));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind: "enrolled",
        unique_id: `enrolled:${participationId}`,
        customer_id: TEST_IDS.CUSTOMER,
        properties: { source_id: participationId, status: "active", participant_id: TEST_IDS.GAMER },
      });
      expect(rows[0].properties.product?.id).toBe(CLUB);

      await admin.from("participations").delete().eq("id", participationId);
      await clearEvents([TEST_IDS.CUSTOMER]);
    });
  });
});
