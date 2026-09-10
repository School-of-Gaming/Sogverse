import { describe, it, expect } from "vitest";

import { resolveUnlockDestination } from "@/components/pin/unlock-gate";
import { ROUTES } from "@/lib/constants";

/**
 * Where entering the parent PIN sends the reader.
 *
 * Two properties, and the second is why this file exists. The target is the
 * **raw, localized** path the proxy's bounce carried, so the parent returns to
 * the page they were on rather than to its English twin — and the loop guard
 * that drops the gate itself therefore has to *normalize* before comparing,
 * because `/fi/parent/unlock` is not string-equal to the route it names. With
 * the comparison left raw, unlocking navigated straight back to the gate.
 */
describe("resolveUnlockDestination", () => {
  it("returns a localized target untouched", () => {
    expect(resolveUnlockDestination("/fi/kauppa")).toBe("/fi/kauppa");
  });

  it("drops the gate itself under a locale prefix", () => {
    for (const locale of ["en", "fi", "sv"]) {
      expect(resolveUnlockDestination(`/${locale}/parent/unlock`)).toBe(
        ROUTES.customer.dashboard,
      );
    }
  });

  it("drops the gate on its bare path too", () => {
    expect(resolveUnlockDestination(ROUTES.customer.unlock)).toBe(
      ROUTES.customer.dashboard,
    );
  });

  it("falls back to the dashboard for a missing or off-origin target", () => {
    for (const target of [null, "https://evil.example/x", "//evil.example"]) {
      expect(resolveUnlockDestination(target)).toBe(
        ROUTES.customer.dashboard,
      );
    }
  });
});
