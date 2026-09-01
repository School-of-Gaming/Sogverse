import { describe, it, expect } from "vitest";
import {
  CONSENT_DOCUMENTS,
  CONSENT_DOCUMENT_BUNDLES,
  completeConsentBundles,
  consentRowSlugs,
  describeRequiredConsents,
  isBundledConsentSlug,
} from "@/lib/constants/consent-documents";

/**
 * **Documents that are only ever required together.**
 *
 * The bundle is a UI grouping over an unchanged wire shape: the admin form
 * offers one checkbox, the signup panel offers one sentence to tick, and the
 * database still stores one slug per document and records one acceptance row
 * per document. These helpers are the whole of that grouping, so they are where
 * the all-or-nothing promise is pinned — including the drift case the promise
 * exists for, a stored set holding half a bundle.
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

  it("points every sentence tag at a document its own bundle covers", () => {
    // The sentence a parent ticks names its documents inline, one named tag
    // each, and the tags are what turn into links. A tag pointed at a slug the
    // bundle does not cover would send a parent off to read a document their
    // tick does not consent to — invisible in the rendered sentence, and the
    // reason this is asserted rather than trusted to review.
    for (const bundle of CONSENT_DOCUMENT_BUNDLES) {
      const tagged = Object.values(bundle.sentenceTags);
      expect([...tagged].sort()).toEqual([...bundle.slugs].sort());
      for (const slug of tagged) {
        expect(CONSENT_DOCUMENTS[slug]).toBeDefined();
      }
    }
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

/**
 * What one row accounts for — the signup panel stamps each tick with it, so an
 * agreement lives exactly as long as the thing it was given for.
 */
describe("the slugs behind a row", () => {
  const rowFor = (required: readonly string[], key: string) => {
    const row = describeRequiredConsents(required).find((r) => r.key === key);
    if (row === undefined) throw new Error(`no row ${key}`);
    return row;
  };

  it("gives a whole bundle every slug it holds", () => {
    const required = [TERMS, PRIVACY];
    expect(
      consentRowSlugs(rowFor(required, "roblox-programme"), required),
    ).toEqual([TERMS, PRIVACY]);
  });

  it("gives a half-stored bundle only the half that is required", () => {
    // The sentence still names both documents — it is one authored string — but
    // the tick can only send what the product actually requires, and the stamp
    // has to describe what was sent. So completing the other half later changes
    // the stamp and drops the tick, which is the behaviour this exists for.
    expect(consentRowSlugs(rowFor([PRIVACY], "roblox-programme"), [
      PRIVACY,
    ])).toEqual([PRIVACY]);
  });

  it("gives an unbundled document itself", () => {
    expect(consentRowSlugs(rowFor([UNKNOWN], UNKNOWN), [UNKNOWN])).toEqual([
      UNKNOWN,
    ]);
  });
});
