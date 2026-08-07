import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { LocationsService } from "@/services/locations/locations.service";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_CREDENTIALS } from "./constants";

/**
 * The postal-code table: what it resolves to, and who may touch it.
 *
 * Everything here runs on the **anon** client, and that is the assertion rather
 * than a convenience. The lookup's whole posture is "the answer does not depend
 * on who asks", and reading it as an unauthenticated visitor is the only way to
 * prove that. `postal_codes` carries no **write** grant for anybody,
 * service_role included — rows land through data migrations, which run as the
 * database owner and need no Data API privilege at all. It gained a service_role
 * *read* grant in `00165`, and for one reason only: `search_locations` is
 * SECURITY INVOKER, reads this table for its postal match arm, and is executable
 * by that role, so a role holding EXECUTE on the function has to hold the reads
 * the function makes.
 *
 * The three fixtures below are the ones the plan named, and each proves a
 * different mechanism rather than the same one three times:
 *
 *   - **Helsinki 00100 → kunta 091** is the plain GeoNames path: the postal
 *     dump's third admin column carries the kunta code and it joins straight to
 *     `external_code`.
 *   - **Mariehamn 22100 → kunta 478** is the column shift. Åland is a separate
 *     postal *file* for the same country and puts the kunta code one column
 *     over, in admin code 2 — the Åland-shaped hole that would otherwise be 16
 *     municipalities with no codes and nothing saying so.
 *   - **Paris 75001 → commune 75056** is the La Poste override plus the
 *     Paris/Lyon/Marseille rollup: France's source is not GeoNames at all (whose
 *     French postal file joins zero communes), and La Poste keys Paris by
 *     arrondissement where the COG has one commune.
 *
 * Nothing here creates fixtures. These are claims about seeded reference data,
 * and inventing a throwaway country to make them would prove only that the test
 * can insert rows — the point is that the real seed landed.
 */

/** France's commune count after the cutover, mirrored from the scoped-reads suite. */
const FR_COMMUNES = 34871;

/**
 * The four communes GeoNames files under a retired chef-lieu INSEE code
 * (`allowExtra` in the France config). La Poste keys them by the COG code, so
 * no postal row can reach our rows until upstream corrects the code — which is
 * the entire postal coverage gap for France, named rather than approximated.
 */
const FR_UNCOVERED_CODES = ["12076", "14011", "49069", "69159"];

