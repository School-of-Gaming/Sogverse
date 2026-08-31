import { formatInTimeZone } from "date-fns-tz";
import type {
  BrowseRowLocation,
  ProductTopic,
  ProductType,
} from "@/types";
import { SUPPORTED_CURRENCIES } from "@/lib/constants/currency";
import { firstChargeAnchor } from "@/lib/stripe/first-charge-anchor";
import type { ProductDetailRow } from "@/services/products";
import type { ParticipationCounts } from "@/services/participations";
import type { RegistrationState } from "./derive-registration-state";
import type { ProductTag } from "./product-tag";
import type {
  AuthState,
  MyParticipationState,
  SignupParticipantChoice,
} from "./signup-panel-view";
import type {
  ConfirmationNoticeKind,
  SignupOutcome,
} from "./purchase-confirmation-view";

// Synthetic fixtures, one per curated preview scenario. The mental model: each
// scenario IS a mocked product. The /admin/ui-components card and the
// /preview/products/[scenario] full page both just render that one mock — same
// product row, same registration state, same auth state — so the card and the
// page it links to can never disagree.
//
// The set is curated down to the *visually distinct* surfaces worth eyeballing,
// grouped by product type:
//   • Consumer club — a subscription club, open; a free one (billing is a
//     per-product choice on every type now); one full behind a waitlist; one
//     capped club still short of its signup threshold; and two that have not
//     started yet, which is where deferred billing is looked at — one close
//     enough that the first charge lands on the start date, one far enough out
//     that Stripe's ceiling pulls the charge earlier than the club begins.
//   • Municipality club — the full seat-fill range, plus the pre-launch
//     countdown across the three auth states a parent can be in, one of them
//     with places already comped away.
//   • Camp — one not yet started, one full with no waitlist, one underway, and
//     one finished. Camps and events lock late joins at different moments (a
//     camp from local midnight on its start date, an event only once its
//     session has finished) and say so differently — "Already started" vs.
//     "Already over" — so both labels need somewhere to be looked at.
//   • Event — a free product, plus the same event once it's over.
//
// Three of them exist for the **audience** axis rather than for a registration
// state, because a product sold to parents is otherwise unreachable: no such
// product exists yet. They
// are the only place the three signup-panel cases can be looked at, so between
// them they carry all three — a parents-only panel with the reader
// preselected, a mixed one with children and the reader in the same picker,
// and a parents-only one where the reader already holds the seat (the
// already-enrolled lockout, which the panel gets for free on a self seat and
// which nothing else would prove). Every other scenario is gamers-only and is
// the regression case.
//
// The two capped non-muni scenarios are the pair worth reading together: a
// browse card carries no seat information outside the municipality seat bar, so
// full-with-waitlist and full-without are told apart on the card by exactly one
// thing — whether it opens.
//
// Between them the scenarios cover every registration state the card can
// render, including the one a parent can only reach by leaving a tab open past
// midnight. A state with no scenario here is a state nobody can look at.
//
// Most scenarios author their registration `state` directly so they stay
// deterministic regardless of the wall clock. The countdown scenarios are the
// exception: they carry an `opensInMs` offset and resolve a live `closed_pre`
// state at build time, so the clock actually ticks for an admin reviewing them.
// Their seat numbers are still authored — only the instant moves — so the bar
// they draw is as reproducible as everything else here.

export type PreviewScenario =
  | "consumer-club"
  | "consumer-club-free"
  | "consumer-club-full-waitlist"
  | "consumer-club-threshold"
  | "consumer-club-future-start"
  | "consumer-club-future-start-clamped"
  | "consumer-club-parents-only"
  | "muni-empty"
  | "muni-filling"
  | "muni-almost-full"
  | "muni-full-closed"
  | "muni-full-waitlist"
  | "muni-uncapped"
  | "muni-opens-10s"
  | "muni-opens-signed-out"
  | "muni-opens-no-gamers"
  | "muni-opens-with-gamers"
  | "camp-open"
  | "camp-full-closed"
  | "camp-running"
  | "camp-ended"
  | "free-event"
  | "event-parents-only"
  | "event-both-audiences"
  | "event-over";

// Which signed-in shape the panel renders against. `signed-out` → the auth
// overlay (sign in / create account); `no-gamers` → a `ready` customer whose
// gamer picker is empty (just the "Add a child" row); `with-gamers` → a `ready`
// customer with the two demo children.
type AuthKind = "signed-in-with-gamers" | "signed-in-no-gamers" | "signed-out";

/**
 * Who the product is sold to — the fixture's spelling of the two `products`
 * booleans, plus the age range they gate. Defaults to `gamers`, which is what
 * every product was before audiences existed and what every scenario that is
 * not *about* audience should stay.
 */
type ScenarioAudience = "gamers" | "parents" | "both";

interface ScenarioBase {
  /** Short label shown above the demo card (the subsection carries the type). */
  label: string;
  productType: ProductType;
  billingMode: "paid" | "free" | "external_contract";
  /** Capacity on the product row. Drives the municipality seat-fill bar. */
  seatCount: number | null;
  waitlistEnabled: boolean;
  /**
   * EUR list price in cents — monthly for the subscription club, upfront for
   * camps/events. `null` for free / externally-funded products (no price rows).
   */
  priceCentsEur: number | null;
  auth: AuthKind;
  /**
   * Defaults to `gamers`. `parents` also strips the age range (the schema ties
   * ages to the gamer audience by CHECK, and "18+" was rejected as saying
   * something else entirely), which is why a parents-only card renders no age
   * line and drops out of every age band.
   */
  audience?: ScenarioAudience;
  /**
   * The reader's own already-on-this-product state, for the one scenario that
   * exists to show the lockout on a self seat. Only meaningful when the
   * audience includes parents.
   */
  selfSignupState?: MyParticipationState;
  /**
   * Online municipality club: `is_remote` with a municipality-typed location
   * (no school site), so the card/detail render the "online — {city}" location
   * line instead of the in-person school. Only meaningful for muni clubs.
   */
  online?: boolean;
  /**
   * A club that has not started yet: its `start_date` is this many days ahead of
   * *today* (product-local), rather than the static January calendar the other
   * fixtures share, and it runs open-ended.
   *
   * Live-derived like the countdown scenarios' `opensAt`, and for the same
   * reason: the whole point of these two is the deferred-billing line, which
   * only exists while the start date is genuinely in the future. A hardcoded
   * date would stop being one, and the line would silently vanish from the
   * previews.
   */
  startsInDays?: number;
}

// A scenario either authors a static registration state, or is a live
// pre-launch countdown (resolved to `closed_pre` against `Date.now()` so the
// clock ticks).
type ScenarioConfig =
  | (ScenarioBase & { state: RegistrationState })
  | (ScenarioBase & {
      opensInMs: number;
      /**
       * Seats already gone before the doors open — an admin's comp enrolments,
       * the only way a pre-open product has anyone on it. Defaults to none.
       * The pre-open seat bar reads live availability like every other state,
       * so this is what makes it show something other than a full track.
       */
      compSeats?: number;
    });

// Real UUIDs so the gamer picker's identicons hash to distinct, stable avatars
// — placeholder ids like "g1" render degenerate identicons that misrepresent
// the real UI. The middle child (Väinö) already participates in the product;
// `buildAuthState` stamps the matching signup state (waitlisted vs. seat) so
// the picker shows the disabled "already signed up / waitlisted" row alongside
// two still-selectable siblings.
const DEMO_GAMERS = [
  { id: "6aaac864-5ea7-451b-8d02-93f9ae6f25b5", name: "Oona", age: 10 },
  { id: "decdae83-3f51-4209-bf1a-254e88f1c32f", name: "Väinö", age: 11 },
  { id: "d010872c-7034-401b-9c2d-5dfa675f60d8", name: "Aino", age: 8 },
] as const;

// The reader — the parent whose picker this is, and on a for-parents product a
// selectable row in it. A real UUID for the same reason the children have one:
// their row carries an identicon, and it is the one face on the panel that is
// the reader's own. No age: ages belong to the gamer audience and never to
// adults.
const DEMO_PARENT = {
  id: "5b0f2b6d-6ad9-4a02-8f75-3a3d2a4a7c11",
  name: "Marja",
} as const;

const NINETY_MIN_MS = 90 * 60 * 1000;
const TEN_SEC_MS = 10 * 1000;

