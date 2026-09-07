import { describe, expect, it } from "vitest";
import {
  findGamerPhotoConsentRow,
  isGamerPhotoConsentGranted,
} from "@/lib/gamer-photo-consent-answer";
import type { GamerPhotoConsent } from "@/types";

const GAMER_ID = "6ba0f0f3-0a1c-4a7f-9e37-2c0a5b3c1d81";

function row(overrides: Partial<GamerPhotoConsent> = {}): GamerPhotoConsent {
  return {
    gamer_id: GAMER_ID,
    consent_type: "lynx_educate",
    granted: true,
    updated_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("isGamerPhotoConsentGranted", () => {
  it("is the stored answer when a row exists", () => {
    expect(isGamerPhotoConsentGranted([row()], "lynx_educate")).toBe(true);
    expect(
      isGamerPhotoConsentGranted([row({ granted: false })], "lynx_educate"),
    ).toBe(false);
  });

  // The feature's central decision: a question never put to a parent licenses
  // exactly what a "no" licenses, which is nothing. A default that depended on
  // whether anyone had got round to asking would not be a safeguard.
  it("is false when the consent has no row at all", () => {
    expect(isGamerPhotoConsentGranted([], "lynx_educate")).toBe(false);
  });

  it("is false while the rows are unknown, and never throws", () => {
    expect(isGamerPhotoConsentGranted(undefined, "lynx_educate")).toBe(false);
  });
});

describe("findGamerPhotoConsentRow", () => {
  it("hands back the stored row, so a caller can read its date", () => {
    const stored = row({ granted: false });
    expect(findGamerPhotoConsentRow([stored], "lynx_educate")).toBe(stored);
  });

  // What separates "never asked" from "answered no" on the admin card: only a
  // real row carries a moment, so the absence of one is itself the answer.
  it("is undefined for an absent row and for unknown rows alike", () => {
    expect(findGamerPhotoConsentRow([], "lynx_educate")).toBeUndefined();
    expect(findGamerPhotoConsentRow(undefined, "lynx_educate")).toBeUndefined();
  });
});
