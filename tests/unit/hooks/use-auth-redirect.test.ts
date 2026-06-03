import { describe, it, expect } from "vitest";
import { resolveSafeRedirect } from "@/hooks/use-auth-redirect";

describe("resolveSafeRedirect", () => {
  it("returns null when no redirect is provided", () => {
    expect(resolveSafeRedirect(null)).toBe(null);
    expect(resolveSafeRedirect("")).toBe(null);
  });

  it("allows shop product detail pages", () => {
    expect(resolveSafeRedirect("/shop/abc-123")).toBe("/shop/abc-123");
  });

  it("rejects the bare shop listing (no trailing id)", () => {
    // Without the trailing slash this is just the listing page; the
    // post-auth redirect is meant to land users back on a specific
    // product they were trying to enroll in.
    expect(resolveSafeRedirect("/shop")).toBe(null);
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
});