const SCENARIOS: Record<PreviewScenario, ScenarioConfig> = {
  "consumer-club": {
    // The plain paid club, and the scenario the 30-day money-back guarantee is
    // read on: the panel keys that copy on the `subscription` pricing option,
    // which is what a paid consumer club — and nothing else — resolves to. Its
    // free, municipality, camp and event siblings deliberately show no
    // guarantee, so this is also the pair to compare against.
    label: "€45/mo — open",
    productType: "consumer_club",
    billingMode: "paid",
    seatCount: null,
    waitlistEnabled: false,
    priceCentsEur: 4500,
    auth: "signed-in-with-gamers",
    state: {
      kind: "open",
      seatCount: null,
      seatsLeft: null,
      waitlistEnabled: false,
    },
  },
  "consumer-club-free": {
    // A free consumer club, which is a thing now: billing is a per-product
    // choice on every type, not a property of the type. Two things to eyeball
    // together — the card carries the same "Free" chip an event does, and it is
    // capped (a no-charge signup is hard-capped in the database, so a free
    // product is the one that most wants a number) without saying so anywhere
    // on the card. The seat bar appears on the detail page, not here.
    label: "Free — capped, open",
    productType: "consumer_club",
    billingMode: "free",
    seatCount: 12,
    waitlistEnabled: true,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    state: { kind: "open", seatCount: 12, seatsLeft: 4, waitlistEnabled: true },
  },
  "consumer-club-full-waitlist": {
    // The accepted inherited behaviour, and the reason it is worth looking at:
    // this card is indistinguishable from an open one. It keeps the ordinary
    // "View" CTA, the chevron and the whole-card link, because the detail page
    // behind it has a real action (join the waitlist) — the parent finds out it
    // is full there, from a panel that says so properly. Compare it with
    // `camp-full-closed` below, which is full with nothing to do and is the
    // only inert one of the pair.
    label: "Full with waitlist — still opens, generic CTA",
    productType: "consumer_club",
    billingMode: "paid",
    seatCount: 12,
    waitlistEnabled: true,
    priceCentsEur: 4500,
    auth: "signed-in-with-gamers",
    state: { kind: "full_waitlist", seatCount: 12 },
  },
  "consumer-club-threshold": {
    // The state easiest to forget exists. A club that needs a
    // minimum intake before it can run sits here until the signups arrive, and
    // it is deliberately undramatic: threshold handling is deferred, so there
    // is no meter and no countdown, and the card is an ordinary openable one
    // carrying an ordinary "View". That sameness *is* the thing to eyeball —
    // it is why the state is easy to forget exists.
    //
    // Capped, and that is the one thing about it that is *not* undramatic: a
    // minimum intake and a maximum are independent numbers, and the panel now
    // draws the seat bar here exactly as it does on an open product. This is
    // the only scenario that shows the bar on a threshold-pending product, so
    // uncapping it would take that surface off the style guide entirely. The
    // two counts agree on purpose — 2 of 6 signed up, 18 of 20 seats left.
    label: "€45/mo — awaiting threshold",
    productType: "consumer_club",
    billingMode: "paid",
    seatCount: 20,
    waitlistEnabled: false,
    priceCentsEur: 4500,
    auth: "signed-in-with-gamers",
    state: {
      kind: "pending_thr",
      threshold: 6,
      count: 2,
      seatCount: 20,
      seatsLeft: 18,
      waitlistEnabled: false,
    },
  },
  "consumer-club-future-start": {
    // A club listed for signup before it opens its doors — the ordinary
    // deferred-billing case, and the one where the two dates on the page agree:
    // the term line says the club starts on a date, and the pricing panel says
    // that is also the day the first payment leaves. Three weeks out, so the
    // anchor is inside Stripe's ceiling and is the start date itself.
    label: "€45/mo — starts in 3 weeks, first payment deferred",
    productType: "consumer_club",
    billingMode: "paid",
    seatCount: 12,
    waitlistEnabled: true,
    priceCentsEur: 4500,
    auth: "signed-in-with-gamers",
    startsInDays: 21,
    state: { kind: "open", seatCount: 12, seatsLeft: 9, waitlistEnabled: true },
  },
  "consumer-club-future-start-clamped": {
    // The same club bought too early, and the reason this is a second scenario
    // rather than a variant of the one above: Stripe refuses an anchor more than
    // about a month out, so a parent buying eight weeks ahead is charged roughly
    // four weeks from today — *before* the club starts. The page therefore
    // states a first-payment date that deliberately disagrees with the start
    // date printed above it, and that disagreement is the thing to sign off on.
    // Showing the start date there instead would be a lie about money.
    label: "€45/mo — starts in 8 weeks, first payment clamped",
    productType: "consumer_club",
    billingMode: "paid",
    seatCount: 12,
    waitlistEnabled: true,
    priceCentsEur: 4500,
    auth: "signed-in-with-gamers",
    startsInDays: 56,
    state: { kind: "open", seatCount: 12, seatsLeft: 12, waitlistEnabled: true },
  },
  "consumer-club-parents-only": {
    // The lockout on a self seat, and the one scenario that proves it comes for
    // free. The reader already holds their place, so their row is the disabled
    // "Already enrolled" one — and since it is the *only* row on a parents-only
    // product, the CTA falls all the way through to "You're all set" with no
    // add-a-child affordance underneath to soften it. A subscription club
    // rather than an event on purpose: this is also where the paid monthly path
    // for a parent's own seat is visible, price and cadence on the button.
    label: "For parents only — €39/mo, seat already held",
    productType: "consumer_club",
    billingMode: "paid",
    seatCount: 20,
    waitlistEnabled: false,
    priceCentsEur: 3900,
    auth: "signed-in-with-gamers",
    audience: "parents",
    selfSignupState: "active",
    state: { kind: "open", seatCount: 20, seatsLeft: 6, waitlistEnabled: false },
  },
  "muni-empty": {
    label: "15 / 15 seats",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    state: { kind: "open", seatCount: 15, seatsLeft: 15, waitlistEnabled: false },
  },
  "muni-filling": {
    // The single 6/15 card doubles as the online-muni demo: it's remote and
    // references a municipality node, so it exercises the "online — {city}"
    // location line. The other muni cards stay in-person (a school site).
    label: "Online · 6 / 15 seats",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    online: true,
    state: { kind: "open", seatCount: 15, seatsLeft: 6, waitlistEnabled: false },
  },
  "muni-almost-full": {
    label: "2 / 15 seats",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    state: { kind: "open", seatCount: 15, seatsLeft: 2, waitlistEnabled: false },
  },
  "muni-full-closed": {
    label: "0 / 15 — no waitlist",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    state: { kind: "full_closed", seatCount: 15 },
  },
  "muni-full-waitlist": {
    label: "0 / 15 — waitlist",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: true,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    state: { kind: "full_waitlist", seatCount: 15 },
  },
  "muni-uncapped": {
    // A municipality club whose contracted number of places has not been
    // entered yet. The seat bar renders nothing at all without a cap, which
    // leaves the CTA the only thing in the footer row — the one case the
    // footer's `ml-auto` exists for, and before this branch the one case where
    // the CTA slid to the left-hand edge. Every other muni scenario pins a seat
    // count, which is exactly why nobody saw it.
    label: "No cap set — footer left empty",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: null,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    state: {
      kind: "open",
      seatCount: null,
      seatsLeft: null,
      waitlistEnabled: false,
    },
  },
  "muni-opens-10s": {
    // The scenario the no-shift rule is judged against: park the cursor on the
    // CTA and watch it through zero. The button flips label on the 1-second
    // clock; the panel's *state* only catches up on the 30-second one, and
    // between those two moments — and across the swap — nothing may move. Every
    // seat free, which is the ordinary case for a drop.
    label: "Opens in 10 seconds (live)",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    opensInMs: TEN_SEC_MS,
  },
  "muni-opens-signed-out": {
    label: "Opens in 90 min — signed out",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-out",
    opensInMs: NINETY_MIN_MS,
  },
  "muni-opens-no-gamers": {
    label: "Opens in 90 min — signed in, no gamers",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-no-gamers",
    opensInMs: NINETY_MIN_MS,
  },
  "muni-opens-with-gamers": {
    // The only pre-open scenario whose seat bar is not full: two places have
    // been comped before the doors opened, so it reads 13 / 15 while the clock
    // is still running. That the bar can be honestly short of full pre-open is
    // the reason it is drawn at all rather than faked as "all seats free".
    label: "Opens in 90 min — 2 comped, signed in with gamers",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    opensInMs: NINETY_MIN_MS,
    compSeats: 2,
  },
  "camp-open": {
    label: "Not started yet — €250",
    productType: "camp",
    billingMode: "paid",
    seatCount: null,
    waitlistEnabled: false,
    priceCentsEur: 25000,
    auth: "signed-in-with-gamers",
    state: {
      kind: "open",
      seatCount: null,
      seatsLeft: null,
      waitlistEnabled: false,
    },
  },
  "camp-full-closed": {
    // Paid, capped, no waitlist — the shape a real camp takes, and the one card
    // state that is a dead end for a reason a parent could still act on
    // tomorrow. The card is inert: muted label, no chevron, no link, because
    // the detail page has nothing to offer. It says nothing about seats either;
    // the muted "Full" label is the whole explanation a card owes.
    label: "Full, no waitlist — inert",
    productType: "camp",
    billingMode: "paid",
    seatCount: 20,
    waitlistEnabled: false,
    priceCentsEur: 25000,
    auth: "signed-in-with-gamers",
    state: { kind: "full_closed", seatCount: 20 },
  },
  "camp-running": {
    // Camps lock late joins once running — the card states "Already started"
    // as muted text, carries no chevron, and has no detail page to open.
    label: "Already started",
    productType: "camp",
    billingMode: "paid",
    seatCount: null,
    waitlistEnabled: false,
    priceCentsEur: 25000,
    auth: "signed-in-with-gamers",
    state: { kind: "running_late", phase: "underway" },
  },
  "camp-ended": {
    // A parent cannot reach this from a fetch — the browse query and the
    // service filter between them exclude every status that produces `ended` —
    // but the card derives from a clock that ticks every 30 seconds, so a tab
    // left open past a product's local midnight lands here in place. It is the
    // only state that arrives that way, the only one with a desaturated card and
    // a note instead of a footer row, and therefore the only one with nowhere
    // else to be looked at. It is also the documented layout exception: that
    // footer swap changes the card's height, so this is where you go to see the
    // shrink that happens at midnight.
    label: "Finished — desaturated, inert",
    productType: "camp",
    billingMode: "paid",
    seatCount: null,
    waitlistEnabled: false,
    priceCentsEur: 25000,
    auth: "signed-in-with-gamers",
    state: { kind: "ended" },
  },
  "free-event": {
    label: "Free — open",
    productType: "event",
    billingMode: "free",
    seatCount: null,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    state: {
      kind: "open",
      seatCount: null,
      seatsLeft: null,
      waitlistEnabled: false,
    },
  },
  "event-parents-only": {
    // The parents' evening — the shape this whole capability was built for, and
    // the plainest of the three audience cases. No child list at all: the
    // reader is the single row and is preselected, so "who is this seat for"
    // is answered before paying rather than skipped. The add-a-child row is
    // withdrawn (a child could not be signed up here), the picker heading
    // states the seat instead of asking a question with one answer, and the
    // card and overview card carry the audience label in place of an age line.
    label: "For parents only — free, reader preselected",
    productType: "event",
    billingMode: "free",
    seatCount: 40,
    waitlistEnabled: true,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    audience: "parents",
    state: { kind: "open", seatCount: 40, seatsLeft: 11, waitlistEnabled: true },
  },
  "event-both-audiences": {
    // The mixed case: a family event both a parent and their children can be
    // signed up for. Children first, the reader beneath them — the order their
    // dashboard uses — and one selection out of the four, because a seat per
    // checkout is the rule everywhere (the multi-select idea is deferred). The
    // middle child is already on it, so the child lockout and a selectable
    // parent row sit in the same picker; the add-a-child row is back, because
    // this product does have a gamer audience. (That the reader's row is not
    // counted against the child cap is pinned by the unit tests at the cap's
    // exact borderline — a seven-child fixture here would bury the audience
    // picker this scenario exists to show.)
    label: "For families — children plus the reader",
    productType: "event",
    billingMode: "paid",
    seatCount: null,
    waitlistEnabled: false,
    priceCentsEur: 1500,
    auth: "signed-in-with-gamers",
    audience: "both",
    state: {
      kind: "open",
      seatCount: null,
      seatsLeft: null,
      waitlistEnabled: false,
    },
  },
  "event-over": {
    // The same evening event after it finished. An event stays joinable right
    // through its session, so the only late-join lock it ever shows is this
    // one — hence a different label from the camp above ("Already over", not
    // "Already started"). Same dead-end treatment: a muted label, no chevron,
    // no detail page behind it. It stays on the browse grid until its end_date
    // rolls over, which is the window this card represents — after that it
    // becomes `camp-ended`'s state, which looks quite different.
    label: "Already over",
    productType: "event",
    billingMode: "free",
    // No cap, like its open sibling: `scenarioFilledSeats` only derives a
    // filled count from open/full states, so a capped fixture in a late-join
    // state would draw an empty seat bar on a finished event.
    seatCount: null,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    state: { kind: "running_late", phase: "over" },
  },
};

