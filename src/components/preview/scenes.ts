import {
  CONFIRMATION_NOTICE_SCENARIOS,
  CONFIRMATION_PRODUCT_SCENARIOS,
  PREVIEW_SCENARIOS,
} from "@/components/public/products/mock-detail-fixtures";
import { REGION_LOCK_SCENARIOS } from "@/components/public/products/region-lock/region-lock-scenarios";
import { REQUIRED_CONSENTS_SCENARIO } from "@/components/public/products/required-consents-scenario";

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

/**
 * Which real page chrome a scene composes around its body.
 *
 * `"dashboard"` is the shell every non-admin role meets — header plus the
 * dashboard layout, no sidebar. `"admin"` is the same layout with the sidebar
 * the admin role actually gets, and it is a separate kind because that sidebar
 * takes a third of the width on a surface designed to use width. `"auth"` is
 * the signed-out shell — the public one with its `<main>` centring a single
 * narrow column, which is the whole geometry of a page whose body is one card.
 */
export type PreviewChromeKind = "public" | "auth" | "dashboard" | "admin";

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
 * Every scenario the product fixtures define is previewable on the product
 * surface, including the closed states a parent can only reach from a stale
 * link — those are the ones worth eyeballing full-page, since no browse card
 * links to them.
 */
const PRODUCT_SCENARIOS: readonly PreviewScenarioMeta[] = PREVIEW_SCENARIOS.map(
  ({ slug, label, group }) => ({ slug, label: `${group} — ${label}` }),
);

/**
 * The confirmation surface takes a subset instead, because a summary page is
 * only reachable from a signup panel's CTA. Which scenarios that leaves is
 * derived from the panel's own states rather than picked, since the product
 * scene wires that CTA unconditionally and a missing scenario here is a live
 * button landing on a 404. The derivation lives with the fixtures.
 */
const CONFIRMATION_SCENARIOS: readonly PreviewScenarioMeta[] =
  PREVIEW_SCENARIOS.filter(({ slug }) =>
    CONFIRMATION_PRODUCT_SCENARIOS.includes(slug),
  ).map(({ slug, label, group }) => ({ slug, label: `${group} — ${label}` }));

/**
 * The three region-lock states, on the same scene rather than one of their own:
 * they are the product page, seen by a viewer the lock has something to say to.
 * Three, because no family can be two of them at once — no location, wrong
 * country, or in the country and told so. An unlocked product is not a fourth:
 * that is the page every other scenario already shows.
 */
const REGION_LOCK_SCENARIO_META: readonly PreviewScenarioMeta[] =
  REGION_LOCK_SCENARIOS.map(({ slug, label }) => ({ slug, label }));

