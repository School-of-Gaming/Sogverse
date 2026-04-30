import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * RLS coverage for site_details_v2. The table holds the member-visible
 * site address + notes. Migration 00030 originally made it anon-readable;
 * 00038 tightened it to admin + gedu only. This test pins the new
 * behaviour so a future migration that loosens the policy fails CI
 * instead of silently leaking street addresses.
 *
 * The "purchasing customer can read" branch is intentionally absent —
 * v2 enrollments don't exist yet, so there's no predicate to test
 * against. When that table lands, extend the policy AND this test
 * together (positive: enrolled-family customer can read; negative:
 * customer with no enrollment cannot).
 */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function createAnonTestClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

describe("site_details_v2 RLS", () => {
  let admin: SupabaseClient<Database>;
  let anonClient: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;
  let geduClient: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;

  const TEST_ADDRESS = "Testikatu 42, 00100 Helsinki";

  beforeAll(async () => {
    admin = createAdminTestClient();
    anonClient = createAnonTestClient();
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

    // Seed the row via service role — the table requires a `site` location,
    // and TEST_IDS.LOCATION_SITE is the only seeded site location.
    await admin.from("site_details_v2").upsert({
      location_id: TEST_IDS.LOCATION_SITE,
      address: TEST_ADDRESS,
      notes: "Park out back",
    });
  });

  afterAll(async () => {
    await admin
      .from("site_details_v2")
      .delete()
      .eq("location_id", TEST_IDS.LOCATION_SITE);
  });

  // Positive controls — without these, the negatives could pass vacuously
  // (e.g., if the seed row never landed or if RLS hid the row from
  // everyone, the "anon sees nothing" assertion would still hold).

  it("admin can read site_details_v2", async () => {
    const { data, error } = await adminClient
      .from("site_details_v2")
      .select("address")
      .eq("location_id", TEST_IDS.LOCATION_SITE)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.address).toBe(TEST_ADDRESS);
  });

  it("gedu can read site_details_v2", async () => {
    const { data, error } = await geduClient
      .from("site_details_v2")
      .select("address")
      .eq("location_id", TEST_IDS.LOCATION_SITE)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.address).toBe(TEST_ADDRESS);
  });

  // Hardening assertions — these are the security-critical part.

  it("anon cannot read site_details_v2", async () => {
    const { data, error } = await anonClient
      .from("site_details_v2")
      .select("address")
      .eq("location_id", TEST_IDS.LOCATION_SITE);

    // RLS returns 0 rows rather than an error for SELECT, regardless of
    // whether the policy denies the row or the GRANT is missing.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("customer without an enrollment cannot read site_details_v2", async () => {
    const { data, error } = await customerClient
      .from("site_details_v2")
      .select("address")
      .eq("location_id", TEST_IDS.LOCATION_SITE);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