// Render order for the UI Components grid. Explicit (rather than `Object.keys`)
// so the sequence is intentional, and grouped contiguously by product type so
// the subsections come out in this order.
const SCENARIO_ORDER: PreviewScenario[] = [
  "consumer-club",
  "consumer-club-free",
  "consumer-club-full-waitlist",
  "consumer-club-threshold",
  "consumer-club-future-start",
  "consumer-club-future-start-clamped",
  "consumer-club-parents-only",
  "muni-empty",
  "muni-filling",
  "muni-almost-full",
  "muni-full-closed",
  "muni-full-waitlist",
  "muni-uncapped",
  "muni-opens-10s",
  "muni-opens-signed-out",
  "muni-opens-no-gamers",
  "muni-opens-with-gamers",
  "camp-open",
  "camp-full-closed",
  "camp-running",
  "camp-ended",
  "free-event",
  "event-parents-only",
  "event-both-audiences",
  "event-over",
];

// Subsection heading per product type (the type context the short labels omit).
const GROUP_LABELS: Record<ProductType, string> = {
  consumer_club: "Consumer club",
  municipality_club: "Municipality club",
  camp: "Camp",
  event: "Event",
};

// The list (with subsection grouping) the UI Components page iterates over.
export const PREVIEW_SCENARIOS: {
  slug: PreviewScenario;
  label: string;
  group: string;
}[] = SCENARIO_ORDER.map((slug) => ({
  slug,
  label: SCENARIOS[slug].label,
  group: GROUP_LABELS[SCENARIOS[slug].productType],
}));

export function isPreviewScenario(s: string): s is PreviewScenario {
  return s in SCENARIOS;
}

/**
 * Scene-only demo art, in `public/preview-art/`.
 *
 * A fixture row has no storage object behind it, so a grid built from rows with
 * no picture would put the fallback banner on every card and leave the media
 * block unjudged. These four flat SVGs stand in for product photos, and are
 * picked for spread rather than prettiness: `park` is near-white at its
 * bottom-left, which is precisely where the tag chip sits, and `racetrack` is a
 * night scene, so the two ends of the contrast problem are on the same page.
 *
 * They reach a card through the row's own `image_path` and ordinary image
 * resolution — the resolver passes a root-relative path straight through — so
 * no surface needs an image seam to show them.
 *
 * **The directory is world-readable, whatever the scenes' own gating says.**
 * The proxy admin-gates `/preview/*` pages, but its matcher deliberately
 * excludes image extensions, so anything under `public/` is served to anyone
 * who guesses the URL — which is why this is `preview-art/` and not
 * `preview/`, a name that would read as covered by that gate. Nothing that
 * even resembles family data — a real photograph, a name, a screenshot of a
 * real page — may ever be put in this directory.
 */
const DEMO_ART = {
  terrain: "/preview-art/card-terrain.svg",
  racetrack: "/preview-art/card-racetrack.svg",
  park: "/preview-art/card-park.svg",
  interior: "/preview-art/card-interior.svg",
} as const;

