import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS } from "./constants";
import { deleteTestProducts } from "./product-helpers";

/**
 * DB-level coverage for create_product().
 *
 * The suite's other product tests seed rows by inserting directly through
 * `createTestProduct`, which is deliberate — they are about what happens to a
 * product, not about how it was born. This file is the one place the create RPC
 * is actually called, and it exists because a column that both writers must
 * carry is only half-proved by the update side: `create_product` has its own
 * INSERT column list, and a column missing from it fails silently as "the new
 * product is untagged", which looks exactly like the ordinary case.
 *
 * Unlike every other file here it reserves no fixture UUIDs: `create_product`
 * mints its own id and takes none, so there is nothing to collide on. The ids
 * it returns are collected and deleted in afterAll instead.
 */

describe("create_product", () => {
  /** Service-role client — bypasses RLS, used to read back and to clean up. */
  let admin: SupabaseClient<Database>;
  /**
   * The RPC caller. create_product is SECURITY INVOKER, so it must be a
   * *signed-in* admin: the guard reads the caller's live role, and a
   * service-role connection has no profiles row to read it from.
   */
  let adminAuth: SupabaseClient<Database>;

  /** Every id the RPC handed back, deleted at the end of the file. */
  const created: string[] = [];

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
  });

  afterAll(async () => {
    await deleteTestProducts(admin, created);
  });

  /**
   * Every argument the admin form sends, spelled out — an online, free,
   * gamers-only consumer club. Written in full rather than behind a helper
   * because the point of this file is the RPC's own argument list: a parameter
   * that quietly stops being written would otherwise hide behind a default.
   * `p_tag` and `p_region_lock_country` are the arguments each case varies —
   * the two defaulted, CHECK-less columns whose absence from the INSERT list
   * would look exactly like the ordinary "untagged and unlocked" product.
   */
  async function createProduct(
    tag?: "neuroinclusive" | "beginner" | "advanced",
    regionLockCountry?: string,
  ) {
    const { data, error } = await adminAuth.rpc("create_product", {
      p_product_type: "consumer_club",
      p_billing_mode: "free",
      p_translations: [
        { locale: "en", name: "Created", short_description: "Created desc" },
      ],
      p_topic: "minecraft_java",
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
      p_for_gamers: true,
      p_for_parents: false,
      p_min_age: 7,
      p_max_age: 12,
      p_status: "pending",
      p_is_visible: false,
      p_waitlist_enabled: false,
      p_seat_count: 10,
      p_schedule_slots: [
        { weekday: 1, start_time: "16:00", duration_minutes: 60 },
      ],
      p_prices: [],
      p_holiday_calendar_ids: [],
      // Omitted entirely when the caller has no tag — the DEFAULT NULL is what
      // writes "untagged", exactly as the route's `?? undefined` produces.
      ...(tag === undefined ? {} : { p_tag: tag }),
      // Same shape for the region lock, and the same reason: an omitted
      // argument is how "not locked" reaches the column.
      ...(regionLockCountry === undefined
        ? {}
        : { p_region_lock_country: regionLockCountry }),
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    created.push(data!);
    return data!;
  }

  it("stores the tag it was given", async () => {
    const id = await createProduct("advanced");

    const { data: row } = await admin
      .from("products")
      .select("tag, for_gamers, for_parents, min_age, max_age")
      .eq("id", id)
      .single();
    expect(row).toMatchObject({
      tag: "advanced",
      for_gamers: true,
      for_parents: false,
      min_age: 7,
      max_age: 12,
    });
  });

  it("creates an untagged product when p_tag is omitted", async () => {
    // Untagged is the ordinary state and must stay reachable without a wire
    // shape for "explicitly null" — which is the whole reason the parameter is
    // defaulted rather than following the audience flags' non-defaulted shape.
    const id = await createProduct();

    const { data: row } = await admin
      .from("products")
      .select("tag")
      .eq("id", id)
      .single();
    expect(row?.tag).toBeNull();
  });

  it("writes the translation set alongside the parent row", async () => {
    // The tag rides on the parent INSERT, so a case that reads the child set
    // back is what proves the rest of the function still ran — otherwise a
    // create that failed halfway would pass the two assertions above.
    const id = await createProduct("beginner");

    const { data: trs } = await admin
      .from("product_translations")
      .select("locale, name")
      .eq("product_id", id);
    expect(trs).toEqual([{ locale: "en", name: "Created" }]);
  });

  it("stores the region lock it was given", async () => {
    const id = await createProduct(undefined, "FI");

    const { data: row } = await admin
      .from("products")
      .select("region_lock_country, tag")
      .eq("id", id)
      .single();
    // The tag stays null in the same read: the two columns are independent
    // dimensions, and a create that crossed them would be caught here.
    expect(row).toMatchObject({ region_lock_country: "FI", tag: null });
  });

  it("creates an unlocked product when p_region_lock_country is omitted", async () => {
    // Unlocked is the ordinary state and must stay reachable without a wire
    // shape for "explicitly null" — the reason the parameter is defaulted.
    const id = await createProduct();

    const { data: row } = await admin
      .from("products")
      .select("region_lock_country")
      .eq("id", id)
      .single();
    expect(row?.region_lock_country).toBeNull();
  });

  it("refuses a malformed country code with a CHECK violation", async () => {
    // The database holds the SHAPE invariant and nothing else: which countries
    // may be chosen is application config (the seeded half of
    // SUPPORTED_COUNTRIES) and lives in the write contract. What must never
    // reach the column is something that is not a country code at all — a
    // lower-case code included, since the shop compares the stored value
    // against a code that is always upper-case, and 'fi' would be a lock that
    // silently matches nobody. The failure has to be loud, so it is asserted
    // as a refusal rather than as a value read back.
    const { data, error } = await adminAuth.rpc("create_product", {
      p_product_type: "consumer_club",
      p_billing_mode: "free",
      p_translations: [
        { locale: "en", name: "Malformed", short_description: "" },
      ],
      p_topic: "minecraft_java",
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
      p_for_gamers: true,
      p_for_parents: false,
      p_min_age: 7,
      p_max_age: 12,
      p_region_lock_country: "fi",
    });
    expect(data).toBeNull();
    expect(error?.code).toBe("23514"); // check_violation
    expect(error?.message).toMatch(/region_lock_country/i);
  });

  it("non-admin (customer) is rejected with 42501", async () => {
    const customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );

    const { error } = await customer.rpc("create_product", {
      p_product_type: "consumer_club",
      p_billing_mode: "free",
      p_translations: [
        { locale: "en", name: "Hacker", short_description: "" },
      ],
      p_topic: "minecraft_java",
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "Europe/Helsinki",
      p_registration_opens_at: new Date().toISOString(),
      p_for_gamers: true,
      p_for_parents: false,
      p_min_age: 7,
      p_max_age: 12,
      p_tag: "neuroinclusive",
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });
});
