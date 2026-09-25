import { describe, expect, it } from "vitest";
import {
  advertisingCookieNames,
  CONSENT_COOKIE_NAME,
  CONSENT_VERSION,
  clearAdvertisingStorage,
  consentForChoice,
  cookieValueFromHeader,
  isWithdrawal,
  parseConsentCookie,
  parseConsentCookieHeader,
  serialiseConsent,
  type ConsentState,
} from "@/lib/consent";

/**
 * ============================================================================
 * The consent cookie: what it stores, and what counts as no answer at all.
 * ============================================================================
 *
 * The whole model is one round trip and one collapse. The round trip has to be
 * exact, because the value is a legal record of an answer a person gave. The
 * collapse is the interesting half: **every way of failing to read a stored
 * answer has to come back as `null`**, because `null` is what makes the banner
 * ask again and keeps every optional script off the page. A parse that returned
 * anything else — a partial state, a thrown error a caller might swallow — would
 * either run something nobody agreed to or lose the question entirely.
 *
 * The version field is the case worth staring at. A cookie from an older
 * question is *well-formed*: it parses, it has both booleans, and taking it at
 * face value would look like it worked. It is still not an answer to the
 * question we are asking now, which is why it reads as unanswered rather than
 * as a refusal or as a grant.
 */
describe("consent cookie", () => {
  const answered: ConsentState = {
    analytics: true,
    marketing: true,
    decidedAt: "2026-09-03T10:15:00.000Z",
  };

  it("round-trips a stored answer unchanged", () => {
    expect(parseConsentCookie(serialiseConsent(answered))).toEqual(answered);
  });

  it("round-trips through the URL encoding a cookie write applies", () => {
    const encoded = encodeURIComponent(serialiseConsent(answered));
    expect(parseConsentCookie(encoded)).toEqual(answered);
  });

  it.each([
    ["no cookie at all", undefined],
    ["an empty value", ""],
    ["something that is not JSON", "yes-please"],
    ["JSON that is not an object", "42"],
    ["an object missing the purposes", '{"v":1,"at":"2026-09-03T10:15:00.000Z"}'],
    [
      "a purpose that is not a boolean",
      '{"v":1,"at":"2026-09-03T10:15:00.000Z","analytics":"yes","marketing":false}',
    ],
    [
      "a percent sign that does not decode",
      "%7B%zz",
    ],
  ])("reads %s as no answer", (_label, raw) => {
    expect(parseConsentCookie(raw)).toBeNull();
  });

  it("reads a cookie from a different version of the question as no answer", () => {
    const older = JSON.stringify({
      v: CONSENT_VERSION + 1,
      at: answered.decidedAt,
      analytics: true,
      marketing: true,
    });

    expect(parseConsentCookie(older)).toBeNull();
  });

  it("finds its own cookie in a raw Cookie header, past its neighbours", () => {
    const header = `locale=fi; ${CONSENT_COOKIE_NAME}=${encodeURIComponent(serialiseConsent(answered))}; timezone=Europe%2FHelsinki`;

    expect(parseConsentCookieHeader(header)).toEqual(answered);
  });

  it.each([
    ["no header", null],
    ["a header without our cookie", "locale=fi; timezone=Europe%2FHelsinki"],
    // The near-miss that a substring search would get wrong: a different
    // cookie whose name merely ends with ours.
    ["a cookie whose name only ends with ours", `not_sog_consent=whatever`],
  ])("reads %s as no answer", (_label, header) => {
    expect(parseConsentCookieHeader(header)).toBeNull();
  });

  it("grants exactly the purposes each button names", () => {
    const at = new Date("2026-09-03T10:15:00.000Z");

    expect(consentForChoice("reject_all", at)).toEqual({
      analytics: false,
      marketing: false,
      decidedAt: at.toISOString(),
    });
    expect(consentForChoice("analytics_only", at)).toEqual({
      analytics: true,
      marketing: false,
      decidedAt: at.toISOString(),
    });
    expect(consentForChoice("analytics_and_marketing", at)).toEqual({
      analytics: true,
      marketing: true,
      decidedAt: at.toISOString(),
    });
  });
});

/**
 * A withdrawal is the only transition that cannot be served by mounting or
 * unmounting a component, so naming it correctly is what decides whether the
 * page reloads. Two directions matter and they are not symmetric: taking a
 * granted purpose away is a withdrawal, adding one is not — and a first answer
 * is never a withdrawal however little it grants, because nothing had been
 * granted to take away.
 */
describe("isWithdrawal", () => {
  const at = "2026-09-03T10:15:00.000Z";
  const state = (analytics: boolean, marketing: boolean): ConsentState => ({
    analytics,
    marketing,
    decidedAt: at,
  });

  it("is false for a first answer, even a refusal", () => {
    expect(isWithdrawal(null, state(false, false))).toBe(false);
  });

  it("is false when a purpose is added", () => {
    expect(isWithdrawal(state(true, false), state(true, true))).toBe(false);
    expect(isWithdrawal(state(false, false), state(true, true))).toBe(false);
  });

  it("is true when a granted purpose is taken away", () => {
    expect(isWithdrawal(state(true, true), state(true, false))).toBe(true);
    expect(isWithdrawal(state(true, false), state(false, false))).toBe(true);
    expect(isWithdrawal(state(true, true), state(false, false))).toBe(true);
  });

  it("is false when nothing changes", () => {
    expect(isWithdrawal(state(true, true), state(true, true))).toBe(false);
  });
});

/**
 * The generic half of the cookie reader, used by the consent parse above and by
 * the server-side conversion report, which has to find Meta's own two cookies in
 * the same header.
 *
 * The case a `header.includes(name)` gets wrong is the one worth a test: a
 * cookie whose name merely ends with the one being looked for. Everything else
 * is "find it, or say you did not".
 */
