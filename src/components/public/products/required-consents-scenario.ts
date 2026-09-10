import type { GamerPhotoConsentType, MarketingConsentType } from "@/types";
import type { PreviewScenario } from "./mock-detail-fixtures";
import {
  REGION_LOCK_COUNTRY,
  REGION_LOCK_HOME,
  type ProductRegionLock,
} from "./region-lock/region-lock-scenarios";

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
  /**
   * One line of *why this scenario exists*, for the UI Previews page. Optional,
   * because a scene whose scenarios enumerate one axis says everything in its
   * labels; these two do not enumerate an axis, so each says what it is for.
   */
  description?: string;
  baseScenario: PreviewScenario;
  documentSlugs: readonly string[];
  marketingConsentTypes: readonly MarketingConsentType[];
  gamerPhotoConsentTypes: readonly GamerPhotoConsentType[];
  /**
   * The lock the product carries and the viewer it is read against, when the
   * scenario is about a locked product. Absent on the plain consent scenario,
   * which is the unlocked page every other product scenario shows.
   */
  regionLock?: ProductRegionLock;
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
   * whether a box whose only marker is an info-toned hint sentence reads as
   * skippable directly beneath two identically bordered boxes that hold the
   * button. The ask no longer differs from a gate in shape — the border marks
   * the click target, not the stakes — so that one sentence is the whole of the
   * distinction, and judging it needs the two kinds side by side at rail width,
   * not two of the same kind.
   */
  marketingConsentTypes: ["lynx_educate"],
  /**
   * The photo ask, in the same render again — which is what makes this one
   * scenario rather than three. The panel now puts two optional questions
   * between the conditions and the button, and the thing worth judging is
   * whether they read as two questions a parent may decline rather than as more
   * of the boxes that hold the button: two identically bordered gates, then two
   * identically bordered asks whose only marker is an info-toned hint sentence
   * apiece. Split across scenarios, that comparison happens in somebody's
   * memory.
   *
   * The base scenario is signed in with children, so the selected participant
   * is a child and the photo rows are live. The *disabled* half of the row —
   * the rows standing but unanswerable because the seat has no gamer behind it
   * — needs a picker holding both kinds of row, which is a both-audiences
   * product and its own scenario below.
   */
  gamerPhotoConsentTypes: ["lynx_educate"],
};

/**
 * **The Creator Academy shape, as one scenario: free, locked to France, and
 * asking all three consents at once.**
 *
 * The scenario above is the general one — a page that asks a parent for
 * something extra, on the flagship paid club, so the blocks are judged against
 * the fullest panel the shop produces. This one is the *specific* product the
 * Lynx consent actually ships on, and it earns a scenario of its own because
 * that product differs from the general case in two ways the panel shows at
 * once:
 *
 * - **It is free.** The Roblox Programme products carry no price, so the panel
 *   above the consent blocks is a different page — no price line, no monthly
 *   cadence on the CTA, and no 30-day money-back guarantee, which the panel
 *   keys on a subscription and nothing else resolves to. The consent stack
 *   therefore sits much higher in the rail than the paid scenario shows it,
 *   which is the thing worth eyeballing. The free fixture is also capped with
 *   a waitlist, so the seat bar is in the render too.
 * - **It is region-locked to France**, which is the one thing that puts
 *   another block between the participant picker and the conditions.
 *
 * **The viewer is a French parent who is eligible, and that is a pick rather
 * than a compromise.** Of the three region states the panel says something
 * about, the wrong-country one replaces the whole panel — no picker, no
 * consents, nothing to judge beside them — and the no-location one shows the
 * ask rather than the answer. Eligible is the state a parent is in at the
 * moment they actually read and tick these boxes, and the only one that puts
 * the confirmed location and all three consent blocks in a single render.
 *
 * It reads its lock and its home commune from the region-lock scenarios beside
 * it, so the two cannot end up disagreeing about which country France is.
 */
export const CREATOR_ACADEMY_SCENARIO: RequiredConsentsScenarioMeta = {
  slug: "creator-academy",
  /** Link text on the admin UI Previews page. Developer-facing English. */
  label: "Creator Academy — free, France-locked",
  description: "The product the Lynx consent ships on.",
  /** Free, capped and open — the billing shape the real products have. */
  baseScenario: "consumer-club-free",
  documentSlugs: ["roblox-programme-terms", "roblox-privacy-policy"],
  marketingConsentTypes: ["lynx_educate"],
  gamerPhotoConsentTypes: ["lynx_educate"],
  regionLock: {
    regionLockCountry: REGION_LOCK_COUNTRY,
    viewerCountry: REGION_LOCK_COUNTRY,
    viewerLocationName: REGION_LOCK_HOME,
  },
};

/**
 * **The photo ask on a product whose audience admits adults — the one page
 * where a reader can watch the rows go dead and come back.**
 *
 * The photo rows are drawn wherever a product asks them of a gamer audience,
 * from the panel's first paint, and only their answerability follows the
 * selection: a child selected and they are live, the parent's own seat selected
 * and they are disabled, because a consent about a gamer's image cannot be
 * given about the adult giving it. Nothing about that is visible in a render —
 * it is visible in the *transition*, which is why it earns a link rather than a
 * paragraph: click the reader's own row, watch two boxes go quiet in place with
 * no row moving, click a child, watch them come back.
 *
 * A both-audiences product is the only fixture that can show it. The two
 * scenarios above are gamers-only, where every selectable row is a child and
 * the rows are never anything but live; a parents-only product has no gamer
 * audience at all and so draws no photo rows to begin with.
 *
 * It carries no required documents and no marketing ask. Those are what the two
 * scenarios above are for, and repeating them here would put four bordered
 * boxes around the two this scenario is actually about.
 */
export const PHOTO_ASK_BOTH_AUDIENCES_SCENARIO: RequiredConsentsScenarioMeta = {
  slug: "photo-ask-both-audiences",
  /** Link text on the admin UI Previews page. Developer-facing English. */
  label: "Photo ask — child seat vs. own seat",
  description: "The rows stand and go disabled; they do not appear and vanish.",
  baseScenario: "event-both-audiences",
  documentSlugs: [],
  marketingConsentTypes: [],
  gamerPhotoConsentTypes: ["lynx_educate"],
};

/**
 * Every consent scenario, in the order the UI Previews page lists them.
 *
 * A list rather than exports read one at a time, because the registry and the
 * renderer each walk it: adding another is then one line here and nothing else,
 * which is the property the region-lock trio next door already has.
 */
export const CONSENT_SCENARIOS: readonly RequiredConsentsScenarioMeta[] = [
  REQUIRED_CONSENTS_SCENARIO,
  CREATOR_ACADEMY_SCENARIO,
  PHOTO_ASK_BOTH_AUDIENCES_SCENARIO,
];

/** The consent scenario for a slug, or null when the slug is not one of them. */
export function findConsentScenario(
  slug: string,
): RequiredConsentsScenarioMeta | null {
  return CONSENT_SCENARIOS.find((s) => s.slug === slug) ?? null;
}
