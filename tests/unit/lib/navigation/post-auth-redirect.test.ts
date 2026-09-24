import { describe, it, expect } from "vitest";
import {
  readCompleteRegistrationTarget,
  resolveSafeRedirect,
} from "@/lib/navigation/post-auth-redirect";

describe("resolveSafeRedirect", () => {
  it("returns null when no redirect is provided", () => {
    expect(resolveSafeRedirect(null)).toBe(null);
    expect(resolveSafeRedirect("")).toBe(null);
  });

  it("allows shop product detail pages", () => {
    expect(resolveSafeRedirect("/shop/abc-123")).toBe("/shop/abc-123");
  });

  it("allows municipality-club product detail pages", () => {
    // `/schools/[municipalityName]/[id]` renders the same ProductDetailPage
    // as `/shop/[id]`, so its sign-in CTA must round-trip back here too.
    expect(resolveSafeRedirect("/schools/helsinki/abc-123")).toBe(
      "/schools/helsinki/abc-123"
    );
  });

  it("rejects the bare shop listing (no trailing id)", () => {
    // Without the trailing slash this is just the listing page; the
    // post-auth redirect is meant to land users back on a specific
    // product they were trying to enroll in.
    expect(resolveSafeRedirect("/shop")).toBe(null);
  });

  it("rejects the bare schools listing (no trailing slug)", () => {
    expect(resolveSafeRedirect("/schools")).toBe(null);
  });

  it("rejects the retired per-type storefront roots", () => {
    expect(resolveSafeRedirect("/clubs/abc-123")).toBe(null);
    expect(resolveSafeRedirect("/camps/abc-123")).toBe(null);
    expect(resolveSafeRedirect("/events/abc-123")).toBe(null);
  });

  it("rejects arbitrary paths", () => {
    expect(resolveSafeRedirect("/admin")).toBe(null);
    expect(resolveSafeRedirect("/parent/billing")).toBe(null);
    expect(resolveSafeRedirect("/")).toBe(null);
  });

  it("rejects open-redirect attempts to external hosts", () => {
    expect(resolveSafeRedirect("https://evil.example.com")).toBe(null);
    expect(resolveSafeRedirect("//evil.example.com/shop/x")).toBe(null);
    expect(resolveSafeRedirect("javascript:alert(1)")).toBe(null);
  });

  it("rejects prefix-confusion attempts", () => {
    // `/shopxyz` shares the prefix `/shop` but isn't `/shop/<id>`.
    // The allowlist requires the trailing slash specifically to block this.
    expect(resolveSafeRedirect("/shopxyz")).toBe(null);
  });

  it("rejects path traversal that escapes the /shop/ allowlist", () => {
    // `/shop/../admin` passes a naive startsWith("/shop/"), but the browser
    // normalizes it to `/admin` on navigation. We normalize (collapse `..`)
    // BEFORE the prefix check, so the allowlist sees the real destination.
    expect(resolveSafeRedirect("/shop/../admin")).toBe(null);
    expect(resolveSafeRedirect("/shop/../../parent/billing")).toBe(null);
    // Percent-encoded dot-dot is a double-dot segment per the URL spec.
    expect(resolveSafeRedirect("/shop/%2e%2e/admin")).toBe(null);
  });

  it("normalizes in-allowlist traversal to the real path", () => {
    // A `..` that stays within /shop/ is harmless; it collapses and is
    // returned as the normalized path the browser would actually visit.
    expect(resolveSafeRedirect("/shop/x/../abc-123")).toBe("/shop/abc-123");
  });
});

/**
 * **The finish page is admitted only when the caller asks for it.** The OAuth
 * callback does, because the register pages' Google buttons send it as their
 * `next`; the login form's `?redirect=` never does, so a crafted link cannot
 * route a password sign-in there.
 */
describe("resolveSafeRedirect with the finish page allowed", () => {
  const allow = { allowCompleteRegistration: true };

  it("is refused by default", () => {
    expect(resolveSafeRedirect("/en/complete-registration")).toBe(null);
  });

  it("is admitted, locale prefix and all, when allowed", () => {
    expect(resolveSafeRedirect("/fi/complete-registration", allow)).toBe(
      "/fi/complete-registration",
    );
    expect(
      resolveSafeRedirect("/sv/complete-registration?as=gedu", allow),
    ).toBe("/sv/complete-registration?as=gedu");
  });

  it("does not widen the allowlist to anything else", () => {
    expect(resolveSafeRedirect("/admin", allow)).toBe(null);
    expect(resolveSafeRedirect("/complete-registration/../admin", allow)).toBe(
      null,
    );
    expect(resolveSafeRedirect("/shop/abc-123", allow)).toBe("/shop/abc-123");
  });
});

describe("readCompleteRegistrationTarget", () => {
  const NO_UTM = { source: null, medium: null, campaign: null };

  it("splits the raw pathname from the Gedu flag", () => {
    expect(readCompleteRegistrationTarget("/fr/complete-registration")).toEqual(
      { pathname: "/fr/complete-registration", asGedu: false, utm: NO_UTM },
    );
    expect(
      readCompleteRegistrationTarget("/fi/complete-registration?as=gedu&x=1"),
    ).toEqual({ pathname: "/fi/complete-registration", asGedu: true, utm: NO_UTM });
  });

  it("reads the attribution through the sanitiser", () => {
    expect(
      readCompleteRegistrationTarget(
        "/complete-registration?utm_source=Lynx&utm_medium=%3Dx&utm_campaign=a&utm_campaign=b",
      ),
    ).toEqual({
      pathname: "/complete-registration",
      asGedu: false,
      utm: { source: "Lynx", medium: null, campaign: null },
    });
  });

  it("is null for any other page", () => {
    expect(readCompleteRegistrationTarget("/shop/abc-123")).toBe(null);
  });
});
