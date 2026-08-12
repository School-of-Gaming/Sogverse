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
    surface: "shop",
    title: "Shop browse",
    description:
      "The storefront grid a family lands on, over fixtures: the filter rail (a strip above the cards on a phone, a sticky rail beside them from `lg`), one headed section per shop category, and the cards themselves. The chips are live — they write the URL and the client-side predicate runs over these rows — so a filter can actually be toggled against a grid that answers. Municipality clubs are absent because the storefront does not carry them; every card opens the matching product-detail scene. On the first two scenarios card names carry their fixture's label so the grid is readable as a comparison; the third renders the draft media-top card that is going to replace the live one — over the same grid, rail and widths — and gives its cards realistic names instead, moving the fixture's description into the card's own description slot.",
    chrome: "public",
    scenarios: [
      {
        slug: "default",
        label: "Ordinary storefront",
        description:
          "Every card gamers-only, which is the shape the grid has today and the regression case: no audience badge anywhere, an age line on every card, and an Audience chip row that nothing here answers — a chip matches the products wearing its badge, and these wear none, so lighting either one empties the page onto its no-matches state. Clubs, camps and events all headed.",
      },
      {
        slug: "audiences",
        label: "Mixed audiences",
        description:
          "The smallest grid that answers the audience question: a gamers-only club beside a parents-only one, and an events section holding one card of each of the three audiences. It is the only page where the badge's presence on two cards and its absence on the third can be compared in one pass — and the only place the Audience chips have something to filter, one chip per badge: “For parents” leaves the parents-only cards, “For families” the both-audience ones, and neither leaves a gamers-only card standing. The parents-only cards are also where the missing age line is visible: no range, no “18+”, the badge carrying the whole meaning.",
      },
      {
        slug: "redesign",
        label: "Redesign — media-top card",
        description:
          "The draft card, in the live grid: a full-width 3:2 image on top, the title on a row of its own beneath it, topic and language flag under that, then schedule and place — and the short description back at two lines, above an unchanged footer. Two chips sit on the image, in opposite corners, one fact each: the tag bottom-left (its own icon per tag — a brain, a sprout, a rocket) and, top-right, either the audience badge or the age range, never both, which is the live card's exclusivity rule kept rather than reopened. They are solid brand fills rather than the outline chips used elsewhere, because they sit on a photograph; the demo art is chosen to stress that, one card near-white exactly where the tag lands and two night scenes. Four cards are worth going to first: the long Finnish club name, the only title that should reach a second line; the un-imaged workshop, whose wordmark banner has to sit in the grid without reading as a broken card *and* whose tag chip is the one landing on muted grey rather than a photo; the family outing, the fullest card the design makes, with a chip in both corners; and the full camp, still inert below the rule. Each card's description says which fixture it is — the names are realistic on purpose, since a grid of “· scenario label” titles says nothing about how real ones sit. The ended card's desaturated state is not on this grid at all (no shop fixture is authored as finished); it lives on the camp-ended product scene.",
      },
    ],
  },
  {
    surface: "products",
    title: "Product detail page",
    description:
      "The public product page a parent lands on from the shop, with the registration signup panel in each of its states — and, at the end of each product type's run, the audience scenarios: the three shapes the picker takes once a product can be sold to parents. Those three are the only way to look at a for-parents product at all, since none exists yet and the admin switch that creates one lands last.",
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
      "The body `/parent` renders, over fixtures instead of the family's own rows. The page is organised around the people in the family: a section per child, headed by their identicon, first name and a quiet Manage link to their identity page, with one card per enrollment beneath it — soonest session first, finished runs muted at the bottom. Since products can be sold to parents, the reader gets a section of their own beneath the children whenever they hold a seat: their own name and face, no Manage link, no empty state, and cards whose Join goes straight to the room because there is nobody to switch into. The cards carry no name, because the heading above them already does; the type noun is the eyebrow, the schedule is the shared formatter's sentence, and the footer holds the Join on a remote product, the venue on an in-person one, the place in line and what happens when a seat opens on a waitlisted one, the fact that a Gedu is being matched on a seat nobody has placed yet, or the day a finished run ended. The two cards with nothing behind them yet — the queue place and the unplaced seat — are the ones that are not links, and the corner is reserved for genuine problems: leaving a waitlist is a quiet text link under its own footer sentence, not a badge. The child headings are also how a parent reaches a child, so adding one is a single quiet tile after the last child's section — which hides itself once the account holds as many children as it may. Every action that would reach a backend is inert; the confirm dialog in front of the leave is pure UI and works.",
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
        label: "Two children, a parent's own seat, every card state",
        description:
          "Everything that is not mutually exclusive, on one page — and exactly three named chips, which is the pill at its limit and the widest it ever gets before collapsing (a fourth forced sideways scrolling on an iPhone-width viewport). Since a parent can hold a seat, those three are two children and the parent themselves: one cap over both kinds of chip, not two, which is the decision this page exists to check. Aino has a remote club running right now — lit gradient, Live badge, Join open — with a failing card on the corner over the top of it; a club bought yesterday that nobody has placed her in yet, wearing the blue awaiting tone with no Join, no chevron and no link; and a waitlisted club whose footer carries her place in line and a quiet “Leave waitlist” link beneath it, which opens the real confirm dialog. The last two are the page's only inert child cards and they sit together deliberately: the one thing that has to be legible at a glance is that “your seat is being arranged” and “there is no seat” are not the same news. Her brother, whose name is long enough to test both the heading and the nav chip, has an in-person camp naming its venue where a Join would be, a club winding down with the quiet won’t-renew line under its schedule (information in the body, never an alarm on the corner), and last summer’s camp sitting muted below both — the demotion is only legible next to something live. Under them both is Marja's own section: no Manage link beside her name, a parents' evening running right now whose Join is a plain link to the room rather than the switch-profile dialog a child's card opens, and a family event she is queued for, whose leave dialog is the one that names nobody. Two Stripe customers, so the billing card is in its split form with a button each.",
      },
      {
        slug: "seven-gamers",
        label: "Seven children and a parent — pill collapsed",
        description:
          "Past the named limit the section pill stops naming the children one by one and collapses to a single “Gamers” chip aimed at the first of them, so this is where the collapse and the seven headings behind it can be judged together. The parent's own chip keeps its name beside it — collapsing that one would mean folding a parent into a label that says “Gamers” — so the bar reads Gamers · Marja · Billing · Help, which is the whole of the collapse rule on one line. Seven is also as many children as one account may hold, which makes this the one scenario with no add-a-child tile under the last child's section — withdrawn rather than disabled, since nothing is going to clear the condition.",
      },
      {
        slug: "new-family",
        label: "New account — no gamers yet",
        description:
          "The dashboard minutes after registering: no children linked and nothing bought, so the child sections give way to one “My Gamers” section holding the dashed card whose full-strength add button is the page's whole next step. The pill reads Gamers · Billing · Help — the empty state is still a section the nav can point at, not a card floating above Billing — and the moment the first child is added, that heading becomes their name. Billing is in its ordinary single-button form, and nothing anywhere reads as an error.",
      },
      {
        slug: "parent-only",
        label: "No children, a seat of the parent's own",
        description:
          "The state a parents' evening makes reachable the day it goes on sale: an account with nobody linked to it and a club the parent bought for themselves. The add-a-child card is still the first thing on the page and is still a section — but it is no longer the whole page, which is the point: Marja's own section sits beneath it with her two cards, and the pill reads Gamers · Marja · Billing · Help. This is the scenario to open if the question is whether the add-a-child prompt still reads as an invitation when it is not the only thing there.",
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
      "The body `/gamer` renders, over fixtures: the child's own dashboard with the same enrollment cards, self-scoped — no attribution anywhere, grouped under the type nouns they actually have rather than by person, and with a section pill that names those nouns plus Yty. The hero greets the child by name, and the Yty grid sits under it. Money is absent entirely — billing is a parent concern, so no payment or subscription badge ever renders here — and there is no way to give up a waitlist place. The parent-only props are not merely unpassed: the card's own types make them unreachable from a child's audience.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "typical",
        label: "A club, a queue, a camp, an unplaced seat",
        description:
          "One page carrying every card state a gamer can meet: a club running right now with its Join lit, a club bought yesterday that nobody has placed them in yet (blue tone, no Join, no link, and the awaiting sentence written to the child rather than about them), a club they are queued for — the waitlist sentence in the child's voice, and no way to leave the queue, because that is a decision with a cost and not this account's to make — and an in-person camp naming its venue where the Join would be. Two type nouns with events absent rather than empty; the single-noun composition is the same mechanism the gedu dashboard's clubs-only scenario already shows.",
      },
      {
        slug: "empty",
        label: "Nothing booked yet",
        description:
          "The child with no enrollments: the greeting by name, a single “Clubs” heading over the quiet dashed card — the same convention the gedu's empty dashboard uses — and the Yty grid, which is theirs regardless. The copy tells them to ask a parent, because nothing on this account can book anything.",
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
      "The product page rebuilt around the session feed: the masthead, the standing notes row, one continuous timeline with a “now” divider between the future and the past, the term running backwards behind month dividers, and the reference rail beside it. Expanding the future reveals it upward with the viewport pinned, so nothing already on screen moves. Every editor — write-up, forward plan, group notes, site notes — works against local state. Both scenarios carry a mixed roster: eight children and one adult holding a seat of her own, so the rail's adult row is judged where it actually sits — last in a column of child rows, a line shorter than all of them — and she appears on the attendance checklist alongside them, because a gedu marks a parent present exactly as they mark a child.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "club",
        label: "Club — remote, weekly",
        description:
          "The kitchen sink. Fifty-five weeks of history behind month dividers, arriving as you scroll, both states a card can wear and every way into them (green-checked with register and report both in; amber for a register left unfinished, and amber again for a week marked off but never written up — the report is owed work, not a bonus), reports from two lines to a full dated write-up so the clamp and its “Read more” are both on screen from the first frame, and three sister groups in the rail including one nobody teaches yet. At the bottom, the pre-epoch tail: a session somebody went back and wrote up (an ordinary entry that never turns amber, and the one place the neutral marker survives) and two nobody has touched — quiet placeholder lines that still open the record editor, because the epoch gates what is owed, not what can be edited.",
      },
      {
        slug: "camp",
        label: "Camp — in person, daily",
        description:
          "The two things the club cannot show: back-to-back weekday dates across a weekend, and a venue — so this is the scenario with site notes (shared by every product at that site) and with no voice room anywhere, every Join inert. It owes exactly one day — yesterday's register — because every other day of the run has both its register and its report in; that single gap is what puts an attention badge on an in-person dashboard card.",
      },
    ],
  },
  {
    surface: "parent-club",
    title: "Family product page — parent",
    description:
      "The page a parent opens from My SOG for one enrollment: participant-scoped (“Minecraft Builders Club, for Aino”, with her group on the line beneath — or “for you” on a seat the parent holds themselves), single column, mobile-first, and read-only end to end. The masthead answers when and where — schedule, Join or address — a notice under it says so when the enrollment has a billing problem, the notes card answers what is always true here, and the same session feed the gedu workspace runs on answers what happened, with this participant's attendance mark on it and nothing about anybody else's. Everything a family may not see is structurally absent rather than filtered: no staff notes, no roster, no peer groups, no material link.",
    chrome: "dashboard",
    scenarios: [
      {
        slug: "active-club",
        label: "Club — remote, session in progress",
        description:
          "The kitchen sink, and the only scenario with a live room: a session running right now, so the Join is lit and the top entry says “Live” instead of “Next session” — the same word the cards on both dashboards use, because it is the same state. It is also the cancelled membership — the muted “won't renew” line under the masthead naming the last covered session, which is not an alarm because nothing is wrong; the gamer's copy of this same scenario shows no such line at all. Six more sessions collapsed above the divider (the upward reveal, judged against a screenful), four months of history behind it with month dividers and the scroll-fed past, and the past states worth seeing together — every report rendered in full, never clamped (the reports are what a family comes for; the gedu's Read-more belongs to their work queue): the long recap at the head, an ordinary present week, a week this child was not at, a second long write-up deeper down showing what back-to-back full reports cost the scroll, a week written up with nobody marked, and a week with nothing on it at all.",
      },
      {
        slug: "in-person-club",
        label: "Club — in person",
        description:
          "The venue shape: an address under the schedule, a second standing note about the building, and no Join anywhere — not a locked one, because there is no room behind it and a locked button promises an unlock. It also carries the failing card, so the destructive notice has the top of a page with no Join competing for it.",
      },
      {
        slug: "camp",
        label: "Camp — finished",
        description:
          "A run that is over. A UTC-pinned date range beside the weekday times, no future block and therefore no divider at all, and — although the camp was remote — no Join either, since there is no next session for a room to open for. The feed is history end to end.",
      },
      {
        slug: "locked-join",
        label: "Club — Join locked",
        description:
          "The page in its resting state: the Join locked and naming its open time, which is what a family sees all week outside the voice window — and the one Join state no other scenario can show, since active-club's room is deliberately live. Dressed as a brand-new club, so the empty past comes along incidentally; the button flips open on the shared clock when the window arrives, no reload.",
      },
      {
        slug: "my-own-club",
        label: "Club — the parent's own seat",
        description:
          "The same page about a seat the reader holds themselves, which a for-parents product makes reachable. Three things move into the second person and none of them can be seen on a page about somebody's child: the masthead reads “for you” over the reader's own identicon rather than naming them at themselves, the failing-card notice asks them to keep their own place, and the leave-waitlist dialog (on the dashboard, not here) names nobody. The Join is the fourth difference and the quiet one — it is lit, and on the live page it is a plain link straight to the room, because a parent joining their own club has nobody to switch into. Everything else is the ordinary page: reports render in full, an attendance mark renders (a gedu marks a parent present exactly as they mark a child), and the group note is the group's.",
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
