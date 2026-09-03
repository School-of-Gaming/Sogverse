import { describe, it, expect } from "vitest";
import {
  NO_UTM_ATTRIBUTION,
  UTM_HEADER,
  UTM_QUERY_PARAMS,
  buildUtmMetadata,
  hasUtmAttribution,
  parseUtmHeader,
  readUtmFromSearchParams,
  sanitiseUtmValue,
  serialiseUtm,
} from "@/lib/utm";

/**
 * The shared UTM sanitiser. Three callers depend on it agreeing with the
 * profile-creation trigger's own copy of the same rules, so the cases here are
 * deliberately the same ones the DB suite runs against the trigger.
 *
 * Note what this file *cannot* catch: the repeated-param bug. The sanitiser
 * takes a scalar by design, because `URLSearchParams.getAll()` returns an array
 * even for the ordinary single value — collapsing a repeat is
 * `readUtmFromSearchParams`'s job, exercised further down.
 */
describe("sanitiseUtmValue", () => {
  it("passes an ordinary value through unchanged", () => {
    expect(sanitiseUtmValue("lynx-summer-a")).toBe("lynx-summer-a");
  });

  it("preserves case rather than folding it", () => {
    // Vercel reports UTM values case-sensitively. Folding here would merge
    // Summer_Sale into summer_sale on our side only, and our per-account
    // numbers would stop agreeing with the traffic numbers beside them.
    expect(sanitiseUtmValue("Summer_Sale")).toBe("Summer_Sale");
    expect(sanitiseUtmValue("Lynx-Summer-A")).toBe("Lynx-Summer-A");
  });

  it("trims surrounding whitespace before testing", () => {
    // A hand-authored flyer link or an email client can add a trailing space;
    // refusing to trim would lose a real value for no benefit.
    expect(sanitiseUtmValue("  lynx ")).toBe("lynx");
    expect(sanitiseUtmValue("\tlynx\n")).toBe("lynx");
  });

  it("accepts everything an ad platform actually emits", () => {
    // The old `?ref=` pattern (`^[a-z0-9_-]{1,64}$`) rejected every one of
    // these, which is most of real UTM traffic. Spaces, dots, plus signs,
    // uppercase, accents, percent literals and expanded macro output all stand.
    for (const value of [
      "paid social",
      "google.com",
      "summer+sale",
      "Rentrée scolaire",
      "cpc",
      "SOG | Roblox — Ad set 3",
      "20% off",
      "école_92-b3",
      "2026",
    ]) {
      expect(sanitiseUtmValue(value)).toBe(value);
    }
  });

  it("refuses a formula-shaped value outright", () => {
    // The reason sanitising exists at all: these values reach a partner in a
    // CSV export we do not control, where a leading `=` is a formula that
    // executes on open.
    expect(sanitiseUtmValue("=cmd|'/c calc'!A1")).toBeNull();
    expect(sanitiseUtmValue("=SUM(A1)")).toBeNull();
    expect(sanitiseUtmValue("+SUM(A1)")).toBeNull();
    expect(sanitiseUtmValue("-2+3")).toBeNull();
    expect(sanitiseUtmValue("@SUM(A1)")).toBeNull();
  });

  it("refuses a formula lead that was hiding behind whitespace", () => {
    // Trim happens first, so padding buys nothing.
    expect(sanitiseUtmValue("   =SUM(A1)")).toBeNull();
    expect(sanitiseUtmValue("\t-2+3")).toBeNull();
  });

  it("refuses a control character anywhere in the value", () => {
    // A newline inside a campaign name breaks the CSV row it is exported in.
    // Built from code points rather than escapes so every case stays legible:
    // LF, CR, tab, vertical tab, DEL, and one C1 — the half a naive
    // `[\x00-\x1F]` range misses.
    for (const code of [0x0a, 0x0d, 0x09, 0x0b, 0x7f, 0x85]) {
      expect(sanitiseUtmValue(`lynx${String.fromCharCode(code)}summer`)).toBeNull();
    }
  });

  it("refuses an over-length value rather than truncating it", () => {
    // Never a partial value — a truncated campaign is a different campaign, and
    // would attribute a family to an outreach that did not bring them.
    expect(sanitiseUtmValue("a".repeat(200))).toBe("a".repeat(200));
    expect(sanitiseUtmValue("a".repeat(201))).toBeNull();
  });

  it("counts characters, not UTF-16 code units, at the length boundary", () => {
    // 150 astral characters are 300 code units and 150 characters. The trigger
    // uses char_length(), so counting code units here would refuse a value the
    // database would have accepted and the two copies of the rule would
    // disagree on real input.
    expect(sanitiseUtmValue("🎮".repeat(150))).toBe("🎮".repeat(150));
    expect(sanitiseUtmValue("🎮".repeat(201))).toBeNull();
  });

  it("refuses empty, whitespace-only, null and undefined", () => {
    expect(sanitiseUtmValue("")).toBeNull();
    expect(sanitiseUtmValue("   ")).toBeNull();
    expect(sanitiseUtmValue(null)).toBeNull();
    expect(sanitiseUtmValue(undefined)).toBeNull();
  });
});

