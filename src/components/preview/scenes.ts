import { PREVIEW_SCENARIOS } from "@/components/public/products/mock-detail-fixtures";

/**
 * The **full-page preview scene registry**.
 *
 * A style guide demos components; a page-level redesign has to be judged as a
 * page — real chrome, real viewport, real scrolling. A scene is one page
 * rendered from fixtures at `/preview/{surface}/{scenario}`, admin-gated by the
 * proxy and never indexed. This module is the single list of them: one dynamic
 * route resolves against it, and the UI Components page iterates it, so adding
 * a scene needs no edit to either.
 *
 * Two hard rules keep scenes from rotting into a parallel app:
 *
 * 1. **Chrome is composed, never simulated.** Each scene names the chrome it
 *    wants and gets the real components. A dashboard scene renders the header
 *    plus the dashboard layout with no sidebar — literally what a gedu, parent
 *    or gamer sees. The only honest difference is the viewer's own account in
 *    the header menu.
 * 2. **One body, two shells.** A scene never owns a layout. It renders the same
 *    presentational page body the live route renders — either the live body
 *    (a showcase that cannot drift) or the draft body that is going to replace
 *    it. Promotion means the draft body becomes the route's body and the data
 *    shell swaps fixtures for service calls. A scene that becomes a permanent
 *    third fork of a page is exactly the rot this rule exists to prevent.
 *
 * Scenes are fixture-only: no network, no mutations. Interactions that are pure
 * UI (an inline editor over local state) work; interactions that would hit a
 * backend render their real states with the action inert.
 *
 * This module is deliberately data-only — no React — so the route, the
 * admin UI Previews page and the renderer can all import it without dragging
 * every scene's component tree along. The renderer beside it
 * (`render-scene.tsx`) is keyed by `PreviewSurface`, so a scene listed here with
 * no render fails to compile.
 *
 * Titles and scenario labels are literal English: they are shown only on the
 * admin-only UI Previews page, never on the preview pages themselves. Anything a
 * scene *renders* is user-facing-shaped and goes through next-intl as usual.
 */

/** Which real page chrome a scene composes around its body. */
export type PreviewChromeKind = "public" | "dashboard";

export interface PreviewScenarioMeta {
  /** URL segment — `/preview/{surface}/{slug}`. */
  slug: string;
  /** Short human label for the UI Previews page's link list. */
  label: string;
  /**
   * What this scenario shows that its siblings don't.
   *
   * Optional, because a scene whose scenarios are an enumeration of one axis
   * (every state of the product page's signup panel) says everything in its
   * labels and would only repeat itself here. It earns its place the moment a
   * scene has few, deliberately-chosen scenarios: then the question a reader
   * has is "which of these do I open?", and a label alone doesn't answer it.
   */
  description?: string;
}

export interface PreviewSceneMeta {
  /** URL segment — `/preview/{surface}`. */
  surface: string;
  /** Human title for the UI Previews page's link list. */
  title: string;
  /** One line on what the scene is for, shown above its links. */
  description: string;
  chrome: PreviewChromeKind;
  /** Ordered; the first is the sensible default to open. */
  scenarios: readonly PreviewScenarioMeta[];
}

/**
 * Every scenario the product fixtures define is previewable, including the
 * closed states a parent can only reach from a stale link — those are the ones
 * worth eyeballing full-page, since no browse card links to them.
 */
const PRODUCT_SCENARIOS: readonly PreviewScenarioMeta[] = PREVIEW_SCENARIOS.map(
  ({ slug, label, group }) => ({ slug, label: `${group} — ${label}` }),
);

