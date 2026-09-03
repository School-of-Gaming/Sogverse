import { describe, it, expect } from "vitest";
import { searchTerms, matchesAllTerms } from "@/lib/utils";
import { geduSearchText } from "@/components/admin/products/gedu-picker-sheet";
import type { Profile } from "@/types";

/**
 * The two primitives that decide what "matches what I typed" means, and the
 * gedu picker's use of them.
 *
 * They live in `lib/utils` rather than beside either caller because there are
 * two: the admin user search feeds these terms to PostgREST, and the gedu
 * picker matches them in the browser over a list it already holds. A rule
 * implemented twice agrees only by habit — which is exactly how the picker
 * ended up unable to find a surname while the other surface could — so what
 * counts as a term, and what counts as a match, are pinned here once.
 */

function gedu(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "8f14e45f-ceea-467a-9575-1cbf0f0f2f43",
    email: "anna.virtanen@sog.gg",
    email_verified_at: null,
    first_name: "Anna",
    last_name: "Virtanen",
    role: "gedu",
    phone: null,
    currency: null,
    home_location_id: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    locale: "fi",
    spoken_languages: ["fi"],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** What the picker actually asks: does this person match this box's contents? */
function picks(query: string, person: Profile = gedu()): boolean {
  const terms = searchTerms(query);
  return terms.length === 0 || matchesAllTerms(geduSearchText(person), terms);
}

describe("searchTerms", () => {
  it("splits a full name into one term per word", () => {
    expect(searchTerms("Anna Virtanen")).toEqual(["Anna", "Virtanen"]);
  });

  // A comma is how a name gets typed surname-first.
  it("cuts on a comma as well as whitespace", () => {
    expect(searchTerms("Virtanen, Anna")).toEqual(["Virtanen", "Anna"]);
  });

  // PostgREST reads `*` as an ilike wildcard before the pattern reaches SQL, so
  // a stray one would match everybody rather than nobody. Cut on both surfaces
  // so the two cannot disagree about what the user asked for.
  it("cuts on a wildcard", () => {
    expect(searchTerms("Anna*")).toEqual(["Anna"]);
  });

  it("yields nothing for a query with no searchable term", () => {
    expect(searchTerms("  ,  ")).toEqual([]);
  });
});

describe("matchesAllTerms", () => {
  it("requires every term, not any of them", () => {
    expect(matchesAllTerms("Anna Virtanen", ["Anna", "Virtanen"])).toBe(true);
    expect(matchesAllTerms("Anna Virtanen", ["Anna", "Korhonen"])).toBe(false);
  });

  it("ignores case on both sides", () => {
    expect(matchesAllTerms("Anna Virtanen", ["ANNA", "virtanen"])).toBe(true);
  });

  it("matches within a word, not only at its start", () => {
    expect(matchesAllTerms("Anna Virtanen", ["irtan"])).toBe(true);
  });
});

describe("the gedu picker's search", () => {
  // The bug this replaced: the filter matched the whole typed string against
  // first_name and email separately, so the name an admin reads off a roster
  // found nobody — while the very same name found them in the admin user list.
  it("finds a gedu by their full name", () => {
    expect(picks("Anna Virtanen")).toBe(true);
  });

  it("finds them with the name typed surname-first", () => {
    expect(picks("Virtanen Anna")).toBe(true);
  });

  // The other half of the bug: last_name was not searched at all, so a surname
  // on its own — the thing a colleague is most likely to say — found nobody.
  it("finds a gedu by surname alone", () => {
    expect(picks("Virtanen")).toBe(true);
  });

  it("still finds them by first name and by email", () => {
    expect(picks("Anna")).toBe(true);
    expect(picks("anna.virtanen@sog.gg")).toBe(true);
  });

  it("narrows rather than widens as more of the name is typed", () => {
    const korhonen = gedu({
      first_name: "Anna",
      last_name: "Korhonen",
      email: "anna.korhonen@sog.gg",
    });

    expect(picks("Anna", korhonen)).toBe(true);
    expect(picks("Anna Virtanen", korhonen)).toBe(false);
  });

  it("shows everyone when nothing searchable was typed", () => {
    expect(picks("")).toBe(true);
    expect(picks("  ,  ")).toBe(true);
  });
});