describe("readUtmFromSearchParams", () => {
  function read(query: string) {
    return readUtmFromSearchParams(new URLSearchParams(query));
  }

  it("reads all three fields", () => {
    expect(read("utm_source=lynx&utm_medium=email&utm_campaign=lynx-summer-a")).toEqual({
      source: "lynx",
      medium: "email",
      campaign: "lynx-summer-a",
    });
  });

  it("yields nothing at all for a query with no UTM params", () => {
    expect(read("redirect=/shop")).toEqual(NO_UTM_ATTRIBUTION);
  });

  it("collapses a repeated param to absent rather than taking the first", () => {
    // `?utm_campaign=a&utm_campaign=b` is not a campaign. Reading it with
    // `.get()` would silently store the first value, which is how
    // `?utm_campaign=good&utm_campaign=<junk>` would become a stored `good`.
    expect(read("utm_campaign=good&utm_campaign=junk").campaign).toBeNull();
  });

  it("nulls only the field that was repeated", () => {
    // The three are independent, so a duplicated source must not cost a
    // well-formed campaign.
    expect(read("utm_source=a&utm_source=b&utm_campaign=lynx-summer-a")).toEqual({
      source: null,
      medium: null,
      campaign: "lynx-summer-a",
    });
  });

  it("nulls only the field that failed the sanitiser", () => {
    expect(read("utm_source=%3DSUM(A1)&utm_campaign=lynx-summer-a")).toEqual({
      source: null,
      medium: null,
      campaign: "lynx-summer-a",
    });
  });
});

describe("hasUtmAttribution", () => {
  it("is false only when all three fields are absent", () => {
    expect(hasUtmAttribution(NO_UTM_ATTRIBUTION)).toBe(false);
    expect(hasUtmAttribution({ source: null, medium: null, campaign: "x" })).toBe(true);
    expect(hasUtmAttribution({ source: "x", medium: null, campaign: null })).toBe(true);
  });
});

describe("the x-utm header round trip", () => {
  it("survives a value no raw header could carry", () => {
    // A Meta macro expands to an ad's own name: spaces, accents, punctuation.
    // Percent-encoding through URLSearchParams is what makes the transport
    // ASCII, and this is the case that would break without it.
    const utm = {
      source: "meta",
      medium: "paid social",
      campaign: "Rentrée scolaire — été 2026",
    };
    const serialised = serialiseUtm(utm);
    expect(serialised).not.toBeNull();
    expect(serialised).toMatch(/^[\x20-\x7E]*$/);
    expect(parseUtmHeader(serialised)).toEqual(utm);
  });

  it("serialises only the fields that survived", () => {
    expect(serialiseUtm({ source: null, medium: null, campaign: "lynx-summer-a" })).toBe(
      "campaign=lynx-summer-a",
    );
  });

  it("has no header value at all when nothing survived", () => {
    expect(serialiseUtm(NO_UTM_ATTRIBUTION)).toBeNull();
  });

  it("re-sanitises on parse rather than trusting the string it was handed", () => {
    // The proxy deletes any incoming x-utm before setting its own, so this is
    // unreachable in a real request — running the sanitiser again is what makes
    // "the value always came through our own sanitiser" a fact about this code
    // rather than a fact about the call order of two files.
    expect(parseUtmHeader("source=%3DSUM(A1)&campaign=lynx")).toEqual({
      source: null,
      medium: null,
      campaign: "lynx",
    });
  });

  it("yields nothing for an absent or empty header", () => {
    expect(parseUtmHeader(null)).toEqual(NO_UTM_ATTRIBUTION);
    expect(parseUtmHeader(undefined)).toEqual(NO_UTM_ATTRIBUTION);
    expect(parseUtmHeader("")).toEqual(NO_UTM_ATTRIBUTION);
  });
});

describe("buildUtmMetadata", () => {
  it("omits a field entirely rather than sending null", () => {
    // The column simply stays NULL, and the metadata a future reader inspects
    // says only what was actually true.
    expect(buildUtmMetadata({ campaign: "lynx-summer-a" })).toEqual({
      utm_campaign: "lynx-summer-a",
    });
  });

  it("drops a field the sanitiser refuses and keeps the rest", () => {
    expect(buildUtmMetadata({ source: "=SUM(A1)", campaign: "lynx-summer-a" })).toEqual({
      utm_campaign: "lynx-summer-a",
    });
  });

  it("is empty when the body carried no utm object at all", () => {
    expect(buildUtmMetadata(undefined)).toEqual({});
    expect(buildUtmMetadata({})).toEqual({});
  });
});

describe("utm names", () => {
  // Several files have to agree on these and nothing type-checks them across
  // the boundary — every mismatch fails the same silent way, with the columns
  // always NULL and no error anywhere. The metadata keys are the query-param
  // names on purpose: one vocabulary from the link through to the column.
  it("pins the query params and the proxy → layout header", () => {
    expect(UTM_QUERY_PARAMS).toEqual({
      source: "utm_source",
      medium: "utm_medium",
      campaign: "utm_campaign",
    });
    expect(UTM_HEADER).toBe("x-utm");
    expect(Object.keys(buildUtmMetadata({ source: "a", medium: "b", campaign: "c" }))).toEqual([
      "utm_source",
      "utm_medium",
      "utm_campaign",
    ]);
  });
});
