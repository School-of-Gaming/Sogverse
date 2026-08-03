import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * `profiles.home_location_id` — the parent's own place (migration 00137).
 *
 * Three things are worth proving here and are not proved anywhere else. The
 * column-grant audit in `authorization-spine.test.ts` says `authenticated` may
 * UPDATE this column and may not UPDATE `role`; `write-idor.test.ts` says a
 * `profiles` UPDATE cannot reach another user's row. What neither says is what
 * this column *accepts* — so:
 *
 *  1. the grant actually works end to end for the owner (a positive baseline,
 *     without which every negative below could pass vacuously),
 *  2. the foreign key is real, so a client-supplied id cannot store a dangling
 *     reference, and
 *  3. the referential action is SET NULL rather than RESTRICT — the deliberate
 *     trade in 00137, and the one that would be silently reversed by a future
 *     migration recreating the constraint without thinking about it.
 */
describe("profiles.home_location_id", () => {
  let admin: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;
  let customer2Client: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    customer2Client = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );
  });

  afterEach(async () => {
    await admin
      .from("profiles")
      .update({ home_location_id: null })
      .in("id", [TEST_IDS.CUSTOMER, TEST_IDS.CUSTOMER_2]);
  });

  async function storedLocationOf(userId: string) {
    const { data, error } = await admin
      .from("profiles")
      .select("home_location_id")
      .eq("id", userId)
      .single();

    expect(error).toBeNull();
    return data!.home_location_id;
  }

  it("a parent sets their own home location (baseline)", async () => {
    const { error } = await customerClient
      .from("profiles")
      .update({ home_location_id: TEST_IDS.LOCATION_MUNICIPALITY })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(error).toBeNull();
    expect(await storedLocationOf(TEST_IDS.CUSTOMER)).toBe(
      TEST_IDS.LOCATION_MUNICIPALITY,
    );
  });

  it("a parent clears their own home location", async () => {
    await admin
      .from("profiles")
      .update({ home_location_id: TEST_IDS.LOCATION_MUNICIPALITY })
      .eq("id", TEST_IDS.CUSTOMER);

    const { error } = await customerClient
      .from("profiles")
      .update({ home_location_id: null })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(error).toBeNull();
    expect(await storedLocationOf(TEST_IDS.CUSTOMER)).toBeNull();
  });

  it("a parent cannot set another parent's home location (IDOR)", async () => {
    // RLS scopes the statement rather than refusing it, so the tell is that the
    // target row is untouched — not an error. Asserting only on `error` here
    // would pass against a policy that let the write through.
    const { error } = await customer2Client
      .from("profiles")
      .update({ home_location_id: TEST_IDS.LOCATION_MUNICIPALITY })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(error).toBeNull();
    expect(await storedLocationOf(TEST_IDS.CUSTOMER)).toBeNull();
  });

  it("the column grant does not carry role with it", async () => {
    // The column-level grant exists precisely so that a table-wide UPDATE never
    // reaches `role`. A statement touching both must fail on the privilege, not
    // partially apply.
    const { error } = await customerClient
      .from("profiles")
      .update({
        home_location_id: TEST_IDS.LOCATION_MUNICIPALITY,
        role: "admin",
      })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(error?.code).toBe("42501");
    expect(await storedLocationOf(TEST_IDS.CUSTOMER)).toBeNull();
  });

  it("refuses an id that matches no location (foreign key)", async () => {
    const { error } = await customerClient
      .from("profiles")
      .update({
        home_location_id: "00000000-0000-0000-0000-0000000009ff",
      })
      .eq("id", TEST_IDS.CUSTOMER);

    // 23503 = foreign_key_violation. The value is client-supplied on every
    // write path this column has, so the FK is the only thing standing between
    // a typo and a dangling reference.
    expect(error?.code).toBe("23503");
    expect(await storedLocationOf(TEST_IDS.CUSTOMER)).toBeNull();
  });

  it("deleting the referenced location clears the reference (ON DELETE SET NULL)", async () => {
    // The judgement call in 00137, asserted from the outside: a location a
    // parent points at must never be undeletable, because reconciling an annual
    // classification release means retiring merged rows and profile data must
    // not hold that hostage. The cost — the parent's pick is silently emptied —
    // is exactly what the second assertion here pins.
    const { data: doomed, error: createError } = await admin
      .from("locations")
      .insert({
        name: "Home Location Delete Probe",
        type: "site",
        parent_id: TEST_IDS.LOCATION_MUNICIPALITY,
        country_code: "FI",
      })
      .select("id")
      .single();

    expect(createError).toBeNull();

    await admin
      .from("profiles")
      .update({ home_location_id: doomed!.id })
      .eq("id", TEST_IDS.CUSTOMER);

    const { error: deleteError } = await admin
      .from("locations")
      .delete()
      .eq("id", doomed!.id);

    expect(deleteError).toBeNull();
    expect(await storedLocationOf(TEST_IDS.CUSTOMER)).toBeNull();
  });
});
