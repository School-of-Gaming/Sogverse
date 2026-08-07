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

  /**
   * The United Kingdom is the country that breaks two assumptions the other
   * three share, and both breaks are decisions rather than gaps.
   *
   * Its local-authority level is assembled from *two* of GeoNames' rungs —
   * every ADM2 row outside Greater London, plus the 33 ADM3 London boroughs
   * inside it — because upstream files London one level deeper than the rest of
   * the country. Greater London's own row is deliberately not seeded, so every
   * UK authority sits at the same depth under its nation whichever rung
   * upstream put it on. And no UK row below the country carries an
   * `external_code` at all, because GeoNames' GB admin codes are its own
   * invention rather than ONS/GSS codes.
   */
  describe("the United Kingdom tree", () => {
    it("browses to exactly the four nations", async () => {
      const [uk] = (await service.getChildren(null)).rows.filter(
        (row) => row.country_code === "GB",
      );
      const page = await service.getChildren(uk.id);

      expect(page.total).toBe(4);
      expect(page.rows.map((row) => row.name)).toEqual([
        "England",
        "Northern Ireland",
        "Scotland",
        "Wales",
      ]);
      expect(page.rows.every((row) => row.type === "region")).toBe(true);
    });

    it("seeded every upper-tier authority the config's count names", async () => {
      // 218 authorities in the national classification, minus the two councils
      // that replaced Cumbria and that GeoNames does not carry, plus Cumbria
      // itself, which it still does. Both halves are named in
      // `scripts/lib/geonames/config.mjs`; this number is
      // `count - allowMissing + allowExtra` from that entry and moves with it.
      const { count, error } = await admin
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("country_code", "GB")
        .eq("type", "municipality");
      if (error) throw error;
      expect(count).toBe(217);
    });

    it("hangs a London borough off England, beside the authorities outside London", async () => {
      // The whole point of the two-selector level: Camden arrives as an ADM3
      // row and Kent as an ADM2 one, and they must be indistinguishable
      // afterwards — same type, same parent level, same distance from the root.
      const { data, error } = await admin
        .from("locations")
        .select("name, type, depth, parent:parent_id(name, type)")
        .eq("country_code", "GB")
        .eq("type", "municipality")
        .in("name", ["Camden", "City of London", "Kent"])
        .order("name");
      if (error) throw error;

      expect(data.map((row) => row.name)).toEqual(["Camden", "City of London", "Kent"]);
      for (const row of data) {
        expect(row.parent).toMatchObject({ name: "England", type: "region" });
        expect(row.depth).toBe(2);
      }
    });

    it("does not seed Greater London, whose boroughs are the authorities", async () => {
      const { count, error } = await admin
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("country_code", "GB")
        .eq("name", "Greater London");
      if (error) throw error;
      expect(count).toBe(0);
    });

    // The named allowance, both halves, exactly as France's is asserted. This
    // is the one discrepancy between GeoNames and the national picture, and it
    // is named rather than absorbed: Cumbria was abolished in April 2023 and is
    // still live upstream, and neither of the two councils that replaced it
    // exists there. Cumbria is deliberately NOT excluded — excluding it would
    // leave the county with no authority at all, which is a hole rather than a
    // stale name.
    it("carries Cumbria, and neither of the councils that replaced it", async () => {
      const { data, error } = await admin
        .from("locations")
        .select("name")
        .eq("country_code", "GB")
        .eq("type", "municipality")
        .in("name", ["Cumbria", "Cumberland", "Westmorland and Furness"]);
      if (error) throw error;

      expect(data.map((row) => row.name)).toEqual(["Cumbria"]);
    });
  });

  /**
   * `external_code` is a per-country fact, not a universal one — which is the
   * shape this has to be asserted in now that a seeded country carries none.
   *
   * The claim that generalizes is *uniformity*: a level either maps an official
   * code for its country or it does not, so a level with some coded rows and
   * some code-less ones is a seed that went wrong. `geonames_id` is the key
   * that really is universal, and it is asserted as such.
   */
  describe("official codes across the seeded countries", () => {
    const CODED: Record<string, Database["public"]["Enums"]["location_type"][]> = {
      FI: ["region", "municipality"],
      FR: ["region", "district", "municipality"],
      SE: ["region", "municipality"],
      // GeoNames' GB admin codes (A3, B9, GLA, Z5…) are its own invention and
      // match no ONS or GSS code, so the config maps none and the column stays
      // NULL. What is forfeited — joins against official UK data — is named in
      // the config; what is not affected is identity.
      GB: [],
    };

    async function countCodeless(
      country: string,
      type: Database["public"]["Enums"]["location_type"],
      codeless: boolean,
    ) {
      const query = admin
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("country_code", country)
        .eq("type", type);
      const { count, error } = codeless
        ? await query.is("external_code", null)
        : await query.not("external_code", "is", null);
      if (error) throw error;
      return count ?? 0;
    }

    it("gives every row of a coded level a code, and every row of a code-less level none", async () => {
      const offenders: string[] = [];
      for (const [country, codedTypes] of Object.entries(CODED)) {
        for (const type of ["region", "district", "municipality"] as const) {
          const wantsCode = codedTypes.includes(type);
          const wrong = await countCodeless(country, type, wantsCode);
          if (wrong > 0) {
            offenders.push(
              `${country} ${type}: ${wrong} row(s) ${wantsCode ? "carry no" : "unexpectedly carry an"} external_code`,
            );
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it("gives every seeded row an upstream key, code or no code", async () => {
      // The two France synthetic rows are the only seeded rows anywhere with no
      // `geonames_id`, and they are config-declared: Mayotte's région and
      // département exist in no GeoNames file as administrative rows.
      const { data, error } = await admin
        .from("locations")
        .select("name, country_code, type")
        .in("country_code", Object.keys(CODED))
        .in("type", ["country", "region", "district", "municipality"])
        .is("geonames_id", null);
      if (error) throw error;

      expect(data.map((row) => `${row.country_code} ${row.type} ${row.name}`).sort()).toEqual([
        "FR district Mayotte",
        "FR region Mayotte",
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
