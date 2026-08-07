import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { LocationsService } from "@/services/locations/locations.service";
import { locationSearchResult } from "@/services/locations/locations.contracts";
import { createAdminTestClient, createAnonTestClient } from "./helpers";
import { TEST_IDS } from "./constants";

/**
 * The GeoNames groundwork columns (migration 00154) and what each read does
 * with them.
 *
 * Three things are verified here that nothing else can verify:
 *
 *  - **`depth` is maintained, not merely defaulted.** It is written by a
 *    BEFORE INSERT/UPDATE trigger and consumed by the search function's
 *    ranking, so a wrong value is invisible until a search comes back in the
 *    wrong order. The trigger cases below drive every shape a write can take,
 *    and a separate block checks the recursive backfill landed on the real
 *    seeded tree.
 *  - **Retirement hides a row from the reads that OFFER a place and from
 *    nowhere else.** That split is the whole reason the column exists rather
 *    than a DELETE: `gedu_locations.location_id` cascades, so deleting a
 *    superseded place silently erases a gedu's coverage. A retired row must
 *    keep resolving through the keyed reads a stored pick uses, and must keep
 *    rendering as an ancestor of rows below it.
 *  - **`geonames_id` is unique where present**, which is what lets ingestion
 *    and sync dedupe on it.
 *
 * Fixtures are a throwaway country (`ZZ`), because every assertion here needs
 * rows in states the real seeded tree does not have — retired ones, a site
 * parked directly under a country row — and must not disturb Finland or France.
 * One extra fixture site is created inside the seeded FI tree, purely so the
 * country restriction has a mixed match set to narrow.
 */

/** Fixture ids, outside the ranges seed.sql uses. */
const ZZ = {
  COUNTRY: "00000000-0000-0000-0000-000000000900",
  REGION: "00000000-0000-0000-0000-000000000901",
  OLD_REGION: "00000000-0000-0000-0000-000000000902",
  MUNICIPALITY: "00000000-0000-0000-0000-000000000903",
  RETIRED_MUNICIPALITY: "00000000-0000-0000-0000-000000000904",
  /** Live, but under the retired region — the ancestor-walk case. */
  UNDEAD_MUNICIPALITY: "00000000-0000-0000-0000-000000000905",
  VENUE: "00000000-0000-0000-0000-000000000906",
  /** Parked directly under the country row: depth 1, but still a venue. */
  ANNEX: "00000000-0000-0000-0000-000000000907",
  /** A venue inside the seeded FI fixture tree, for the country restriction. */
  FI_VENUE: "00000000-0000-0000-0000-000000000908",
  /** Scratch rows the trigger cases write and rewrite. */
  SCRATCH: "00000000-0000-0000-0000-000000000909",
  SCRATCH_2: "00000000-0000-0000-0000-00000000090a",
} as const;

const FIXTURE_IDS = Object.values(ZZ);

/** Every fixture name starts with this, so one needle finds exactly them. */
const NEEDLE = "zzgw";

async function search(
  client: SupabaseClient<Database>,
  args: {
    p_query: string;
    p_types?: Database["public"]["Enums"]["location_type"][];
    p_limit?: number;
    p_country?: string;
  },
) {
  const { data, error } = await client.rpc("search_locations", args);
  if (error) throw error;
  return locationSearchResult.parse(data);
}

const names = (result: { results: { name: string }[] }) =>
  result.results.map((row) => row.name);

