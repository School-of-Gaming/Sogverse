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
 *  - the **postal code** as a second search key, from a second table, merged
 *    into the same match set before ranking,
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
    p_country?: string;
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

    it("matches an alternate that is a customary exonym, not a legal name", async () => {
      // The cutover's visible gain, and the contract change behind it:
      // `name_i18n` is GeoNames-sourced display alternates now, not a curated
      // list of legally bilingual names. Tampere is monolingual Finnish by law
      // and has always been Tammerfors to a Swedish speaker.
      const result = await search(anon, { p_query: "tammerfors" });

      expect(names(result)).toContain("Tampere");
    });

    it("matches an infix, not only a prefix", async () => {
      const result = await search(anon, {
        p_query: "roubaix",
        p_types: ["municipality"],
      });

      expect(names(result)).toContain("Roubaix");
    });
  });

  /**
   * Postal codes are the one search key that does not live in `search_blob`,
   * because a generated column may only read its own row and a code belongs to
   * another table entirely — many codes to a municipality, many municipalities
   * to a French code. The function grows a second match arm instead, joined back
   * to the place each code reaches and merged in before ranking.
   *
   * What these assert is that the second arm is a *source*, not a second search:
   * one folded needle, one match set, one ranking, one total.
   */
  describe("postal codes as a second search key", () => {
    it("finds Helsinki from a Finnish postal code", async () => {
      const result = await search(anon, { p_query: "00100" });

      expect(result.total).toBe(1);
      expect(result.results[0].name).toBe("Helsinki");
      expect(result.results[0].type).toBe("municipality");
      // A postal hit is an ordinary row, so it carries its chain like any other
      // — which is what lets the picker render it without a second read.
      expect(result.results[0].ancestors.map((node) => node.name)).toEqual([
        "Uusimaa",
        "Suomi",
      ]);
    });

    it("finds Maarianhamina from an Åland code, ahead of the French communes that share it", async () => {
      // 22100 is Mariehamn's code and also a Breton one around Dinan. Both are
      // exact matches, so the tie falls to the ordering the panel already uses:
      // an Åland kunta sits one level shallower than a French commune, and
      // broadest-first puts it on top.
      const result = await search(anon, { p_query: "22100" });

      expect(result.results[0].name).toBe("Maarianhamina");
      expect(result.total).toBeGreaterThan(1);
    });

    it("finds Paris from an arrondissement code, through the seed's rollup", async () => {
      // La Poste keys Paris by arrondissement; the COG has one commune. The
      // rollup happened at ingestion, so search sees one place per code.
      const result = await search(anon, { p_query: "75001" });

      expect(result.total).toBe(1);
      expect(result.results[0].name).toBe("Paris");
      expect(result.results[0].external_code).toBe("75056");
    });

    it("answers with the place once however many of its codes the needle reaches", async () => {
      // "003" is the prefix of every code in the 00300–00399 block, all of them
      // Helsinki's. One row comes out, and it outranks the infix code matches
      // that a three-digit needle also finds in the blob.
      const result = await search(anon, { p_query: "003", p_limit: 50 });
      const helsinki = result.results.filter((row) => row.name === "Helsinki");

      expect(helsinki).toHaveLength(1);
      expect(result.results[0].name).toBe("Helsinki");
    });

    it("counts a place matched by both arms once, at its better rank", async () => {
      // Espinasse-Vozelle's INSEE code is 03110 and 03110 is also one of its
      // postal codes, so it is an exact hit on both arms at once. Nine communes
      // share the code; a union that failed to dedupe would report ten.
      const result = await search(anon, { p_query: "03110", p_limit: 50 });
      const ids = result.results.map((row) => row.id);

      expect(new Set(ids).size).toBe(ids.length);
      expect(result.total).toBe(ids.length);
      expect(
        result.results.filter((row) => row.name === "Espinasse-Vozelle"),
      ).toHaveLength(1);
    });

    it("gives a shared French code every commune it reaches, capped with a bigger total", async () => {
      // A French code routinely spans dozens of communes. The cap is a rendering
      // budget and the total is the truth behind it — the same "showing N of M"
      // gap the name arm reports.
      const result = await search(anon, { p_query: "51300", p_limit: 20 });

      expect(result.results).toHaveLength(20);
      expect(result.total).toBeGreaterThan(20);
      expect(result.results.every((row) => row.type === "municipality")).toBe(
        true,
      );
    });

    it("does not match the middle of a code", async () => {
      // Deliberately no infix arm on codes: "9800" sits inside a hundred French
      // codes and starts none of them. Nobody searches the middle of a postcode,
      // and an infix arm would answer a four-digit needle with half a country.
      expect(await search(anon, { p_query: "9800" })).toEqual({
        total: 0,
        results: [],
      });
    });

    it("offers no postal hit when the requested levels exclude municipalities", async () => {
      // A postal row reaches a municipality, so a site-only search must not see
      // one. The filter is applied to the joined row's real type rather than
      // assumed from what the seed happens to have produced.
      expect(await search(anon, { p_query: "00100", p_types: ["site"] })).toEqual(
        { total: 0, results: [] },
      );
    });

    it("respects the country restriction, in the total as well as the page", async () => {
      // The country is applied where the matching happens, for the postal arm
      // exactly as for the name arm — otherwise a French code would crowd a
      // Finland-restricted picker's page and inflate its "of M".
      expect(await search(anon, { p_query: "75001", p_country: "FI" })).toEqual({
        total: 0,
        results: [],
      });

      const french = await search(anon, { p_query: "75001", p_country: "FR" });
      expect(french.total).toBe(1);
      expect(french.results[0].name).toBe("Paris");
    });

    it("leaves a name-shaped needle exactly as it was", async () => {
      // The regression the second arm could plausibly cause: extra rows, a
      // shifted ranking, or an inflated total on a needle no code can match.
      // Tampere is reachable only through its Swedish alternate, and it is still
      // the only row reachable at all.
      const result = await search(anon, { p_query: "tammerfors" });

      expect(result.total).toBe(1);
      expect(result.results[0].name).toBe("Tampere");
    });

    it("adds nothing at all to a broad name needle — same total, same page, same order", async () => {
      // The ranking test below already pins that "haute" reaches France's
      // départements ahead of its communes, and repeating that here would prove
      // nothing new. What is unproven is the *arithmetic* of the union on a
      // needle the second arm cannot reach: no seeded postal code starts with
      // "haute", so the deduped total and the whole first page have to be
      // exactly what the blob arm produces on its own.
      //
      // Both halves are load-bearing and they fail differently. An arm leaking
      // a row — a join that widened, a filter applied to the code instead of to
      // the place — moves the total off 70 whether or not the row reaches the
      // page. A merge that mis-ranked or double-counted leaves the total alone
      // and reorders the page, which is why the names are asserted whole and in
      // order rather than as a set.
      const result = await search(anon, { p_query: "haute", p_limit: 20 });

      expect(result.total).toBe(70);
      // Seven départements, not nine — the two missing ones are named in the
      // ranking test below, along with why one authority costs them.
      expect(names(result)).toEqual([
        "Haute-Loire",
        "Haute-Marne",
        "Haute-Saône",
        "Haute-Savoie",
        "Haute-Vienne",
        "Hautes-Alpes",
        "Hautes-Pyrénées",
        "Haute-Amance",
        "Haute-Avesnes",
        "Haute-Épine",
        "Haute-Goulaine",
        "Haute-Isle",
        "Haute-Kontz",
        "Haute-Rivoire",
        "Haute-Vigneulles",
        "Hautecloque",
        "Hautecour",
        "Hautecour",
        "Hautecourt-Romanèche",
        "Hautefage",
      ]);
    });

    it("answers a service-role caller too, not only anon", async () => {
      // SECURITY INVOKER means the arm reads `postal_codes` as whoever called,
      // and `service_role` may execute this function — so it needs the SELECT
      // grant 00165 adds, or the postal arm raises permission denied on a path
      // no anonymous test would ever exercise.
      const privileged = await search(admin, { p_query: "00100" });

      expect(privileged.results[0].name).toBe("Helsinki");
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
      // "Lille" the commune, above Lillebonne, Lillemer and Lillers — and above
      // the infix matches (Marquette-lez-Lille) that the previous rank covers.
      // Exactness is the first ordering term, so it wins even though a commune
      // is the deepest thing in the tree and every other kind of tie-break
      // would put it last.
      const result = await search(anon, { p_query: "lille", p_limit: 10 });

      expect(result.results[0].name).toBe("Lille");
      expect(names(result)).toEqual(expect.arrayContaining(["Lillebonne"]));
    });

    // The regression migration 00141 was written for, now ranked by the stored
    // `depth` instead of a hardcoded per-type CASE. "haute" matches dozens of
    // communes and nine départements; ordering by the location_type enum's
    // declaration order put every commune first, and since search does not
    // paginate past the default page of 20, Haute-Savoie and its siblings were
    // unreachable by search at all. `depth` says a French département is
    // shallower than a commune without anyone spelling out France's shape.
    it("reaches France's départements on the default page of a broad needle", async () => {
      const result = await search(anon, { p_query: "haute", p_limit: 20 });
      const returned = names(result);

      // Haute-Garonne and Haute-Corse are deliberately not in this list: under
      // GeoNames they read "Upper Garonne" and "Upper Corsica" and no longer
      // match the needle at all. That is the named cost of one authority, and
      // the fix for it is a correction upstream, not a local override.
      expect(returned).toEqual(
        expect.arrayContaining(["Haute-Savoie", "Haute-Loire", "Hautes-Alpes"]),
      );
      // Presence is only half of it: every one of the départements still
      // matching has to precede every commune, or the next needle with a longer
      // tail buries them again.
      const kinds = result.results.map((row) => row.type);
      expect(kinds.lastIndexOf("district")).toBeLessThan(
        kinds.indexOf("municipality"),
      );
    });
  });

  describe("restricting to one country", () => {
    // Restricting downstream of this function cannot work, and the picker's own
    // docs record why: the ranking and the cap are applied first, so a needle
    // with many matches elsewhere crowds the wanted country off the page, and
    // the "showing N of M" total counts rows the caller will never be offered.
    // Both halves are fixed by filtering in the match CTE.
    it("returns only that country's rows", async () => {
      const result = await search(anon, {
        p_query: "helsinki",
        p_country: "FI",
      });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.every((row) => row.country_code === "FI")).toBe(true);
    });

    it("narrows the total, not just the page", async () => {
      const everywhere = await search(anon, { p_query: "ille", p_limit: 1 });
      const french = await search(anon, {
        p_query: "ille",
        p_limit: 1,
        p_country: "FR",
      });

      expect(everywhere.total).toBeGreaterThan(0);
      expect(french.total).toBeGreaterThan(0);
      expect(french.total).toBeLessThanOrEqual(everywhere.total);
    });

    it("answers empty for a country the needle does not match in", async () => {
      const result = await search(anon, { p_query: "helsinki", p_country: "FR" });

      expect(result).toEqual({ total: 0, results: [] });
    });

    it("searches every country when no country is named", async () => {
      // The parameter is optional and defaults to NULL, so every existing
      // caller keeps the cross-country behaviour it had.
      const result = await search(anon, { p_query: "lille" });

      expect(result.results.some((row) => row.country_code === "FR")).toBe(true);
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
      expect(names(result)).not.toContain("Département du Nord");
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
        "Département du Nord",
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
    it("is maintained for every row, including hand-created sites", async () => {
      const { count, error } = await admin
        .from("locations")
        .select("id", { count: "exact", head: true })
        .or("search_blob.is.null,search_blob.eq.");
      if (error) throw error;

      expect(count).toBe(0);
    });

    it("finds a site by name, so a building is searchable like anything else", async () => {
      const result = await search(anon, {
        p_query: "Test School",
        p_types: ["site"],
      });

      expect(names(result)).toContain("Test School");
    });
  });
});
