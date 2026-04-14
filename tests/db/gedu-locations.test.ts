import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * Security-critical RLS coverage for gedu_locations (migration 00024).
 * The three negative tests lock in the "both actor AND target authorized"
 * pattern from the access-control rule — they're the safety net if anyone
 * rewrites the policy. The two positive tests anchor them: without a
 * baseline insert/read that works, the negatives could pass vacuously.
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

  it("gedu can insert their own coverage row (baseline)", async () => {
    // Anchors the "cannot insert for another gedu" test below — without
    // this, that test would pass even if gedu inserts were broken entirely.
    const { error } = await geduClient.from("gedu_locations").insert({
      gedu_id: TEST_IDS.GEDU,
      location_id: TEST_IDS.LOCATION_REGION,
    });

    expect(error).toBeNull();
  });

  it("gedu cannot insert a row for a different gedu (IDOR)", async () => {
    const { error } = await geduClient.from("gedu_locations").insert({
      gedu_id: TEST_IDS.ADMIN, // not the signed-in gedu
      location_id: TEST_IDS.LOCATION_SITE,
    });

    expect(error).not.toBeNull();
  });

  it("customer cannot insert a coverage row (actor role must be gedu)", async () => {
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

    expect(data ?? []).toEqual([]);
  });

  it("admin can read any gedu's coverage rows", async () => {
    // Proves the admin policy is in place — the customer-denial test above
    // would still pass if the admin policy was dropped entirely.
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
});
