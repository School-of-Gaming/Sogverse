import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  ADMIN_PRODUCT_LIST_PAGE_SIZE,
  ProductsService,
  type AdminProductListFilters,
} from "@/services/products/products.service";
import { nextKeysetCursor } from "@/lib/supabase/keyset";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { deleteTestProducts } from "./product-helpers";

/**
 * The admin product list's page read, `ProductsService.getAdminListPage`, run
 * against a real PostgREST as a signed-in admin.
 *
 * The unit suite pins the URL the read builds; this pins what that URL means.
 * The filters over a product's children ride on aliased empty embeds with a
 * `not.is.null` on the alias, the municipality filter is an `or` scoped to
 * one of them, and the gedu filter narrows to the ids of the products the gedu
 * holds a seat on in either seat table — semantics only PostgREST can confirm:
 * that each keeps exactly the products with a matching child, that it never
 * narrows the children the row renders, that they AND with each other, and
 * that the count and the keyset cursor agree with the filtered set.
 *
 * Every fixture is created far in the future, so on a newest-first list the
 * file's own products lead every page whatever other files have created in a
 * parallel worker; each case then looks only at the fixtures it seeded.
 */
describe("ProductsService.getAdminListPage", () => {
  /** Service-role — bypasses RLS. Setup and teardown only. */
  let admin: SupabaseClient<Database>;
  let service: ProductsService;

  /** Online club, English: named in Finnish with an Ä, on Monday and Wednesday, taught by the seeded gedu. */
  const CLUB_MON_WED = "00000000-0000-0000-0000-0000000008d1";
  /** Online club, Swedish, on Wednesday, with the seeded gedu as its only educator — a trainee. */
  const CLUB_WED_SV = "00000000-0000-0000-0000-0000000008d2";
  /** Camp at a site whose parent is the municipality, Finnish, Friday, taught by the seeded gedu. */
  const CAMP_AT_SITE = "00000000-0000-0000-0000-0000000008d3";
  /** Online municipality club located at the municipality itself, Finnish, Monday. */
  const MUNI_AT_MUNI = "00000000-0000-0000-0000-0000000008d4";
  /** Online municipality club at the region above the municipality — the decoy for its filter. */
  const MUNI_AT_REGION = "00000000-0000-0000-0000-0000000008d5";
  const GROUP_CLUB = "00000000-0000-0000-0000-0000000008d8";
  const GROUP_CAMP = "00000000-0000-0000-0000-0000000008d9";
  const GROUP_TRAINEE = "00000000-0000-0000-0000-0000000008da";
  const GROUPS = [GROUP_CLUB, GROUP_CAMP, GROUP_TRAINEE];
  const FILTER_FIXTURES = [
    CLUB_MON_WED,
    CLUB_WED_SV,
    CAMP_AT_SITE,
    MUNI_AT_MUNI,
    MUNI_AT_REGION,
  ];

  /**
   * More products than one page holds, all found by one name only they carry.
   * They share three `created_at` values nine apiece, so the page boundary
   * falls inside a tie and only the id tiebreaker can place it.
   */
  const PAGING_MARKER = "Pgzq keyset";
  const PAGING_FIXTURES = Array.from(
    { length: ADMIN_PRODUCT_LIST_PAGE_SIZE + 2 },
    (_, i) => `00000000-0000-0000-0000-0000000008${(0xe0 + i).toString(16)}`,
  );

  const ALL_FIXTURES = [...FILTER_FIXTURES, ...PAGING_FIXTURES];

  const NO_FILTERS: AdminProductListFilters = {
    type: null,
    search: "",
    weekday: null,
    geduId: null,
    spokenLanguage: null,
    municipalityId: null,
  };

  /** The filter fixtures the first page keeps, in the page's own order. */
  async function fixturesMatching(
    filters: Partial<AdminProductListFilters>,
  ): Promise<string[]> {
    const page = await service.getAdminListPage({ ...NO_FILTERS, ...filters });
    return page.rows
      .map((row) => row.id)
      .filter((id) => FILTER_FIXTURES.includes(id));
  }

  async function cleanUp() {
    await admin.from("gedu_group_assignments").delete().in("group_id", GROUPS);
    await admin.from("gedu_group_trainees").delete().in("group_id", GROUPS);
    await admin.from("product_groups").delete().in("id", GROUPS);
    await deleteTestProducts(admin, ALL_FIXTURES);
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    service = new ProductsService(
      await createAuthenticatedClient(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
      ),
    );

    await cleanUp();

    const common = {
      topic: "minecraft_java",
      billing_mode: "paid",
      seat_count: 10,
      start_date: "2099-06-01",
      registration_opens_at: "2099-05-01T00:00:00Z",
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
        id: CLUB_MON_WED,
        product_type: "consumer_club",
        spoken_language_code: "en",
        is_remote: true,
        created_at: "2099-06-05T00:00:00Z",
      },
      {
        ...common,
        id: CLUB_WED_SV,
        product_type: "consumer_club",
        spoken_language_code: "sv",
        is_remote: true,
        created_at: "2099-06-04T00:00:00Z",
      },
      {
        ...common,
        id: CAMP_AT_SITE,
        product_type: "camp",
        spoken_language_code: "fi",
        is_remote: false,
        location_id: TEST_IDS.LOCATION_SITE,
        end_date: "2099-06-05",
        created_at: "2099-06-03T00:00:00Z",
      },
      {
        ...common,
        id: MUNI_AT_MUNI,
        product_type: "municipality_club",
        spoken_language_code: "fi",
        is_remote: true,
        location_id: TEST_IDS.LOCATION_MUNICIPALITY,
        end_date: "2099-12-31",
        created_at: "2099-06-02T00:00:00Z",
      },
      {
        ...common,
        id: MUNI_AT_REGION,
        product_type: "municipality_club",
        spoken_language_code: "en",
        is_remote: true,
        location_id: TEST_IDS.LOCATION_REGION,
        end_date: "2099-12-31",
        created_at: "2099-06-01T00:00:00Z",
      },
      ...PAGING_FIXTURES.map((id, i) => ({
        ...common,
        id,
        product_type: "consumer_club" as const,
        spoken_language_code: "en" as const,
        is_remote: true,
        created_at: `2099-01-01T00:00:0${Math.floor(i / 9) + 1}Z`,
      })),
    ]);
    if (products.error) throw new Error(`seed products failed: ${products.error.message}`);

    const translation = (product_id: string, locale: string, name: string) => ({
      product_id,
      locale,
      name,
      short_description: "Fixture",
    });
    const translations = await admin.from("product_translations").insert([
      translation(CLUB_MON_WED, "en", "Sound world club"),
      translation(CLUB_MON_WED, "fi", "Äänimaailman kerho"),
      translation(CLUB_WED_SV, "en", "Bravo crafters"),
      translation(CAMP_AT_SITE, "en", "Site camp"),
      translation(MUNI_AT_MUNI, "en", "Municipality club"),
      translation(MUNI_AT_REGION, "en", "Region club"),
      ...PAGING_FIXTURES.map((id, i) => translation(id, "en", `${PAGING_MARKER} ${i}`)),
    ]);
    if (translations.error) {
      throw new Error(`seed translations failed: ${translations.error.message}`);
    }

    const slot = (product_id: string, weekday: number) => ({
      product_id,
      weekday,
      start_time: "17:00",
      duration_minutes: 60,
    });
    const slots = await admin
      .from("schedule_slots")
      .insert([
        slot(CLUB_MON_WED, 0),
        slot(CLUB_MON_WED, 2),
        slot(CLUB_WED_SV, 2),
        slot(CAMP_AT_SITE, 4),
        slot(MUNI_AT_MUNI, 0),
      ]);
    if (slots.error) throw new Error(`seed slots failed: ${slots.error.message}`);

    const groups = await admin.from("product_groups").insert([
      { id: GROUP_CLUB, product_id: CLUB_MON_WED, name: "List crew" },
      { id: GROUP_CAMP, product_id: CAMP_AT_SITE, name: "List camp crew" },
      { id: GROUP_TRAINEE, product_id: CLUB_WED_SV, name: "List trainee crew" },
    ]);
    if (groups.error) throw new Error(`seed groups failed: ${groups.error.message}`);

    const staff = await admin.from("gedu_group_assignments").insert([
      { group_id: GROUP_CLUB, product_id: CLUB_MON_WED, gedu_id: TEST_IDS.GEDU, role: "primary" },
      { group_id: GROUP_CAMP, product_id: CAMP_AT_SITE, gedu_id: TEST_IDS.GEDU, role: "primary" },
    ]);
    if (staff.error) throw new Error(`seed assignments failed: ${staff.error.message}`);

    const trainee = await admin
      .from("gedu_group_trainees")
      .insert({ group_id: GROUP_TRAINEE, product_id: CLUB_WED_SV, gedu_id: TEST_IDS.GEDU });
    if (trainee.error) throw new Error(`seed trainee failed: ${trainee.error.message}`);
  });

  afterAll(cleanUp);

  describe("each filter keeps exactly the products with a matching child", () => {
    it("searches every locale's name, not only English", async () => {
      expect(await fixturesMatching({ search: "äänimaailma" })).toEqual([CLUB_MON_WED]);
    });

    it("searches case-insensitively beyond ASCII", async () => {
      expect(await fixturesMatching({ search: "ÄÄNIMAAILMA" })).toEqual([CLUB_MON_WED]);
      expect(await fixturesMatching({ search: "bRAVO" })).toEqual([CLUB_WED_SV]);
    });

    it("keeps the products scheduled on the weekday", async () => {
      expect(await fixturesMatching({ weekday: 0 })).toEqual([CLUB_MON_WED, MUNI_AT_MUNI]);
      expect(await fixturesMatching({ weekday: 2 })).toEqual([CLUB_MON_WED, CLUB_WED_SV]);
      expect(await fixturesMatching({ weekday: 6 })).toEqual([]);
    });

    // Assigned on two products, a trainee on a third that has no other
    // educator: a trainee seat alone is enough to match.
    it("keeps the products the gedu is assigned to or a trainee on", async () => {
      expect(await fixturesMatching({ geduId: TEST_IDS.GEDU })).toEqual([
        CLUB_MON_WED,
        CLUB_WED_SV,
        CAMP_AT_SITE,
      ]);
    });

    // Not a version-4 id, so no auth user — and so no seat — carries it.
    it("keeps no product for a gedu seated nowhere", async () => {
      const page = await service.getAdminListPage({
        ...NO_FILTERS,
        geduId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      });
      expect(page.rows).toEqual([]);
      expect(page.total).toBe(0);
    });

    it("keeps the products delivered in the spoken language", async () => {
      expect(await fixturesMatching({ spokenLanguage: "sv" })).toEqual([CLUB_WED_SV]);
      expect(await fixturesMatching({ spokenLanguage: "fi" })).toEqual([
        CAMP_AT_SITE,
        MUNI_AT_MUNI,
      ]);
    });

    // The two shapes a product's location may take under a municipality: a
    // site whose parent is the municipality, and the municipality itself. The
    // club at the region above it is in neither.
    it("keeps the products at the municipality or at a site under it", async () => {
      expect(
        await fixturesMatching({ municipalityId: TEST_IDS.LOCATION_MUNICIPALITY }),
      ).toEqual([CAMP_AT_SITE, MUNI_AT_MUNI]);
    });
  });

  it("filters on a weekday without narrowing the days the row renders", async () => {
    const page = await service.getAdminListPage({ ...NO_FILTERS, weekday: 0 });
    const club = page.rows.find((row) => row.id === CLUB_MON_WED);

    expect(club?.schedule_slots.map((s) => s.weekday).sort()).toEqual([0, 2]);
  });

  it("filters on a name without narrowing the names the row renders", async () => {
    const page = await service.getAdminListPage({ ...NO_FILTERS, search: "Äänimaailma" });
    const club = page.rows.find((row) => row.id === CLUB_MON_WED);

    expect(club?.product_translations.map((t) => t.locale).sort()).toEqual(["en", "fi"]);
  });

  it("ANDs the filters together", async () => {
    expect(await fixturesMatching({ weekday: 0, geduId: TEST_IDS.GEDU })).toEqual([
      CLUB_MON_WED,
    ]);
    // The trainee-only club ANDs like an assigned one: in on its weekday and
    // its language, out under another type.
    expect(await fixturesMatching({ weekday: 2, geduId: TEST_IDS.GEDU })).toEqual([
      CLUB_MON_WED,
      CLUB_WED_SV,
    ]);
    expect(
      await fixturesMatching({ spokenLanguage: "sv", geduId: TEST_IDS.GEDU }),
    ).toEqual([CLUB_WED_SV]);
    expect(
      await fixturesMatching({ search: "bravo", type: "camp", geduId: TEST_IDS.GEDU }),
    ).toEqual([]);
    expect(
      await fixturesMatching({
        weekday: 0,
        municipalityId: TEST_IDS.LOCATION_MUNICIPALITY,
      }),
    ).toEqual([MUNI_AT_MUNI]);
    expect(
      await fixturesMatching({
        type: "camp",
        municipalityId: TEST_IDS.LOCATION_MUNICIPALITY,
        geduId: TEST_IDS.GEDU,
      }),
    ).toEqual([CAMP_AT_SITE]);
    expect(await fixturesMatching({ spokenLanguage: "sv", weekday: 0 })).toEqual([]);
    expect(await fixturesMatching({ search: "bravo", weekday: 2 })).toEqual([CLUB_WED_SV]);
    expect(await fixturesMatching({ search: "bravo", weekday: 0 })).toEqual([]);
  });

  it("counts the filtered set on the first page only", async () => {
    const first = await service.getAdminListPage({ ...NO_FILTERS, search: "Äänimaailma" });
    expect(first.total).toBe(1);

    const paging = await service.getAdminListPage({ ...NO_FILTERS, search: PAGING_MARKER });
    expect(paging.total).toBe(PAGING_FIXTURES.length);
  });

  it("resumes after the cursor without repeating or dropping a row", async () => {
    const filters = { ...NO_FILTERS, search: PAGING_MARKER };

    const first = await service.getAdminListPage(filters);
    expect(first.rows).toHaveLength(ADMIN_PRODUCT_LIST_PAGE_SIZE);

    const cursor = nextKeysetCursor(first.rows, ADMIN_PRODUCT_LIST_PAGE_SIZE);
    expect(cursor).toBeDefined();
    const second = await service.getAdminListPage(filters, { cursor });
    expect(second.total).toBeNull();
    expect(nextKeysetCursor(second.rows, ADMIN_PRODUCT_LIST_PAGE_SIZE)).toBeUndefined();

    // Newest first, ties broken by id ascending.
    const expected = [...PAGING_FIXTURES]
      .map((id, i) => ({ id, at: Math.floor(i / 9) }))
      .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
      .map((row) => row.id);
    expect([...first.rows, ...second.rows].map((row) => row.id)).toEqual(expected);
  });
});