/**
 * **The tag a scenario's product carries.** Folded onto the row by
 * `buildBaseProduct`, exactly as the real `products.tag` column arrives — so
 * every surface reads it the one way, and a card and the page it opens cannot
 * say different things about the same club.
 *
 * A scenario absent from the map is untagged, which is most of them and is the
 * ordinary state.
 */
const SCENARIO_TAG: Partial<Record<PreviewScenario, ProductTag>> = {
  "consumer-club": "beginner",
  "consumer-club-free": "neuroinclusive",
  "consumer-club-full-waitlist": "advanced",
  "consumer-club-threshold": "beginner",
  "camp-open": "beginner",
  "event-both-audiences": "neuroinclusive",
};

/**
 * The demo art a scenario's card and detail hero both paint, folded onto the
 * row as its `image_path` for the same reason the tag is. Absent means the
 * scenario has no picture and renders the wordmark banner — exactly one card on
 * the tagged-catalog grid is deliberately in that state.
 */
const SCENARIO_ART: Partial<Record<PreviewScenario, string>> = {
  "consumer-club": DEMO_ART.terrain,
  "consumer-club-free": DEMO_ART.park,
  "consumer-club-full-waitlist": DEMO_ART.interior,
  "consumer-club-parents-only": DEMO_ART.interior,
  "camp-open": DEMO_ART.terrain,
  "camp-full-closed": DEMO_ART.racetrack,
  "event-both-audiences": DEMO_ART.park,
  "event-parents-only": DEMO_ART.racetrack,
  "free-event": DEMO_ART.racetrack,
};

/**
 * The topic a scenario's row carries, where the default below is not the point.
 *
 * Two things are only visible at page scale, so each gets one scenario:
 *
 * - **A topic with no card.** Most topics bring an "About {name}" card to the
 *   detail page; a few name subject matter rather than one piece of software
 *   and bring none, and the page then renders no card *and no wrapper for one*.
 *   The difference between those two is a gap in the reading column. This goes
 *   on a municipality club rather than the flagship consumer one — the card is
 *   the thing most worth looking at on the default scenario, and this map
 *   exists to make its absence reviewable somewhere, not to take it away from
 *   where it reads best.
 * - **A card whose copy is new.** A card renders on the default scenario
 *   already, but always the same one, so freshly written topic prose has
 *   nowhere to be read at full width against the sections above and below it.
 *   The camp carries whichever topic that currently is.
 */
const SCENARIO_TOPIC: Partial<Record<PreviewScenario, ProductTopic>> = {
  "muni-uncapped": "programming",
  "camp-open": "rocket_league",
};

export interface ShopCatalogEntry {
  slug: PreviewScenario;
  /**
   * The product's name, replacing both the per-type copy and the ` · label`
   * suffix every other scene's cards carry.
   *
   * Required here, unlike everywhere else, and that is the point: the suffix
   * makes a title unrepresentative — ten cards reading "Minecraft Redstone Club
   * · €45/mo — open" say nothing about how a real catalogue's titles sit in a
   * full-width row. So the showcase grid carries names a shop would actually
   * ship (varied, so the grid does not read as one club ten times), and the
   * scenario descriptor moves down into `descriptionOverride` where it is still
   * legible but is no longer pretending to be a product name.
   */
  nameOverride: string;
  /**
   * The card's short description, and where each card says which fixture it is
   * — the job the name suffix used to do, moved somewhere it does not distort
   * what is being judged.
   */
  descriptionOverride: string;
}

/**
 * The **storefront grid**: the one page the shop scene renders, carrying every
 * combination the browse card has to survive, reusing the existing scenarios
 * rather than authoring a parallel set of products.
 *
 * Municipality clubs are absent because the storefront does not surface them —
 * they are discovered location-first from `/schools` — so a shop scene carrying
 * one would be showing a card the real page cannot produce.
 *
 * There were once two narrower grids beside this one, isolating the audience
 * question. They were a strict subset of this list and composed their Events
 * section out of the identical three cards, so they compared nothing this grid
 * does not already put side by side.
 *
 * **Every row inherits whatever tag and picture its scenario carries**, because
 * tags and art are row fields and this list is scenario slugs. That is
 * deliberate rather than tolerated: a real storefront is a mixed grid, so an
 * ordinary storefront means an ordinary mix, not "no tags anywhere".
 *
 * What it puts side by side, and why each earns its place:
 *
 * - a tagged card of each tag, so the three labels — and their three icons —
 *   are comparable at a glance;
 * - the free capped club tagged, because a Free chip in the footer and a tag
 *   chip on the image are two chips on one card;
 * - the family event tagged, which is the fullest card the design produces: a
 *   tag bottom-left and an audience badge top-right, both over a bright photo;
 * - the parents-only club and event untagged, so the top-right slot is seen
 *   carrying a badge with no tag opposite it;
 * - the threshold club un-imaged **but tagged**, which is the nastiest
 *   combination on the page: a chip over the muted fallback banner rather than
 *   over a photograph, and the one most likely to read badly;
 * - the full-with-waitlist club under a deliberately long Finnish name, because
 *   a grid of comfortable titles proves nothing about the title row;
 * - and the two dead ends — a full camp and, in the footer, the inert CTA —
 *   because nothing below the rule changed and that has to stay visibly true.
 *
 * Names are what a real catalogue would carry and are varied on purpose; each
 * card's *description* is what says which fixture it is. The tag and the art
 * are **not** listed here — they are row fields, folded on from `SCENARIO_TAG`
 * / `SCENARIO_ART` above, so the detail page a card opens shows the same tag
 * and the same picture without either surface owning the list.
 */
export const SHOP_SCENE_TAGGED_CATALOG: readonly ShopCatalogEntry[] = [
  {
    slug: "consumer-club",
    nameOverride: "Minecraft Redstone Club",
    descriptionOverride:
      "Paid monthly club, open, ages 8–12 in the top-right slot. The ordinary card, and the one everything else is a deviation from.",
  },
  {
    slug: "consumer-club-free",
    nameOverride: "Roblox Studio Beginners",
    descriptionOverride:
      "Free and capped: the Free chip in the footer and a tag chip on the image, on the brightest photo of the set — the bottom-left corner this art is lightest in is exactly where the tag sits.",
  },
  {
    slug: "consumer-club-full-waitlist",
    nameOverride: "Minecraft-rakentelukerho edistyneille konepajamestareille",
    descriptionOverride:
      "Full with a waitlist, so it still opens and still says View — indistinguishable from an open card, which is inherited behaviour. The name is deliberately long: this is the card the full-width title row is judged on.",
  },
  {
    slug: "consumer-club-threshold",
    nameOverride: "Fortnite Creative Workshop",
    descriptionOverride:
      "The only card with no image, on purpose: it is here to judge the SOG fallback banner in the grid rather than on its own — and, since it is tagged, to show a chip over that muted ground instead of over a photograph. Awaiting its signup threshold, which the card says nothing about.",
  },
  {
    slug: "consumer-club-parents-only",
    nameOverride: "Vanhempien peli-ilta · Parents' Gaming Evening",
    descriptionOverride:
      "For parents only: the top-right slot carries the audience badge, no age range anywhere, and nothing opposite it bottom-left.",
  },
  {
    slug: "camp-open",
    nameOverride: "Minecraft Builders Camp",
    descriptionOverride:
      "An upfront-priced camp, open. Two schedule lines instead of one, which is what the meta list has to absorb without pushing the description around.",
  },
  {
    slug: "camp-full-closed",
    nameOverride: "Roblox Obby Bootcamp",
    descriptionOverride:
      "Full with no waitlist: the inert card. Muted label, no chevron, no link — and the darkest photo of the set, which is the other end of the chip-legibility question.",
  },
  {
    slug: "event-both-audiences",
    nameOverride: "Pokémon GO -perheretki · Family Outing",
    descriptionOverride:
      "The fullest card the design makes: a tag bottom-left and the families badge top-right, both over the bright art. Its age range yields the slot to the badge, exactly as the live card decides it.",
  },
  {
    slug: "event-parents-only",
    nameOverride: "Vanhempainilta · Parents' Evening",
    descriptionOverride:
      "For parents only, and free. No tag, no age, one badge on a dark photo — the sparsest the media block ever gets.",
  },
  {
    slug: "free-event",
    nameOverride: "Friday Night Mario Kart",
    descriptionOverride:
      "Free and untagged: the age range has the top-right slot to itself, and the Free chip sits in the footer beneath it.",
  },
];

