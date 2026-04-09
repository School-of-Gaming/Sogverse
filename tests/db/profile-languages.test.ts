import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

describe("Profile languages validation", () => {
  let admin: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password
    );
  });

  afterEach(async () => {
    // Reset languages to empty array
    await admin
      .from("profiles")
      .update({ languages: [] })
      .eq("id", TEST_IDS.CUSTOMER);
  });

  it("accepts valid language codes", async () => {
    const { error } = await customer
      .from("profiles")
      .update({ languages: ["fi", "en"] })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(error).toBeNull();
  });

  it("accepts an empty array", async () => {
    const { error } = await customer
      .from("profiles")
      .update({ languages: [] })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(error).toBeNull();
  });

  it("rejects invalid language codes", async () => {
    const { error } = await customer
      .from("profiles")
      .update({ languages: ["fi", "xx"] })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(error).not.toBeNull();
    expect(error!.message).toContain("Invalid language code");
  });

  it("rejects duplicate language codes", async () => {
    const { error } = await customer
      .from("profiles")
      .update({ languages: ["fi", "fi"] })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(error).not.toBeNull();
    expect(error!.message).toContain("Duplicate language codes");
  });
});
