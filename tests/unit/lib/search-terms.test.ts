import { describe, it, expect } from "vitest";
import { searchTerms } from "@/lib/utils";

/**
 * The tokenizer that decides what "matches what I typed" is *made of*.
 *
 * There used to be a second half here — a browser-side matcher, tested against
 * the gedu picker's own field list — because two surfaces implemented one rule:
 * the admin user search fed these terms to PostgREST while the picker matched
 * them itself over a list of every educator it held. That is exactly how the
 * picker came to be unable to find a surname the users list could. Every people
 * surface asks the shared read now, so what a term *is* still belongs here and
 * what a *match* is belongs to the database; the service tests pin the terms
 * reaching the request.
 */

describe("searchTerms", () => {
  it("splits a full name into one term per word", () => {
    expect(searchTerms("Anna Virtanen")).toEqual(["Anna", "Virtanen"]);
  });

  // A comma is how a name gets typed surname-first.
  it("cuts on a comma as well as whitespace", () => {
    expect(searchTerms("Virtanen, Anna")).toEqual(["Virtanen", "Anna"]);
  });

  // PostgREST reads `*` as an ilike wildcard before the pattern reaches SQL, so
  // a stray one would match everybody rather than nobody.
  it("cuts on a wildcard", () => {
    expect(searchTerms("Anna*")).toEqual(["Anna"]);
  });

  it("yields nothing for a query with no searchable term", () => {
    expect(searchTerms("  ,  ")).toEqual([]);
  });
});
