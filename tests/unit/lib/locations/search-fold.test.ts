import { describe, it, expect } from "vitest";
import { foldForSearch } from "@/lib/locations/search-fold";
import { SEARCH_FOLD_CASES } from "../../../helpers/search-fold-cases";

/**
 * The client-side fold, which exists only for the bounded lists a surface has
 * already fetched in full. The large search is the database's, and it folds the
 * same way — the shared case table is the contract between them, asserted here
 * against the TypeScript side and in the DB suite against the SQL side.
 */

describe("foldForSearch", () => {
  describe("the fold the database also has to produce", () => {
    it.each(SEARCH_FOLD_CASES)("folds $what", ({ raw, folded }) => {
      expect(foldForSearch(raw)).toBe(folded);
    });
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

  it("leaves an empty string alone", () => {
    expect(foldForSearch("")).toBe("");
  });
});