describe("cookieValueFromHeader", () => {
  const header = "locale=fi; _fbp=fb.1.123.456; not__fbc=decoy; _fbc=fb.1.789";

  it("finds a cookie past its neighbours", () => {
    expect(cookieValueFromHeader(header, "_fbp")).toBe("fb.1.123.456");
    expect(cookieValueFromHeader(header, "_fbc")).toBe("fb.1.789");
  });

  it("is not fooled by a name that merely ends with the one asked for", () => {
    expect(cookieValueFromHeader("not__fbc=decoy", "_fbc")).toBeUndefined();
  });

  it.each([
    ["no header", null],
    ["a header without it", "locale=fi"],
    ["a pair with no equals sign at all", "locale"],
  ])("answers undefined for %s", (_label, raw) => {
    expect(cookieValueFromHeader(raw, "_fbp")).toBeUndefined();
  });

  // Undecoded, deliberately: the caller knows what it is holding. The consent
  // parse decodes; a pixel cookie is passed on exactly as the browser sent it.
  it("returns the raw value, untouched", () => {
    expect(cookieValueFromHeader("sog_x=%7B%22v%22%3A1%7D", "sog_x")).toBe(
      "%7B%22v%22%3A1%7D",
    );
  });
});

/**
 * Withdrawal has to clear what the advertising libraries left in local storage
 * as well as their cookies, and that half is the one that is easy to forget:
 * none of it is a cookie, so clearing the cookies alone leaves the device
 * re-identifiable the moment the scripts are allowed to run again. Both vendors
 * keep a storage twin of a click id they also write to a cookie, so a list
 * covering one of them is half a list. Some keys are matched by prefix because
 * the libraries append a pixel id and a purpose to each one.
 */
describe("clearAdvertisingStorage", () => {
  function fakeStorage(entries: Record<string, string>): Storage {
    const map = new Map(Object.entries(entries));
    return {
      get length() {
        return map.size;
      },
      key: (index: number) => Array.from(map.keys())[index] ?? null,
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
      clear: () => {
        map.clear();
      },
    };
  }

  function keysOf(storage: Storage): string[] {
    return Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    ).filter((key): key is string => key !== null);
  }

  // The six advertising keys are the set a real browser held after a granted
  // visit that arrived on an ad link carrying both vendors' click ids, with
  // their values as observed: this half of the withdrawal cannot be derived
  // from our own source, because the names belong to code we neither ship nor
  // wrote. The last two entries are the controls - one of ours, and one whose
  // name merely resembles the pixel's.
  it("removes what the libraries wrote and nothing else", () => {
    const storage = fakeStorage({
      multiFbc: "fb.1.1790253052194.FbRehearsal456",
      "fbevents^$last_event^$1234567890": "1757500000000",
      "pixel_mutex:1234567890": "held",
      _gcl_ls: '{"schema":"gcl","version":1,"gclid":{"value":"abc123"}}',
      lastExternalReferrer: "empty",
      lastExternalReferrerTime: "1790253052187",
      "sog-theme": "dark",
      fbp: "not-ours-either",
    });

    clearAdvertisingStorage(storage);

    expect(keysOf(storage)).toEqual(["sog-theme", "fbp"]);
  });

  // The bug a remove-while-walking implementation has: deleting a key shifts
  // every later one down an index, so the next match is stepped over. Three
  // adjacent matches is the shape that catches it.
  it("removes every match, not every other one", () => {
    const storage = fakeStorage({
      "fbevents^$a": "1",
      "fbevents^$b": "2",
      "fbevents^$c": "3",
      keep: "yes",
    });

    clearAdvertisingStorage(storage);

    expect(keysOf(storage)).toEqual(["keep"]);
  });

  it("does nothing to a storage the libraries never touched", () => {
    const storage = fakeStorage({ "sog-theme": "dark" });

    clearAdvertisingStorage(storage);

    expect(keysOf(storage)).toEqual(["sog-theme"]);
  });
});

/**
 * The cookie half of a withdrawal, and the reason it reads the document rather
 * than expiring a list of names: the container's analytics cookies carry a
 * property id in their own names, which is decided in the Tag Manager UI and is
 * unknowable from here. A name that survives a withdrawal goes on identifying
 * the same browser to the same platform, including from our own server-side
 * reports, which read these back off a later request.
 */
describe("advertisingCookieNames", () => {
  it("finds what each advertising script wrote, whole names and per-property alike", () => {
    expect(
      advertisingCookieNames(
        "_fbp=fb.1.1757; _fbc=fb.1.1757.IwAR0; _fbleid=lead-1; _ga=GA1.1.99; _ga_5WS8TXL4=GS1.1.1757; _gid=GA1.1.42; _gcl_au=1.1.222",
      ),
    ).toEqual([
      "_fbp",
      "_fbc",
      "_fbleid",
      "_ga",
      "_ga_5WS8TXL4",
      "_gid",
      "_gcl_au",
    ]);
  });

  it("leaves everything else alone", () => {
    expect(
      advertisingCookieNames(
        "sog_consent=%7B%22v%22%3A1%7D; NEXT_LOCALE=fi; sb-access-token=abc; theme=dark",
      ),
    ).toEqual([]);
  });

  // A cookie value may hold anything, `=` and `;`-free padding included, so the
  // name is whatever sits before the first `=` of each pair and nothing else.
  it("reads a name as what precedes the first equals sign", () => {
    expect(advertisingCookieNames("_gcl_au=1.1.a=b=c")).toEqual(["_gcl_au"]);
  });

  it("finds nothing in a document that has no cookies", () => {
    expect(advertisingCookieNames("")).toEqual([]);
  });
});
