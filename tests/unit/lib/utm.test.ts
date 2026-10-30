import { describe, it, expect } from "vitest";
import { ResponseCookies } from "next/dist/compiled/@edge-runtime/cookies";
import {
  NO_UTM_ATTRIBUTION,
  UTM_COOKIE_MAX_AGE_SECONDS,
  UTM_COOKIE_NAME,
  UTM_HEADER,
  UTM_HEADER_MAX_LENGTH,
  UTM_QUERY_PARAMS,
  hasUtmAttribution,
  parseUtmHeader,
  readUtmFromSearchParams,
  sanitiseUtmValue,
  serialiseUtm,
  utmCookieOptions,
  utmFromCookieHeader,
  utmMetadataForConsent,
  utmRegistrationBody,
} from "@/lib/utm";
import type { ConsentState } from "@/lib/consent";
import { attributionCookie } from "../../mocks/attribution-cookie";

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

  it("reads all five fields", () => {
    expect(
      read(
        "utm_source=lynx&utm_medium=email&utm_campaign=lynx-summer-a&utm_content=hero-banner&utm_term=minecraft+club",
      ),
    ).toEqual({
      source: "lynx",
      medium: "email",
      campaign: "lynx-summer-a",
      content: "hero-banner",
      term: "minecraft club",
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
    // The five are independent, so a duplicated source must not cost a
    // well-formed campaign, and a duplicated term must not cost the content.
    expect(
      read("utm_source=a&utm_source=b&utm_campaign=lynx-summer-a&utm_term=x&utm_term=y&utm_content=ad-3"),
    ).toEqual({
      source: null,
      medium: null,
      campaign: "lynx-summer-a",
      content: "ad-3",
      term: null,
    });
  });

  it("nulls only the field that failed the sanitiser", () => {
    expect(
      read("utm_source=%3DSUM(A1)&utm_campaign=lynx-summer-a&utm_content=%3DSUM(A1)&utm_term=cpc"),
    ).toEqual({
      source: null,
      medium: null,
      campaign: "lynx-summer-a",
      content: null,
      term: "cpc",
    });
  });
});

describe("hasUtmAttribution", () => {
  it("is false only when all five fields are absent", () => {
    expect(hasUtmAttribution(NO_UTM_ATTRIBUTION)).toBe(false);
    expect(hasUtmAttribution({ ...NO_UTM_ATTRIBUTION, campaign: "x" })).toBe(true);
    expect(hasUtmAttribution({ ...NO_UTM_ATTRIBUTION, source: "x" })).toBe(true);
    expect(hasUtmAttribution({ ...NO_UTM_ATTRIBUTION, content: "x" })).toBe(true);
    expect(hasUtmAttribution({ ...NO_UTM_ATTRIBUTION, term: "x" })).toBe(true);
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
      content: "Vidéo 3 · carré",
      term: "jeux vidéo",
    };
    const serialised = serialiseUtm(utm);
    expect(serialised).not.toBeNull();
    expect(serialised).toMatch(/^[\x20-\x7E]*$/);
    expect(parseUtmHeader(serialised)).toEqual(utm);
  });

  it("serialises only the fields that survived", () => {
    expect(serialiseUtm({ ...NO_UTM_ATTRIBUTION, campaign: "lynx-summer-a" })).toBe(
      "campaign=lynx-summer-a",
    );
    expect(serialiseUtm({ ...NO_UTM_ATTRIBUTION, term: "cpc" })).toBe("term=cpc");
  });

  it("has no header value at all when nothing survived", () => {
    expect(serialiseUtm(NO_UTM_ATTRIBUTION)).toBeNull();
  });

  // The budget is on the *encoded* value, which is what the per-field cap
  // cannot see: five fields of 200 code points are well inside their own
  // limit, and percent-encoding astral-plane characters multiplies each one by
  // roughly twelve. A header a stranger controls through the query string must
  // not be able to push a request past a hop's own ceiling.
  it("drops the whole attribution rather than truncating an over-long header", () => {
    // 200 code points each, every one encoding to 12 bytes — comfortably legal
    // per field, and ~12,000 bytes once the five are serialised together.
    const wide = "𝔸".repeat(200);
    const utm = { source: wide, medium: wide, campaign: wide, content: wide, term: wide };

    expect(sanitiseUtmValue(wide)).toBe(wide);
    expect(serialiseUtm(utm)).toBeNull();
  });

  it("keeps a header that fits the budget", () => {
    const utm = {
      source: "lynx",
      medium: "email",
      campaign: "a".repeat(200),
      content: null,
      term: null,
    };

    const serialised = serialiseUtm(utm);
    expect(serialised).not.toBeNull();
    expect(serialised!.length).toBeLessThanOrEqual(UTM_HEADER_MAX_LENGTH);
    expect(parseUtmHeader(serialised)).toEqual(utm);
  });

  it("keeps all five fields at their full plain-ASCII length", () => {
    // The budget must never bite on a real link: five maximal unencoded values
    // serialise to about 1,050 bytes.
    const full = "a".repeat(200);
    const utm = { source: full, medium: full, campaign: full, content: full, term: full };

    const serialised = serialiseUtm(utm);
    expect(serialised).not.toBeNull();
    expect(parseUtmHeader(serialised)).toEqual(utm);
  });

  // Serialising never produces a repeat, so this only fires on a value that did
  // not come from serialiseUtm — which is the case the re-sanitise exists for,
  // and it has to answer the same way the query-string side does.
  it("nulls a repeated field on the header side too", () => {
    expect(parseUtmHeader("campaign=good&campaign=bad&source=lynx&term=cpc")).toEqual({
      source: "lynx",
      medium: null,
      campaign: null,
      content: null,
      term: "cpc",
    });
  });

  it("re-sanitises on parse rather than trusting the string it was handed", () => {
    // The proxy deletes any incoming x-utm before setting its own, so this is
    // unreachable in a real request — running the sanitiser again is what makes
    // "the value always came through our own sanitiser" a fact about this code
    // rather than a fact about the call order of two files.
    expect(parseUtmHeader("source=%3DSUM(A1)&campaign=lynx&content=%2Bx")).toEqual({
      source: null,
      medium: null,
      campaign: "lynx",
      content: null,
      term: null,
    });
  });

  it("yields nothing for an absent or empty header", () => {
    expect(parseUtmHeader(null)).toEqual(NO_UTM_ATTRIBUTION);
    expect(parseUtmHeader(undefined)).toEqual(NO_UTM_ATTRIBUTION);
    expect(parseUtmHeader("")).toEqual(NO_UTM_ATTRIBUTION);
  });
});

