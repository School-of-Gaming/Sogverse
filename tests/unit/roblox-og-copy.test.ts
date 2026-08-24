import { describe, expect, it } from "vitest";
import fr from "@/../messages/fr.json";
import { ROBLOX_TRADEMARK_NOTICE } from "@/app/(public)/roblox/metadata-copy";

/**
 * The programme's Open Graph card is a PNG built by next/og, so its text is
 * baked in at build time with no request behind it and no locale to translate
 * against. The trademark notice Roblox requires on that card therefore has to
 * be a literal — while the same notice on the page itself comes out of
 * `messages/`.
 *
 * One sentence, two homes, and nothing in the type system to hold them
 * together: a re-wording landing in the catalog would leave the card asserting
 * the superseded notice, on the surface a partner's legal team is most likely
 * to see and the one nobody re-reads after a copy edit. This is the join.
 *
 * French, and only French, because the whole card is set in French (see
 * `metadata-copy.ts` for why the programme's card does not follow the viewer's
 * locale). The other four catalogs translate the notice for their own pages and
 * are not this constant's business.
 */
describe("the Roblox trademark notice on the OG card", () => {
  it("is the same sentence messages/fr.json puts on the page", () => {
    expect(ROBLOX_TRADEMARK_NOTICE).toBe(fr.roblox.legal.roblox);
  });
});
