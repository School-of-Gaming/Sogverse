import { describe, expect, it } from "vitest";
import {
  CONSENT_COOKIE_NAME,
  CONSENT_VERSION,
  consentForChoice,
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
