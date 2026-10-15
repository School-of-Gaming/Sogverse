import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { productListFacetsRow } from "@/services/products/products.contracts";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { deleteTestProducts } from "./product-helpers";

/**
 * `product_list_facets` — the admin product list's per-type counts and filter
 * options.
 *
 * What it exists to prove is the half of the list that lives in the database:
 * that every type gets its row with every count the caller could make for
 * themselves, that a municipality is derived from either shape the schema
 * allows a product's location, that the jsonb parses through the app's own
 * schema — and that `security_invoker` keeps the caller's own RLS the only
 * thing deciding any of it, which is the scope test the authorization spine
 * names.
 */
describe("product_list_facets", () => {
  /** Service-role — bypasses RLS. Setup, restore, and the expected counts. */
  let admin: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;
  let geduClient: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;

  /** A camp at a site under the seeded municipality, staffed by two gedus. */
  const CAMP = "00000000-0000-0000-0000-000000000fc1";
  /**
   * An online municipality club pointing at the municipality itself, whose
   * only educators are both gedus as trainees.
   */
  const MUNI_CLUB = "00000000-0000-0000-0000-000000000fc2";
  const GROUP = "00000000-0000-0000-0000-000000000fc3";
  const TRAINEE_GROUP = "00000000-0000-0000-0000-000000000fc4";
  const GROUPS = [GROUP, TRAINEE_GROUP];

  /** A second gedu, so one gedu's reading can be shown to leave the other out. */
  let otherGeduId = "";

  const facets = z.array(productListFacetsRow);

  async function readAs(
    client: SupabaseClient<Database>,
  ): Promise<z.infer<typeof facets>> {
    const { data, error } = await client
      .from("product_list_facets")
      .select(
        "product_type, product_count, gedu_ids, weekdays, spoken_language_codes, municipalities",
      );
    expect(error).toBeNull();
    return facets.parse(data);
  }

  function rowOf(
    rows: z.infer<typeof facets>,
    type: Database["public"]["Enums"]["product_type"],
  ) {
    const row = rows.find((r) => r.product_type === type);
    if (row === undefined) throw new Error(`no facets row for ${type}`);
    return row;
  }

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

    // Unique per run: CI's database keeps whatever a previous run left behind.
    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email: `facets-gedu-${Date.now()}@test.local`,
      password: "testpassword123",
      email_confirm: true,
      user_metadata: { first_name: "Facet", last_name: "Gedu" },
    });
    expect(userError).toBeNull();
    otherGeduId = created.user?.id ?? "";
    expect(otherGeduId).toBeTruthy();
    await admin.from("profiles").update({ role: "gedu" }).eq("id", otherGeduId);
    await admin.from("customer_profiles").delete().eq("user_id", otherGeduId);
    await admin.from("gedu_profiles").insert({ user_id: otherGeduId, certified: true });

    await admin.from("gedu_group_assignments").delete().in("group_id", GROUPS);
    await admin.from("gedu_group_trainees").delete().in("group_id", GROUPS);
    await deleteTestProducts(admin, [CAMP, MUNI_CLUB]);

    const common = {
      topic: "minecraft_java",
      billing_mode: "paid",
      seat_count: 10,
      start_date: "2025-06-02",
      end_date: "2025-06-06",
      registration_opens_at: "2025-05-01T00:00:00Z",
      timezone: "Europe/Helsinki",
      is_visible: false,
      for_gamers: true,
      min_age: 8,
      max_age: 18,
      created_by: TEST_IDS.ADMIN,
    } as const;
    const products = await admin.from("products").insert([
      {
        ...common,
        id: CAMP,
        product_type: "camp",
        spoken_language_code: "sv",
        is_remote: false,
        location_id: TEST_IDS.LOCATION_SITE,
      },
      {
        ...common,
        id: MUNI_CLUB,
        product_type: "municipality_club",
        spoken_language_code: "fi",
        is_remote: true,
        location_id: TEST_IDS.LOCATION_MUNICIPALITY,
      },
    ]);
    if (products.error) throw new Error(`seed products failed: ${products.error.message}`);

    const slot = await admin.from("schedule_slots").insert({
      product_id: CAMP,
      weekday: 4,
      start_time: "09:00",
      duration_minutes: 60,
    });
    if (slot.error) throw new Error(`seed slot failed: ${slot.error.message}`);

    const group = await admin.from("product_groups").insert([
      { id: GROUP, product_id: CAMP, name: "Facet crew" },
      { id: TRAINEE_GROUP, product_id: MUNI_CLUB, name: "Facet trainees" },
    ]);
    if (group.error) throw new Error(`seed group failed: ${group.error.message}`);

    const staff = await admin.from("gedu_group_assignments").insert([
      { group_id: GROUP, product_id: CAMP, gedu_id: TEST_IDS.GEDU, role: "primary" },
      { group_id: GROUP, product_id: CAMP, gedu_id: otherGeduId, role: "assistant" },
    ]);
    if (staff.error) throw new Error(`seed assignments failed: ${staff.error.message}`);

    const trainees = await admin.from("gedu_group_trainees").insert([
      { group_id: TRAINEE_GROUP, product_id: MUNI_CLUB, gedu_id: TEST_IDS.GEDU },
      { group_id: TRAINEE_GROUP, product_id: MUNI_CLUB, gedu_id: otherGeduId },
    ]);
    if (trainees.error) throw new Error(`seed trainees failed: ${trainees.error.message}`);
  });

  afterAll(async () => {
    await admin.from("gedu_group_assignments").delete().in("group_id", GROUPS);
    await admin.from("gedu_group_trainees").delete().in("group_id", GROUPS);
    await admin.from("product_groups").delete().in("id", GROUPS);
    await deleteTestProducts(admin, [CAMP, MUNI_CLUB]);
    if (otherGeduId) await admin.auth.admin.deleteUser(otherGeduId);
  });

  it("answers one row per product type, each counting what a direct read counts", async () => {
    const rows = await readAs(adminClient);

    const types = [...rows.map((r) => r.product_type)].sort();
    expect(types).toEqual(["camp", "consumer_club", "event", "municipality_club"]);

    for (const row of rows) {
      const { count, error } = await adminClient
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("product_type", row.product_type);
      expect(error).toBeNull();
      expect(row.product_count).toBe(count);
    }
  });

  it("collects a type's weekdays, languages and assigned gedus", async () => {
    const camp = rowOf(await readAs(adminClient), "camp");

    expect(camp.weekdays).toContain(4);
    expect(camp.spoken_language_codes).toContain("sv");
    expect(camp.gedu_ids).toEqual(
      expect.arrayContaining([TEST_IDS.GEDU, otherGeduId]),
    );
  });

  // The gedu filter matches a trainee seat as well as an assignment, so it
  // offers a gedu seated only as a trainee — once, sorted with the rest.
  it("offers a gedu seated only as a trainee", async () => {
    const club = rowOf(await readAs(adminClient), "municipality_club");

    expect(club.gedu_ids).toEqual(
      expect.arrayContaining([TEST_IDS.GEDU, otherGeduId]),
    );
    expect(new Set(club.gedu_ids).size).toBe(club.gedu_ids.length);
    expect(club.gedu_ids).toEqual([...club.gedu_ids].sort());
  });

  // The two shapes a municipality club's location may take: a site whose
  // parent is the municipality, and the municipality itself. Both name the
  // municipality — never the site.
  it("derives the municipality from a site's parent and from the municipality itself", async () => {
    const rows = await readAs(adminClient);
    const campMunis = rowOf(rows, "camp").municipalities.map((m) => m.id);
    const clubMunis = rowOf(rows, "municipality_club").municipalities.map(
      (m) => m.id,
    );

    expect(campMunis).toContain(TEST_IDS.LOCATION_MUNICIPALITY);
    expect(campMunis).not.toContain(TEST_IDS.LOCATION_SITE);
    expect(clubMunis).toContain(TEST_IDS.LOCATION_MUNICIPALITY);
    for (const muni of rowOf(rows, "camp").municipalities) {
      expect(muni.type).toBe("municipality");
    }
  });

  // The scope test. The same query, three callers: the gedu's own policies
  // admit only their own assignment and trainee rows, so the other gedu on the
  // same camp, and the other trainee on the same club, are absent from their
  // arrays — and a parent with no participation on either reads no seat at
  // all, a trainee seat being one no family path reaches. The counts are of
  // products, which every caller may read, so they agree.
  it("answers each caller only from the rows its own policies admit", async () => {
    const [asAdmin, asGedu, asCustomer] = await Promise.all(
      [adminClient, geduClient, customerClient].map(readAs),
    );

    for (const type of ["camp", "municipality_club"] as const) {
      expect(rowOf(asAdmin, type).gedu_ids).toEqual(
        expect.arrayContaining([TEST_IDS.GEDU, otherGeduId]),
      );
      expect(rowOf(asGedu, type).gedu_ids).toContain(TEST_IDS.GEDU);
      expect(rowOf(asGedu, type).gedu_ids).not.toContain(otherGeduId);
      expect(rowOf(asCustomer, type).gedu_ids).not.toContain(TEST_IDS.GEDU);
      expect(rowOf(asCustomer, type).gedu_ids).not.toContain(otherGeduId);
      expect(rowOf(asGedu, type).product_count).toBe(
        rowOf(asAdmin, type).product_count,
      );
    }
  });

  it("is not readable without signing in", async () => {
    const { error } = await createAnonTestClient()
      .from("product_list_facets")
      .select("product_type");

    expect(error?.code).toBe("42501");
  });
});
