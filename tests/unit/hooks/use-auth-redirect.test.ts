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