export const PREVIEW_SCENES = [
  {
    surface: "shop",
    title: "Shop browse",
    description:
      "The public storefront grid over fixtures: the filter rail, one headed section per category, and the browse card in every shape it takes. Chips are live and cards open the matching product-detail scene.",
    chrome: "public",
    scenarios: [{ slug: "default", label: "Storefront grid" }],
  },
  {
    surface: "products",
    title: "Product detail page",
    description:
      "The public product page a parent lands on from the shop, once per state its signup panel can be met in: registration window, audience, region lock, and the consent asks — required and optional together.",
    chrome: "public",
    scenarios: [
      ...PRODUCT_SCENARIOS,
      ...REGION_LOCK_SCENARIO_META,
      {
        slug: REQUIRED_CONSENTS_SCENARIO.slug,
        label: REQUIRED_CONSENTS_SCENARIO.label,
      },
    ],
  },
  {
    surface: "confirmation",
    title: "Purchase confirmation",
    description:
      "The post-signup summary, reached from the CTA on the matching product scene — plus the three paid states with no order row to show.",
    chrome: "public",
    scenarios: [
      ...CONFIRMATION_SCENARIOS,
      ...CONFIRMATION_NOTICE_SCENARIOS.map(({ slug, label }) => ({
        slug,
        label: `Paid, no order — ${label}`,
      })),
    ],
  },
  {
    surface: "parent-dashboard",
    title: "Parent dashboard",
    description:
      "The body /parent renders, over fixtures: a section per child, the parent's own section when they hold a seat, then billing and help. Every backend action is inert; the leave-waitlist confirm dialog is real.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "typical",
        label: "One child, one club",
        description: "The common case, which a busy fixture cannot stand in for.",
      },
      {
        slug: "busy-family",
        label: "Busy family",
        description:
          "The pill at its three-chip limit, with every card state that can share one page.",
      },
      {
        slug: "seven-gamers",
        label: "Seven children",
        description: "The pill past its limit, where it collapses.",
      },
      {
        slug: "new-family",
        label: "New account",
        description: "The account before its first child exists.",
      },
      {
        slug: "parent-only",
        label: "The parent's own seat",
        description: "A childless account holding a seat of its own.",
      },
      {
        slug: "no-enrollments",
        label: "Nothing booked",
        description: "Children linked, nothing booked.",
      },
    ],
  },
  {
    surface: "gamer-dashboard",
    title: "Gamer dashboard",
    description:
      "The body /gamer renders, over fixtures: the same enrollment cards, self-scoped and grouped by type noun, then the child-facing Help section. No money anywhere, and no way to leave a queue.",
    chrome: "dashboard",
    scenarios: [
      { slug: "typical", label: "Everything booked" },
      { slug: "empty", label: "Nothing booked yet" },
    ],
  },
  {
    surface: "gedu-dashboard",
    title: "Gedu dashboard",
    description:
      "The body /gedu renders, over fixtures: the next-step band, one roll-up card per group grouped by type noun, the Tools section beneath, and Help & feedback last. Badge counts are counted out of the feed each card links to.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "default",
        label: "Working dashboard",
        description:
          "The working dashboard: all three type nouns and every card state that can share a page, under an unsigned contract band.",
      },
      {
        slug: "clubs-only",
        label: "Clubs only",
        description:
          "The single-noun composition, at the card count where the grid wraps — and the page with no band at all.",
      },
      {
        slug: "uncertified",
        label: "Awaiting certification",
        description:
          "An account awaiting approval, which by definition has no assignments — under the criminal-record band, the other of the two.",
      },
    ],
  },
  {
    surface: "gedu-contract",
    title: "Gedu contract",
    description:
      "The page a Game Educator reads and signs their contract on: the criminal record extract explained above, the terms verbatim in your own locale's language, and the acceptance panel beneath. The signing dialog's sign and date steps work; accepting is inert.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "unaccepted",
        label: "Not signed yet",
        description: "The prompt, and the signing ceremony behind it.",
      },
      {
        slug: "accepted",
        label: "Signed",
        description: "The record that stands in place of the prompt.",
      },
    ],
  },
  {
    surface: "gedu-product",
    title: "Gedu product page",
    description:
      "The gedu's workspace for one product: masthead, standing notes, one continuous session feed with a now-divider, and the reference rail beside it. Every editor works against local state.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "club",
        label: "Club — remote, weekly",
        description:
          "The kitchen sink: a year of history, every session state, and an unstaffed peer group.",
      },
      {
        slug: "camp",
        label: "Camp — in person, daily",
        description:
          "The in-person, daily, end-dated shape — the only one with a site and a long future block.",
      },
      {
        slug: "roblox",
        label: "Roblox topic — the other game identity",
        description:
          "The Roblox identity on the roster, which one product's topic cannot show twice.",
      },
      {
        slug: "no-platform",
        label: "No game identity — the short row",
        description:
          "The topic that names no game account, where every roster row is the short one.",
      },
      {
        slug: "owed",
        label: "Creations owed — a finished flagged run",
        description:
          "The one product shape the owed signal needs: flagged, and over.",
      },
    ],
  },
  {
    surface: "voice-room",
    title: "Voice room",
    description:
      "The scheduled group room over a fixture context — zone cards, control dock, chat and the participant rail. The rail is where the staff flair is judged; the family scenario is the check that none of it is there.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "gedu",
        label: "Gedu — mid-session",
        description:
          "The staff view: newcomer badges across the window and two notes, on the real rail.",
      },
      {
        slug: "gamer",
        label: "Gamer — the same room",
        description:
          "The same room with no staff overlay at all, which is what a child's client can build.",
      },
    ],
  },
  {
    surface: "chat",
    title: "Chat",
    description:
      "The chat surface over fixtures, at the geometry the voice room gives it.",
    chrome: "dashboard",
    scenarios: [{ slug: "session", label: "Session chat" }],
  },
  {
    surface: "parent-club",
    title: "Family product page — parent",
    description:
      "The page a parent opens from My SOG for one enrollment: participant-scoped, single column, read-only. Everything a family may not see is structurally absent rather than filtered.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "active-club",
        label: "Club — remote, session in progress",
        description: "The kitchen sink, and the only live room.",
      },
      {
        slug: "in-person-club",
        label: "Club — in person",
        description: "The site shape: an address, and no Join at all.",
      },
      {
        slug: "camp",
        label: "Camp — finished",
        description: "A finished run — history end to end, no divider.",
      },
      {
        slug: "locked-join",
        label: "Club — Join locked",
        description: "The resting Join, which a live room cannot show.",
      },
      {
        slug: "my-own-club",
        label: "Club — the parent's own seat",
        description:
          "The seat the reader holds themselves, worded in the second person.",
      },
    ],
  },
  {
    surface: "gamer-club",
    title: "Family product page — gamer",
    description:
      "The same body and fixtures as the parent's page, rendered for the child whose page it is: no attendance marks, the group on the identity line, and empty states written to them.",
    chrome: "dashboard",
    scenarios: [
      { slug: "active-club", label: "Club — remote, session in progress" },
    ],
  },
  {
    surface: "seat-offer",
    title: "Seat-offer landing page",
    description:
      "The page the seat-offer mail links to, in each state it can be met in. Answering reaches no backend and still moves the panel: accept and decline hold their real committing states and land on the real card, and the decline confirmation works against local state.",
    chrome: "auth",
    scenarios: [
      { slug: "live", label: "The offer" },
      {
        slug: "expired",
        label: "Window closed",
        description:
          "The seat has gone, but declining has not — the one answer the deadline never governed.",
      },
      { slug: "accepted", label: "Seat accepted" },
      { slug: "declined", label: "Seat declined" },
      { slug: "used", label: "Link already used" },
      { slug: "dead-link", label: "Dead link" },
    ],
  },
  {
    surface: "admin-dashboard",
    title: "Admin dashboard (draft redesign)",
    description:
      "The /admin redesign over fixtures, pinned to a fixed Monday: the users strip, the needs-attention queue, Gedu certification, and the week's schedule. Filters, week steps and Certify work against local state.",
    chrome: "admin",
    scenarios: [
      {
        slug: "busy",
        label: "Busy platform",
        description:
          "The platform under load — the queue, the grid and the schedule with something in them.",
      },
      {
        slug: "quiet",
        label: "Quiet platform — all clear",
        description:
          "The empty states, which a platform under load has no way to reach.",
      },
    ],
  },
] as const satisfies readonly PreviewSceneMeta[];

export type PreviewScene = (typeof PREVIEW_SCENES)[number];
export type PreviewSurface = PreviewScene["surface"];

/**
 * The same list, read through its declared interface.
 *
 * `PREVIEW_SCENES` is `as const` — which is what gives `PreviewSurface` its
 * literal union, and therefore what makes a scene with no renderer fail to
 * compile — but it also means a scenario that omits its optional `description`
 * has no such property on the literal type at all, so a reader that walks every
 * scenario cannot ask for one. Widening to the interface is the fix, and it is
 * done once here rather than at each read site.
 */
export const PREVIEW_SCENE_LIST: readonly PreviewSceneMeta[] = PREVIEW_SCENES;

/** The scene for a URL segment, or `null` when nothing claims it. */
export function findPreviewScene(surface: string): PreviewScene | null {
  return PREVIEW_SCENES.find((scene) => scene.surface === surface) ?? null;
}

/** Whether a scene declares the given scenario slug. */
export function sceneHasScenario(scene: PreviewScene, scenario: string): boolean {
  return scene.scenarios.some((s) => s.slug === scenario);
}

export { previewSceneHref } from "./href";