/**
 * The shop browse scene's scenario slugs and guard.
 *
 * They live here — not in the scene component — because the scene file is
 * `"use client"` and the scene router narrows the slug on the server: a guard
 * exported from a client module is a client reference there, and calling it
 * during server render is a runtime error. Same arrangement as every other
 * surface (the guard lives with the fixtures, the component imports it).
 *
 * One scenario, because there is one storefront grid: `SHOP_SCENE_TAGGED_CATALOG`
 * carries every card shape at once, so nothing a second grid could show is
 * missing from it.
 */
export const SHOP_BROWSE_SCENARIOS = ["default"] as const;

export type ShopBrowseScenario = (typeof SHOP_BROWSE_SCENARIOS)[number];

export function isShopBrowseScenario(s: string): s is ShopBrowseScenario {
  return (SHOP_BROWSE_SCENARIOS as readonly string[]).includes(s);
}

/**
 * A scenario's product row, with its name suffixed by the scenario's own label.
 *
 * The per-type copy above gives every consumer club the same name, which is
 * fine on a detail page (one product per page) and unreadable on a grid of
 * them. The suffix is what makes each card identifiable as the fixture behind
 * it — the browse scene's whole job is comparing cards side by side, and cards
 * you cannot tell apart defeat it.
 *
 * `copy` overrides both halves of that, and the tagged-catalog grid passes it
 * for every card: a suffixed name is unrepresentative of a real catalogue, so
 * those cards carry names a shop would ship and move the scenario descriptor
 * into the description instead — which the card renders anyway. Overriding belongs
 * here rather than in the scene because this is the only place a fixture's copy
 * is decided; a scene rewriting names after the fact would be a second naming
 * rule, free to disagree with this one.
 */
export function buildBrowseFixture(
  slug: PreviewScenario,
  now: Date,
  copy?: { name: string; description: string },
): ProductDetailRow {
  const { product } = buildScenarioFixture(slug);
  // The browse card DERIVES its registration state from the row's calendar
  // (unlike the detail scene, which is handed the authored state directly), so
  // the fixture's static January anchor must be re-based onto the live clock —
  // otherwise every card reads as months-ended, whatever its scenario claims.
  // Whole days, floored, so "now" keeps the same position inside the authored
  // week that STATIC_REF had, and the date-only fields stay exact under
  // UTC-pinned arithmetic. Countdown scenarios already anchor their
  // registration instant on the live clock and are left alone.
  const config = SCENARIOS[slug];
  const dayShift = Math.floor((now.getTime() - STATIC_REF_MS) / DAY_MS);
  return {
    ...product,
    start_date: shiftDateOnly(product.start_date, dayShift),
    end_date: shiftDateOnly(product.end_date, dayShift),
    registration_opens_at:
      "opensInMs" in config
        ? product.registration_opens_at
        : new Date(
            new Date(product.registration_opens_at).getTime() +
              dayShift * DAY_MS,
          ).toISOString(),
    product_translations: product.product_translations.map((tr) => ({
      ...tr,
      name: copy?.name ?? `${tr.name} · ${SCENARIOS[slug].label}`,
      short_description: copy?.description ?? tr.short_description,
    })),
  };
}

