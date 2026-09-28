import { describe, it, expect } from "vitest";
import {
  completeRegistrationQuery,
  readCompleteRegistrationTarget,
  resolveCompleteRegistrationIntent,
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

  it("splits the raw pathname from the variant it asked for", () => {
    expect(readCompleteRegistrationTarget("/fr/complete-registration")).toEqual(
      {
        pathname: "/fr/complete-registration",
        asGedu: null,
        utm: NO_UTM,
        redirect: null,
      },
    );
    expect(
      readCompleteRegistrationTarget("/fi/complete-registration?as=gedu&x=1"),
    ).toEqual({
      pathname: "/fi/complete-registration",
      asGedu: true,
      utm: NO_UTM,
      redirect: null,
    });
    expect(
      readCompleteRegistrationTarget("/complete-registration?as=parent"),
    ).toMatchObject({ asGedu: false });
    expect(
      readCompleteRegistrationTarget("/complete-registration?as=admin"),
    ).toMatchObject({ asGedu: null });
  });

  it("reads the attribution through the sanitiser", () => {
    expect(
      readCompleteRegistrationTarget(
        "/complete-registration?utm_source=Lynx&utm_medium=%3Dx&utm_campaign=a&utm_campaign=b",
      ),
    ).toEqual({
      pathname: "/complete-registration",
      asGedu: null,
      utm: { source: "Lynx", medium: null, campaign: null },
      redirect: null,
    });
  });

  it("reads the product page through the post-auth allowlist", () => {
    expect(
      readCompleteRegistrationTarget(
        `/complete-registration?redirect=${encodeURIComponent("/fi/kauppa/abc-123")}`,
      ),
    ).toMatchObject({ redirect: "/fi/kauppa/abc-123" });
    for (const unsafe of [
      "/admin",
      "//evil.example/shop/abc",
      "/shop/../admin",
      "/complete-registration",
    ]) {
      expect(
        readCompleteRegistrationTarget(
          `/complete-registration?redirect=${encodeURIComponent(unsafe)}`,
        ),
      ).toMatchObject({ redirect: null });
    }
  });

  it("is null for any other page", () => {
    expect(readCompleteRegistrationTarget("/shop/abc-123")).toBe(null);
  });
});

describe("completeRegistrationQuery", () => {
  const UTM = { source: "Lynx", medium: null, campaign: "summer" };

  it("puts the variant first, then the attribution, then the product page", () => {
    expect(
      Object.entries(
        completeRegistrationQuery({
          asGedu: true,
          utm: UTM,
          redirect: "/fi/kauppa/abc-123",
        }),
      ),
    ).toEqual([
      ["as", "gedu"],
      ["utm_source", "Lynx"],
      ["utm_campaign", "summer"],
      ["redirect", "/fi/kauppa/abc-123"],
    ]);
  });

  it("emits a redirect only once it has passed the allowlist", () => {
    for (const unsafe of ["/admin", "https://evil.example/shop/x", "/shop/../admin"]) {
      expect(
        completeRegistrationQuery({ asGedu: false, utm: UTM, redirect: unsafe }),
      ).not.toHaveProperty("redirect");
    }
  });

  it("is empty for a parent with nothing to carry", () => {
    expect(
      completeRegistrationQuery({
        asGedu: false,
        utm: { source: null, medium: null, campaign: null },
      }),
    ).toEqual({});
  });
});

/**
 * The proxy's registration gate bounces an owing account to a bare finish
 * page, so the page falls back to the intent cookie the callback set for
 * whatever its own address lacks.
 */
describe("resolveCompleteRegistrationIntent", () => {
  const COOKIE =
    "as=gedu&utm_source=Lynx&utm_campaign=summer&redirect=%2Ffi%2Fkauppa%2Fabc-123";

  it("falls back to the cookie for everything a bare address lacks", () => {
    expect(
      resolveCompleteRegistrationIntent(new URLSearchParams(), COOKIE),
    ).toEqual({
      asGedu: true,
      utm: { source: "Lynx", medium: null, campaign: "summer" },
      redirect: "/fi/kauppa/abc-123",
    });
  });

  it("lets the address win for each part it carries", () => {
    expect(
      resolveCompleteRegistrationIntent(
        new URLSearchParams(
          "as=parent&utm_medium=email&redirect=%2Fshop%2Fxyz",
        ),
        COOKIE,
      ),
    ).toEqual({
      asGedu: false,
      // Whole, never merged field by field with the cookie's.
      utm: { source: null, medium: "email", campaign: null },
      redirect: "/shop/xyz",
    });
  });

  it("is the parent form, with nothing carried, when neither says", () => {
    expect(
      resolveCompleteRegistrationIntent(new URLSearchParams(), undefined),
    ).toEqual({
      asGedu: false,
      utm: { source: null, medium: null, campaign: null },
      redirect: null,
    });
  });

  it("reads the cookie through the same sanitisers as the address", () => {
    expect(
      resolveCompleteRegistrationIntent(
        new URLSearchParams(),
        "as=admin&utm_source=%3Dformula&redirect=%2Fadmin",
      ),
    ).toEqual({
      asGedu: false,
      utm: { source: null, medium: null, campaign: null },
      redirect: null,
    });
  });
});