/**
 * The consent gate on the write. Counsel reads a landing link's UTM parameters
 * as tracking under the MARKETING purpose, so the five `profiles.utm_*`
 * columns are filled only for a visitor whose stored answer granted it. This is
 * the only exported way to build the signup metadata, which is what stops a
 * registration route from persisting an attribution without first saying what
 * the visitor consented to.
 */
describe("utmMetadataForConsent", () => {
  /** A stored answer, exactly as the cookie parser hands one back. */
  const answer = (analytics: boolean, marketing: boolean): ConsentState => ({
    analytics,
    marketing,
    decidedAt: "2026-09-14T10:15:00.000Z",
  });
  const GRANTED = answer(true, true);
  const utm = {
    source: "Lynx",
    medium: "email",
    campaign: "lynx-summer-a",
    content: "header-link",
    term: "roblox",
  };

  it("carries all five fields when marketing consent was granted", () => {
    expect(utmMetadataForConsent(GRANTED, utm)).toEqual({
      utm_source: "Lynx",
      utm_medium: "email",
      utm_campaign: "lynx-summer-a",
      utm_content: "header-link",
      utm_term: "roblox",
    });
  });

  it("carries nothing when the visitor never answered the banner", () => {
    // `null` is every unusable answer collapsed into one — no cookie, a cookie
    // from a superseded version of the question, junk. An unanswered banner is
    // not consent, so it is refused exactly like a refusal.
    //
    // Which of those it was cannot be distinguished here: this function takes
    // the parsed answer, and the version stamp is gone by the time it arrives.
    // The superseded-version case is exercised end to end in the parent
    // registration route's suite, with a cookie carrying an old stamp.
    expect(utmMetadataForConsent(null, utm)).toEqual({});
  });

  it("carries nothing when the visitor rejected everything", () => {
    expect(
      utmMetadataForConsent(answer(false, false), utm),
    ).toEqual({});
  });

  it("carries nothing on analytics-only, which is the case the ruling turns on", () => {
    // Lynx's lawyer put this under marketing rather than analytics, so a
    // visitor who agreed to measurement and refused advertising produces no
    // tag. Reading the parameters still happened — that is the proxy's
    // business, and it is what the banner governs; the write is the part
    // consent decides.
    expect(
      utmMetadataForConsent(answer(true, false), utm),
    ).toEqual({});
  });

  it("omits a field entirely rather than sending null", () => {
    // The column simply stays NULL, and the metadata a future reader inspects
    // says only what was actually true.
    expect(
      utmMetadataForConsent(GRANTED, { campaign: "lynx-summer-a" }),
    ).toEqual({ utm_campaign: "lynx-summer-a" });
  });

  it("drops a field the sanitiser refuses and keeps the rest", () => {
    expect(
      utmMetadataForConsent(GRANTED, {
        source: "=SUM(A1)",
        campaign: "lynx-summer-a",
      }),
    ).toEqual({ utm_campaign: "lynx-summer-a" });
  });

  it("is empty when the body carried no utm object at all", () => {
    expect(utmMetadataForConsent(GRANTED, undefined)).toEqual({});
    expect(utmMetadataForConsent(GRANTED, {})).toEqual({});
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
      content: "utm_content",
      term: "utm_term",
    });
    expect(UTM_HEADER).toBe("x-utm");
    expect(
      Object.keys(
        utmMetadataForConsent(
          {
            analytics: true,
            marketing: true,
            decidedAt: "2026-09-14T10:15:00.000Z",
          },
          { source: "a", medium: "b", campaign: "c", content: "d", term: "e" },
        ),
      ),
    ).toEqual(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]);
  });
});

