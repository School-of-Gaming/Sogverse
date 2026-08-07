import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  LocationsService,
  LOCATION_BROWSE_PAGE_SIZE,
} from "@/services/locations/locations.service";
import { createAdminTestClient } from "./helpers";
import { TEST_IDS } from "./constants";

/**
 * The scoped location reads, against a real PostgREST.
 *
 * These exist because the unit tests for the same methods run over a fake fetch
 * transport: that proves the service builds the request it means to and handles
 * the pages it gets back, but it cannot prove PostgREST *accepts* the request.
 * Two things here are only knowable against a live server — whether a deep
 * self-referential embed resolves, and whether the paged walk really clears
 * `max_rows` on a country of ~35,000 communes — and both are load-bearing for
 * the "nothing fetches the whole table" design.
 *
 * The France commune tree is asserted here too, for the same reason the seed's
 * own assertion block exists: a partial seed is a hole in the tree an admin
 * browses, and it should fail in CI rather than in front of them.
 */

/**
 * France's commune count after the GeoNames cutover: the COG's 34,875, minus
 * the 8 codes GeoNames does not carry, plus the 4 communes it carries under a
 * code the COG retired. Both lists are named in `scripts/lib/geonames/config.mjs`
 * and this number is `count - allowMissing + allowExtra` from that entry — so
 * when upstream heals and the config shrinks, this moves with it in the same
 * change.
 */
const FR_COMMUNES = 34871;