export const PREVIEW_SCENES = [
  {
    surface: "products",
    title: "Product detail page",
    description:
      "The public product page a parent lands on from the shop, with the registration signup panel in each of its states.",
    chrome: "public",
    scenarios: PRODUCT_SCENARIOS,
  },
  {
    surface: "confirmation",
    title: "Purchase confirmation",
    description:
      "The post-signup summary, reached in the preview by clicking the CTA on the matching product scene.",
    chrome: "public",
    scenarios: PRODUCT_SCENARIOS,
  },
  {
    surface: "gedu-dashboard",
    title: "Gedu dashboard",
    description:
      "The gedu dashboard rolled up to one card per group they run, grouped under the type nouns: next session, the cadence in words with an aggregate “needs attention” badge on the end of it, a Live badge in the corner while something is running, and a footer holding the Join on a remote product, the venue on an in-person one, or the day it ended on a finished run. Every card is the same height because every zone holds something, not because empty ones are padded. The two scene-backed cards open the matching product-page scene.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "default",
        label: "Working dashboard",
        description:
          "All three type nouns, and the five card shapes that cover every state: a remote club live right now (Live badge, Join lit), a remote club later this week (Join locked), a club whose run has ended (muted, no next-session line, an “Ended …” date where the Join was, backlog badge undimmed), an in-person camp owing a write-up (attention badge, venue in the footer), and an in-person event running now (Live badge, venue, still no Join). The ended club sits under the same heading as the two live ones and below both, so the demotion is visible on the page; the last pairing is what proves the footer zone is full on both kinds of product.",
      },
      {
        slug: "clubs-only",
        label: "Clubs only",
        description:
          "The single-noun composition most gedus actually have — one “Clubs” heading, one pill entry, camps and events absent rather than empty — and seven clubs in it, so how the cards tile and wrap is visible at both the two-column and three-column widths. Their next sessions are spread across the week, a couple carry a backlog, and one is live.",
      },
      {
        slug: "unverified",
        label: "Awaiting verification",
        description:
          "The same assignments for an account an admin has not approved yet — the instant-room panel is replaced by the verification notice. The one state that cannot coexist with the default.",
      },
    ],
  },
  {
    surface: "gedu-product",
    title: "Gedu product page",
    description:
      "The product page rebuilt around the session feed: the masthead, the standing notes row, one continuous timeline with a “now” divider between the future and the past, the term running backwards behind month dividers, and the reference rail beside it. Expanding the future reveals it upward with the viewport pinned, so nothing already on screen moves. Every editor — write-up, forward plan, group notes, site notes — works against local state.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "club",
        label: "Club — remote, weekly",
        description:
          "The kitchen sink. Fifty-five weeks of history behind month dividers and the chunked reveal, all three rungs of the completeness ladder (green-checked, quietly done, and still owed), reports from two lines to a full dated write-up so the clamp and its “Read more” are both on screen from the first frame, and three sister groups in the rail including one nobody teaches yet. At the bottom, the pre-epoch tail: a session somebody went back and wrote up (an ordinary entry that never turns amber) and two nobody has touched — quiet placeholder lines that still open the record editor, because the epoch gates what is owed, not what can be edited.",
      },
      {
        slug: "camp",
        label: "Camp — in person, daily",
        description:
          "The two things the club cannot show: back-to-back weekday dates across a weekend, and a venue — so this is the scenario with site notes (shared by every product at that site) and with no voice room anywhere, every Join inert. It owes exactly one day, which is what puts an attention badge on an in-person dashboard card.",
      },
    ],
  },
] as const satisfies readonly PreviewSceneMeta[];

export type PreviewScene = (typeof PREVIEW_SCENES)[number];
export type PreviewSurface = PreviewScene["surface"];

/** The scene for a URL segment, or `null` when nothing claims it. */
export function findPreviewScene(surface: string): PreviewScene | null {
  return PREVIEW_SCENES.find((scene) => scene.surface === surface) ?? null;
}

/** Whether a scene declares the given scenario slug. */
export function sceneHasScenario(scene: PreviewScene, scenario: string): boolean {
  return scene.scenarios.some((s) => s.slug === scenario);
}

export { previewSceneHref } from "./href";
