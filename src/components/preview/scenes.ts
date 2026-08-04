import {
  CONFIRMATION_NOTICE_SCENARIOS,
  PREVIEW_SCENARIOS,
} from "@/components/public/products/mock-detail-fixtures";

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
      "The post-signup summary, reached in the preview by clicking the CTA on the matching product scene — plus the three paid states with no order to show, where the page arrived before (or instead of) the row the webhook writes.",
    chrome: "public",
    scenarios: [
      ...PRODUCT_SCENARIOS,
      ...CONFIRMATION_NOTICE_SCENARIOS.map(({ slug, label, description }) => ({
        slug,
        label: `Paid, no order — ${label}`,
        description,
      })),
    ],
  },
  {
    surface: "parent-dashboard",
    title: "Parent dashboard",
    description:
      "The parent dashboard reorganised around the children rather than around the sessions: a section per child, headed by their identicon, first name and a quiet Manage link to their identity page, with one card per enrollment beneath it — soonest session first, finished runs muted at the bottom. The cards carry no child's name, because the heading above them already does; the type noun is the eyebrow, the schedule is the shared formatter's sentence, and the footer holds the Join on a remote product, the venue on an in-person one, the place in line and what happens when a seat opens on a waitlisted one, or the day a finished run ended. A waitlisted card is the one card that is not a link — there is no page behind it yet — and the corner is reserved for genuine problems. The My Gamers tile strip is gone — the headings absorbed it, and adding a child is one quiet tile after the last section. Every action is inert.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "typical",
        label: "One child, one club",
        description:
          "The page most parents actually open: one heading, one card, a locked Join naming the next session, and the billing card in its ordinary single-button form. It is here so the design can be judged on the common case — a dashboard that reads well with four cards and looks abandoned with one has failed at its main job.",
      },
      {
        slug: "busy-family",
        label: "Three children, every card state",
        description:
          "Everything that is not mutually exclusive, on one page — and exactly three children, so the pill is also at its named-entry limit, the widest it ever gets before collapsing (four forced sideways scrolling on an iPhone-width viewport). Aino has a remote club running right now — lit gradient, Live badge, Join open — with a failing card on the corner over the top of it, plus a waitlisted club whose footer carries her place in line and which links nowhere. Her brother, whose name is long enough to test both the heading and the nav chip, has an in-person camp naming its venue where a Join would be, a club winding down with the muted “Won’t renew” badge, and last summer’s camp sitting muted below both — the demotion is only legible next to something live. Otso is signed up for nothing, which is where the quiet empty-state card appears. Two Stripe customers, so the billing card is in its split form with a button each.",
      },
      {
        slug: "seven-gamers",
        label: "Seven children — pill collapsed",
        description:
          "Past three children the section pill stops naming them one by one and collapses to a single “Gamers” chip, so this is where the collapse and the seven headings behind it can be judged together.",
      },
      {
        slug: "new-family",
        label: "New account — no gamers yet",
        description:
          "The dashboard minutes after registering: no children linked, so the child sections give way to one “My Gamers” section holding the dashed card whose full-strength add button is the page's whole next step. The pill reads Gamers · Billing · Help — the empty state is still a section the nav can point at, not a card floating above Billing — and the moment the first child is added, that heading becomes their name. Billing is in its ordinary single-button form, and nothing anywhere reads as an error.",
      },
      {
        slug: "no-enrollments",
        label: "Gamers added, nothing booked",
        description:
          "The step after new-family and the state every real family passes through before their first purchase: two children, each section holding only the dashed empty card pointing at the shop. The page has to read as an invitation to book something, not as a dashboard that failed to load.",
      },
    ],
  },
  {
    surface: "gamer-dashboard",
    title: "Gamer dashboard",
    description:
      "The child's own dashboard with the same enrollment cards, self-scoped: no attribution anywhere, grouped under the type nouns they actually have rather than by person, and with a section pill that names those nouns plus Yty. The welcome header and the Yty grid are unchanged. Money is absent entirely — billing is a parent concern, so no payment or subscription badge ever renders here — and there is no way to give up a waitlist place.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "typical",
        label: "A club, a queue, a camp",
        description:
          "One page carrying every card state a gamer can meet: a club running right now with its Join lit, a club they are queued for — the waitlist sentence in the child's voice, no link on the card — and an in-person camp naming its venue where the Join would be. Two type nouns with events absent rather than empty; the single-noun composition is the same mechanism the gedu dashboard's clubs-only scenario already shows.",
      },
      {
        slug: "empty",
        label: "Nothing booked yet",
        description:
          "The child with no enrollments: the welcome, a single “Clubs” heading over the quiet dashed card — the same convention the gedu's empty dashboard uses — and the Yty grid, which is theirs regardless. The copy tells them to ask a parent, because nothing on this account can book anything.",
      },
    ],
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
          "A brand-new account an admin has not approved yet: the instant-room panel is replaced by the verification notice, and there are no cards at all, because verification is what gates group assignment. So this is also the empty state — a “Clubs” heading with its pill entry and one line saying a group will appear here once one is assigned, because a gedu with no assignments has no noun of their own and clubs is the default. Neither half can coexist with the default scenario.",
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
  {
    surface: "parent-club",
    title: "Family product page — parent",
    description:
      "The page a parent opens from My SOG for one enrollment: gamer-scoped (“Minecraft Builders Club, for Aino”), single column, mobile-first, and read-only end to end. The masthead answers when and where — schedule, Join or address — the notes card answers what is always true here, and the same session feed the gedu workspace runs on answers what happened, with this child's attendance mark on it and nothing about anybody else's. Everything a family may not see is structurally absent rather than filtered: no staff notes, no roster, no peer groups, no material link.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "active-club",
        label: "Club — remote, session in progress",
        description:
          "The kitchen sink, and the only scenario with a live room: a session running right now, so the Join is lit and the top entry says “Happening now” instead of “Next session”. Six more sessions collapsed above the divider (the upward reveal, judged against a screenful), four months of history behind it with month dividers and the chunked reveal, and the six past states worth seeing together — the long recap at the head rendered in full, an ordinary present week, a week this child was not at, a second long report far enough down to keep its “Read more”, a week written up with nobody marked, and a week with nothing on it at all.",
      },
      {
        slug: "in-person-club",
        label: "Club — in person",
        description:
          "The venue shape: an address under the schedule, a second standing note about the building, and no Join anywhere — not a locked one, because there is no room behind it and a locked button promises an unlock.",
      },
      {
        slug: "camp",
        label: "Camp — finished",
        description:
          "A run that is over. A UTC-pinned date range beside the weekday times, no future block and therefore no divider at all, and — although the camp was remote — no Join either, since there is no next session for a room to open for. The feed is history end to end.",
      },
      {
        slug: "new-club",
        label: "Club — nothing has happened yet",
        description:
          "The page a family lands on the week they buy a place: eight sessions ahead, a locked Join, and an empty past. The only way to judge the feed when the divider has nothing under it — which is why the column says so rather than simply stopping.",
      },
    ],
  },
  {
    surface: "gamer-club",
    title: "Family product page — gamer",
    description:
      "The same body and the same fixtures as the parent's page, rendered for the child whose page it is. Three things differ and they are the whole of the variant: no attendance marks anywhere (whether they turned up is a signal for the adult paying for the club, not something a child's own page should tell them), the identity line carries their group rather than “for Aino”, and the empty states speak to them instead of about them.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "active-club",
        label: "Club — remote, session in progress",
        description:
          "Deliberately the one scenario. The variant is about voice and attendance, not about the shapes a product can be in, and both are visible here — the venue, the finished run and the empty past all behave identically to the parent's copy beside it.",
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