describe("locations scoped reads", () => {
  let admin: SupabaseClient<Database>;
  let service: LocationsService;

  beforeAll(() => {
    admin = createAdminTestClient();
    service = new LocationsService(admin);
  });

  describe("the France commune tree", () => {
    it("seeded every commune, each under its département", async () => {
      const { count, error } = await admin
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("country_code", "FR")
        .eq("type", "municipality");
      if (error) throw error;
      expect(count).toBe(FR_COMMUNES);
    });

    it("parents a commune to the right département", async () => {
      const { data, error } = await admin
        .from("locations")
        .select("name, parent:parent_id(name, type, external_code)")
        .eq("country_code", "FR")
        .eq("type", "municipality")
        .eq("external_code", "59350")
        .single();
      if (error) throw error;
      expect(data.name).toBe("Lille");
      expect(data.parent).toMatchObject({ type: "district", external_code: "59" });
    });

    it("keeps the source's typography, apostrophes included", async () => {
      const { data, error } = await admin
        .from("locations")
        .select("name")
        .eq("country_code", "FR")
        .eq("type", "municipality")
        .in("external_code", ["01001", "97613"])
        .order("external_code");
      if (error) throw error;
      expect(data.map((row) => row.name)).toEqual([
        "L'Abergement-Clémenciat",
        "M'Tsangamouji",
      ]);
    });

    // Mayotte is the shape that breaks every assumption at once: GeoNames files
    // its 17 communes as top-level rows of their own country file, with no
    // région and no département row anywhere. Both of those are declared in
    // config as synthetic rows, and this is what proves the subtree hangs off
    // them rather than off nothing.
    it("hangs Mayotte's communes off the two config-declared synthetic rows", async () => {
      const { data, error } = await admin
        .from("locations")
        .select("name, geonames_id, parent:parent_id(external_code, geonames_id)")
        .eq("country_code", "FR")
        .eq("type", "municipality")
        .eq("external_code", "97613")
        .single();
      if (error) throw error;

      expect(data.parent).toMatchObject({ external_code: "976", geonames_id: null });
      expect(data.geonames_id).not.toBeNull();

      const { count, error: countError } = await admin
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("country_code", "FR")
        .eq("type", "municipality")
        .like("external_code", "976%");
      if (countError) throw countError;
      expect(count).toBe(17);
    });

    // The named allowance, both halves of it. These eight codes are the whole
    // of what France gives up by moving to one authority, and they are named
    // rather than absorbed: the first four are simply absent upstream, the
    // second four are present under the pre-merger chef-lieu's retired code.
    it("is missing exactly the communes the config names, and carries their stale-coded twins", async () => {
      const { data, error } = await admin
        .from("locations")
        .select("external_code, name")
        .eq("country_code", "FR")
        .eq("type", "municipality")
        .in("external_code", [
          // allowMissing: absent upstream
          "15031", "15035", "15047", "15171",
          // allowMissing: present, but filed under an allowExtra code
          "12218", "14581", "49126", "69114",
          // allowExtra: the codes they are filed under
          "12076", "14011", "49069", "69159",
        ])
        .order("external_code");
      if (error) throw error;

      expect(data.map((row) => row.external_code)).toEqual([
        "12076",
        "14011",
        "49069",
        "69159",
      ]);
      expect(data.map((row) => row.name)).toEqual([
        "Conques-en-Rouergue",
        "Aurseulles",
        "Orée d'Anjou",
        "Porte des Pierres Dorées",
      ]);
    });
  });

  describe("getMunicipalitiesByCountry", () => {
    // One walk each, shared by every assertion below: the France walk is 35
    // sequential pages with a three-level embed and an exact count per page —
    // doing it twice inside one 15s test timeout is how this file flakes.
    let frRows: Awaited<ReturnType<typeof service.getMunicipalitiesByCountry>>;
    let fiRows: Awaited<ReturnType<typeof service.getMunicipalitiesByCountry>>;

    beforeAll(async () => {
      frRows = await service.getMunicipalitiesByCountry("FR");
      fiRows = await service.getMunicipalitiesByCountry("FI");
    }, 120_000);

    // ~35,000 rows is 35 pages at PostgREST's max_rows — the case an unpaged
    // select would silently truncate to the first 1000.
    it("walks past max_rows for a country the size of France", () => {
      expect(frRows).toHaveLength(FR_COMMUNES);
      expect(new Set(frRows.map((row) => row.id)).size).toBe(FR_COMMUNES);
    });

    it("returns Finland's municipalities and nothing else", () => {
      expect(fiRows.length).toBeGreaterThanOrEqual(308);
      expect(fiRows.every((row) => row.country_code === "FI")).toBe(true);
      expect(fiRows.every((row) => row.type === "municipality")).toBe(true);
    });

    // The chain is what lets /schools group by region and the club picker show
    // one, without a second read or a lookup table.
    it("carries each municipality's chain, nearest first", () => {
      const helsinki = fiRows.find((row) => row.external_code === "091");

      expect(helsinki?.ancestors.map((node) => node.name)).toEqual([
        "Uusimaa",
        "Suomi",
      ]);
    });

    // France needs one more level than Finland: a commune sits under a
    // département, which is the level Finland skips entirely.
    it("reaches the région through France's extra département level", () => {
      const lille = frRows.find((row) => row.external_code === "59350");

      expect(lille?.ancestors.map((node) => node.type)).toEqual([
        "district",
        "region",
        "country",
      ]);
    });
  });

  describe("getChildren", () => {
    // The whole of browsing, and the one filter that is easy to get wrong: a
    // country is a row with no parent, and `eq` against NULL matches nothing.
    it("returns the countries when asked for the top of the tree", async () => {
      const page = await service.getChildren(null);

      expect(page.rows.every((row) => row.parent_id === null)).toBe(true);
      expect(page.rows.map((row) => row.type)).toEqual(
        page.rows.map(() => "country"),
      );
      expect(page.rows.map((row) => row.name).sort()).toContain("France");
    });

    it("returns one node's children and the true total behind the page", async () => {
      const [france] = (await service.getChildren(null)).rows.filter(
        (row) => row.country_code === "FR",
      );
      const page = await service.getChildren(france.id);

      // France's 18 régions, comfortably inside one page.
      expect(page.total).toBe(18);
      expect(page.rows).toHaveLength(18);
      expect(page.hasMore).toBe(false);
      expect(page.rows.every((row) => row.parent_id === france.id)).toBe(true);
    });

    // The case pagination exists for: a French département has hundreds of
    // communes, and the payload has to stay proportional to the screen.
    it("pages a large fan-out and reports that more remains", async () => {
      const { data: nord, error } = await admin
        .from("locations")
        .select("id")
        .eq("country_code", "FR")
        .eq("type", "district")
        .eq("external_code", "59")
        .single();
      if (error) throw error;

      const first = await service.getChildren(nord.id);

      expect(first.total).toBeGreaterThan(LOCATION_BROWSE_PAGE_SIZE);
      expect(first.rows).toHaveLength(LOCATION_BROWSE_PAGE_SIZE);
      expect(first.hasMore).toBe(true);

      const second = await service.getChildren(nord.id, { page: 1 });

      expect(second.total).toBe(first.total);
      // Consecutive, non-overlapping windows under a total order.
      const ids = new Set([
        ...first.rows.map((row) => row.id),
        ...second.rows.map((row) => row.id),
      ]);
      expect(ids.size).toBe(first.rows.length + second.rows.length);
    });

    it("answers an empty page for a leaf rather than failing", async () => {
      const { data: lille, error } = await admin
        .from("locations")
        .select("id")
        .eq("country_code", "FR")
        .eq("type", "municipality")
        .eq("external_code", "59350")
        .single();
      if (error) throw error;

      const page = await service.getChildren(lille.id);

      expect(page.rows).toEqual([]);
      expect(page.total).toBe(0);
      expect(page.hasMore).toBe(false);
    });
  });

  describe("getLocationsByIds", () => {
    it("returns exactly the rows asked for, deduplicated, with their chains", async () => {
      const { data: lille, error } = await admin
        .from("locations")
        .select("id")
        .eq("country_code", "FR")
        .eq("type", "municipality")
        .eq("external_code", "59350")
        .single();
      if (error) throw error;

      const rows = await service.getLocationsByIds([lille.id, lille.id]);

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Lille");
      // "Département du Nord", not "Nord": under one authority a place is
      // called what GeoNames calls it, and the COG's shorter form is now
      // something to correct upstream rather than to keep locally.
      expect(rows[0].ancestors.map((node) => node.name)).toEqual([
        "Département du Nord",
        "Hauts-de-France",
        "France",
      ]);
    });

    // The keyed read carries the deepest embed in the service — four ancestor
    // levels — and a site is the row that needs all of it. Only a live
    // PostgREST can say whether an embed nested that deep on a self-referential
    // FK resolves at all, which is why this assertion is here rather than over
    // the fake transport upstairs.
    it("resolves a site's chain, four embed levels deep", async () => {
      const rows = await service.getLocationsByIds([TEST_IDS.LOCATION_SITE]);

      // Nearest first, and it stops at the country: Suomi is a root row, so
      // the fourth embed level really does come back null. The depth is there
      // for France's extra `district` level, not for Finland.
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Test School");
      expect(rows[0].ancestors.map((node) => node.name)).toEqual([
        "Helsinki",
        "Uusimaa",
        "Suomi",
      ]);
      expect(rows[0].ancestors.map((node) => node.type)).toEqual([
        "municipality",
        "region",
        "country",
      ]);
    });
  });
});
