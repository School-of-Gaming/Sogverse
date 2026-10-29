import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
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
import { createScheduleSlot, createTestProduct, deleteTestProducts } from "./product-helpers";

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
 * Products 930-933 (see the product-helpers allocation registry): CLUB, a club
 * starting tomorrow with a Wednesday slot, ENDED, one that ended long ago,
 * FREE, a free club, and MUNI, a municipality club on an external contract.
 */

const CLUB = "00000000-0000-0000-0000-000000000930";
const ENDED = "00000000-0000-0000-0000-000000000931";
const FREE = "00000000-0000-0000-0000-000000000932";
const MUNI = "00000000-0000-0000-0000-000000000933";
const PRODUCTS = [CLUB, ENDED, FREE, MUNI];

const FORBIDDEN = "42501";
const CHECK_VIOLATION = "23514";

/** What every enrolled event of the seeded gamer's seat says about who holds it, with no booking tag. */
const GAMER_SEAT_UNTAGGED = {
  seat_holder: "gamer",
  gamer_birth_year: SEED.GAMER_BIRTH.birth_year,
  gamer_gender: "boy",
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  marketing_opt_in: null,
};

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
    await deleteTestProducts(admin, PRODUCTS);
    await createTestProduct(admin, { id: CLUB, seatCount: null, topic: "roblox_studio" });
    await createScheduleSlot(admin, CLUB, { weekday: 2, startTime: "17:30" });
    await createTestProduct(admin, { id: FREE, seatCount: null, billingMode: "free" });
    await createTestProduct(admin, {
      id: MUNI,
      seatCount: null,
      productType: "municipality_club",
      billingMode: "external_contract",
      locationId: TEST_IDS.LOCATION_MUNICIPALITY,
      endDate: "2099-06-01",
      startDate: "2099-01-01",
    });
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
    await deleteTestProducts(admin, PRODUCTS);
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
        anon.rpc("get_klaviyo_parent_snapshots", { p_customer_ids: [TEST_IDS.CUSTOMER] }),
      ];
      for (const { error } of await Promise.all(calls)) {
        expect(error?.code).toBe(FORBIDDEN);
      }
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

    it("files each parent of a gamer whose gender or linked games change, and not for a name", async () => {
      await clearProfiles([TEST_IDS.CUSTOMER]);
      // Klaviyo holds no gamer's name, so a rename tells it nothing.
      const { data: gamer } = await admin.from("profiles").select("first_name").eq("id", TEST_IDS.GAMER).single();
      await admin.from("profiles").update({ first_name: "Renamed" }).eq("id", TEST_IDS.GAMER);
      expect(await profileRow(TEST_IDS.CUSTOMER)).toBeNull();
      await admin.from("profiles").update({ first_name: gamer?.first_name ?? "" }).eq("id", TEST_IDS.GAMER);

      await admin.from("gamer_profiles").update({ gender: "girl" }).eq("user_id", TEST_IDS.GAMER);
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(1);
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

    it("files every parent with a seat in a product whose name, topic or billing change", async () => {
      const participationId = await seat(CLUB, "active");
      await clearProfiles([TEST_IDS.CUSTOMER]);

      await admin.from("product_translations").update({ name: "Klaviyo Club II" }).eq("product_id", CLUB).eq("locale", "en");
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(1);
      await admin.from("products").update({ topic: "minecraft_java" }).eq("id", CLUB);
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(2);
      await admin.from("products").update({ billing_mode: "free" }).eq("id", CLUB);
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(3);
      await admin.from("products").update({ billing_mode: "paid" }).eq("id", CLUB);

      await admin.from("participations").delete().eq("id", participationId);
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(5);
    });

    it("files every parent with a seat in a product whose language, slots or location's name change", async () => {
      const clubSeat = await seat(CLUB, "active");
      const muniSeat = await seat(MUNI, "active");
      await clearProfiles([TEST_IDS.CUSTOMER]);

      await admin.from("products").update({ spoken_language_code: "fi" }).eq("id", CLUB);
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(1);
      await admin.from("products").update({ spoken_language_code: "en" }).eq("id", CLUB);

      await createScheduleSlot(admin, CLUB, { weekday: 4, startTime: "10:00" });
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(3);
      await admin.from("schedule_slots").update({ start_time: "11:00" }).eq("product_id", CLUB).eq("weekday", 4);
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(4);
      await admin.from("schedule_slots").delete().eq("product_id", CLUB).eq("weekday", 4);
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(5);

      // The municipality club is at the seeded municipality.
      const { data: location } = await admin.from("locations").select("name").eq("id", TEST_IDS.LOCATION_MUNICIPALITY).single();
      await admin.from("locations").update({ name: "Klaviyo Helsinki" }).eq("id", TEST_IDS.LOCATION_MUNICIPALITY);
      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(6);
      await admin.from("locations").update({ name: location?.name ?? "" }).eq("id", TEST_IDS.LOCATION_MUNICIPALITY);

      await admin.from("participations").delete().in("id", [clubSeat, muniSeat]);
      await clearProfiles([TEST_IDS.CUSTOMER]);
    });
  });

  // -------------------------------------------------------------------------
  // Only a registered parent reaches Klaviyo
  // -------------------------------------------------------------------------

  describe("who reaches Klaviyo", () => {
    /** A fresh password account: a customer row, registered at creation. */
    async function newCustomer(label: string): Promise<string> {
      const { data, error } = await admin.auth.admin.createUser({
        email: `klaviyo-${label}-${Date.now()}@test.local`,
        password: "testpassword123",
        email_confirm: true,
        user_metadata: { first_name: "Klaviyo", last_name: label },
      });
      expect(error).toBeNull();
      return data.user?.id ?? "";
    }

    /** As a Google sign-up arrives: a customer row still owing its registration. */
    async function newUnregisteredCustomer(label: string): Promise<string> {
      const userId = await newCustomer(label);
      const owed = await admin.from("profiles").update({ registration_completed_at: null }).eq("id", userId);
      expect(owed.error).toBeNull();
      return userId;
    }

    async function snapshotIds(customerIds: string[]): Promise<string[]> {
      const { data, error } = await admin.rpc("get_klaviyo_parent_snapshots", { p_customer_ids: customerIds });
      expect(error).toBeNull();
      return (data ?? []).map((row) => row.customer_id);
    }

    async function remove(userId: string) {
      expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
      await clearProfiles([userId]);
    }

    it("gives a customer who has not finished registering no snapshot, so they never reach Klaviyo", async () => {
      const userId = await newUnregisteredCustomer("unregistered");
      // The OAuth callback's verified-address stamp files them, and the
      // snapshot's silence is what keeps them out.
      await admin.from("profiles").update({ email_verified_at: new Date().toISOString() }).eq("id", userId);
      expect((await profileRow(userId))?.seq).toBeGreaterThanOrEqual(1);
      expect(await snapshotIds([userId])).toEqual([]);
      await remove(userId);
    });

    it("files the parent when their registration completes, and the snapshot then answers", async () => {
      const userId = await newUnregisteredCustomer("completes");
      await clearProfiles([userId]);

      const stamped = await admin
        .from("profiles")
        .update({ registration_completed_at: new Date().toISOString() })
        .eq("id", userId);
      expect(stamped.error).toBeNull();
      expect((await profileRow(userId))?.seq).toBe(1);
      expect(await snapshotIds([userId])).toEqual([userId]);
      await remove(userId);
    });

    it("leaves a Google parent's account opening unclaimed until their registration is stamped", async () => {
      const userId = await newUnregisteredCustomer("google-parent");
      // The finish page records the terms first and stamps the registration last.
      const terms = await admin.rpc("record_account_consents", {
        p_customer_id: userId,
        p_document_slugs: [...REGISTRATION_CONSENT_DOCUMENTS],
      });
      expect(terms.error).toBeNull();
      expect(await eventRow("account_created", userId)).not.toBeNull();

      const early = await admin.rpc("claim_klaviyo_event_jobs", { p_limit: 10, p_customer_ids: [userId] });
      expect(early.error).toBeNull();
      expect(early.data).toEqual([]);

      await admin.from("profiles").update({ registration_completed_at: new Date().toISOString() }).eq("id", userId);
      const claimed = await admin.rpc("claim_klaviyo_event_jobs", { p_limit: 10, p_customer_ids: [userId] });
      expect(claimed.data).toEqual([expect.objectContaining({ kind: "account_created", customer_id: userId })]);
      await remove(userId);
    });

    it("files a customer promoted to gedu one last time, with no snapshot, so their Klaviyo profile is deleted", async () => {
      const userId = await newCustomer("promoted");
      // The account was a registered customer, so Klaviyo may hold it.
      expect(await snapshotIds([userId])).toEqual([userId]);
      await clearProfiles([userId]);

      const promoted = await admin.rpc("register_gedu", {
        p_user_id: userId,
        p_first_name: "Klaviyo",
        p_last_name: "Gedu",
        p_locale: "en",
        p_phone: "",
        p_spoken_languages: [],
        p_location_ids: [],
        p_minecraft_username: "",
        p_minecraft_uuid: "",
        p_roblox_username: "",
        p_roblox_user_id: "",
      });
      expect(promoted.error).toBeNull();
      expect((await profileRow(userId))?.seq).toBe(1);
      expect(await snapshotIds([userId])).toEqual([]);

      // A gedu is never filed again.
      await clearProfiles([userId]);
      await admin.from("profiles").update({ phone: "358401234569" }).eq("id", userId);
      expect(await profileRow(userId)).toBeNull();
      await remove(userId);
    });

    it("files every registered parent at a location whose name or country changes, and sends its canonical name alone", async () => {
      const { data: location, error } = await admin
        .from("locations")
        .insert({
          name: "Klaviyo Town",
          type: "municipality",
          parent_id: TEST_IDS.LOCATION_REGION,
          country_code: "FI",
          name_i18n: { sv: "Klaviyostad" },
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      const locationId = location?.id ?? "";
      const { data: before } = await admin.from("profiles").select("home_location_id").eq("id", TEST_IDS.CUSTOMER_2).single();
      await admin.from("profiles").update({ home_location_id: locationId }).eq("id", TEST_IDS.CUSTOMER_2);

      await clearProfiles([TEST_IDS.CUSTOMER_2]);
      await admin.from("locations").update({ name: "Klaviyo City" }).eq("id", locationId);
      expect((await profileRow(TEST_IDS.CUSTOMER_2))?.seq).toBe(1);
      await admin.from("locations").update({ country_code: "SE" }).eq("id", locationId);
      expect((await profileRow(TEST_IDS.CUSTOMER_2))?.seq).toBe(2);

      const { data } = await admin.rpc("get_klaviyo_parent_snapshots", { p_customer_ids: [TEST_IDS.CUSTOMER_2] });
      // Exactly these three keys: the translations stay out of Klaviyo.
      expect(data?.[0]?.snapshot).toEqual(
        expect.objectContaining({
          profile: expect.objectContaining({
            home_location: { id: locationId, name: "Klaviyo City", country_code: "SE" },
          }),
        }),
      );

      await admin.from("profiles").update({ home_location_id: before?.home_location_id ?? null }).eq("id", TEST_IDS.CUSTOMER_2);
      await admin.from("locations").delete().eq("id", locationId);
      await clearProfiles([TEST_IDS.CUSTOMER_2]);
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

    it("files an enrolment, a waitlist joined and a seat offered, once each", async () => {
      await clearEvents([TEST_IDS.CUSTOMER]);
      const active = await seat(CLUB, "active");
      const enrolled = await eventRow("enrolled", active);
      expect(enrolled).toMatchObject({
        product_id: CLUB,
        unique_id: `enrolled:${active}`,
        facts: GAMER_SEAT_UNTAGGED,
      });

      const waiting = await seat(ENDED, "waitlisted");
      expect(await eventRow("waitlisted", waiting)).toMatchObject({ product_id: ENDED, facts: {} });
      expect(await eventRow("enrolled", waiting)).toBeNull();

      const offeredAt = new Date().toISOString();
      await admin.from("participations").update({ seat_offer_sent_at: offeredAt }).eq("id", waiting);
      const offered = await eventRow("seat_offered", waiting);
      expect(new Date(offered?.occurred_at ?? "").getTime()).toBe(new Date(offeredAt).getTime());

      // Off the waitlist into the seat: that is an enrolment too.
      await admin.from("participations").update({ status: "active", seat_offer_sent_at: null }).eq("id", waiting);
      expect(await eventRow("enrolled", waiting)).toMatchObject({ product_id: ENDED, facts: GAMER_SEAT_UNTAGGED });

      await admin.from("participations").delete().in("id", [active, waiting]);
    });

    it("files an enrolment for a seat on a free product and on a municipality's contract", async () => {
      await clearEvents([TEST_IDS.CUSTOMER]);
      const free = await seat(FREE, "active");
      const muni = await seat(MUNI, "active");
      expect(await eventRow("enrolled", free)).toMatchObject({ product_id: FREE, facts: GAMER_SEAT_UNTAGGED });
      expect(await eventRow("enrolled", muni)).toMatchObject({ product_id: MUNI, facts: GAMER_SEAT_UNTAGGED });
      await admin.from("participations").delete().in("id", [free, muni]);
    });

    it("records the booking's UTM tag and School of Gaming answer the seat writer was handed", async () => {
      await clearEvents([TEST_IDS.CUSTOMER]);
      const { data, error } = await admin.rpc("create_participation", {
        p_product_id: FREE,
        p_participant_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "free",
        p_currency: "eur",
        p_utm_source: "lynx",
        p_utm_medium: "email",
        p_utm_campaign: "lynx-autumn",
        p_school_of_gaming_marketing_opt_in: true,
      });
      expect(error).toBeNull();
      const participationId = z.object({ participation_id: z.string() }).parse(data).participation_id;

      const { data: written } = await admin
        .from("participations")
        .select("utm_source, utm_medium, utm_campaign, utm_content, utm_term, school_of_gaming_marketing_opt_in")
        .eq("id", participationId)
        .single();
      expect(written).toEqual({
        utm_source: "lynx",
        utm_medium: "email",
        utm_campaign: "lynx-autumn",
        utm_content: null,
        utm_term: null,
        school_of_gaming_marketing_opt_in: true,
      });
      expect(await eventRow("enrolled", participationId)).toMatchObject({
        facts: {
          ...GAMER_SEAT_UNTAGGED,
          utm_source: "lynx",
          utm_medium: "email",
          utm_campaign: "lynx-autumn",
          marketing_opt_in: true,
        },
      });

      await admin.from("participations").delete().eq("id", participationId);
    });

    it("carries the School of Gaming answer only with the booking, never with a later re-activation", async () => {
      await clearEvents([TEST_IDS.CUSTOMER]);
      const adminUser = await createAuthenticatedClient(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
      );
      const { data, error } = await admin.rpc("create_participation", {
        p_product_id: FREE,
        p_participant_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "free",
        p_currency: "eur",
        p_utm_source: "lynx",
        p_school_of_gaming_marketing_opt_in: true,
      });
      expect(error).toBeNull();
      const participationId = z.object({ participation_id: z.string() }).parse(data).participation_id;
      expect(await eventRow("enrolled", participationId)).toMatchObject({
        facts: { utm_source: "lynx", marketing_opt_in: true },
      });

      // The booking's event has been sent, so the next activation files anew.
      await clearEvents([TEST_IDS.CUSTOMER]);
      const demoted = await adminUser.rpc("demote_to_waitlist", { p_participation_id: participationId });
      expect(demoted.error).toBeNull();
      const promoted = await adminUser.rpc("promote_from_waitlist", { p_participation_id: participationId });
      expect(promoted.error).toBeNull();

      // The seat still holds the parent's answer; the re-activation does not repeat it.
      expect(await eventRow("enrolled", participationId)).toMatchObject({
        facts: { ...GAMER_SEAT_UNTAGGED, utm_source: "lynx", marketing_opt_in: null },
      });

      await admin.from("participations").delete().eq("id", participationId);
    });

    it("tells a parent's own seat apart from their gamer's", async () => {
      await clearEvents([TEST_IDS.CUSTOMER]);
      const { data, error } = await admin
        .from("participations")
        .insert({ product_id: FREE, participant_id: TEST_IDS.CUSTOMER, customer_id: TEST_IDS.CUSTOMER, status: "active" })
        .select("id")
        .single();
      expect(error).toBeNull();
      const own = data?.id ?? "";
      expect(await eventRow("enrolled", own)).toMatchObject({
        facts: { ...GAMER_SEAT_UNTAGGED, seat_holder: "parent", gamer_birth_year: null, gamer_gender: null },
      });
      await admin.from("participations").delete().eq("id", own);
    });

    describe("attendance", () => {
      const GROUP = "00000000-0000-0000-0000-000000000934";
      let sessionId = "";
      let groupSeat = "";

      async function sessionEvents(): Promise<EventOutbox[]> {
        const { data, error } = await admin
          .from("klaviyo_event_outbox")
          .select("*")
          .eq("kind", "session")
          .eq("customer_id", TEST_IDS.CUSTOMER)
          .order("enqueued_at");
        expect(error).toBeNull();
        return data ?? [];
      }

      beforeAll(async () => {
        expect((await admin.from("product_groups").insert({ id: GROUP, product_id: CLUB, name: "Klaviyo crew" })).error).toBeNull();
        const placed = await admin
          .from("participations")
          .insert({ product_id: CLUB, participant_id: TEST_IDS.GAMER, customer_id: TEST_IDS.CUSTOMER, status: "active", group_id: GROUP })
          .select("id")
          .single();
        expect(placed.error).toBeNull();
        groupSeat = placed.data?.id ?? "";
        const session = await admin
          .from("group_sessions")
          .insert({
            group_id: GROUP,
            session_date: "2026-10-28",
            starts_at: "2026-10-28T15:30:00Z",
            ends_at: "2026-10-28T16:30:00Z",
          })
          .select("id")
          .single();
        expect(session.error).toBeNull();
        sessionId = session.data?.id ?? "";
      });

      afterAll(async () => {
        await admin.from("participations").delete().eq("id", groupSeat);
        await admin.from("product_groups").delete().eq("id", GROUP);
      });

      it("files one session event per mark and per status it is corrected to, and nothing for a deleted mark", async () => {
        await clearEvents([TEST_IDS.CUSTOMER]);
        const marked = await admin
          .from("session_attendance")
          .insert({ session_id: sessionId, participant_id: TEST_IDS.GAMER, status: "present" })
          .select("id, recorded_at")
          .single();
        expect(marked.error).toBeNull();
        const markId = marked.data?.id ?? "";

        const [present] = await sessionEvents();
        expect(present).toMatchObject({
          source_id: markId,
          product_id: CLUB,
          unique_id: `session:${sessionId}:${TEST_IDS.GAMER}:present`,
          facts: {
            seat_holder: "gamer",
            gamer_birth_year: SEED.GAMER_BIRTH.birth_year,
            gamer_gender: "boy",
            attended: true,
            session_date: "2026-10-28",
          },
        });
        expect(new Date(present.occurred_at).getTime()).toBe(new Date(marked.data?.recorded_at ?? "").getTime());

        // The same status again is no new mark.
        await admin.from("session_attendance").update({ status: "present" }).eq("id", markId);
        expect(await sessionEvents()).toHaveLength(1);

        await admin.from("session_attendance").update({ status: "absent" }).eq("id", markId);
        const events = await sessionEvents();
        expect(events).toHaveLength(2);
        expect(events[1]).toMatchObject({
          unique_id: `session:${sessionId}:${TEST_IDS.GAMER}:absent`,
          facts: { attended: false },
        });

        const { data, error } = await admin.rpc("get_klaviyo_events", { p_event_ids: events.map((e) => e.id) });
        expect(error).toBeNull();
        const rows = (data ?? []).map((row) => klaviyoEventRow.parse(row));
        expect(new Set(rows.map((row) => row.unique_id)).size).toBe(2);
        const absent = rows.find((row) => row.unique_id.endsWith(":absent"));
        expect(absent?.kind === "session" && absent.properties.session_starts_at).toBeTruthy();

        await admin.from("session_attendance").delete().eq("id", markId);
        expect(await sessionEvents()).toHaveLength(2);
        await clearEvents([TEST_IDS.CUSTOMER]);
      });

      it("files nothing for a mark nobody holds a seat for", async () => {
        await clearEvents([TEST_IDS.CUSTOMER_2]);
        const marked = await admin
          .from("session_attendance")
          .insert({ session_id: sessionId, participant_id: TEST_IDS.GAMER_2, status: "present" })
          .select("id")
          .single();
        expect(marked.error).toBeNull();
        const { data } = await admin.from("klaviyo_event_outbox").select("id").eq("source_id", marked.data?.id ?? "");
        expect(data).toEqual([]);
        await admin.from("session_attendance").delete().eq("id", marked.data?.id ?? "");
      });
    });

    describe("the School of Gaming ask", () => {
      it("may be put on a product's signup panel, while set_marketing_consent still refuses the answer", async () => {
        const staff = await createAuthenticatedClient(TEST_CREDENTIALS.ADMIN.email, TEST_CREDENTIALS.ADMIN.password);
        const asked = await staff.rpc("admin_set_product_marketing_consents", {
          p_product_id: FREE,
          p_consent_types: ["school_of_gaming", "lynx_educate"],
        });
        expect(asked.error).toBeNull();
        const { data } = await admin.from("product_marketing_consents").select("consent_type").eq("product_id", FREE);
        expect((data ?? []).map((row) => row.consent_type).sort()).toEqual(["lynx_educate", "school_of_gaming"]);

        const answered = await customer.rpc("set_marketing_consent", {
          p_consent_type: "school_of_gaming",
          p_granted: true,
          p_source: "enrolment",
        });
        expect(answered.error?.code).toBe(CHECK_VIOLATION);

        expect((await staff.rpc("admin_set_product_marketing_consents", { p_product_id: FREE, p_consent_types: [] })).error).toBeNull();
      });
    });

    it("files the parent for a payment, and no event", async () => {
      await clearProfiles([TEST_IDS.CUSTOMER]);
      await clearEvents([TEST_IDS.CUSTOMER]);
      const { data, error } = await admin
        .from("payments")
        .insert({
          customer_id: TEST_IDS.CUSTOMER,
          amount_cents: 4900,
          currency: "eur",
          purpose: "single_payment",
          stripe_event_id: `evt_klaviyo_${Date.now()}_a`,
          metadata: { productId: CLUB },
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      paymentIds.push(data?.id ?? "");

      expect((await profileRow(TEST_IDS.CUSTOMER))?.seq).toBe(1);
      const events = await admin.from("klaviyo_event_outbox").select("id").eq("customer_id", TEST_IDS.CUSTOMER);
      expect(events.data).toEqual([]);
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
      expect(first).toMatchObject({
        product_id: CLUB,
        facts: { status: "canceling", current_period_end: null },
      });

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
      const muni = await seat(MUNI, "active");
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
      // A gamer is their birth year, gender and linked games: no name, no birth month.
      const raw = z
        .object({ gamers: z.array(z.record(z.string(), z.unknown())) })
        .parse(data?.[0]?.snapshot);
      for (const gamer of raw.gamers) {
        expect(Object.keys(gamer).sort()).toEqual(["birth_year", "gender", "minecraft", "roblox"]);
      }
      expect(snapshot.gamers).toContainEqual({
        birth_year: SEED.GAMER_BIRTH.birth_year,
        gender: "boy",
        minecraft: true,
        roblox: false,
      });

      const byId = new Map(snapshot.participations.map((p) => [p.id, p]));
      expect(byId.get(active)?.product).toMatchObject({
        billing_mode: "paid",
        product_type: "consumer_club",
        delivery_mode: "online",
        spoken_language_code: "en",
        location_name: null,
        slots: [{ weekday: 2, start_time: "17:30:00" }],
      });
      expect(byId.get(past)?.product).toMatchObject({ product_type: "camp", end_date: "2020-01-05", slots: [] });
      expect(byId.get(muni)?.product).toMatchObject({ billing_mode: "external_contract", location_name: "Helsinki" });
      expect(byId.get(active)?.product.names).toEqual(
        expect.arrayContaining([expect.objectContaining({ locale: "fi", name: "Klaviyo-kerho" })]),
      );

      await admin.from("participations").delete().in("id", [active, past, muni]);
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
        properties: { source_id: participationId, ...GAMER_SEAT_UNTAGGED },
      });
      expect(rows[0].properties.product?.id).toBe(CLUB);

      await admin.from("participations").delete().eq("id", participationId);
      await clearEvents([TEST_IDS.CUSTOMER]);
    });
  });
});
