import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * RLS coverage for the gedu_locations table (migration 00024):
 *   - Gedus can read/write their own rows (self-only, actor-must-be-gedu).
 *   - Admins can read/write any rows.
 *   - Non-gedu, non-admin users cannot read or write rows for any gedu.
 */
describe("gedu_locations RLS", () => {
  let admin: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;
  let geduClient: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    geduClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
    customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
  });

  afterEach(async () => {
    await admin.from("gedu_locations").delete().eq("gedu_id", TEST_IDS.GEDU);
  });

  it("gedu can insert their own coverage row", async () => {
    const { error } = await geduClient.from("gedu_locations").insert({
      gedu_id: TEST_IDS.GEDU,
      location_id: TEST_IDS.LOCATION_REGION,
    });

    expect(error).toBeNull();
  });

  it("gedu can read their own coverage rows", async () => {
    await admin.from("gedu_locations").insert({
      gedu_id: TEST_IDS.GEDU,
      location_id: TEST_IDS.LOCATION_MUNICIPALITY,
    });

    const { data, error } = await geduClient
      .from("gedu_locations")
      .select("*")
      .eq("gedu_id", TEST_IDS.GEDU);

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThanOrEqual(1);
  });

  it("gedu cannot insert a row for a different gedu (WITH CHECK)", async () => {
    const { error } = await geduClient.from("gedu_locations").insert({
      gedu_id: TEST_IDS.ADMIN, // not the signed-in gedu
      location_id: TEST_IDS.LOCATION_SITE,
    });

    expect(error).not.toBeNull();
  });

  it("customer cannot insert their own coverage row (role must be gedu)", async () => {
    const { error } = await customerClient.from("gedu_locations").insert({
      gedu_id: TEST_IDS.CUSTOMER,
      location_id: TEST_IDS.LOCATION_SITE,
    });

    expect(error).not.toBeNull();
  });

  it("customer cannot read other gedus' coverage rows", async () => {
    await admin.from("gedu_locations").insert({
      gedu_id: TEST_IDS.GEDU,
      location_id: TEST_IDS.LOCATION_REGION,
    });

    const { data } = await customerClient
      .from("gedu_locations")
      .select("*")
      .eq("gedu_id", TEST_IDS.GEDU);

    // Either empty result (no rows visible) or explicit denial — not a row leak.
    expect(data ?? []).toEqual([]);
  });

  it("admin can read any gedu's coverage rows", async () => {
    await admin.from("gedu_locations").insert({
      gedu_id: TEST_IDS.GEDU,
      location_id: TEST_IDS.LOCATION_REGION,
    });

    const { data, error } = await adminClient
      .from("gedu_locations")
      .select("*")
      .eq("gedu_id", TEST_IDS.GEDU);

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThanOrEqual(1);
  });

  it("admin can insert a coverage row for any gedu", async () => {
    const { error } = await adminClient.from("gedu_locations").insert({
      gedu_id: TEST_IDS.GEDU,
      location_id: TEST_IDS.LOCATION_SITE,
    });

    expect(error).toBeNull();
  });

  it("gedu can delete their own row, preserving sibling data", async () => {
    await admin.from("gedu_locations").insert([
      { gedu_id: TEST_IDS.GEDU, location_id: TEST_IDS.LOCATION_REGION },
      { gedu_id: TEST_IDS.GEDU, location_id: TEST_IDS.LOCATION_MUNICIPALITY },
    ]);

    const { error } = await geduClient
      .from("gedu_locations")
      .delete()
      .eq("gedu_id", TEST_IDS.GEDU)
      .eq("location_id", TEST_IDS.LOCATION_REGION);

    expect(error).toBeNull();

    const { data } = await admin
      .from("gedu_locations")
      .select("location_id")
      .eq("gedu_id", TEST_IDS.GEDU);

    expect(data?.map((r) => r.location_id)).toEqual([TEST_IDS.LOCATION_MUNICIPALITY]);
  });
});
