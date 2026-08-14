import { describe, it, expect } from "vitest";
import {
  REFERRAL_CODE_HEADER,
  REFERRAL_QUERY_PARAM,
  sanitiseReferralCode,
} from "@/lib/referral";

/**
 * The shared `?ref=` sanitiser. Two callers depend on it agreeing with the
 * profile-creation trigger's own copy of the same rules, so the cases here are
 * deliberately the same ones the DB suite runs against the trigger.
 *
 * Note what this file *cannot* catch: the repeated-param bug. This function
 * takes a scalar by design, because `URLSearchParams.getAll()` returns an array
 * even for the ordinary single value — collapsing a repeat is the caller's job,
 * and the proxy's integration test is where that is pinned.
 */
describe("sanitiseReferralCode", () => {
  it("passes an ordinary code through unchanged", () => {
    expect(sanitiseReferralCode("paris-nord")).toBe("paris-nord");
  });

  it("lowercases", () => {
    expect(sanitiseReferralCode("Paris-Nord")).toBe("paris-nord");
  });

  it("trims surrounding whitespace before testing", () => {
    // A hand-authored flyer link or an email client can add a trailing space;
    // refusing to trim would lose a real code for no benefit.
    expect(sanitiseReferralCode("  paris-nord ")).toBe("paris-nord");
    expect(sanitiseReferralCode("\tParis-Nord\n")).toBe("paris-nord");
  });

  it("keeps hyphens, underscores and digits", () => {
    expect(sanitiseReferralCode("ecole_92-b3")).toBe("ecole_92-b3");
    expect(sanitiseReferralCode("2026")).toBe("2026");
  });

  it("refuses a formula-shaped value outright", () => {
    // The reason sanitising exists at all: referral data gets exported to a
    // spreadsheet, where a leading `=` is a formula that executes on open.
    expect(sanitiseReferralCode("=cmd|'/c calc'!A1")).toBeNull();
    expect(sanitiseReferralCode("=SUM(A1)")).toBeNull();
  });

  it("refuses anything outside a-z, 0-9, - and _", () => {
    for (const bad of [
      "paris nord",
      "paris.nord",
      "paris/nord",
      "<script>",
      "paris+nord",
      "école",
      "paris%2Dnord",
    ]) {
      expect(sanitiseReferralCode(bad)).toBeNull();
    }
  });

  it("refuses an over-length value rather than truncating it", () => {
    // Never a partial value — a truncated code is a different code, and would
    // attribute a family to a group that did not bring them.
    expect(sanitiseReferralCode("a".repeat(64))).toBe("a".repeat(64));
    expect(sanitiseReferralCode("a".repeat(65))).toBeNull();
  });

  it("refuses empty, whitespace-only, null and undefined", () => {
    expect(sanitiseReferralCode("")).toBeNull();
    expect(sanitiseReferralCode("   ")).toBeNull();
    expect(sanitiseReferralCode(null)).toBeNull();
    expect(sanitiseReferralCode(undefined)).toBeNull();
  });

  it("takes a scalar, so a `.getAll()` array is not something it can be handed", () => {
    // Pinned as a type-level fact via the caller shape: the proxy collapses the
    // array first. Passing one here is a compile error, and this case documents
    // why the split exists rather than exercising it — a sanitiser that nulled
    // every array input would null the ordinary single case too, because
    // `getAll()` returns `["paris-nord"]` for it, and the feature would silently
    // never work.
    const singleValue = ["paris-nord"];
    expect(
      singleValue.length === 1 ? sanitiseReferralCode(singleValue[0]) : null,
    ).toBe("paris-nord");

    const repeated = ["paris-nord", "lyon-sud"];
    expect(
      repeated.length === 1 ? sanitiseReferralCode(repeated[0]) : null,
    ).toBeNull();
  });
});

describe("referral names", () => {
  // Four files have to agree on these and nothing type-checks them across the
  // boundary — every mismatch fails the same silent way, with the column always
  // NULL and no error anywhere.
  it("pins the query param and the proxy → layout header", () => {
    expect(REFERRAL_QUERY_PARAM).toBe("ref");
    expect(REFERRAL_CODE_HEADER).toBe("x-referral-code");
  });
});
