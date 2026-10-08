import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";

describe("gamer_profiles date_of_birth constraint", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  afterAll(async () => {
    // Restore the seed DOB in case a test modified it
    await admin
      .from("gamer_profiles")
      .update({ date_of_birth: "2015-06-15" })
      .eq("user_id", TEST_IDS.GAMER);
  });

  it("should reject a future date_of_birth on INSERT", async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    // Use a fake UUID that doesn't exist — the CHECK fires before FK
    const { error } = await admin.from("gamer_profiles").insert({
      user_id: "00000000-0000-0000-0000-ffffffffffff",
      date_of_birth: futureDateStr,
      gender: "boy",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("gamer_profiles_date_of_birth_check");
  });

  it("should reject a future date_of_birth on UPDATE", async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const { error } = await admin
      .from("gamer_profiles")
      .update({ date_of_birth: futureDateStr })
      .eq("user_id", TEST_IDS.GAMER);

    expect(error).not.toBeNull();
    expect(error!.message).toContain("gamer_profiles_date_of_birth_check");
  });

  it("should accept today as date_of_birth", async () => {
    const today = new Date().toISOString().split("T")[0];

    const { error } = await admin
      .from("gamer_profiles")
      .update({ date_of_birth: today })
      .eq("user_id", TEST_IDS.GAMER);

    expect(error).toBeNull();
  });

  it("should accept a past date_of_birth", async () => {
    const { error } = await admin
      .from("gamer_profiles")
      .update({ date_of_birth: "2015-06-15" })
      .eq("user_id", TEST_IDS.GAMER);

    expect(error).toBeNull();
  });
});

/**
 * After creation a child's birth date and gender are written by admins alone.
 * The parent supplies them once, through the creation write, and the admin edit
 * card is the one surface that changes them; the child may read their own row
 * but not rewrite the age a gedu sees on the roster.
 *
 * `authenticated` holds UPDATE on both columns — it is the grant the admin edit
 * card writes through — so what refuses the gamer is the absence of any UPDATE
 * policy admitting their own row. The refusal is therefore zero rows affected,
 * not an error, and the admin case beside it is what keeps that from passing
 * because the write was impossible for everybody.
 */
describe("gamer_profiles birth date and gender writers", () => {
  const SEEDED = { date_of_birth: "2015-06-15", gender: "boy" } as const;

  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  async function storedFacts() {
    const { data, error } = await admin
      .from("gamer_profiles")
      .select("date_of_birth, gender")
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

  it("refuses the gamer rewriting their own date of birth", async () => {
    const { data, error } = await gamerAuth
      .from("gamer_profiles")
      .update({ date_of_birth: "2010-01-01" })
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

  it("lets an admin rewrite both", async () => {
    const { data, error } = await adminAuth
      .from("gamer_profiles")
      .update({ date_of_birth: "2014-03-01", gender: "non_binary" })
      .eq("user_id", TEST_IDS.GAMER)
      .select("user_id");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(await storedFacts()).toEqual({
      date_of_birth: "2014-03-01",
      gender: "non_binary",
    });

    await admin
      .from("gamer_profiles")
      .update(SEEDED)
      .eq("user_id", TEST_IDS.GAMER);
  });
});
