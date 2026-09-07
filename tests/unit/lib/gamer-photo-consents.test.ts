import { describe, it, expect } from "vitest";
import {
  ATTACHABLE_GAMER_PHOTO_CONSENT_TYPES,
  GAMER_PHOTO_CONSENT_ASKS,
  describeGamerPhotoConsents,
  isAttachableGamerPhotoConsent,
} from "@/lib/constants/gamer-photo-consents";
import { ROUTES } from "@/lib/constants/routes";

/**
 * **The photo-consent registry: which consents a product may ask for, and how
 * each one is asked.**
 *
 * The pure half of the feature, and the half every surface reads: the admin
 * form offers one row per attachable type, the signup panel renders one box per
 * row of a product's stored set. What is asserted here is the behaviour the two
 * ends rely on and could not see themselves losing — the ask reaching the right
 * document, and rows arriving in registry order rather than stored order.
 *
 * **One case is deliberately absent: a stored type this deploy cannot name.**
 * `describeGamerPhotoConsents` drops it, which is the opposite of what the
 * required-document registry does with an unknown slug, and it is worth a test —
 * but `gamer_photo_consent_type` has exactly one member today, so there is no
 * second value the parameter type will accept and the case cannot be written
 * without a cast that lies about the enum. The change that adds a second
 * partner is the change that can write it, and should.
 */

describe("the attachable registry", () => {
  it("offers the Lynx Educate ask and nothing else", () => {
    // School of Gaming does not use gamer photos on its own products, so it
    // does not ask. A second entry here is a decision somebody made about what
    // families get asked, and it should not arrive as a side effect.
    expect(ATTACHABLE_GAMER_PHOTO_CONSENT_TYPES).toEqual(["lynx_educate"]);
    expect(isAttachableGamerPhotoConsent("lynx_educate")).toBe(true);
  });

  it("gives every attachable type a sentence and a link to the policy", () => {
    // A row with no ask would render a checkbox with no sentence beside it —
    // a consent nobody can read before ticking.
    for (const type of ATTACHABLE_GAMER_PHOTO_CONSENT_TYPES) {
      const ask = GAMER_PHOTO_CONSENT_ASKS[type];
      expect(ask.sentenceKey).toBeTruthy();
      // The sentence's `<privacy>` tag has to reach the document that explains
      // what a tick permits, not the partner's marketing site — that is the one
      // way this registry differs from its marketing twin, and it is invisible
      // in the rendered sentence.
      expect(ask.href).toBe(ROUTES.robloxPrivacy);
    }
  });
});

describe("describeGamerPhotoConsents", () => {
  it("returns the rows a parent meets, each carrying its own ask", () => {
    expect(describeGamerPhotoConsents(["lynx_educate"])).toEqual([
      { type: "lynx_educate", ask: GAMER_PHOTO_CONSENT_ASKS.lynx_educate },
    ]);
  });

  it("asks nothing for a product with an empty set", () => {
    expect(describeGamerPhotoConsents([])).toEqual([]);
  });

  it("follows registry order rather than the order the product stored", () => {
    // The stored set is a set: whatever order the database hands it back in is
    // not a decision anybody made, and a parent should meet the boxes in the
    // same order every time.
    const rows = describeGamerPhotoConsents([
      ...ATTACHABLE_GAMER_PHOTO_CONSENT_TYPES,
    ].reverse());
    expect(rows.map((row) => row.type)).toEqual([
      ...ATTACHABLE_GAMER_PHOTO_CONSENT_TYPES,
    ]);
  });

  it("ignores a duplicate stored type rather than asking twice", () => {
    expect(
      describeGamerPhotoConsents(["lynx_educate", "lynx_educate"]),
    ).toHaveLength(1);
  });
});
