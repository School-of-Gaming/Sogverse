import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { LocationsService } from "@/services/locations/locations.service";
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
 * reason its own assertion block exists: a partial seed is a catalog entry that
 * resolves to no row, and it should fail in CI rather than in front of an admin.
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
        "Finland",
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

      // Nearest first, and it stops at the country: Finland is a root row, so
      // the fourth embed level really does come back null. The depth is there
      // for France's extra `district` level, not for Finland.
      expect(school?.ancestors.map((node) => node.name)).toEqual([
        "Helsinki",
        "Uusimaa",
        "Finland",
      ]);
      expect(school?.ancestors.map((node) => node.type)).toEqual([
        "municipality",
        "region",
        "country",
      ]);
    });
  });

  describe("getSitesByParent", () => {
    it("returns only the sites under the given municipality", async () => {
      const [helsinki] = await service.resolveLocationsByCodes("FI", [
        { type: "municipality", external_code: "091" },
      ]);
      const sites = await service.getSitesByParent(helsinki.id);

      expect(sites.every((site) => site.type === "site")).toBe(true);
      expect(sites.every((site) => site.parent_id === helsinki.id)).toBe(true);
    });
  });

  describe("resolveLocationsByCodes", () => {
    // The reason the lookup carries `type`: France publishes its régions and
    // its départements as separate files, and every région code is also a
    // département code. '01' is région Guadeloupe and département Ain.
    it("distinguishes a code reused across levels", async () => {
      const rows = await service.resolveLocationsByCodes("FR", [
        { type: "region", external_code: "01" },
        { type: "district", external_code: "01" },
      ]);

      expect(rows).toHaveLength(2);
      expect(
        rows.map((row) => `${row.type}:${row.name}`).sort()
      ).toEqual(["district:Ain", "region:Guadeloupe"]);
    });

    it("resolves a batch of commune codes to their rows", async () => {
      const codes = ["59350", "75056", "2A004"];
      const rows = await service.resolveLocationsByCodes(
        "FR",
        codes.map((external_code) => ({
          type: "municipality" as const,
          external_code,
        }))
      );

      expect(rows.map((row) => row.name).sort()).toEqual([
        "Ajaccio",
        "Lille",
        "Paris",
      ]);
    });

    it("omits a code no row carries rather than failing", async () => {
      const rows = await service.resolveLocationsByCodes("FR", [
        { type: "municipality", external_code: "99999" },
      ]);
      expect(rows).toEqual([]);
    });
  });

  describe("getLocationsByIds", () => {
    it("returns exactly the rows asked for, deduplicated", async () => {
      const [lille] = await service.resolveLocationsByCodes("FR", [
        { type: "municipality", external_code: "59350" },
      ]);

      const rows = await service.getLocationsByIds([lille.id, lille.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Lille");
    });
  });
});
