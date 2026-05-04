import { describe, it, expect } from "vitest";
import { resolveSafeRedirect } from "@/hooks/use-auth-redirect";

describe("resolveSafeRedirect", () => {
  it("returns null when no redirect is provided", () => {
    expect(resolveSafeRedirect(null)).toBe(null);
    expect(resolveSafeRedirect("")).toBe(null);
  });

  it("allows checkout with a query string", () => {
    expect(resolveSafeRedirect("/checkout?priceId=price_123")).toBe(
      "/checkout?priceId=price_123",
    );
  });

  it("allows product detail pages for every public product root", () => {
    expect(resolveSafeRedirect("/clubs/abc-123")).toBe("/clubs/abc-123");
    expect(resolveSafeRedirect("/camps/abc-123")).toBe("/camps/abc-123");
    expect(resolveSafeRedirect("/events/abc-123")).toBe("/events/abc-123");
  });

  it("rejects the bare browse roots (no trailing id)", () => {
    // Without the trailing slash this is just the listing page; the
    // post-auth redirect is meant to land users back on a specific
    // product they were trying to enroll in.
    expect(resolveSafeRedirect("/clubs")).toBe(null);
    expect(resolveSafeRedirect("/camps")).toBe(null);
    expect(resolveSafeRedirect("/events")).toBe(null);
  });

  it("rejects /checkout without a query string", () => {
    // The allowlist requires `?` so an attacker can't smuggle a path
    // like `/checkoutevil` through the prefix check.
    expect(resolveSafeRedirect("/checkout")).toBe(null);
  });

  it("rejects arbitrary paths", () => {
    expect(resolveSafeRedirect("/admin")).toBe(null);
    expect(resolveSafeRedirect("/parent/billing")).toBe(null);
    expect(resolveSafeRedirect("/")).toBe(null);
  });

  it("rejects open-redirect attempts to external hosts", () => {
    expect(resolveSafeRedirect("https://evil.example.com")).toBe(null);
    expect(resolveSafeRedirect("//evil.example.com/clubs/x")).toBe(null);
    expect(resolveSafeRedirect("javascript:alert(1)")).toBe(null);
  });

  it("rejects prefix-confusion attempts", () => {
    // `/clubsxyz` shares the prefix `/clubs` but isn't `/clubs/<id>`.
    // The allowlist requires the trailing slash specifically to block this.
    expect(resolveSafeRedirect("/clubsxyz")).toBe(null);
    expect(resolveSafeRedirect("/campsxyz")).toBe(null);
    expect(resolveSafeRedirect("/eventsxyz")).toBe(null);
  });
});
