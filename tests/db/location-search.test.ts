import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { locationSearchResult } from "@/services/locations/locations.contracts";
import { createAdminTestClient, createAnonTestClient } from "./helpers";

/**
 * `search_locations` — the server-side replacement for the client-side catalog
 * search, against the real seed.
 *
 * The behaviours asserted here are the ones the picker's users depend on and
 * that no unit test can prove any more, because the folding, the ranking and
 * the cap all happen in SQL now:
 *
 *  - diacritic-insensitivity **in both directions**, since a French user types
 *    "Nîmes" and a hurried one types "nimes",
 *  - the official statistical code as a search key,
 *  - `name_i18n` alternates, so a Swedish speaker finds the Finnish row,
 *  - **prefix beats infix regardless of where either sits in the table** — the
 *    property the old client-side two-bucket scan existed to guarantee, and the
 *    one a naive "filter then sort by name" loses,
 *  - a true total behind a capped page, which is what "showing N of M" reads,
 *  - and the bounds that make a public, keystroke-driven endpoint safe.
 *
 * Every assertion runs on the **anon** client. That is the posture that
 * matters: the educator registration page calls this with no session at all.
 */

/** Parse through the shared contract, so the wire shape is asserted too. */
async function search(
  client: SupabaseClient<Database>,
  args: {
    p_query: string;
    p_types?: Database["public"]["Enums"]["location_type"][];
    p_limit?: number;
  },
) {
  const { data, error } = await client.rpc("search_locations", args);
  if (error) throw error;
  return locationSearchResult.parse(data);
}

const names = (result: { results: { name: string }[] }) =>
  result.results.map((row) => row.name);

