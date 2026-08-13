import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * DB-level coverage for update_product(). Cousin of the create RPC,
 * tested through the same admin/non-admin / wipe-and-replace lens.
 *
 * What we cover:
 *   - admin happy path: parent fields update; child sets (translations,
 *     prices, schedule slots, holiday calendars) wipe-and-replace.
 *   - the design tag (00178) round-trips, and an OMITTED p_tag clears it —
 *     the defaulted-parameter half that has no CHECK behind it.
 *   - non-admin denied (customer client gets 42501).
 *   - product_type and status are NOT mutable through this RPC (the
 *     stored status is preserved across an update).
 *   - relaxed locale rule: any single locale is accepted (sv-only is
 *     fine); empty translation set is rejected.
 *   - translation BEFORE-DELETE trigger doesn't trip on wipe-and-replace
 *     (the upsert-then-delete-leftovers ordering is the load-bearing
 *     piece — see migration 00046 header comment).
 *   - turning the waitlist off deletes the queue behind it (00171), with the
 *     live-subscription carve-out that stops the delete cascading a
 *     subscription Stripe still bills.
 */

const PRODUCT_ID = "00000000-0000-0000-0000-0000000005f1";
// A municipality club, used only by the municipality-fee CHECK tests (the fee
// is meaningless on the consumer-club PRODUCT_ID and rejected by the muni-only
// constraint). Muni clubs need a location, so it points at the seeded one.
const MUNI_PRODUCT_ID = "00000000-0000-0000-0000-0000000005f2";
// Its own product for the 00171 waitlist-deletion cases: they seed
// participations (and, in two of them, a family_subscriptions row), which the
// wipe-and-replace cases above have no business seeing.
const WAITLIST_PRODUCT_ID = "00000000-0000-0000-0000-0000000005f7";
// A decoy with its own waitlisted row, asserted untouched by every
// queue-clearing save. This is the only thing anywhere that pins the delete's
// `product_id = p_id` scoping: the migration's DO block checks the status
// predicate and the carve-out but not the product key, so without this row a
// predicate that lost its product scoping — one uncap wiping every queue in
// the database — would pass the migration's own assertions and every test.
const DECOY_PRODUCT_ID = "00000000-0000-0000-0000-0000000005f8";

