import type { PreviewScenario } from "./mock-detail-fixtures";

/**
 * **A product whose enrolment conditions have to be agreed to, as one preview
 * scenario.**
 *
 * It belongs to the product-detail scene — it is that page, on a product that
 * asks for something extra — and it is exactly one scenario because everything
 * the section does is visible in a single render: both checkboxes unticked, the
 * CTA naming the step, and the whole thing ticking through to the live label
 * without leaving the page. Ticking a box is pure UI state, so the "agreed"
 * state is not a second scenario; it is two clicks away inside this one.
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
}

export const REQUIRED_CONSENTS_SCENARIO: RequiredConsentsScenarioMeta = {
  slug: "required-consents",
  /** Link text on the admin UI Previews page. Developer-facing English. */
  label: "Required consents",
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
};