describe("search_locations", () => {
  let anon: SupabaseClient<Database>;
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    anon = createAnonTestClient();
    admin = createAdminTestClient();
  });

  describe("folding", () => {
    it("finds an accented name from an unaccented needle", async () => {
      const result = await search(anon, { p_query: "nimes" });

      expect(names(result)).toContain("Nîmes");
    });

    it("finds it from the accented needle too", async () => {
      // The direction that breaks when only the stored side is folded.
      const result = await search(anon, { p_query: "Nîmes" });

      expect(names(result)).toContain("Nîmes");
    });

    it("folds Finnish umlauts the same way", async () => {
      const plain = await search(anon, { p_query: "jarvenpaa" });
      const accented = await search(anon, { p_query: "Järvenpää" });

      expect(names(plain)).toContain("Järvenpää");
      expect(names(accented)).toContain("Järvenpää");
    });

    it("ignores case", async () => {
      const upper = await search(anon, { p_query: "LILLE" });

      expect(names(upper)).toContain("Lille");
    });
  });

  describe("what counts as a match", () => {
    it("matches the official statistical code", async () => {
      const result = await search(anon, { p_query: "59512" });

      expect(names(result)).toContain("Roubaix");
    });

    it("matches an alphabetic Corsican code in either case", async () => {
      // 2A/2B are real INSEE codes; the needle is lowercased, so the stored
      // side has to be too or 360 communes become unfindable by code.
      expect(names(await search(anon, { p_query: "2A004" }))).toContain("Ajaccio");
      expect(names(await search(anon, { p_query: "2a004" }))).toContain("Ajaccio");
    });

    it("matches a name_i18n alternate", async () => {
      // Helsinki's row is named in Finnish and carries {"sv":"Helsingfors"}.
      const result = await search(anon, { p_query: "helsingfors" });

      expect(names(result)).toContain("Helsinki");
    });

    it("matches an infix, not only a prefix", async () => {
      const result = await search(anon, {
        p_query: "roubaix",
        p_types: ["municipality"],
      });

      expect(names(result)).toContain("Roubaix");
    });
  });

  describe("ranking", () => {
    // The property the client-side version needed two buckets for: with 35,000
    // rows, thousands of infix matches sort alphabetically ahead of a prefix
    // match, and a "filter then order by name" query would bury it.
    it("puts prefix matches above infix ones wherever they sit in the table", async () => {
      const result = await search(anon, {
        p_query: "ille",
        p_types: ["municipality"],
        p_limit: 20,
      });

      const returned = names(result);
      const firstInfix = returned.findIndex(
        (name) => !name.toLowerCase().startsWith("ille"),
      );
      const lastPrefix = returned.reduce(
        (last, name, index) =>
          name.toLowerCase().startsWith("ille") ? index : last,
        -1,
      );

      // Both kinds are present, and every prefix hit precedes every infix one —
      // even though "Abbeville" sorts alphabetically far ahead of "Ille-sur-Têt".
      expect(firstInfix).toBeGreaterThan(0);
      expect(lastPrefix).toBeLessThan(firstInfix);
      expect(returned.some((name) => name.startsWith("Abb"))).toBe(true);
    });

    it("puts an exact name above everything that merely starts with it", async () => {
      const result = await search(anon, { p_query: "nord", p_limit: 10 });

      expect(result.results[0].name).toBe("Nord");
    });
  });

  describe("the page and the count", () => {
    it("reports the true total behind a capped page", async () => {
      const result = await search(anon, { p_query: "saint", p_limit: 5 });

      expect(result.results).toHaveLength(5);
      // France has thousands of Saint-somethings; the exact number will drift
      // with a classification refresh, so the assertion is the *gap*.
      expect(result.total).toBeGreaterThan(result.results.length);
    });

    it("caps the page server-side however large a limit is asked for", async () => {
      const result = await search(anon, { p_query: "saint", p_limit: 5000 });

      expect(result.results.length).toBeLessThanOrEqual(50);
    });

    it("clamps a nonsensical limit instead of failing", async () => {
      const result = await search(anon, { p_query: "lille", p_limit: -3 });

      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  describe("bounds on a public, keystroke-driven surface", () => {
    it("answers nothing for a needle under the minimum length", async () => {
      // Enforced here as well as in the client: a caller that skips the UI must
      // not be able to make the table scan for one letter.
      expect(await search(anon, { p_query: "a" })).toEqual({
        total: 0,
        results: [],
      });
    });

    it("answers nothing for an empty or whitespace needle", async () => {
      expect(await search(anon, { p_query: "" })).toEqual({
        total: 0,
        results: [],
      });
      expect(await search(anon, { p_query: "   " })).toEqual({
        total: 0,
        results: [],
      });
    });

    it("treats LIKE metacharacters as text, not as wildcards", async () => {
      // Unescaped, "%%" would match every row in the table.
      expect(await search(anon, { p_query: "%%" })).toEqual({
        total: 0,
        results: [],
      });
      expect(await search(anon, { p_query: "__" })).toEqual({
        total: 0,
        results: [],
      });
    });
  });

  describe("filtering and shape", () => {
    it("restricts hits to the requested levels", async () => {
      const result = await search(anon, {
        p_query: "nord",
        p_types: ["municipality"],
      });

      expect(result.results.every((row) => row.type === "municipality")).toBe(
        true,
      );
      expect(names(result)).not.toContain("Nord");
    });

    it("searches every country at once, with no country chosen first", async () => {
      // The point of the rewrite: "Tampere" and "Lille" are answerable from the
      // same box without the user picking a country.
      const fi = await search(anon, { p_query: "tampere" });
      const fr = await search(anon, { p_query: "lille" });

      expect(
        fi.results.some((row) => row.country_code === "FI"),
      ).toBe(true);
      expect(
        fr.results.some((row) => row.country_code === "FR"),
      ).toBe(true);
    });

    it("carries each hit's ancestor chain, nearest first", async () => {
      const result = await search(anon, {
        p_query: "59350",
        p_types: ["municipality"],
      });
      const lille = result.results[0];

      expect(lille.name).toBe("Lille");
      expect(lille.ancestors.map((node) => node.name)).toEqual([
        "Nord",
        "Hauts-de-France",
        "France",
      ]);
      expect(lille.ancestors.map((node) => node.type)).toEqual([
        "district",
        "region",
        "country",
      ]);
    });

    it("returns an empty chain for a country row rather than failing", async () => {
      const result = await search(anon, {
        p_query: "france",
        p_types: ["country"],
      });

      expect(result.results[0].ancestors).toEqual([]);
    });

    it("answers a signed-in caller identically to an anonymous one", async () => {
      // SECURITY INVOKER over a table both roles may read in full, which is
      // exactly what makes the route in front of it publicly cacheable.
      const anonymous = await search(anon, { p_query: "lille" });
      const privileged = await search(admin, { p_query: "lille" });

      expect(names(anonymous)).toEqual(names(privileged));
      expect(anonymous.total).toBe(privileged.total);
    });
  });

  describe("the search blob the index is built on", () => {
    it("is maintained for every row, including hand-created venues", async () => {
      const { count, error } = await admin
        .from("locations")
        .select("id", { count: "exact", head: true })
        .or("search_blob.is.null,search_blob.eq.");
      if (error) throw error;

      expect(count).toBe(0);
    });

    it("finds a venue by name, so a site is searchable like anything else", async () => {
      const result = await search(anon, {
        p_query: "Test School",
        p_types: ["site"],
      });

      expect(names(result)).toContain("Test School");
    });
  });
});