/** UTC-pinned day arithmetic on a bare `yyyy-mm-dd` — exact, no DST to hit. */
function addDaysToDateOnly(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The same walk, tolerating the nullable end date on the row. */
function shiftDateOnly(date: string | null, days: number): string | null {
  return date === null ? null : addDaysToDateOnly(date, days);
}

/**
 * The counts row the browse scene feeds beside each fixture card. The card
 * derives fullness from live counts, so a full-waitlist scenario handed no
 * count would derive "open" and mislabel itself — the same authored state the
 * detail panel draws is translated into the numbers that make the card agree.
 */
export function buildBrowseCounts(
  slug: PreviewScenario,
  productId: string,
): ParticipationCounts {
  const config = SCENARIOS[slug];
  const isFullWaitlist =
    !("opensInMs" in config) && config.state.kind === "full_waitlist";
  return {
    productId,
    activeCount: scenarioFilledSeats(slug),
    // A short queue, not zero: a full-waitlist card whose queue is empty is a
    // state the shop can produce but not an interesting one to preview.
    waitlistCount: isFullWaitlist ? 3 : 0,
    myGamerStates: {},
  };
}

// The three states the paid confirmation page lands in when there is no order
// row to show yet (or ever). Not product scenarios — no fixture builds them,
// `PurchaseConfirmationNotice` takes only which state it is — but their slugs
// live here so the scene registry (data-only, no React) and the scene renderer
// read one list. All three follow a payment that *succeeded*, which is why
// none of them may read as an error.
export const CONFIRMATION_NOTICE_SCENARIOS = [
  {
    slug: "paid-finalizing",
    kind: "finalizing",
    label: "Finalizing — webhook not landed yet",
  },
  {
    slug: "paid-timed-out",
    kind: "timedOut",
    label: "Timed out — stopped waiting",
  },
  {
    slug: "paid-duplicate",
    kind: "duplicatePayment",
    label: "Duplicate payment — seat already taken",
  },
] as const satisfies readonly {
  slug: string;
  kind: ConfirmationNoticeKind;
  label: string;
}[];

/**
 * The three registration states whose panel is inert — the kinds that render
 * the closed panel instead of a signup body, and so put no CTA on the page at
 * all. Every other kind ends in a button. Mirrors the switch in
 * `SignupPanelView`, and is the whole of what decides the list below.
 */
const NON_COMMITTING_STATE_KINDS: readonly RegistrationState["kind"][] = [
  "ended",
  "running_late",
  "full_closed",
];

/**
 * The product scenarios the **confirmation** scene previews.
 *
 * Derived from the panel rather than curated by hand, because this is not a
 * taste question: the product scene wires its CTA to the matching confirmation
 * scenario unconditionally, so a scenario whose panel can commit and which this
 * list omits is not a missing demo — it is a dead link, and the route 404s on
 * the scenario the registry never declared.
 *
 * That includes the pre-open countdowns, whose CTA is dormant rather than
 * absent: it goes live in place the moment the clock runs out, on the same page
 * somebody left open.
 *
 * The pages this yields are not all visually distinct — the summary says who
 * the seat is for and what it cost, and nothing about how full the product is,
 * so several of them render the same page. That redundancy is what a reachable
 * surface costs, and it is the right way round: an extra link nobody needs to
 * open beats a live button landing on a 404.
 */
export const CONFIRMATION_PRODUCT_SCENARIOS: readonly PreviewScenario[] =
  SCENARIO_ORDER.filter((slug) => {
    const config = SCENARIOS[slug];
    // A countdown resolves to `closed_pre` at build time, which is a signup
    // body like any other — it is the clock that is closed, not the panel.
    if ("opensInMs" in config) return true;
    return !NON_COMMITTING_STATE_KINDS.includes(config.state.kind);
  });

export type ConfirmationNoticeScenario =
  (typeof CONFIRMATION_NOTICE_SCENARIOS)[number]["slug"];

/** The notice entry for a slug, or null when the slug is a product scenario. */
export function findConfirmationNotice(
  s: string,
): (typeof CONFIRMATION_NOTICE_SCENARIOS)[number] | null {
  return CONFIRMATION_NOTICE_SCENARIOS.find((n) => n.slug === s) ?? null;
}

// CTA kind for a scenario without needing the wall clock — a countdown is
// always `closed_pre`, which is a primary "View" CTA.
// There is deliberately no "does this scenario's card link anywhere" helper.
// The demo grid hands every scenario its href and lets the card decide from the
// state, which is the same split the shop makes — a second copy of that rule
// here could only ever drift from the first.
//
// Note also that a card being inert says nothing about whether a preview page
// exists: every scenario is previewable full-page from the UI Previews list,
// because the product scene maps the whole of `PREVIEW_SCENARIOS`. The closed
// states especially, since no card links to them and that page is the only way
// to look at one. (The confirmation scene takes the derived subset above
// instead — a closed product has no CTA, so no purchase to confirm.)

// Seats already taken on a scenario — the count the municipality seat-fill bar
// reads. Derived from the authored state so the bar and the card's state stay
// in lock-step. A countdown scenario reads whatever comp enrolments it declares
// (nobody can *register* before registration opens, but an admin can place
// someone), which is the same number its pre-open detail panel draws.
export function scenarioFilledSeats(slug: PreviewScenario): number {
  const c = SCENARIOS[slug];
  if (c.seatCount === null) return 0;
  if ("opensInMs" in c) return Math.min(c.compSeats ?? 0, c.seatCount);
  switch (c.state.kind) {
    // The three states that carry live capacity read it the same way. A
    // threshold-pending product has a cap like any other — a minimum intake and
    // a maximum are independent numbers — so it cannot be lumped in with the
    // states below that have no seats to report.
    case "open":
    case "pending_thr":
    case "closed_pre":
      return c.state.seatsLeft === null ? 0 : c.seatCount - c.state.seatsLeft;
    case "full_waitlist":
    case "full_closed":
      return c.seatCount;
    default:
      return 0;
  }
}

// Static reference instant for the dated fixtures (start_date, end_date,
// timestamps on the row). The countdown scenarios anchor their `opensAt` on
// `Date.now()` instead — see `buildScenarioFixture`.
const STATIC_REF_MS = Date.UTC(2026, 0, 5, 12, 0, 0); // Mon 5 Jan 2026, 12:00 UTC
const DAY_MS = 24 * 60 * 60 * 1000;

// Every product is authored in Helsinki, as the admin form fixes them to be.
// Named because the future-start scenarios resolve "today" in it as well as
// stamping it on the row, and the two must be the same zone.
const FIXTURE_TIMEZONE = "Europe/Helsinki";

interface BuildFixtureResult {
  product: ProductDetailRow;
  state: RegistrationState;
  authState: AuthState;
}

export function buildScenarioFixture(slug: PreviewScenario): BuildFixtureResult {
  const config = SCENARIOS[slug];
  const detailHref = `/preview/products/${slug}`;

  let state: RegistrationState;
  let registrationOpensAt: string;
  if ("opensInMs" in config) {
    // Live countdown: opens a fixed offset ahead of *now* so the clock ticks.
    // The row's drop instant and the panel state share the same timestamp.
    const opensAt = new Date(Date.now() + config.opensInMs).toISOString();
    // Pre-open carries the same seat trio every other signup-able state does,
    // so the panel's bar is already on screen while the clock runs — the whole
    // point being that nothing mounts above the CTA when the state swaps.
    state = {
      kind: "closed_pre",
      opensAt,
      seatCount: config.seatCount,
      seatsLeft:
        config.seatCount === null
          ? null
          : Math.max(0, config.seatCount - (config.compSeats ?? 0)),
      waitlistEnabled: config.waitlistEnabled,
    };
    registrationOpensAt = opensAt;
  } else {
    state = config.state;
    // Already open (or ended) in every static scenario — the drop is in the past.
    registrationOpensAt = new Date(STATIC_REF_MS - DAY_MS).toISOString();
  }

  const product = buildBaseProduct(slug, config, registrationOpensAt, state);
  const authState = buildAuthState(config, detailHref, state);
  return { product, state, authState };
}

/** The fixture's audience, with the gamers-only default applied. */
function audienceOf(config: ScenarioConfig): ScenarioAudience {
  return config.audience ?? "gamers";
}

export interface ConfirmationFixtureResult {
  product: ProductDetailRow;
  participantName: string;
  /** True on a scenario whose seat is the reader's own — the self-worded page. */
  isSelfSeat: boolean;
  outcome: SignupOutcome;
  /** Mock waitlist position for the waitlist outcome; null otherwise. */
  waitlistPosition: number | null;
  /**
   * The deferred first charge, as the live page would resolve it: an ISO
   * instant on a subscription club bought before it starts, null everywhere
   * else.
   *
   * On the real page this stands for two reads the fixture has no database for
   * — the €0 subscription payment row that marks the purchase as deferred, and
   * the subscription's `current_period_end`, which for such a purchase *is* the
   * anchor. Computed here from the same helper the checkout route sets the
   * anchor with, so the confirmation preview states the date the signup panel
   * promised.
   */
  firstChargeAt: string | null;
}

// Post-signup summary fixture for /preview/confirmation/<scenario>. Reuses the
// scenario's product and derives the outcome from its registration state — a
// full-waitlist signup lands on the waitlist variant, everything else on the
// enrolled one. The detail preview's CTA navigates here, so the preview walks
// the real detail → CTA → summary flow.
export function buildConfirmationFixture(
  slug: PreviewScenario,
): ConfirmationFixtureResult {
  const { product, state } = buildScenarioFixture(slug);
  const isWaitlist = state.kind === "full_waitlist";
  // A parents-only scenario can only have been bought for the reader, so its
  // summary is the self-worded one — which is the only place that copy is
  // reviewable. A mixed product's panel preselects the first child, so it lands
  // on the ordinary third-person page like everything else.
  const isSelfSeat = audienceOf(SCENARIOS[slug]) === "parents";
  // Only a paid consumer club is bought as a subscription, and only a
  // subscription carries a billing anchor — a camp starting in three weeks was
  // paid for in full at checkout and has no first charge still to come.
  const config = SCENARIOS[slug];
  const anchor =
    config.productType === "consumer_club" && config.billingMode === "paid"
      ? firstChargeAnchor(product.start_date, product.timezone, new Date())
      : null;
  return {
    product,
    // A literal placeholder rather than a demo child's name — it makes obvious
    // that this is a mock. The self page names the reader instead, because the
    // whole point of that variant is reading a page about yourself.
    participantName: isSelfSeat ? DEMO_PARENT.name : "GamerName",
    isSelfSeat,
    outcome: isWaitlist ? "waitlisted" : "enrolled",
    // A sample rank so the "You're #N" row shows in the preview.
    waitlistPosition: isWaitlist ? 3 : null,
    // A waitlist join has bought nothing, so it has no first charge either.
    firstChargeAt: isWaitlist ? null : (anchor?.toISOString() ?? null),
  };
}

// The picker's rows, assembled the way the route adapter assembles them: the
// children (only where the product has a gamer audience), then the reader's own
// row beneath them (only where it has a parent audience). `gamerCount` is the
// account's children regardless of which rows were offered — the number the
// add-a-child cap is measured against, and the reason the reader's row cannot
// hide that affordance one child early.
function buildAuthState(
  config: ScenarioConfig,
  detailHref: string,
  state: RegistrationState,
): AuthState {
  const audience = audienceOf(config);
  if (config.auth === "signed-out") {
    const redirect = `?redirect=${encodeURIComponent(detailHref)}`;
    return {
      kind: "unauthenticated",
      signInHref: `/login${redirect}`,
      createAccountHref: `/register${redirect}`,
    };
  }

  const hasGamers = config.auth === "signed-in-with-gamers";
  // The middle child already participates — on a full product with a waitlist
  // they hold a waitlist spot; otherwise they hold a seat.
  const childState: MyParticipationState =
    state.kind === "full_waitlist" ? "waitlisted" : "active";
  const gamerRows: SignupParticipantChoice[] =
    hasGamers && audience !== "parents"
      ? [
          { ...DEMO_GAMERS[0] },
          { ...DEMO_GAMERS[1], signupState: childState },
          { ...DEMO_GAMERS[2] },
        ]
      : [];
  const selfRow: SignupParticipantChoice[] =
    audience === "gamers"
      ? []
      : [
          {
            ...DEMO_PARENT,
            age: null,
            signupState: config.selfSignupState ?? null,
            isSelf: true,
          },
        ];

  return {
    kind: "ready",
    participants: [...gamerRows, ...selfRow],
    gamerCount: hasGamers ? DEMO_GAMERS.length : 0,
  };
}

// ---------- Base product shape ----------

function buildBaseProduct(
  slug: PreviewScenario,
  config: ScenarioConfig,
  registrationOpensAt: string,
  state: RegistrationState,
): ProductDetailRow {
  const { productType, billingMode } = config;
  const audience = audienceOf(config);
  const copy = copyFor(productType, audience);
  const schedule = pickSchedule(productType);
  const scheduleSlots = schedule.scheduleSlots;
  // A not-yet-started club replaces the static calendar with a live one, walked
  // forward from today's *product-local* date with UTC-pinned day arithmetic
  // (never by stepping an instant, which repeats or skips a date across a DST
  // transition). It runs open-ended, which a consumer club may.
  const futureStart =
    config.startsInDays === undefined
      ? null
      : addDaysToDateOnly(
          formatInTimeZone(new Date(), FIXTURE_TIMEZONE, "yyyy-MM-dd"),
          config.startsInDays,
        );
  const startDate = futureStart ?? schedule.startDate;
  const endDate = futureStart === null ? schedule.endDate : null;
  // Online muni clubs are remote and reference a municipality node (not a
  // school site); everything else keeps its per-type location + remoteness.
  const isOnlineMuni = config.online === true;
  const isRemote = isOnlineMuni ? true : copy.isRemote;
  const locationFixture = isOnlineMuni
    ? MOCK_LOC_ESPOO_MUNI
    : pickLocationFixture(productType);

  // Metadata the database would otherwise populate (created_at/updated_at,
  // created_by) gets static demo values so the fixture is a complete,
  // honestly-typed ProductDetailRow — no casts.
  const refTimestamp = new Date(STATIC_REF_MS - 30 * DAY_MS).toISOString();

  const id = `mock-${slug}`;

  return {
    id,
    product_type: productType,
    billing_mode: billingMode,
    status: pickStatus(state, config),
    is_visible: true,
    is_remote: isRemote,
    // Audience, and the age range the schema ties to it: `min_age`/`max_age`
    // are required with a gamer audience and must be null without one, so a
    // parents-only fixture that kept 8–12 would be a row the database would
    // refuse. This is also what makes such a product drop out of every age
    // band on the browse grid.
    for_gamers: audience !== "parents",
    for_parents: audience !== "gamers",
    min_age: audience === "parents" ? null : 8,
    max_age: audience === "parents" ? null : 12,
    // A real row field, like every other product column: the card, the detail
    // hero and the tag note all read `product.tag`, so nothing keyed by
    // scenario can leave two surfaces disagreeing about one club.
    tag: SCENARIO_TAG[slug] ?? null,
    // Unlocked on every product scenario here: the region lock is a property of
    // *who is looking*, not of the club, so it has nothing to say about the
    // registration states this set enumerates. The candidate blocks for it are
    // their own scenarios on the same scene (`region-*`), which render one of
    // these products and supply the lock and the viewer's country alongside it.
    region_lock_country: null,
    spoken_language_code: "fi",
    location_id: locationFixture?.id ?? null,
    locations: locationFixture,
    // There is deliberately no lesson-material field here. It moved off
    // `products` into `product_staff_details` precisely so that no family-facing
    // read path can reach it, and this fixture stands for one of those.
    // Taken from the authored state rather than pinned null, so a
    // threshold-pending scenario's row agrees with the state sitting beside it
    // — the card reads the state, but a row claiming no threshold while the
    // state names one is a fixture that contradicts itself, and the next
    // person to build a surface off `product` inherits the contradiction.
    signup_threshold: state.kind === "pending_thr" ? state.threshold : null,
    start_date: startDate,
    end_date: endDate,
    timezone: FIXTURE_TIMEZONE,
    seat_count: config.seatCount,
    waitlist_enabled: config.waitlistEnabled,
    registration_opens_at: registrationOpensAt,
    // Demo art under `public/preview-art/`, reached through ordinary image
    // resolution: `productImageUrl` passes a root-relative path through
    // untouched, so a fixture needs no image seam anywhere. Null renders the
    // wordmark banner.
    image_path: SCENARIO_ART[slug] ?? null,
    // Null on every scenario: a preview scene's art is a file in `public/`, not
    // an object in the catalogue bucket, and nothing family-facing resolves the
    // link anyway — `image_path` is what these surfaces paint.
    image_id: null,
    // Fixed product_topic enum; the label is resolved via PRODUCT_TOPICS, so
    // the value just needs to be valid. Events get Fortnite, the rest
    // Minecraft Java — unless the scenario names one, which is how the
    // info-less (no About card) shape gets a page to be seen on.
    topic:
      SCENARIO_TOPIC[slug] ??
      (productType === "event" ? "fortnite" : "minecraft_java"),
    primary_gedu_fee_cents: null,
    assistant_gedu_fee_cents: null,
    municipality_fee_cents: null,
    created_at: refTimestamp,
    updated_at: refTimestamp,
    created_by: "mock-admin",
    product_translations: [
      {
        locale: "en",
        name: copy.name,
        short_description: copy.description,
        long_description: copy.long ?? null,
        product_id: id,
        created_at: refTimestamp,
        updated_at: refTimestamp,
      },
    ],
    product_prices:
      config.priceCentsEur === null
        ? []
        : buildPriceRows(id, config.priceCentsEur),
    schedule_slots: scheduleSlots,
    // Empty on every product scenario, exactly as the region lock is null on
    // every one: what a product requires is a property of that product, and
    // there is no ordinary club whose page should be showing consent boxes.
    // The required-consents scenario supplies its own set to the panel rather
    // than writing one onto a fixture, because the panel is the only thing on
    // this page that reads them.
    product_required_consents: [],
    // Empty for the same reason, and supplied the same way: the consent-asks
    // scenario hands its own set to the panel rather than writing one onto a
    // fixture, because the panel is the only thing on this page that reads it.
    product_marketing_consents: [],
    holidays: pickHolidays(productType),
  };
}

// ---------- Per-type narrative copy ----------

interface TypeCopy {
  name: string;
  description: string;
  /**
   * Optional markdown long description — exercises the detail-page card.
   *
   * **The club's blurb is the one written to full length, and it is the only
   * place any preview shows an authored field carrying links.** Marketing copy
   * on our own shop pages is the link-bearing variant of the renderer — an
   * admin writing for strangers browsing a shop, rather than a gedu writing to
   * one family — so a preview that never renders a link cannot show whether
   * that variant reads correctly in place. It is deliberately long as well: a
   * page of marketing copy judged against two short paragraphs is judged
   * against nothing, and the blurb's real job is to sit under the hero and
   * beside the signup rail without either losing the reader.
   *
   * Leaving most types without one is equally deliberate — a product carrying
   * no blurb renders no card at all, and that is the common case.
   */
  long?: string;
  isRemote: boolean;
}

const COPY: Record<ProductType, TypeCopy> = {
  consumer_club: {
    name: "Minecraft Redstone Club",
    description:
      "We build little machines together — doors that open on command, item sorters, hidden traps, and small automated factories. A playful, hands-on way for kids to learn how circuits actually think, one contraption at a time.",
    long: [
      "# What happens each week",
      "Every session starts with a quick show-and-tell of what the group built last time, then we take on one new contraption together — a hidden door, an item sorter, an automatic farm. The gedu builds alongside the group rather than in front of it, so nobody spends the hour watching somebody else's screen.",
      'Gedus keep the pace gentle and hands-on. There\'s no winning or losing, just steady building and plenty of "wait, how did you do that?" moments. A session that ends with one working machine and four half-finished ones is a good session.',
      "# Who it is for",
      "Ages 8 to 12, and the only thing we assume is that your child can move around a Minecraft world without help. Redstone itself we start from nothing — the first three weeks are levers, torches and repeaters, and by the end of the term the same children are reading each other's circuits and spotting where the signal dies.",
      "# What your child takes away",
      "Logical thinking, a bit of patience, and the quiet confidence that comes from making a machine work. Friendships, too — the same gamers come back week after week, and by spring they are planning builds between sessions without anybody organising it.",
      "# Before the first session",
      "There is nothing to install beyond the game itself — the server, the mods and the world are all ours. If you do not have a copy yet, the **Java edition** is the one you want, and it is the cheaper of the two:",
      [
        "- [Minecraft: Java & Bedrock Edition](https://www.minecraft.net/en-us/store/minecraft-deluxe-collection-pc), from Mojang's own store",
        "- a headset with a microphone — a phone's earbuds are fine",
        "- your child's Minecraft username, which we ask for at checkout",
      ].join("\n"),
      "Once you have signed up we mail you the server address and a short note about how the voice room works. How we look after your child's data while they are with us is set out in our [privacy policy](/privacy), and there is nothing else to do before the first evening.",
    ].join("\n\n"),
    isRemote: true,
  },
  municipality_club: {
    name: "Espoon Minecraft-kerho",
    description:
      "Funded by the City of Espoo and free for Espoo residents. We meet weekly at Tapiolan koulu after school — a relaxed group where kids build together, team up on projects, and make a few friends along the way.",
    isRemote: false,
  },
  camp: {
    name: "Minecraft Builders Camp",
    description:
      "Three mornings a week across two weeks of school holiday. Each session the group takes on a fresh build, and by the end everyone shares one big world they can explore, show off, and keep playing in together.",
    long: [
      "# How it runs",
      "We meet Monday, Wednesday, and Friday mornings across two weeks — enough rhythm to build something real without taking over the whole holiday.",
      "Each morning starts by looking at what the group made last time, then we take on one new build together — a redstone gadget, a themed house, a small adventure map.",
      "# Who it's for",
      "Curious kids who love games and want to try making one. No prior experience needed — just a laptop and an account.",
    ].join("\n\n"),
    isRemote: false,
  },
  event: {
    name: "Friday Night Mario Kart Tournament",
    description:
      "Bring your A-game for a bracket-style Mario Kart night — fast races, friendly rivalries, and snacks on us. One evening only, so come hang out with the crew and see who takes the crown.",
    isRemote: false,
  },
};

/**
 * Narrative copy for the audience scenarios.
 *
 * The blurb is the longest thing anyone reads on these pages, and the
 * gamers-only copy above is written about somebody's child throughout ("what
 * your child takes away"). Rendering that under a "For parents" label would be
 * a fixture contradicting the page it sits on — the one thing a preview must
 * never do, since the whole point is judging the page as a parent meets it.
 * Only the (type, audience) pairs the scenarios actually use are written out;
 * anything else falls back to the gamers-only copy.
 */
const AUDIENCE_COPY: Record<
  Exclude<ScenarioAudience, "gamers">,
  Partial<Record<ProductType, TypeCopy>>
> = {
  parents: {
    consumer_club: {
      name: "Vanhempien peli-ilta · Parents' Gaming Evening",
      description:
        "A monthly evening for the grown-ups: we play the games your kids play, badly and cheerfully, and talk about what they actually do online. No prior experience, no judgement, and nobody is grading you.",
      long: [
        "# What happens each month",
        "We pick one game the children in our clubs are playing, and spend the evening in it together. A Gedu hosts, explains what you are looking at, and answers the questions that are hard to ask a twelve-year-old.",
        "# What you take away",
        "A feel for the thing your child disappears into after school, some vocabulary to talk about it, and an evening with other parents who are working the same thing out.",
      ].join("\n\n"),
      isRemote: true,
    },
    event: {
      name: "Vanhempainilta · Parents' Evening",
      description:
        "One evening for the adults in our clubs: what the children are building, how the groups run, and what safe play online actually looks like. Coffee, a short talk, and plenty of time for questions.",
      isRemote: false,
    },
  },
  both: {
    event: {
      name: "Pokémon GO -perheretki · Family Outing",
      description:
        "A Saturday walk around the city for families — grown-ups and children on the same team, one seat each. Bring a charged phone and comfortable shoes; we supply the route, the snacks and someone who knows where the rare ones are.",
      isRemote: false,
    },
  },
};

function copyFor(
  productType: ProductType,
  audience: ScenarioAudience,
): TypeCopy {
  if (audience === "gamers") return COPY[productType];
  return AUDIENCE_COPY[audience][productType] ?? COPY[productType];
}

// ---------- Schedule ----------

function pickSchedule(productType: ProductType): {
  startDate: string;
  endDate: string;
  scheduleSlots: { weekday: number; start_time: string; duration_minutes: number }[];
} {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return {
        startDate: "2026-01-13",
        endDate: "2026-05-30",
        // Tuesday afternoons (weekday 1 = Tue under 0=Mon convention).
        scheduleSlots: [
          { weekday: 1, start_time: "15:30:00", duration_minutes: 90 },
        ],
      };
    case "camp":
      // Real camps run a few days a week, not all five — Mon/Wed/Fri mornings
      // across two weeks (weekday 0 = Mon). Start/end bracket the first and last
      // session so the date range and the calendar agree.
      return {
        startDate: "2026-02-23", // Mon
        endDate: "2026-03-06", // Fri, two weeks later
        scheduleSlots: [0, 2, 4].map((weekday) => ({
          weekday,
          start_time: "10:00:00",
          duration_minutes: 240,
        })),
      };
    case "event":
      return {
        startDate: "2026-01-30",
        endDate: "2026-01-30",
        scheduleSlots: [
          { weekday: 4, start_time: "18:00:00", duration_minutes: 120 },
        ],
      };
  }
}