describe("postal codes", () => {
  let anon: SupabaseClient<Database>;
  let service: LocationsService;

  beforeAll(() => {
    anon = createAnonTestClient();
    service = new LocationsService(anon);
  });

  // -------------------------------------------------------------------------
  // The three acceptance fixtures, through the service the app would use
  // -------------------------------------------------------------------------

  describe("resolving a code to its municipality", () => {
    it("reaches Helsinki from 00100, by the kunta code in the GeoNames dump", async () => {
      const rows = await service.getMunicipalitiesByPostalCode("FI", "00100");

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        name: "Helsinki",
        type: "municipality",
        external_code: "091",
        country_code: "FI",
      });
      // The chain rides along, because a name with no path is ambiguous the
      // moment two countries are in play.
      expect(rows[0].ancestors.map((node) => node.name)).toEqual([
        "Uusimaa",
        "Suomi",
      ]);
    });

    it("reaches Maarianhamina from 22100, across the Åland column shift", async () => {
      const rows = await service.getMunicipalitiesByPostalCode("FI", "22100");

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        name: "Maarianhamina",
        type: "municipality",
        external_code: "478",
        country_code: "FI",
      });
      // Åland is maakunta 21 to Statistics Finland and its own country to
      // GeoNames, so this chain is what the config's pin produced.
      expect(rows[0].ancestors.map((node) => node.external_code)).toEqual([
        "21",
        null,
      ]);
    });

    it("reaches Paris from 75001, through the arrondissement rollup", async () => {
      const rows = await service.getMunicipalitiesByPostalCode("FR", "75001");

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        name: "Paris",
        type: "municipality",
        external_code: "75056",
        country_code: "FR",
      });
    });

    it("gives Paris every one of its arrondissement codes, and no other commune", async () => {
      // 20 arrondissements, plus 75116 — the 16th's second code, which is why
      // the rollup is enumerated rather than expressed as a range.
      const { data, error } = await anon
        .from("postal_codes")
        .select("postal_code, locations!inner(external_code)")
        .eq("country_code", "FR")
        .in("postal_code", ["75001", "75008", "75016", "75116", "75020"]);
      if (error) throw error;

      expect(data).toHaveLength(5);
      expect(
        data.every((row) => row.locations.external_code === "75056"),
      ).toBe(true);
    });

    it("answers with every commune a shared code reaches, not the first", async () => {
      // A French postal code routinely spans dozens of communes, which is why
      // `location_id` is part of the key rather than a unique column beside it.
      const rows = await service.getMunicipalitiesByPostalCode("FR", "51300");

      expect(rows.length).toBeGreaterThan(1);
      expect(rows.every((row) => row.type === "municipality")).toBe(true);
      expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    });

    it("answers empty for a code nobody carries", async () => {
      // A lookup, not an assertion: an unknown code is "no municipality", never
      // an error, because the caller is a parent typing into a box. The junk is
      // shape-impossible on purpose — FI and FR codes are digits, so letters
      // can never exist in the data. The first draft guessed "99999" was free;
      // it is Korvatunturi, Santa Claus's postal code, and very much carried.
      await expect(
        service.getMunicipalitiesByPostalCode("FI", "XXXXX"),
      ).resolves.toEqual([]);
    });

    it("does not answer across countries", async () => {
      // 75001 is a Paris code; asking Finland for it must find nothing rather
      // than falling through to the code's other country.
      await expect(
        service.getMunicipalitiesByPostalCode("FI", "75001"),
      ).resolves.toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Coverage — the gate the seeds assert, re-asserted against the live table
  // -------------------------------------------------------------------------

  describe("coverage", () => {
    /**
     * Sourced municipalities of a country, with how many postal codes each got.
     *
     * Whole-country only where the country is small enough to come back whole —
     * `max_rows` truncates a read of France's ~34,900 communes, and a truncated
     * anti-join would report perfect coverage for a country whose codes never
     * landed. France is therefore checked by naming rows instead, below. The
     * exhaustive count for both countries is asserted by the seed migrations
     * themselves, which run in this same from-scratch build.
     */
    async function codesPerMunicipality(
      country: string,
      externalCodes?: string[],
    ): Promise<{ external_code: string | null; codes: number }[]> {
      let query = anon
        .from("locations")
        .select("external_code, postal_codes(country_code)")
        .eq("country_code", country)
        .eq("type", "municipality")
        .not("geonames_id", "is", null);
      if (externalCodes) query = query.in("external_code", externalCodes);

      const { data, error } = await query;
      if (error) throw error;

      return data
        .map((row) => ({
          external_code: row.external_code,
          codes: row.postal_codes.length,
        }))
        .sort((a, b) => (a.external_code ?? "").localeCompare(b.external_code ?? ""));
    }

    it("gives every Finnish kunta at least one code — all 308, Åland included", async () => {
      // 308/308 is the number the plan verified and the seed asserts. Åland is
      // 16 of them and lives in a different postal *file*, so a shortfall of
      // exactly 16 is the shape of a forgotten file rather than a broken join.
      const rows = await codesPerMunicipality("FI");

      expect(rows).toHaveLength(308);
      expect(rows.filter((row) => row.codes === 0)).toEqual([]);
    });

    it("leaves exactly the four stale-coded French communes uncovered", async () => {
      // Not a percentage: the gap is four named rows, each one GeoNames filing
      // a commune nouvelle under the pre-merger chef-lieu's retired INSEE code
      // while La Poste keys it by the COG code. When upstream corrects a code,
      // this list shrinks in the same change as the config's `allowExtra`.
      const stale = await codesPerMunicipality("FR", FR_UNCOVERED_CODES);

      expect(stale.map((row) => row.external_code)).toEqual(FR_UNCOVERED_CODES);
      expect(stale.every((row) => row.codes === 0)).toBe(true);
    });

    it("covers ordinary French communes, including the three rolled-up cities", async () => {
      // The anchor for the negative above: four uncovered rows only mean
      // something if their neighbours are covered.
      const covered = await codesPerMunicipality("FR", [
        "75056", // Paris — 20 arrondissement codes plus 75116
        "69123", // Lyon
        "13055", // Marseille
        "59350", // Lille, no rollup involved
        "97611", // Mamoudzou, Mayotte — the file GeoNames shapes differently
      ]);

      expect(covered).toHaveLength(5);
      expect(covered.every((row) => row.codes > 0)).toBe(true);
    });

    it("attaches no code to a country that is out of postal scope", async () => {
      // Sweden and the United Kingdom are seeded geography with no postal rows.
      // The UK is the structural case and worth pinning: every GB row below the
      // country carries a NULL `external_code`, so there is no key for the
      // postal join to run on at all.
      const { count, error } = await anon
        .from("postal_codes")
        .select("postal_code", { count: "exact", head: true })
        .in("country_code", ["SE", "GB"]);
      if (error) throw error;

      expect(count).toBe(0);
    });

    it("points every postal row at a municipality, and a sample of them at one in the row's own country", async () => {
      // The join is (country_code, type, external_code), and it can go wrong in
      // two ways: land on a region or a site, or land on another country's
      // commune. Only the first is a claim the database can settle over the
      // whole table — `neq` on the embedded type asks for any row that broke it
      // and gets none.
      const { data: wrongLevel, error } = await anon
        .from("postal_codes")
        .select("country_code, postal_code, locations!inner(type, country_code)")
        .neq("locations.type", "municipality")
        .limit(5);
      if (error) throw error;

      expect(wrongLevel).toEqual([]);

      // The second compares two columns, which PostgREST has no filter for. So
      // it is a bounded sample per seeded country, compared here — deliberately
      // a sample: sweeping France's ~39,000 rows to re-prove what the seed's
      // own country-scoped join already guarantees would cost more than the
      // claim is worth.
      for (const country of ["FI", "FR"]) {
        const { data: sample, error: sampleError } = await anon
          .from("postal_codes")
          .select("country_code, locations!inner(country_code)")
          .eq("country_code", country)
          .order("postal_code")
          .limit(200);
        if (sampleError) throw sampleError;

        expect(sample.length, `${country} sample`).toBeGreaterThan(0);
        const foreign = sample.filter(
          (row) => row.locations.country_code !== row.country_code,
        );
        expect(foreign, `${country} rows pointing outside ${country}`).toEqual([]);
      }
    });

    it("seeded France's communes and their codes together", async () => {
      const { count, error } = await anon
        .from("postal_codes")
        .select("postal_code", { count: "exact", head: true })
        .eq("country_code", "FR");
      if (error) throw error;

      // More rows than communes, because a commune has several codes and a code
      // spans several communes — the many-to-many the three-column key exists
      // for. The exact figure is asserted by the seed migration itself; here
      // the claim is only that the two tables are the same order of magnitude,
      // so a half-applied seed is visible without pinning a number that moves
      // whenever La Poste republishes.
      expect(count).toBeGreaterThan(FR_COMMUNES);
    });
  });

  // -------------------------------------------------------------------------
  // Access posture
  // -------------------------------------------------------------------------

  describe("access posture", () => {
    it("is readable without a session at all", async () => {
      // The parent registration page is public, and postal entry is meant to be
      // a shortcut on it — so this table is read exactly as `locations` is,
      // by anon, with no route and no RPC in front of it.
      const { data, error } = await anon
        .from("postal_codes")
        .select("country_code, postal_code, location_id")
        .eq("country_code", "FI")
        .eq("postal_code", "00100");

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("is readable on the privileged client, because the search RPC reads it as its caller", async () => {
      // The one grant `00165` added, and the narrowest reason for it:
      // `search_locations` is SECURITY INVOKER and `service_role` may execute
      // it, so the postal match arm reads this table as service_role. Without
      // the grant that call raises `permission denied` on a path no anonymous
      // test would ever reach.
      const { data, error } = await createAdminTestClient()
        .from("postal_codes")
        .select("country_code, postal_code, location_id")
        .eq("country_code", "FI")
        .eq("postal_code", "00100");

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("refuses every write from a signed-in user", async () => {
      // There is no write grant and no write policy, for anyone. Rows land
      // through data migrations, which run as the database owner and are not
      // subject to a Data API grant at all — so a client write must fail
      // closed rather than merely finding no policy to satisfy.
      const client = await createAuthenticatedClient(
        TEST_CREDENTIALS.CUSTOMER.email,
        TEST_CREDENTIALS.CUSTOMER.password,
      );

      const { data: helsinki, error: readError } = await client
        .from("postal_codes")
        .select("location_id")
        .eq("country_code", "FI")
        .eq("postal_code", "00100")
        .single();
      if (readError) throw readError;

      const inserted = await client.from("postal_codes").insert({
        country_code: "FI",
        postal_code: "00199",
        location_id: helsinki.location_id,
      });
      expect(inserted.error).not.toBeNull();

      const updated = await client
        .from("postal_codes")
        .update({ postal_code: "00199" })
        .eq("country_code", "FI")
        .eq("postal_code", "00100");
      expect(updated.error).not.toBeNull();

      const deleted = await client
        .from("postal_codes")
        .delete()
        .eq("country_code", "FI")
        .eq("postal_code", "00100");
      expect(deleted.error).not.toBeNull();

      // And the row is still there — an error is only worth asserting if the
      // statement it refused really affected nothing.
      const { count } = await anon
        .from("postal_codes")
        .select("postal_code", { count: "exact", head: true })
        .eq("country_code", "FI")
        .eq("postal_code", "00100");
      expect(count).toBe(1);
    });

    it("refuses every write from an anonymous caller", async () => {
      const { data: helsinki, error: readError } = await anon
        .from("postal_codes")
        .select("location_id")
        .eq("country_code", "FI")
        .eq("postal_code", "00100")
        .single();
      if (readError) throw readError;

      const inserted = await anon.from("postal_codes").insert({
        country_code: "FI",
        postal_code: "00198",
        location_id: helsinki.location_id,
      });
      expect(inserted.error).not.toBeNull();

      const deleted = await anon
        .from("postal_codes")
        .delete()
        .eq("country_code", "FI")
        .eq("postal_code", "00100");
      expect(deleted.error).not.toBeNull();
    });
  });
});
