import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { Json } from "@/types";
import { SEARCH_FOLD_CASES } from "../helpers/search-fold-cases";
import { createAdminTestClient } from "./helpers";

/**
 * The location search fold, pinned to a table of literals.
 *
 * The fold lives in Postgres and only in Postgres: it computes the stored blob
 * every row is findable by, and it folds the needle the search function is
 * given. Both halves of a match therefore come out of the same expression, so
 * what needs asserting is not that two implementations agree but that this one
 * still does what it is supposed to — hence a shared case table of literal
 * input/output pairs rather than an oracle that recomputes the answer.
 *
 * The oracle is `location_search_blob` rather than `immutable_unaccent`, and
 * deliberately: the blob applies `lower(immutable_unaccent(btrim(...)))`, which
 * is the *whole* fold and character-for-character the same expression the search
 * function applies to a needle. Testing the unaccent wrapper alone would leave
 * the lowercasing — half the fold, and the half an alphabetic INSEE code depends
 * on — unasserted.
 *
 * This is also the scope test the DB authorization spine names for all three
 * fold primitives, which is the other reason it asserts the blob end to end:
 * what makes them safe to expose is that they read no table and answer purely
 * from their arguments, and a blob built from nothing but what was passed in is
 * that property made visible.
 *
 * Service role, because `location_search_blob` is granted to the roles that
 * write `locations` rather than to `anon`; the folding itself is a pure function
 * of its arguments and answers identically whoever asks.
 */

/** U+001F UNIT SEPARATOR — the blob wraps every term in it. */
const SEPARATOR = String.fromCharCode(31);

/** The blob's shape for a term, which is how a prefix/exact test finds one. */
const wrapped = (term: string) => `${SEPARATOR}${term}${SEPARATOR}`;

describe("the location search fold, as the database computes it", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  /**
   * The blob for one row's worth of searchable strings.
   *
   * The empty defaults stand in for "this row has no alternates / no official
   * code": the function drops any source that trims to nothing, so an empty
   * string and a NULL produce the same blob — and the generated argument type
   * for the code is non-nullable, which is the generator failing to see a
   * nullable `text` parameter rather than anything the function insists on.
   */
  async function blobOf(
    name: string,
    alternates: Json = {},
    externalCode = "",
  ): Promise<string> {
    const { data, error } = await admin.rpc("location_search_blob", {
      p_name: name,
      p_name_i18n: alternates,
      p_external_code: externalCode,
    });
    if (error) throw error;
    return data;
  }

  describe("folds to what the case table says", () => {
    it.each(SEARCH_FOLD_CASES)("on $what", async ({ raw, folded }) => {
      // One name in, so the blob is exactly that one term, wrapped.
      expect(await blobOf(raw)).toBe(wrapped(folded));
    });
  });

  /**
   * The separator is not decoration: it is what makes a prefix test different
   * from an infix one, because a term-prefix match is "contains separator then
   * needle". If it ever stopped being a character that cannot occur in a place
   * name, a name containing it would forge a term boundary and rank as an exact
   * match on something it merely contains.
   */
  it("delimits terms with a control character no place name can contain", async () => {
    const { data, error } = await admin.rpc("location_search_separator");
    if (error) throw error;

    expect(data).toBe(SEPARATOR);
    expect(data).toHaveLength(1);
    // A control character, so it cannot appear in a name, a code, or anything
    // a user can type into the search box.
    expect(data.charCodeAt(0)).toBeLessThan(32);

    // And the blob really is built with it, rather than merely agreeing on it.
    expect(await blobOf("Nimes")).toBe(`${data}nimes${data}`);
  });

  it("folds the canonical name, the alternates and the official code alike", async () => {
    // The three sources a blob is built from at once — a Finnish name, its
    // Swedish alternate, and a code whose letters have to be lowercased — each
    // ending up as its own wrapped term rather than one of the three being
    // carried through raw. Spelled out, for the same reason the case table is:
    // an expected value computed by re-folding proves nothing about the fold.
    const blob = await blobOf("Järvenpää", { sv: "Träskända" }, "2A004");

    for (const term of ["jarvenpaa", "traskanda", "2a004"]) {
      expect(blob).toContain(wrapped(term));
    }
  });
});