// Static location fixtures. The detail-body and card both render
// "site, parent" for in-person and "muni" for online municipality_clubs;
// the IDs are placeholders that mock detail rows reference via
// location_id. None of these UUIDs ever hit the DB — the preview route
// renders straight from this fixture.
const MOCK_LOC_TAPIOLA: BrowseRowLocation = {
  id: "mock-loc-tapiolan-koulu",
  name: "Tapiolan koulu",
  name_i18n: null,
  type: "site",
  parent: {
    id: "mock-loc-espoo",
    name: "Espoo",
    name_i18n: { sv: "Esbo" },
    type: "municipality",
  },
};
// Municipality node (not a school site) — the location an online muni club
// references. `formatProductLocation` renders its city name as the "online —
// {city}" line when the product is remote.
const MOCK_LOC_ESPOO_MUNI: BrowseRowLocation = {
  id: "mock-loc-espoo-muni",
  name: "Espoo",
  name_i18n: { sv: "Esbo" },
  type: "municipality",
  parent: {
    id: "mock-loc-uusimaa",
    name: "Uusimaa",
    name_i18n: { sv: "Nyland" },
    type: "region",
  },
};
const MOCK_LOC_SOG_HQ: BrowseRowLocation = {
  id: "mock-loc-sog-hq",
  name: "Sogverse HQ",
  name_i18n: null,
  type: "site",
  parent: {
    id: "mock-loc-helsinki",
    name: "Helsinki",
    name_i18n: { sv: "Helsingfors" },
    type: "municipality",
  },
};