describe("the attribution cookie", () => {
  const CONSENTED: ConsentState = {
    analytics: false,
    marketing: true,
    decidedAt: "2026-10-01T10:00:00.000Z",
  };

  /** What a browser sends back: the serialised value, encoded by the writer. */
  function header(attribution: Parameters<typeof serialiseUtm>[0]): string {
    return `locale=fi; ${attributionCookie(
      Object.fromEntries(new URLSearchParams(serialiseUtm(attribution) ?? "")),
    )}; sog_consent=x`;
  }

  it("reads back what the writers stored, accents, spaces and all", () => {
    const utm = {
      ...NO_UTM_ATTRIBUTION,
      source: "lynx",
      campaign: "Rentrée scolaire 100%",
      term: "a&b=c",
    };
    expect(utmFromCookieHeader(header(utm))).toEqual({
      source: "lynx",
      campaign: "Rentrée scolaire 100%",
      term: "a&b=c",
    });
  });

  it("reads back through the same whole-value encoding the proxy's response writes", () => {
    const utm = { ...NO_UTM_ATTRIBUTION, campaign: "Rentrée scolaire" };
    const written = new ResponseCookies(new Headers());
    written.set(UTM_COOKIE_NAME, serialiseUtm(utm) ?? "");
    const setCookie = written.toString().split(";")[0];

    expect(utmFromCookieHeader(setCookie)).toEqual({ campaign: "Rentrée scolaire" });
  });

  it("is nothing without the cookie", () => {
    expect(utmFromCookieHeader(null)).toEqual({});
    expect(utmFromCookieHeader("locale=fi")).toEqual({});
  });

  it("re-sanitises what a browser could have edited", () => {
    expect(
      utmFromCookieHeader(
        attributionCookie({ source: "=SUM(A1)", campaign: "lynx" }),
      ),
    ).toEqual({ campaign: "lynx" });
  });

  it("reads a value that will not decode as nothing", () => {
    expect(utmFromCookieHeader(`${UTM_COOKIE_NAME}=%E0%A4%A`)).toEqual({});
  });

  it("gives a request nothing without marketing consent, even with the cookie", () => {
    const utm = utmFromCookieHeader(attributionCookie({ campaign: "lynx" }));
    expect(utmMetadataForConsent(CONSENTED, utm)).toEqual({ utm_campaign: "lynx" });
    expect(utmMetadataForConsent({ ...CONSENTED, marketing: false }, utm)).toEqual({});
    expect(utmMetadataForConsent(null, utm)).toEqual({});
  });

  it("keeps the tag for 30 days on every path, readable by the banner's own code", () => {
    expect(UTM_COOKIE_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(utmCookieOptions()).toMatchObject({
      path: "/",
      maxAge: UTM_COOKIE_MAX_AGE_SECONDS,
      sameSite: "lax",
      httpOnly: false,
    });
  });
});

describe("utmRegistrationBody", () => {
  it("keeps every present field and no absent one", () => {
    expect(
      utmRegistrationBody({
        source: "lynx",
        medium: null,
        campaign: "lynx-summer-a",
        content: "hero",
        term: "minecraft",
      }),
    ).toEqual({
      source: "lynx",
      campaign: "lynx-summer-a",
      content: "hero",
      term: "minecraft",
    });
    expect(utmRegistrationBody(NO_UTM_ATTRIBUTION)).toEqual({});
  });
});
