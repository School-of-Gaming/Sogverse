import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";
import { TEST_IDS } from "./constants";

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
