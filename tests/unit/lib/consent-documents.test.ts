import { describe, it, expect } from "vitest";
import {
  CONSENT_DOCUMENT_BUNDLES,
  completeConsentBundles,
  describeRequiredConsents,
  isBundledConsentSlug,
} from "@/lib/constants/consent-documents";

/**
 * **Documents that are only ever required together.**
 *
 * The bundle is a UI grouping over an unchanged wire shape: the admin form
 * offers one checkbox, the database still stores one slug per document and
 * records one acceptance row per document. These three helpers are the whole of
 * that grouping, so they are where the all-or-nothing promise is pinned —
 * including the drift case the promise exists for, a stored set holding half a
 * bundle.
 */
const TERMS = "roblox-programme-terms";
const PRIVACY = "roblox-privacy-policy";
const UNKNOWN = "some-future-document";

describe("the bundle registry", () => {
  it("publishes the Roblox pair as one unit", () => {
    const [bundle] = CONSENT_DOCUMENT_BUNDLES;
    expect(bundle.slugs).toEqual([TERMS, PRIVACY]);
    expect(isBundledConsentSlug(TERMS)).toBe(true);
    expect(isBundledConsentSlug(PRIVACY)).toBe(true);
    // Anything outside a bundle still needs a row of its own in the form, so
    // this is the question that decides whether it gets one.
    expect(isBundledConsentSlug(UNKNOWN)).toBe(false);
  });
});

describe("completing a set on the way to the database", () => {
  it("leaves a whole bundle alone", () => {
    expect(completeConsentBundles([TERMS, PRIVACY]).sort()).toEqual(
      [TERMS, PRIVACY].sort(),
    );
  });

  it("leaves a set that touches no bundle alone", () => {
    expect(completeConsentBundles([])).toEqual([]);
    expect(completeConsentBundles([UNKNOWN])).toEqual([UNKNOWN]);
  });

  it("completes a half-bundle rather than trimming it", () => {
    // The drift case, from either end. Completing is the safe direction: the
    // form's row ticks on either half, so the screen already said the bundle
    // was required — and trimming would let an unrelated edit silently drop a
    // legal condition the product really carries.
    expect(completeConsentBundles([TERMS]).sort()).toEqual(
      [TERMS, PRIVACY].sort(),
    );
    expect(completeConsentBundles([PRIVACY]).sort()).toEqual(
      [TERMS, PRIVACY].sort(),
    );
  });

  it("keeps unbundled slugs beside a completed bundle", () => {
    expect(completeConsentBundles([PRIVACY, UNKNOWN]).sort()).toEqual(
      [TERMS, PRIVACY, UNKNOWN].sort(),
    );
  });
});

describe("describing a stored set for a reader", () => {
  it("collapses a bundle to one row", () => {
    const rows = describeRequiredConsents([TERMS, PRIVACY]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("bundle");
  });

  it("shows a bundle for a half-set, matching what the form says", () => {
    const rows = describeRequiredConsents([TERMS]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("bundle");
  });

  it("lists anything outside a bundle on its own, and drops nothing", () => {
    const rows = describeRequiredConsents([TERMS, PRIVACY, UNKNOWN]);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe("bundle");
    expect(rows[1]).toEqual({ kind: "document", key: UNKNOWN, slug: UNKNOWN });
  });

  it("says nothing about a product that requires nothing", () => {
    expect(describeRequiredConsents([])).toEqual([]);
  });
});
