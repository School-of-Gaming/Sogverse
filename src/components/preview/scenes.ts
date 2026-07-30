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
    title: "Gedu dashboard (draft)",
    description:
      "The gedu dashboard rolled up to one card per group they run: next session with its Join state, the cadence in words, and an aggregate “needs attention” badge counted out of that product’s own feed. Cards open the matching product-page scene.",
    chrome: "dashboard",
    scenarios: [
      { slug: "default", label: "Two clubs, one behind" },
      { slug: "all-clear", label: "Nothing outstanding" },
      { slug: "unverified", label: "Awaiting verification" },
    ],
  },
  {
    surface: "gedu-product",
    title: "Gedu product page (draft)",
    description:
      "The product page rebuilt around the session feed: group identity band with its standing notes, roster behind a disclosure, the future horizon collapsed above the next session, then the term running backwards behind month dividers. Every editor — write-up, forward plan, group notes — works against local state.",
    chrome: "dashboard",
    scenarios: [
      { slug: "club-midterm", label: "Club, mid-term" },
      { slug: "needs-attention", label: "Several write-ups owed" },
      { slug: "club-yearlong", label: "Club, a year of history" },
      { slug: "camp-daily", label: "Camp, consecutive days" },
      { slug: "first-week", label: "Club, first week" },
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
