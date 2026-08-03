import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  LocationsService,
  LOCATION_BROWSE_PAGE_SIZE,
} from "@/services/locations/locations.service";
import { createAdminTestClient } from "./helpers";

/**
 * The scoped location reads, against a real PostgREST.
 *
 * These exist because the unit tests for the same methods run over a fake fetch
 * transport: that proves the service builds the request it means to and handles
 * the pages it gets back, but it cannot prove PostgREST *accepts* the request.
 * Two things here are only knowable against a live server — whether a deep
 * self-referential embed resolves, and whether the paged walk really clears
 * `max_rows` on a 34,875-row country — and both are load-bearing for the
 * "nothing fetches the whole table" design.
 *
 * The France commune seed (migration 00133) is asserted here too, for the same
 * reason its own assertion block exists: a partial seed is a hole in the tree
 * an admin browses, and it should fail in CI rather than in front of them.
 */
describe("locations scoped reads", () => {
  let admin: SupabaseClient<Database>;
  let service: LocationsService;

  beforeAll(() => {
    admin = createAdminTestClient();
    service = new LocationsService(admin);
  });

  describe("France commune seed (00133)", () => {
    it("seeded every commune, each under its département", async () => {
      const { count, error } = await admin
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("country_code", "FR")
        .eq("type", "municipality");
      if (error) throw error;
      expect(count).toBe(34875);
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

    it("keeps INSEE's typography, apostrophes included", async () => {
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

    // 34,875 rows is 35 pages at PostgREST's max_rows — the case an unpaged
    // select would silently truncate to the first 1000.
    it("walks past max_rows for a country the size of France", () => {
      expect(frRows).toHaveLength(34875);
      expect(new Set(frRows.map((row) => row.id)).size).toBe(34875);
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

  describe("getSites", () => {
    it("flattens the chain PostgREST has to resolve four levels deep", async () => {
      const sites = await service.getSites();
      const school = sites.find((site) => site.name === "Test School");

      // Nearest first, and it stops at the country: Suomi is a root row, so
      // the fourth embed level really does come back null. The depth is there
      // for France's extra `district` level, not for Finland.
      expect(school?.ancestors.map((node) => node.name)).toEqual([
        "Helsinki",
        "Uusimaa",
        "Suomi",
      ]);
      expect(school?.ancestors.map((node) => node.type)).toEqual([
        "municipality",
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
      expect(rows[0].ancestors.map((node) => node.name)).toEqual([
        "Nord",
        "Hauts-de-France",
        "France",
      ]);
    });
  });
});