describe("update_product", () => {
  /** Service-role client — bypasses RLS, used to seed and to read back. */
  let admin: SupabaseClient<Database>;
  /**
   * The RPC caller. It has to be a *signed-in* admin, not the service-role
   * client: the guard reads the caller's live role via get_user_role(), and
   * since 00121 a caller with no profiles row (which is what a service-role
   * connection is) is refused rather than waved through.
   */
  let adminAuth: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [
      PRODUCT_ID,
      MUNI_PRODUCT_ID,
      WAITLIST_PRODUCT_ID,
      DECOY_PRODUCT_ID,
    ]);
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
      topic: "minecraft_java",
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
      { product_id: PRODUCT_ID, locale: "en", name: "Old", short_description: "Old desc" },
      { product_id: PRODUCT_ID, locale: "fi", name: "Vanha", short_description: "Vanha kuvaus" },
    ]);
    await admin
      .from("schedule_slots")
      .insert({ product_id: PRODUCT_ID, weekday: 0, start_time: "16:00", duration_minutes: 60 });
    await admin
      .from("product_prices")
      .insert({ product_id: PRODUCT_ID, currency: "eur", price_cents: 4000 });
  }

  it("admin can update parent fields and wipe-and-replace children", async () => {
    await freshProduct();

    const { data, error } = await adminAuth.rpc("update_product", {
      p_id: PRODUCT_ID,
      p_billing_mode: "paid",
      p_translations: [
        { locale: "en", name: "New", short_description: "New desc" },
        { locale: "fi", name: "Uusi", short_description: "Uusi kuvaus" },
      ],
      p_topic: "minecraft_java",
      p_for_gamers: true,
      p_for_parents: false,
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
        { currency: "eur", price_cents: 5000 },
        { currency: "gbp", price_cents: 4400 },
        { currency: "usd", price_cents: 5600 },
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
      .select("currency, price_cents")
      .eq("product_id", PRODUCT_ID);
    expect(prices?.length).toBe(3);
  });

  it("preserves stored status across an update", async () => {
    await freshProduct();
    await admin
      .from("products")
      .update({ status: "cancelled" })
      .eq("id", PRODUCT_ID);

    const { error } = await adminAuth.rpc("update_product", {
      p_id: PRODUCT_ID,
      p_billing_mode: "paid",
      p_translations: [{ locale: "en", name: "Whatever", short_description: "" }],
      p_topic: "minecraft_java",
      p_for_gamers: true,
      p_for_parents: false,
      p_min_age: 7,
      p_max_age: 12,
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date().toISOString(),
      // A concrete cap; seat_count may also be null for any billing mode
      // (uncapped) since 00083 dropped chk_products_seat_count_null_requires_free.
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
      p_translations: [{ locale: "en", name: "Hacker", short_description: "" }],
      p_topic: "minecraft_java",
      p_for_gamers: true,
      p_for_parents: false,
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

    const { error } = await adminAuth.rpc("update_product", {
      p_id: PRODUCT_ID,
      p_billing_mode: "paid",
      p_translations: [{ locale: "sv", name: "Bara svenska", short_description: "" }],
      p_topic: "minecraft_java",
      p_for_gamers: true,
      p_for_parents: false,
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

    const { error } = await adminAuth.rpc("update_product", {
      p_id: PRODUCT_ID,
      p_billing_mode: "paid",
      p_translations: [],
      p_topic: "minecraft_java",
      p_for_gamers: true,
      p_for_parents: false,
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
    const { error } = await adminAuth.rpc("update_product", {
      p_id: fakeId,
      p_billing_mode: "paid",
      p_translations: [{ locale: "en", name: "Doesn't exist", short_description: "" }],
      p_topic: "minecraft_java",
      p_for_gamers: true,
      p_for_parents: false,
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

  it("stores and round-trips a markdown long_description", async () => {
    await freshProduct();

    // Newlines, an escaped character and non-ASCII in one value: the column is
    // text, so all three have to survive the RPC's JSON payload untouched.
    const longDesc =
      "# What you'll learn\n\nBuild a redstone door together — a hidden 3 \\* 3 piston door, and a wheat farm that harvests itself.\n\n- bring a headset\n- bring a mouse";

    const { error } = await adminAuth.rpc("update_product", {
      p_id: PRODUCT_ID,
      p_billing_mode: "paid",
      p_translations: [
        {
          locale: "en",
          name: "New",
          short_description: "Teaser",
          long_description: longDesc,
        },
        // null long_description folds to SQL NULL (no long description).
        { locale: "fi", name: "Uusi", short_description: "", long_description: null },
      ],
      p_topic: "minecraft_java",
      p_for_gamers: true,
      p_for_parents: false,
      p_min_age: 7,
      p_max_age: 12,
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date().toISOString(),
      p_seat_count: 10,
    });
    expect(error).toBeNull();

    const { data: rows } = await admin
      .from("product_translations")
      .select("locale, short_description, long_description")
      .eq("product_id", PRODUCT_ID)
      .order("locale", { ascending: true });
    expect(rows).toEqual([
      { locale: "en", short_description: "Teaser", long_description: longDesc },
      { locale: "fi", short_description: "", long_description: null },
    ]);
  });

  it("rejects a blank long_description via the CHECK constraint", async () => {
    await freshProduct();

    // Direct insert — admin bypasses RLS but not the CHECK. NULL is how a
    // locale says it has no long description, so a whitespace-only string
    // would be a second spelling of the same thing that every reader would
    // then have to know about. The constraint (00183) refuses it, and the
    // admin form folds a cleared editor to NULL rather than sending one.
    const { error } = await admin.from("product_translations").insert({
      product_id: PRODUCT_ID,
      locale: "sv",
      name: "Bad",
      short_description: "",
      long_description: "   \n  ",
    });
    expect(error?.code).toBe("23514"); // check_violation
  });

  // Per-session fees (00112). The RPC threads the three columns through; the
  // table CHECKs are the backstop the client form also enforces (gedu >= 0,
  // muni > 0 and muni-only).
  it("round-trips per-session fees through update_product", async () => {
    await freshProduct();

    const { error } = await adminAuth.rpc("update_product", {
      p_id: PRODUCT_ID,
      p_billing_mode: "paid",
      p_translations: [{ locale: "en", name: "Fees", short_description: "" }],
      p_topic: "minecraft_java",
      p_for_gamers: true,
      p_for_parents: false,
      p_min_age: 7,
      p_max_age: 12,
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date().toISOString(),
      p_seat_count: 10,
      // fee → cents, volunteer → 0. The muni-only column is left unset (the
      // RPC defaults it to NULL); the muni round-trip lives in the muni test.
      p_primary_gedu_fee_cents: 2500,
      p_assistant_gedu_fee_cents: 0,
    });
    expect(error).toBeNull();

    const { data: row } = await admin
      .from("products")
      .select(
        "primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents",
      )
      .eq("id", PRODUCT_ID)
      .single();
    expect(row).toEqual({
      primary_gedu_fee_cents: 2500,
      assistant_gedu_fee_cents: 0,
      municipality_fee_cents: null,
    });
  });

  it("rejects a negative gedu fee via the CHECK constraint", async () => {
    await freshProduct();
    // Direct update — admin bypasses RLS but not products_primary_gedu_fee_cents_check
    // (NULL or >= 0). The form never produces this; the contract now also
    // rejects it, leaving the CHECK as the last line.
    const { error } = await admin
      .from("products")
      .update({ primary_gedu_fee_cents: -1 })
      .eq("id", PRODUCT_ID);
    expect(error?.code).toBe("23514"); // check_violation
  });

  it("rejects a municipality fee on a non-municipality product", async () => {
    await freshProduct(); // consumer_club
    // chk_products_municipality_fee_only_for_muni — the sole server-side guard
    // of the invariant the form enforces by forcing the column to null for
    // every non-muni type.
    const { error } = await admin
      .from("products")
      .update({ municipality_fee_cents: 5000 })
      .eq("id", PRODUCT_ID);
    expect(error?.code).toBe("23514"); // check_violation
  });

  it("accepts a positive but rejects a zero municipality fee on a muni club", async () => {
    await deleteTestProducts(admin, [MUNI_PRODUCT_ID]);
    await admin.from("products").insert({
      id: MUNI_PRODUCT_ID,
      product_type: "municipality_club",
      billing_mode: "external_contract",
      topic: "minecraft_java",
      min_age: 7,
      max_age: 12,
      spoken_language_code: "en",
      is_remote: true,
      location_id: TEST_IDS.LOCATION_MUNICIPALITY, // muni clubs need a location
      timezone: "Europe/Helsinki",
      registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
      seat_count: 10,
      waitlist_enabled: false,
      status: "pending",
      // chk_products_non_consumer_has_end_date: a municipality club needs one,
      // in every status. (Until 00169 a 'draft' row was exempt; the value and
      // its escape hatch are both gone.)
      end_date: "2099-12-31",
      is_visible: false,
      created_by: TEST_IDS.ADMIN,
    });

    const positive = await admin
      .from("products")
      .update({ municipality_fee_cents: 4000 })
      .eq("id", MUNI_PRODUCT_ID);
    expect(positive.error).toBeNull();

    // products_municipality_fee_cents_check — NULL or > 0, never 0 (a
    // municipality always pays).
    const zero = await admin
      .from("products")
      .update({ municipality_fee_cents: 0 })
      .eq("id", MUNI_PRODUCT_ID);
    expect(zero.error?.code).toBe("23514"); // check_violation
  });

  // Design tag (00178). One nullable enum column, threaded through the RPC the
  // same way the fees above are — with one difference that earns its own case
  // below: `p_tag` is DEFAULTED, so omitting it is not "leave it alone", it is
  // "clear it".
  it("round-trips a tag through update_product", async () => {
    await freshProduct();

    const { error } = await adminAuth.rpc("update_product", {
      p_id: PRODUCT_ID,
      p_billing_mode: "paid",
      p_translations: [{ locale: "en", name: "Tagged", short_description: "" }],
      p_topic: "minecraft_java",
      p_for_gamers: true,
      p_for_parents: false,
      p_min_age: 7,
      p_max_age: 12,
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date().toISOString(),
      p_seat_count: 10,
      p_tag: "neuroinclusive",
    });
    expect(error).toBeNull();

    const { data: row } = await admin
      .from("products")
      .select("tag")
      .eq("id", PRODUCT_ID)
      .single();
    expect(row?.tag).toBe("neuroinclusive");
  });

  it("clears an existing tag when p_tag is omitted", async () => {
    // The half of `DEFAULT NULL` that has no CHECK behind it, pinned. The RPC
    // assigns every editable column on every call, so an omitted p_tag writes
    // its default and the tag is gone — which is exactly how the admin form
    // clears one (the route maps a null field to `undefined`). What stops it
    // happening by accident is a wire schema that requires the field, and that
    // guard lives in the contract, not here; this case is the reason it has to.
    await freshProduct();
    const seeded = await admin
      .from("products")
      .update({ tag: "advanced" })
      .eq("id", PRODUCT_ID);
    expect(seeded.error).toBeNull();

    const { error } = await adminAuth.rpc("update_product", {
      p_id: PRODUCT_ID,
      p_billing_mode: "paid",
      p_translations: [{ locale: "en", name: "Untagged", short_description: "" }],
      p_topic: "minecraft_java",
      p_for_gamers: true,
      p_for_parents: false,
      p_min_age: 7,
      p_max_age: 12,
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date().toISOString(),
      p_seat_count: 10,
      // p_tag deliberately absent.
    });
    expect(error).toBeNull();

    const { data: row } = await admin
      .from("products")
      .select("tag")
      .eq("id", PRODUCT_ID)
      .single();
    expect(row?.tag).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 00171 — turning the waitlist off deletes the queue behind it
  // -------------------------------------------------------------------------
  //
  // The flag goes off two ways in the admin form, and the RPC sees only one of
  // them: `waitlist = uncapped ? false : checkbox`, so an uncapping save and an
  // unticking save both arrive as p_waitlist_enabled = false. Both are exercised
  // here because they are two different admin actions with one wire shape — a
  // future form change that stops deriving would break the first without
  // touching the second.
  //
  // The seeded family has exactly two gamers (GAMER, GAMER_2), both children of
  // CUSTOMER, and uq_participations_active_or_waitlisted allows one live row per
  // gamer per product — which is why each case seeds at most two rows.
  describe("waitlist deletion when the flag goes off", () => {
    /**
     * Fresh product + no participations, before every case — plus the decoy
     * product carrying one waitlisted row, which every queue-clearing case
     * asserts survived (see DECOY_PRODUCT_ID).
     */
    async function freshWaitlistProduct(): Promise<void> {
      await deleteTestProducts(admin, [WAITLIST_PRODUCT_ID, DECOY_PRODUCT_ID]);
      await createTestProduct(admin, {
        id: WAITLIST_PRODUCT_ID,
        productType: "consumer_club",
        billingMode: "paid",
        seatCount: 10,
        waitlistEnabled: true,
      });
      await createTestProduct(admin, {
        id: DECOY_PRODUCT_ID,
        productType: "consumer_club",
        billingMode: "paid",
        seatCount: 10,
        waitlistEnabled: true,
      });
      const { error } = await admin.from("participations").insert({
        product_id: DECOY_PRODUCT_ID,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "waitlisted",
        waitlisted_at: new Date().toISOString(),
      });
      expect(error).toBeNull();
    }

    /** The other product's queue must survive every save of this one. */
    async function expectDecoyQueueUntouched(): Promise<void> {
      const { data } = await admin
        .from("participations")
        .select("participant_id, status")
        .eq("product_id", DECOY_PRODUCT_ID);
      expect(data).toEqual([
        { participant_id: TEST_IDS.GAMER, status: "waitlisted" },
      ]);
    }

    /**
     * Seeds participations directly. Waitlisted rows carry `waitlisted_at`
     * because chk_participations_waitlisted_has_timestamp requires it; the
     * queue's order is derived from that column, never stored.
     */
    async function seedParticipations(
      rows: { gamerId: string; status: "active" | "waitlisted" }[],
    ): Promise<Record<string, string>> {
      const { data, error } = await admin
        .from("participations")
        .insert(
          rows.map((row) => ({
            product_id: WAITLIST_PRODUCT_ID,
            participant_id: row.gamerId,
            customer_id: TEST_IDS.CUSTOMER,
            status: row.status,
            waitlisted_at:
              row.status === "waitlisted" ? new Date().toISOString() : null,
          })),
        )
        .select("id, participant_id");
      expect(error).toBeNull();
      return Object.fromEntries(data!.map((r) => [r.participant_id, r.id]));
    }

    /**
     * Saves the product through the RPC exactly as the admin form's update
     * route does: an omitted p_seat_count is the uncapped case (the route maps
     * a null seat count to `undefined` so the RPC's DEFAULT NULL clears the
     * column).
     */
    async function saveProduct(fields: {
      seatCount?: number;
      waitlistEnabled: boolean;
    }): Promise<void> {
      const { error } = await adminAuth.rpc("update_product", {
        p_id: WAITLIST_PRODUCT_ID,
        p_billing_mode: "paid",
        p_translations: [{ locale: "en", name: "Queue", short_description: "" }],
        p_topic: "minecraft_java",
        p_for_gamers: true,
        p_for_parents: false,
        p_min_age: 7,
        p_max_age: 12,
        p_spoken_language_code: "en",
        p_is_remote: true,
        p_timezone: "Europe/Helsinki",
        p_registration_opens_at: new Date().toISOString(),
        p_seat_count: fields.seatCount,
        p_waitlist_enabled: fields.waitlistEnabled,
      });
      expect(error).toBeNull();
    }

    /** The product's surviving participations, as participant_id → status. */
    async function survivors(): Promise<Record<string, string>> {
      const { data } = await admin
        .from("participations")
        .select("participant_id, status")
        .eq("product_id", WAITLIST_PRODUCT_ID);
      return Object.fromEntries(data!.map((r) => [r.participant_id, r.status]));
    }

    it("uncapping a capped product deletes its waitlisted rows and leaves the active ones", async () => {
      await freshWaitlistProduct();
      await seedParticipations([
        { gamerId: TEST_IDS.GAMER, status: "waitlisted" },
        { gamerId: TEST_IDS.GAMER_2, status: "active" },
      ]);

      // Unlimited seats: the form derives waitlist_enabled false from the same
      // answer, which is what makes uncapping a queue-clearing edit.
      await saveProduct({ waitlistEnabled: false });

      expect(await survivors()).toEqual({ [TEST_IDS.GAMER_2]: "active" });
      await expectDecoyQueueUntouched();

      const { data: row } = await admin
        .from("products")
        .select("seat_count, waitlist_enabled")
        .eq("id", WAITLIST_PRODUCT_ID)
        .single();
      expect(row).toMatchObject({ seat_count: null, waitlist_enabled: false });
    });

    it("unticking the waitlist on a still-capped product does the same", async () => {
      await freshWaitlistProduct();
      await seedParticipations([
        { gamerId: TEST_IDS.GAMER, status: "waitlisted" },
        { gamerId: TEST_IDS.GAMER_2, status: "active" },
      ]);

      await saveProduct({ seatCount: 10, waitlistEnabled: false });

      expect(await survivors()).toEqual({ [TEST_IDS.GAMER_2]: "active" });
      await expectDecoyQueueUntouched();

      const { data: row } = await admin
        .from("products")
        .select("seat_count, waitlist_enabled")
        .eq("id", WAITLIST_PRODUCT_ID)
        .single();
      expect(row).toMatchObject({ seat_count: 10, waitlist_enabled: false });
    });

    it("leaves the queue alone while the waitlist stays on", async () => {
      // The negative half: the delete is keyed to the saved flag, so an
      // ordinary edit of a waitlist-enabled product must not touch the queue.
      await freshWaitlistProduct();
      await seedParticipations([
        { gamerId: TEST_IDS.GAMER, status: "waitlisted" },
        { gamerId: TEST_IDS.GAMER_2, status: "active" },
      ]);

      await saveProduct({ seatCount: 10, waitlistEnabled: true });

      expect(await survivors()).toEqual({
        [TEST_IDS.GAMER]: "waitlisted",
        [TEST_IDS.GAMER_2]: "active",
      });
    });

    it("spares a waitlisted row carrying a live subscription, and deletes its unsubscribed neighbour", async () => {
      // A waitlisted row with a live subscription is a webhook-race ghost (a
      // demote landing between Checkout completing and the webhook's insert, or
      // the manual sub-adoption process). Deleting it would CASCADE
      // family_subscriptions away and orphan billing Stripe still runs — the
      // hazard demote_to_waitlist and admin_remove_participation refuse for.
      await freshWaitlistProduct();
      const ids = await seedParticipations([
        { gamerId: TEST_IDS.GAMER, status: "waitlisted" },
        { gamerId: TEST_IDS.GAMER_2, status: "waitlisted" },
      ]);
      await admin.from("family_subscriptions").insert({
        participation_id: ids[TEST_IDS.GAMER],
        customer_id: TEST_IDS.CUSTOMER,
        stripe_subscription_id: "sub_waitlist_off_live",
        stripe_customer_id: "cus_waitlist_off",
        currency: "eur",
        status: "active",
      });

      await saveProduct({ waitlistEnabled: false });

      expect(await survivors()).toEqual({ [TEST_IDS.GAMER]: "waitlisted" });
      await expectDecoyQueueUntouched();

      // The subscription row is what the carve-out exists to protect, so assert
      // it directly rather than inferring it from the participation surviving.
      const { data: subs } = await admin
        .from("family_subscriptions")
        .select("participation_id")
        .eq("stripe_subscription_id", "sub_waitlist_off_live");
      expect(subs).toEqual([{ participation_id: ids[TEST_IDS.GAMER] }]);
    });

    it("deletes a waitlisted row whose subscription is cancelled", async () => {
      // 00170's liveness predicate, applied to the carve-out: `cancelled` is
      // terminal (a dunning-dead subscription is stored that way and never
      // fires subscription.deleted), so such a row is not protected — otherwise
      // a dead subscription would strand a queue entry forever, which is the
      // failure 00170 removed from the two admin refusals.
      await freshWaitlistProduct();
      const ids = await seedParticipations([
        { gamerId: TEST_IDS.GAMER, status: "waitlisted" },
      ]);
      await admin.from("family_subscriptions").insert({
        participation_id: ids[TEST_IDS.GAMER],
        customer_id: TEST_IDS.CUSTOMER,
        stripe_subscription_id: "sub_waitlist_off_dead",
        stripe_customer_id: "cus_waitlist_off",
        currency: "eur",
        status: "cancelled",
      });

      await saveProduct({ waitlistEnabled: false });

      expect(await survivors()).toEqual({});
      await expectDecoyQueueUntouched();

      // The dead subscription row went with it, via the ON DELETE CASCADE that
      // makes the live case dangerous in the first place.
      const { data: subs } = await admin
        .from("family_subscriptions")
        .select("participation_id")
        .eq("stripe_subscription_id", "sub_waitlist_off_dead");
      expect(subs).toEqual([]);
    });
  });
});
