import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * The profiles name CHECKs, on the path that makes them the database's rule
 * rather than the forms': a signed-in person updating their own names straight
 * through the Data API, which their column grants and the own-profile UPDATE
 * policy allow with no route in between.
 *
 * Every write here is either refused or writes back the value already stored,
 * so the seed rows other files read are never changed.
 */
describe("profiles names are stored trimmed", () => {
  let customer: SupabaseClient<Database>;
  let stored: { first_name: string; last_name: string };

  beforeAll(async () => {
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    const { data, error } = await customer
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", TEST_IDS.CUSTOMER)
      .single();
    if (error) throw error;
    stored = data;
  });

  async function updateOwn(update: { first_name?: string; last_name?: string }) {
    return customer.from("profiles").update(update).eq("id", TEST_IDS.CUSTOMER).select("id");
  }

  it("lets a person write their own names", async () => {
    // The control: the refusals below are the CHECK's, not the policy's.
    const { data, error } = await updateOwn(stored);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("refuses a first name padded with spaces", async () => {
    const { error } = await updateOwn({ first_name: ` ${stored.first_name} ` });

    expect(error?.code).toBe("23514");
  });

  it("refuses a first name of nothing but spaces", async () => {
    const { error } = await updateOwn({ first_name: "    " });

    expect(error?.code).toBe("23514");
  });

  it("refuses a first name that is one character once trimmed", async () => {
    const { error } = await updateOwn({ first_name: "A " });

    expect(error?.code).toBe("23514");
  });

  it("refuses a last name padded with spaces", async () => {
    const { error } = await updateOwn({ last_name: "Padded " });

    expect(error?.code).toBe("23514");
  });

  it("refuses a last name of nothing but spaces", async () => {
    const { error } = await updateOwn({ last_name: "  " });

    expect(error?.code).toBe("23514");
  });
});