describe("locations GeoNames groundwork", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let service: LocationsService;

  beforeAll(async () => {
    admin = createAdminTestClient();
    anon = createAnonTestClient();
    service = new LocationsService(admin);

    // Deleted first so a previous failed run cannot leave the tree half-built.
    // Bottom-up: parent_id is ON DELETE RESTRICT.
    await admin.from("locations").delete().in("id", [...FIXTURE_IDS].reverse());

    // `depth` is deliberately not written by any of these inserts — the trigger
    // computes it, and an emitted value would be decorative.
    const { error } = await admin.from("locations").insert([
      {
        id: ZZ.COUNTRY,
        name: "Zzgwland",
        type: "country",
        parent_id: null,
        country_code: "ZZ",
      },
      {
        id: ZZ.REGION,
        name: "Zzgwregion",
        type: "region",
        parent_id: ZZ.COUNTRY,
        country_code: "ZZ",
      },
      {
        id: ZZ.OLD_REGION,
        name: "Zzgwoldregion",
        type: "region",
        parent_id: ZZ.COUNTRY,
        country_code: "ZZ",
        retired_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: ZZ.MUNICIPALITY,
        name: "Zzgwmuni",
        type: "municipality",
        parent_id: ZZ.REGION,
        country_code: "ZZ",
      },
      {
        id: ZZ.RETIRED_MUNICIPALITY,
        name: "Zzgwgone",
        type: "municipality",
        parent_id: ZZ.REGION,
        country_code: "ZZ",
        retired_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: ZZ.UNDEAD_MUNICIPALITY,
        name: "Zzgwundead",
        type: "municipality",
        parent_id: ZZ.OLD_REGION,
        country_code: "ZZ",
      },
      {
        id: ZZ.VENUE,
        name: "Zzgwvenue",
        type: "site",
        parent_id: ZZ.MUNICIPALITY,
        country_code: "ZZ",
      },
      {
        id: ZZ.ANNEX,
        name: "Zzgwannex",
        type: "site",
        parent_id: ZZ.COUNTRY,
        country_code: "ZZ",
      },
      {
        id: ZZ.FI_VENUE,
        name: "Zzgwsuomi",
        type: "site",
        parent_id: TEST_IDS.LOCATION_MUNICIPALITY,
        country_code: "FI",
      },
    ]);
    if (error) throw error;
  });

  afterAll(async () => {
    await admin.from("locations").delete().in("id", [...FIXTURE_IDS].reverse());
  });

  // -------------------------------------------------------------------------
  // The depth trigger
  // -------------------------------------------------------------------------

  describe("the depth trigger", () => {
    // The scratch rows end this block as a parentless `site`, which is a shape
    // the whole-table invariants below are entitled to reject. They are the
    // trigger's material, not fixtures, so they go as soon as it is done.
    afterAll(async () => {
      await admin
        .from("locations")
        .delete()
        .in("id", [ZZ.SCRATCH, ZZ.SCRATCH_2]);
    });

    async function depthOf(id: string): Promise<number> {
      const { data, error } = await admin
        .from("locations")
        .select("depth")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data.depth;
    }

    it("stamps 0 on a row with no parent and parent + 1 below it", async () => {
      expect(await depthOf(ZZ.COUNTRY)).toBe(0);
      expect(await depthOf(ZZ.REGION)).toBe(1);
      expect(await depthOf(ZZ.MUNICIPALITY)).toBe(2);
      expect(await depthOf(ZZ.VENUE)).toBe(3);
    });

    it("overwrites a depth the writer supplied on insert", async () => {
      // The column has a DEFAULT so it stays optional in the generated Insert
      // type, which means a caller *can* name it. It must not be believed.
      const { error } = await admin.from("locations").insert({
        id: ZZ.SCRATCH,
        name: "Zzgwscratch",
        type: "site",
        parent_id: ZZ.MUNICIPALITY,
        country_code: "ZZ",
        depth: 99,
      });
      if (error) throw error;

      expect(await depthOf(ZZ.SCRATCH)).toBe(3);
    });

    it("recomputes depth when a leaf is re-parented", async () => {
      // Sites are the only rows anything re-parents — the FI/FR cutover moves
      // them and nothing else, which is exactly why a row trigger suffices.
      const { error } = await admin
        .from("locations")
        .update({ parent_id: ZZ.COUNTRY })
        .eq("id", ZZ.SCRATCH);
      if (error) throw error;

      expect(await depthOf(ZZ.SCRATCH)).toBe(1);
    });

    it("overwrites a depth the writer supplied on update", async () => {
      const { error } = await admin
        .from("locations")
        .update({ depth: 42 })
        .eq("id", ZZ.SCRATCH);
      if (error) throw error;

      expect(await depthOf(ZZ.SCRATCH)).toBe(1);
    });

    it("returns a re-rooted row to depth 0", async () => {
      const { error } = await admin
        .from("locations")
        .update({ parent_id: null })
        .eq("id", ZZ.SCRATCH);
      if (error) throw error;

      expect(await depthOf(ZZ.SCRATCH)).toBe(0);
    });

    it("refuses a parent that is not a row, as a foreign-key violation", async () => {
      // A BEFORE trigger runs ahead of the FK check, so this is the trigger's
      // error rather than the constraint's — it must still read as one, not as
      // a NOT NULL violation on `depth`.
      const { error } = await admin.from("locations").insert({
        id: ZZ.SCRATCH_2,
        name: "Zzgworphan",
        type: "site",
        parent_id: "00000000-0000-0000-0000-0000000009ff",
        country_code: "ZZ",
      });

      expect(error?.code).toBe("23503");
    });
  });

  // -------------------------------------------------------------------------
  // The recursive backfill, on the real seeded tree
  // -------------------------------------------------------------------------

  describe("the depth backfill", () => {
    /** How many rows of a level sit at some depth other than the expected one. */
    async function wrongDepth(
      filter: { type: Database["public"]["Enums"]["location_type"]; country?: string },
      expected: number,
    ): Promise<number | null> {
      let query = admin
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("type", filter.type)
        .neq("depth", expected);
      if (filter.country) query = query.eq("country_code", filter.country);

      const { count, error } = await query;
      if (error) throw error;
      return count;
    }

    it("put every seeded level at its real distance from the root", async () => {
      // Finland skips `district`, so its kunnat sit one level shallower than
      // France's communes — which is precisely the thing the enum-order
      // ranking could not see and `depth` can.
      expect(await wrongDepth({ type: "country" }, 0)).toBe(0);
      expect(await wrongDepth({ type: "region" }, 1)).toBe(0);
      expect(await wrongDepth({ type: "district" }, 2)).toBe(0);
      expect(await wrongDepth({ type: "municipality", country: "FI" }, 2)).toBe(0);
      expect(await wrongDepth({ type: "municipality", country: "FR" }, 3)).toBe(0);
      expect(await wrongDepth({ type: "municipality", country: "SE" }, 2)).toBe(0);
      // The UK is the one whose uniform depth is a decision rather than a
      // consequence: GeoNames files London's boroughs a rung deeper than every
      // other authority in the country, and the config lifts them so a borough
      // and a shire county sit at the same distance from the root.
      expect(await wrongDepth({ type: "municipality", country: "GB" }, 2)).toBe(0);
    });

    it("keeps every site exactly one level below its parent", async () => {
      const { data, error } = await admin
        .from("locations")
        .select("id, name, depth, parent:parent_id(depth)")
        .eq("type", "site");
      if (error) throw error;

      const offenders = data.filter(
        (row) => row.parent === null || row.depth !== row.parent.depth + 1,
      );
      expect(offenders.map((row) => row.name)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // country_code on sites
  // -------------------------------------------------------------------------

  it("carries the parent's country code on every site", async () => {
    // Denormalized purely so country filtering needs no recursion, which makes
    // the parent's code the only value that can be right. The create route
    // derives it server-side; 00154 backfilled the rows written before it did.
    const { data, error } = await admin
      .from("locations")
      .select("id, name, country_code, parent:parent_id(country_code)")
      .eq("type", "site");
    if (error) throw error;

    const offenders = data.filter(
      (row) => row.parent === null || row.country_code !== row.parent.country_code,
    );
    expect(offenders.map((row) => row.name)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // geonames_id
  // -------------------------------------------------------------------------

  describe("geonames_id", () => {
    it("refuses a second row claiming the same upstream key", async () => {
      // Negative on purpose: GeoNames ids are positive, so a negative key can
      // never collide with a row the real seeds put in this database. The
      // first draft used 660013 — Suomi's actual geonameid — and collided with
      // the adopted Finland country row the moment CI ran the full chain.
      const first = await admin
        .from("locations")
        .update({ geonames_id: -660013 })
        .eq("id", ZZ.MUNICIPALITY);
      expect(first.error).toBeNull();

      const second = await admin
        .from("locations")
        .update({ geonames_id: -660013 })
        .eq("id", ZZ.UNDEAD_MUNICIPALITY);
      expect(second.error?.code).toBe("23505");

      await admin
        .from("locations")
        .update({ geonames_id: null })
        .eq("id", ZZ.MUNICIPALITY);
    });

    it("lets every unsourced row carry no key at all", async () => {
      // The uniqueness is partial for exactly this reason: sites and
      // config-declared synthetic rows have no upstream record.
      const { count, error } = await admin
        .from("locations")
        .select("id", { count: "exact", head: true })
        .is("geonames_id", null);
      if (error) throw error;

      expect(count).toBeGreaterThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // Retirement, read shape by read shape
  // -------------------------------------------------------------------------

  describe("a retired row", () => {
    it("is gone from the browse level it sits in", async () => {
      const page = await service.getChildren(ZZ.REGION);

      expect(page.rows.map((row) => row.name)).toEqual(["Zzgwmuni"]);
      // The total is the filtered one, not the level's real row count.
      expect(page.total).toBe(1);
    });

    it("is gone from the municipality directory", async () => {
      const rows = await service.getMunicipalitiesByCountry("ZZ");

      expect(rows.map((row) => row.name).sort()).toEqual([
        "Zzgwmuni",
        "Zzgwundead",
      ]);
    });

    it("is gone from search, and out of the total as well as the page", async () => {
      // The filter lives in the match CTE rather than in the page, because a
      // "showing N of M" whose M counts rows the panel will never offer is
      // worse than no M at all.
      const result = await search(anon, { p_query: NEEDLE, p_limit: 50 });

      expect(names(result)).not.toContain("Zzgwgone");
      expect(names(result)).not.toContain("Zzgwoldregion");
      expect(result.total).toBe(result.results.length);
    });

    it("still resolves through the keyed reads a stored pick uses", async () => {
      // The distinction the three-state picker guard rests on: a retired row is
      // a *valid* pick, and reading it must not answer "this id resolves to
      // nothing" — which is what would wipe it on the next save.
      const [row] = await service.getLocationsByIds([ZZ.RETIRED_MUNICIPALITY]);

      expect(row.name).toBe("Zzgwgone");
      expect(row.ancestors.map((node) => node.name)).toEqual([
        "Zzgwregion",
        "Zzgwland",
      ]);
      expect((await service.getLocation(ZZ.RETIRED_MUNICIPALITY)).name).toBe(
        "Zzgwgone",
      );
    });

    it("is climbed through when it is somebody's ancestor", async () => {
      // A chain has to render whole. Hiding a place from being *chosen* is not
      // the same as hiding it from being *named*.
      const result = await search(anon, { p_query: "zzgwundead" });

      expect(result.results[0].ancestors.map((node) => node.name)).toEqual([
        "Zzgwoldregion",
        "Zzgwland",
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Search ordering, against a tree built to break it
  // -------------------------------------------------------------------------

  it("ranks places by depth and pushes venues below all of them", async () => {
    // Every fixture name is a term-prefix of the needle, so all seven live rows
    // share a match rank and the tie-breaks are the whole result.
    //
    // `Zzgwannex` is the case depth alone gets wrong: it is a venue parked
    // directly under a country row — the shape the FI/FR cutover produces when
    // a site's old municipality has no counterpart in the new tree — so it sits
    // at depth 1, shallower than the municipalities. Ordering by depth alone
    // would list it third. The explicit `type = 'site'` term ahead of depth is
    // what keeps every venue below every place.
    const result = await search(anon, { p_query: NEEDLE, p_limit: 50 });

    expect(names(result)).toEqual([
      "Zzgwland", //   country,      depth 0
      "Zzgwregion", // region,       depth 1
      "Zzgwmuni", //   municipality, depth 2
      "Zzgwundead", // municipality, depth 2, name breaks the tie
      "Zzgwannex", //  site,         depth 1 — a venue, so still after places
      "Zzgwsuomi", //  site,         depth 3, in Finland
      "Zzgwvenue", //  site,         depth 3, name breaks the tie
    ]);
  });

  // -------------------------------------------------------------------------
  // The country restriction, over a deliberately mixed match set
  // -------------------------------------------------------------------------

  describe("the country restriction", () => {
    it("drops the other country's rows from the page and the total alike", async () => {
      const zz = await search(anon, { p_query: NEEDLE, p_country: "ZZ" });

      expect(names(zz)).not.toContain("Zzgwsuomi");
      expect(zz.total).toBe(6);
      expect(zz.results.every((row) => row.country_code === "ZZ")).toBe(true);
    });

    it("keeps the row that belongs to the country asked for", async () => {
      const fi = await search(anon, { p_query: NEEDLE, p_country: "FI" });

      expect(names(fi)).toEqual(["Zzgwsuomi"]);
      expect(fi.total).toBe(1);
    });

    it("still answers across countries when none is named", async () => {
      const everywhere = await search(anon, { p_query: NEEDLE, p_limit: 50 });

      expect(everywhere.total).toBe(7);
    });
  });
});
