import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  accessTokenFor,
  createAdminTestClient,
  createAuthenticatedClient,
  patchRaw,
} from "./helpers";
import { SEED, TEST_CREDENTIALS, TEST_IDS } from "./constants";

/**
 * A child's birth is a year and a month, and the table refuses anything that
 * is not one: a month outside 1–12, a year before 1900, a year and month still
 * in the future, and either half missing. There is no day column to test.
 *
 * "Now" is read in UTC, the zone the database's CURRENT_DATE answers in; the
 * future case is a whole year ahead so no boundary can make it ambiguous.
 */
describe("gamer_profiles birth year and month constraints", () => {
  // Never inserted: each CHECK fires before the foreign key would.
  const NO_SUCH_USER = "00000000-0000-0000-0000-ffffffffffff";

  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  afterAll(async () => {
    await admin
      .from("gamer_profiles")
      .update(SEED.GAMER_BIRTH)
      .eq("user_id", TEST_IDS.GAMER);
  });

  function thisMonth() {
    const now = new Date();
    return { birth_year: now.getUTCFullYear(), birth_month: now.getUTCMonth() + 1 };
  }

  it.each([0, 13])("refuses birth month %i", async (birth_month) => {
    const { error } = await admin
      .from("gamer_profiles")
      .update({ birth_month })
      .eq("user_id", TEST_IDS.GAMER);

    expect(error?.message).toContain("gamer_profiles_birth_month_check");
  });

  it("refuses a birth year before 1900", async () => {
    const { error } = await admin
      .from("gamer_profiles")
      .update({ birth_year: 1899 })
      .eq("user_id", TEST_IDS.GAMER);

    expect(error?.message).toContain("gamer_profiles_birth_year_check");
  });

  it("refuses a birth month in the future on INSERT", async () => {
    const { birth_year, birth_month } = thisMonth();
    const { error } = await admin.from("gamer_profiles").insert({
      user_id: NO_SUCH_USER,
      birth_year: birth_year + 1,
      birth_month,
    });

    expect(error?.message).toContain("gamer_profiles_birth_not_future_check");
  });

  it("refuses a birth month in the future on UPDATE", async () => {
    const { birth_year, birth_month } = thisMonth();
    const { error } = await admin
      .from("gamer_profiles")
      .update({ birth_year: birth_year + 1, birth_month })
      .eq("user_id", TEST_IDS.GAMER);

    expect(error?.message).toContain("gamer_profiles_birth_not_future_check");
  });

  it("accepts the current month", async () => {
    const { error } = await admin
      .from("gamer_profiles")
      .update(thisMonth())
      .eq("user_id", TEST_IDS.GAMER);

    expect(error).toBeNull();
  });

  it("accepts a past month", async () => {
    const { error } = await admin
      .from("gamer_profiles")
      .update(SEED.GAMER_BIRTH)
      .eq("user_id", TEST_IDS.GAMER);

    expect(error).toBeNull();
  });

  it("refuses a year without a month, and a month without a year", async () => {
    // The generated types already forbid a null half, so the request is built
    // without them — the same PATCH the admin edit card sends, on the admin's
    // own session — to prove the database refuses it as well.
    const token = await accessTokenFor(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    const row = `gamer_profiles?user_id=eq.${TEST_IDS.GAMER}`;

    const noMonth = await patchRaw(token, row, { birth_month: null });
    const noYear = await patchRaw(token, row, { birth_year: null });

    expect(noMonth.code).toBe("23502");
    expect(noMonth.message).toContain("birth_month");
    expect(noYear.code).toBe("23502");
    expect(noYear.message).toContain("birth_year");
  });
});

/**
 * After creation a child's birth year and month and gender are written by
 * admins alone. The parent supplies them once, through the creation write, and
 * the admin edit card is the one surface that changes them; the child may read
 * their own row but not rewrite the age a gedu sees on the roster.
 *
 * `authenticated` holds UPDATE on the three columns — it is the grant the admin
 * edit card writes through — so what refuses the gamer is the absence of any
 * UPDATE policy admitting their own row. The refusal is therefore zero rows
 * affected, not an error, and the admin case beside it is what keeps that from
 * passing because the write was impossible for everybody.
 */
describe("gamer_profiles birth and gender writers", () => {
  const SEEDED = { ...SEED.GAMER_BIRTH, gender: "boy" } as const;

  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  async function storedFacts() {
    const { data, error } = await admin
      .from("gamer_profiles")
      .select("birth_year, birth_month, gender")
      .eq("user_id", TEST_IDS.GAMER)
      .single();
    expect(error).toBeNull();
    return data;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    gamerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
  });

  afterAll(async () => {
    await admin
      .from("gamer_profiles")
      .update(SEEDED)
      .eq("user_id", TEST_IDS.GAMER);
  });

  it("lets the gamer see their own row, so a refusal below is the missing policy", async () => {
    const { data, error } = await gamerAuth
      .from("gamer_profiles")
      .select("user_id")
      .eq("user_id", TEST_IDS.GAMER);

    expect(error).toBeNull();
    expect(data).toEqual([{ user_id: TEST_IDS.GAMER }]);
  });

  it("refuses the gamer rewriting their own birth year and month", async () => {
    const { data, error } = await gamerAuth
      .from("gamer_profiles")
      .update({ birth_year: 2010, birth_month: 1 })
      .eq("user_id", TEST_IDS.GAMER)
      .select("user_id");

    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await storedFacts()).toEqual(SEEDED);
  });

  it("refuses the gamer rewriting their own gender", async () => {
    const { data, error } = await gamerAuth
      .from("gamer_profiles")
      .update({ gender: "girl" })
      .eq("user_id", TEST_IDS.GAMER)
      .select("user_id");

    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await storedFacts()).toEqual(SEEDED);
  });

  it("lets an admin rewrite all three", async () => {
    const { data, error } = await adminAuth
      .from("gamer_profiles")
      .update({ birth_year: 2014, birth_month: 3, gender: "non_binary" })
      .eq("user_id", TEST_IDS.GAMER)
      .select("user_id");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(await storedFacts()).toEqual({
      birth_year: 2014,
      birth_month: 3,
      gender: "non_binary",
    });

    await admin
      .from("gamer_profiles")
      .update(SEEDED)
      .eq("user_id", TEST_IDS.GAMER);
  });
});
