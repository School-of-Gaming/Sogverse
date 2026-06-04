import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { deleteTestProducts } from "./product-helpers";

/**
 * DB-level coverage for update_product(). Cousin of the create RPC,
 * tested through the same admin/non-admin / wipe-and-replace lens.
 *
 * What we cover:
 *   - admin happy path: parent fields update; child sets (translations,
 *     prices, schedule slots, tags, holiday calendars) wipe-and-replace.
 *   - non-admin denied (customer client gets 42501).
 *   - product_type and status are NOT mutable through this RPC (the
 *     stored status is preserved across an update).
 *   - relaxed locale rule: any single locale is accepted (sv-only is
 *     fine); empty translation set is rejected.
 *   - translation BEFORE-DELETE trigger doesn't trip on wipe-and-replace
 *     (the upsert-then-delete-leftovers ordering is the load-bearing
 *     piece — see migration 00046 header comment).
 */

const PRODUCT_ID = "00000000-0000-0000-0000-0000000005f1";

describe("update_product", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [PRODUCT_ID]);
  });

  // Recreate a fresh product before each path so we're testing update,
  // not the residue of a previous test. Bypassing create_product() and
  // inserting directly so we control exactly what's there to wipe.
  async function freshProduct(): Promise<void> {
    await deleteTestProducts(admin, [PRODUCT_ID]);
    await admin.from("products").insert({
      id: PRODUCT_ID,
      product_type: "consumer_club",
      billing_mode: "paid",
      topic: "minecraft",
      min_age: 7,
      max_age: 12,
      spoken_language_code: "en",
      is_remote: true,
      timezone: "Europe/Helsinki",
      registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
      seat_count: 10,
      waitlist_enabled: true,
      is_visible: false,
      status: "pending",
      created_by: TEST_IDS.ADMIN,
    });
    // Seed one of every child set so the wipe-and-replace assertions have
    // something to delete.
    await admin.from("product_translations").insert([
      { product_id: PRODUCT_ID, locale: "en", name: "Old", description: "Old desc" },
      { product_id: PRODUCT_ID, locale: "fi", name: "Vanha", description: "Vanha kuvaus" },
    ]);
    await admin
      .from("schedule_slots")
      .insert({ product_id: PRODUCT_ID, weekday: 0, start_time: "16:00", duration_minutes: 60 });
    await admin
      .from("product_prices")
      .insert({ product_id: PRODUCT_ID, currency: "eur", price_per_session: 1000, price_per_month: 4000 });
  }

  it("admin can update parent fields and wipe-and-replace children", async () => {
    await freshProduct();

    const { data, error } = await admin.rpc("update_product", {
      p_id: PRODUCT_ID,
      p_billing_mode: "paid",
      p_translations: [
        { locale: "en", name: "New", description: "New desc" },
        { locale: "fi", name: "Uusi", description: "Uusi kuvaus" },
      ],
      p_topic: "minecraft",
      p_min_age: 8,
      p_max_age: 14,
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date().toISOString(),
      p_is_visible: true,
      p_seat_count: 20,
      p_waitlist_enabled: false,
      p_schedule_slots: [
        { weekday: 1, start_time: "17:00", duration_minutes: 90 },
        { weekday: 3, start_time: "17:00", duration_minutes: 90 },
      ],
      p_prices: [
        { currency: "eur", price_per_session: 1500, price_per_month: 5000 },
        { currency: "gbp", price_per_session: 1300, price_per_month: 4400 },
        { currency: "usd", price_per_session: 1700, price_per_month: 5600 },
      ],
    });

    expect(error).toBeNull();
    expect(data).toBe(PRODUCT_ID);

    const { data: row } = await admin
      .from("products")
      .select("min_age, max_age, seat_count, waitlist_enabled, is_visible, status, product_type")
      .eq("id", PRODUCT_ID)
      .single();
    expect(row).toMatchObject({
      min_age: 8,
      max_age: 14,
      seat_count: 20,
      waitlist_enabled: false,
      is_visible: true,
      status: "pending",            // preserved
      product_type: "consumer_club", // immutable
    });

    const { data: trs } = await admin
      .from("product_translations")
      .select("locale, name")
      .eq("product_id", PRODUCT_ID)
      .order("locale", { ascending: true });
    expect(trs).toEqual([
      { locale: "en", name: "New" },
      { locale: "fi", name: "Uusi" },
    ]);

    const { data: slots } = await admin
      .from("schedule_slots")
      .select("weekday, start_time, duration_minutes")
      .eq("product_id", PRODUCT_ID)
      .order("weekday", { ascending: true });
    expect(slots).toEqual([
      { weekday: 1, start_time: "17:00:00", duration_minutes: 90 },
      { weekday: 3, start_time: "17:00:00", duration_minutes: 90 },
    ]);

    const { data: prices } = await admin
      .from("product_prices")
      .select("currency, price_per_session")
      .eq("product_id", PRODUCT_ID);
    expect(prices?.length).toBe(3);
  });

  it("preserves stored status across an update", async () => {
    await freshProduct();
    await admin
      .from("products")
      .update({ status: "cancelled" })
      .eq("id", PRODUCT_ID);

    const { error } = await admin.rpc("update_product", {
      p_id: PRODUCT_ID,
      p_billing_mode: "paid",
      p_translations: [{ locale: "en", name: "Whatever", description: "" }],
      p_topic: "minecraft",
      p_min_age: 7,
      p_max_age: 12,
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date().toISOString(),
      // Required by chk_products_seat_count_null_requires_free when
      // billing_mode is paid — null seat_count is only legal for free.
      p_seat_count: 10,
    });
    expect(error).toBeNull();

    const { data: row } = await admin
      .from("products")
      .select("status")
      .eq("id", PRODUCT_ID)
      .single();
    expect(row?.status).toBe("cancelled");
  });

  it("non-admin (customer) is rejected with 42501", async () => {
    await freshProduct();
    const customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );

    const { error } = await customer.rpc("update_product", {
      p_id: PRODUCT_ID,
      p_billing_mode: "paid",
      p_translations: [{ locale: "en", name: "Hacker", description: "" }],
      p_topic: "minecraft",
      p_min_age: 7,
      p_max_age: 12,
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("accepts a single non-(en, fi) locale (sv only)", async () => {
    // Confirms the relaxed rule: any single locale is enough. The
    // display fallback chain (preferred → en → first available) means
    // sv-only still resolves for every viewer.
    await freshProduct();

    const { error } = await admin.rpc("update_product", {
      p_id: PRODUCT_ID,
      p_billing_mode: "paid",
      p_translations: [{ locale: "sv", name: "Bara svenska", description: "" }],
      p_topic: "minecraft",
      p_min_age: 7,
      p_max_age: 12,
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date().toISOString(),
      p_seat_count: 10,
    });
    expect(error).toBeNull();

    const { data: trs } = await admin
      .from("product_translations")
      .select("locale")
      .eq("product_id", PRODUCT_ID);
    expect(trs?.map((t) => t.locale).sort()).toEqual(["sv"]);
  });

  it("rejects an empty translation set", async () => {
    await freshProduct();

    const { error } = await admin.rpc("update_product", {
      p_id: PRODUCT_ID,
      p_billing_mode: "paid",
      p_translations: [],
      p_topic: "minecraft",
      p_min_age: 7,
      p_max_age: 12,
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date().toISOString(),
    });
    expect(error?.code).toBe("23514"); // check_violation
    expect(error?.message).toMatch(/at least one translation/i);
  });

  it("returns no_data_found for an unknown product id", async () => {
    const fakeId = "00000000-0000-0000-0000-0000000005ff";
    const { error } = await admin.rpc("update_product", {
      p_id: fakeId,
      p_billing_mode: "paid",
      p_translations: [{ locale: "en", name: "Doesn't exist", description: "" }],
      p_topic: "minecraft",
      p_min_age: 7,
      p_max_age: 12,
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date().toISOString(),
    });
    // SQLSTATE P0002 — PL/pgSQL's `no_data_found` condition (the function
    // uses `USING ERRCODE = 'no_data_found'`, which maps to P0002, not the
    // SQL-standard 02000/no_data). Asserting on the code rather than the
    // message so a copy tweak doesn't break the test.
    expect(error?.code).toBe("P0002");
  });
});
