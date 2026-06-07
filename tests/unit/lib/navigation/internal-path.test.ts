import { describe, it, expect } from "vitest";
import { resolveInternalPath } from "@/lib/navigation/internal-path";

const FALLBACK = "/dashboard";

describe("resolveInternalPath", () => {
  describe("accepts genuine internal paths", () => {
    it("returns a simple absolute path unchanged", () => {
      expect(resolveInternalPath("/gedu/clubs/123", FALLBACK)).toBe(
        "/gedu/clubs/123",
      );
    });

    it("preserves query string and hash", () => {
      expect(resolveInternalPath("/gedu/clubs/123?tab=roster#top", FALLBACK)).toBe(
        "/gedu/clubs/123?tab=roster#top",
      );
    });

    it("returns the root path", () => {
      expect(resolveInternalPath("/", FALLBACK)).toBe("/");
    });
  });

  describe("rejects off-origin / open-redirect vectors", () => {
    it("rejects protocol-relative //host", () => {
      expect(resolveInternalPath("//evil.com", FALLBACK)).toBe(FALLBACK);
    });

    it("rejects backslash-smuggled /\\host (browsers normalize \\ to /)", () => {
      expect(resolveInternalPath("/\\evil.com", FALLBACK)).toBe(FALLBACK);
    });

    it("rejects an absolute https URL", () => {
      expect(resolveInternalPath("https://evil.com", FALLBACK)).toBe(FALLBACK);
    });

    it("coerces a single-slash scheme to a same-origin path (stays on our host)", () => {
      // `https:/evil.com` resolves to `https://<sentinel>/evil.com` — the
      // "evil.com" lands in the PATH, not the host, so it can only ever
      // navigate to a path on our own origin. Safe; returned as-is.
      expect(resolveInternalPath("https:/evil.com", FALLBACK)).toBe("/evil.com");
    });

    it("rejects a leading-tab smuggled protocol-relative path", () => {
      expect(resolveInternalPath("\t//evil.com", FALLBACK)).toBe(FALLBACK);
    });

    it("rejects a non-http scheme", () => {
      expect(resolveInternalPath("javascript:alert(1)", FALLBACK)).toBe(
        FALLBACK,
      );
    });

    it("rejects a userinfo trick that resolves off-origin", () => {
      expect(
        resolveInternalPath("https://internal.invalid@evil.com", FALLBACK),
      ).toBe(FALLBACK);
    });

    it("collapses .. traversal to the normalized same-origin path", () => {
      // The parser normalizes `..` during construction, so the returned path
      // is the one the browser would actually navigate to — callers layering
      // an allowlist on top (resolveSafeRedirect) check the real destination,
      // not the raw string.
      expect(resolveInternalPath("/shop/../admin", FALLBACK)).toBe("/admin");
    });
  });

  describe("missing / malformed input falls back", () => {
    it("falls back on undefined", () => {
      expect(resolveInternalPath(undefined, FALLBACK)).toBe(FALLBACK);
    });

    it("falls back on null", () => {
      expect(resolveInternalPath(null, FALLBACK)).toBe(FALLBACK);
    });

    it("falls back on empty string", () => {
      expect(resolveInternalPath("", FALLBACK)).toBe(FALLBACK);
    });

    it("uses the first entry of a string array", () => {
      expect(resolveInternalPath(["/gedu", "/admin"], FALLBACK)).toBe("/gedu");
    });

    it("falls back when the first array entry is unsafe", () => {
      expect(resolveInternalPath(["//evil.com"], FALLBACK)).toBe(FALLBACK);
    });
  });
});
