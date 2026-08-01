import { describe, it, expect } from "vitest";
import { foldForSearch } from "@/lib/locations/search-fold";

/**
 * The client-side fold, which exists only for the bounded lists a surface has
 * already fetched in full. The large search is the database's, and it folds the
 * same way — these cases are the shared contract stated on the side that can be
 * asserted without a Postgres, and their mirror images live in the DB suite.
 */

describe("foldForSearch", () => {
  it("folds diacritics and case", () => {
    expect(foldForSearch("Nîmes")).toBe("nimes");
    expect(foldForSearch("Järvenpää")).toBe("jarvenpaa");
    expect(foldForSearch("Côte-d'Or")).toBe("cote-d'or");
  });

  // The direction that is easy to forget: folding both the needle and the
  // haystack is what makes an accented query work too. A user who types
  // "Nîmes" properly must not get fewer results than one who types "nimes".
  it("matches in both directions once both sides are folded", () => {
    expect(foldForSearch("Nîmes").includes(foldForSearch("nimes"))).toBe(true);
    expect(foldForSearch("Nîmes").includes(foldForSearch("Nîmes"))).toBe(true);
    expect(foldForSearch("Järvenpää").includes(foldForSearch("järven"))).toBe(
      true,
    );
  });

  it("leaves a string with nothing to fold alone", () => {
    expect(foldForSearch("lille")).toBe("lille");
    expect(foldForSearch("")).toBe("");
  });
});
