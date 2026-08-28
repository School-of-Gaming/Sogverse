import type { MarketingConsentType } from "@/types";
import type { PreviewScenario } from "./mock-detail-fixtures";

/**
 * **A product that asks a parent for something extra, as one preview
 * scenario — the conditions and the optional ask together.**
 *
 * It belongs to the product-detail scene — it is that page, on a product that
 * asks for something extra — and it is exactly one scenario because everything
 * both blocks do is visible in a single render: the required boxes unticked
 * with the CTA naming the step, the optional box beneath them not touching the
 * CTA at all, and the whole thing ticking through to the live label without
 * leaving the page. Ticking a box is pure UI state, so the "agreed" state is
 * not a second scenario; it is two clicks away inside this one.
 *
 * **The optional ask rides on this scenario rather than on one of its own**,
 * and that is the point of it: the one thing worth looking at is whether a
 * reader can tell the box that blocks the button from the box that does not,
 * and two scenarios would put that comparison in somebody's memory instead of
 * on their screen.
 *
 * A slug of its own rather than an entry in `PreviewScenario`, for the reason
 * the region-lock scenarios have one: the product is not what varies. This
 * renders the same club fixture every other scenario does, with a requirement
 * set written onto it — folding it into the fixtures would mean a near-identical
 * club whose difference lived somewhere the fixture could not state.
 *
 * Data-only: the scene registry is React-free and reads this to publish the
 * link, and the scene component reads it to build the page.
 */
interface RequiredConsentsScenarioMeta {
  slug: string;
  label: string;
  baseScenario: PreviewScenario;
  documentSlugs: readonly string[];
  marketingConsentTypes: readonly MarketingConsentType[];
}

export const REQUIRED_CONSENTS_SCENARIO: RequiredConsentsScenarioMeta = {
  // Unchanged when the optional ask joined it: a preview URL is a link people
  // paste to each other, and renaming one to describe a scenario more fully is
  // not worth breaking them.
  slug: "required-consents",
  /** Link text on the admin UI Previews page. Developer-facing English. */
  label: "Consent asks",
  /**
   * The product it renders: the flagship paid consumer club, signed in with
   * children, registration open — the same base the region-lock scenarios use,
   * and for the same reason. It is the fullest page the shop produces, so a new
   * section is judged against a panel that already has plenty in it rather than
   * against a bare one.
   */
  baseScenario: "consumer-club",
  /**
   * The whole Roblox bundle, which is the shape worth looking at: two documents
   * arriving as ONE row, whose sentence names them both inline as links. What a
   * scene is for is judging that sentence at rail width in a real locale —
   * whether it wraps, where the links land, and whether the row still reads as
   * one act next to the rules row beneath it.
   */
  documentSlugs: ["roblox-programme-terms", "roblox-privacy-policy"],
  /**
   * The partner ask, in the same render as the conditions above. It is the only
   * one there is, and one is enough for what the scene is for: the question is
   * whether the unbordered, hinted, non-gating box reads as optional directly
   * beneath two bordered boxes that hold the button — which needs the two kinds
   * side by side, not two of the same kind.
   */
  marketingConsentTypes: ["lynx_educate"],
};