function pickLocationFixture(
  productType: ProductType,
): BrowseRowLocation | null {
  switch (productType) {
    case "consumer_club":
      // Online consumer club, no muni — no joined location.
      return null;
    case "municipality_club":
      return MOCK_LOC_TAPIOLA;
    case "camp":
    case "event":
      return MOCK_LOC_SOG_HQ;
  }
}

function pickHolidays(
  productType: ProductType,
): { date: string; reason: string }[] {
  if (productType !== "consumer_club" && productType !== "municipality_club") {
    return [];
  }
  return [
    { date: "2026-02-24", reason: "Talviloma · winter break" },
    { date: "2026-04-07", reason: "Pääsiäisloma · Easter" },
    { date: "2026-05-01", reason: "Vappu" },
  ];
}

// ---------- Price rows ----------

// The admin create form requires a row per supported currency (validated
// in product-build.ts), so the mock has to as well — otherwise the
// panel falls into the "Pricing isn't available in {currency}" branch
// when the viewer's currency picker is on GBP or USD.
//
// Static FX-ish rates are fine here: this is a visual reference fixture,
// not a checkout.
const FX_FROM_EUR = { eur: 1, gbp: 0.86, usd: 1.08 } as const;

function buildPriceRows(
  productId: string,
  priceCentsEur: number,
): ProductDetailRow["product_prices"] {
  const refTimestamp = new Date(STATIC_REF_MS - 30 * DAY_MS).toISOString();
  return SUPPORTED_CURRENCIES.map((currency) => ({
    product_id: productId,
    currency,
    price_cents: Math.round(priceCentsEur * FX_FROM_EUR[currency]),
    created_at: refTimestamp,
    updated_at: refTimestamp,
  }));
}

// ---------- Product status ----------

// `status` is the stored DB status. The panel renders from the authored
// `state`, not this, but matching the shape a real row would carry avoids
// confusing future readers: open/ended products stay 'running', full or
// pre-launch ones sit in 'pending'. A club whose start date has not arrived is
// 'pending' whatever its registration state says — signups are open, the club
// is not.
function pickStatus(
  state: RegistrationState,
  config: ScenarioConfig,
): "pending" | "running" {
  if (config.startsInDays !== undefined) return "pending";
  switch (state.kind) {
    case "full_closed":
    case "full_waitlist":
    case "pending_thr":
    case "closed_pre":
      return "pending";
    case "open":
    case "running_late":
    case "ended":
      return "running";
  }
}
