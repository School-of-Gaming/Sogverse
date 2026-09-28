import { effectiveStatus } from "@/lib/products/effective-status";
import { dateTimeInstant } from "@/lib/schedule-occurrence";
import type { ProductType, Product } from "@/types";

// Registration state for the parent-facing browse + purchased cards.
//
// Centralising the decision tree here keeps the card rendering branchless
// beyond a single `kind` switch — same shape as `formatProductSchedule`
// and `formatProductPrice`.
//
// Muni clubs are intentionally not modelled here — they don't get a
// browse landing page and their purchased-card surface doesn't need a
// status pill (the verb badge "Registered" already conveys "you're in",
// and registration goes through the city's own flow).
//
// Decision tree (top-down, first match wins):
//   ended         ← effectiveStatus = completed
//   closed_pre    ← registration_opens_at > now
//   running_late  ← effectiveStatus = running AND either
//                     product_type = camp (locks at local midnight on
//                     start_date — a cohort starts together), or
//                     product_type = event AND now >= the event's end
//                     instant (start_date + its slot's start_time +
//                     duration_minutes, read in product.timezone). An event
//                     with no slot falls back to the camp rule.
//   full_waitlist ← seat_count IS NOT NULL
//                   AND participations_count >= seat_count
//                   AND waitlist_enabled
//   full_closed   ← seat_count IS NOT NULL
//                   AND participations_count >= seat_count
//                   AND NOT waitlist_enabled
//   open          ← otherwise
//
// How these states reach a card — there are two routes, and telling them
// apart matters more than it looks.
//
// A browse row is filtered on its way to becoming a card: the query asks only
// for visible products, and the service then drops anything whose derived
// status has already reached completed. Every state above except `ended`
// survives that and can arrive in a response.
//
// `ended` cannot, and it does not need to: the detail page calls this same
// function, and every product stays readable by direct link forever (owner
// decision, Sep 2026) — so a parent following a link to last spring's club
// opens its page and this branch renders, which is the whole reason that
// decision was made. The branch is ordinary live code on an ordinary surface.
//
// It also arrives on a browse card, which is the subtler route: this function
// is called with `useNow()`, which ticks every 30 seconds, so a shop tab left
// open past a product's local midnight re-derives `ended` in place, under a
// card already on screen, with no refetch anywhere in between. So: never
// reason "the list filters that out, therefore a card cannot see it" about
// anything derived from `useNow()`. The filter runs once, at fetch. This
// function runs every tick, for as long as the tab is open.
//
// The same tick moves other states under a reader mid-visit: closed_pre → open
// when registration opens, open → running_late when a camp reaches its start
// date or an event's session ends, running_late → ended at the local midnight
// after. None of those is something the reader asked for, which makes them
// changes on data's own schedule — free to repaint a card, but not to resize
// one (see the layout rules in `src/CLAUDE.md`).
//
// One known exception, left deliberately: the ended branch swaps the footer's
// whole row for a single line, so a card does shrink at midnight and the grid
// below it moves. It costs one card, once in its life, on a tab that happens
// to be open at the time — small enough not to be worth restructuring the
// footer for, but a real exception rather than an oversight.

/**
 * Capacity as the signup panel's seat bar needs it.
 *
 * Carried by *every* state a capped product can still be signed up on —
 * pre-open and open alike — because the panel renders the bar in both. That
 * uniformity is a layout requirement, not a
 * convenience: the panel variant is dispatched off `useNow()`, which ticks
 * every 30 seconds, so a bar that only existed on `open` would mount up to
 * half a minute *after* the countdown hit zero, above a live CTA the parent
 * already has their cursor on. Giving pre-open the same trio settles the bar's
 * box before the button can ever go live.
 *
 * The numbers are honest at every stage: seat counts are live regardless of
 * registration state (an admin can place comp enrolments before the doors
 * open), so a pre-open bar reads real availability — usually every seat free,
 * reduced by whatever has already been placed — and doubles as a plain
 * statement that seats will be limited when it opens.
 */
export interface SeatAvailability {
  /**
   * Total capacity. `null` when there is no cap — the card and panel layers
   * then render no capacity hint at all.
   */
  seatCount: number | null;
  /**
   * Seats still open, floored at zero. `null` exactly when `seatCount` is.
   * Live: derived from the product's real active-participation count.
   */
  seatsLeft: number | null;
  waitlistEnabled: boolean;
}

export type RegistrationState =
  | { kind: "ended" }
  | ({ kind: "closed_pre"; opensAt: string } & SeatAvailability)
  | {
      kind: "running_late";
      /**
       * Which flavour of "too late" this is, so the CTA label can say it.
       * `underway` — a camp mid-term (or an event we can't time, see the
       * zero-slot fallback). `over` — an event whose session has finished.
       */
      phase: "underway" | "over";
    }
  // The two full kinds carry the cap alone, with no `seatsLeft` for a negative
  // to hide in: a soft cap can be exceeded, and "full" is the whole fact. The
  // panel hands the bar a flat 0.
  | {
      kind: "full_waitlist";
      seatCount: number;
    }
  | {
      kind: "full_closed";
      seatCount: number;
    }
  | ({ kind: "open" } & SeatAvailability);

// Lifecycle-relevant columns. Keeping the input narrow lets callers
// project a smaller select without losing type-safety.
//
// `schedule_slots` is the one joined field: an event's registration closes at
// the moment its session ends, which needs the slot's clock time. Structural,
// not the full row type, so any select carrying at least these two columns
// (the browse and detail queries both do) satisfies it.
export type RegistrationStateInputs = Pick<
  Product,
  | "start_date"
  | "end_date"
  | "timezone"
  | "registration_opens_at"
  | "seat_count"
  | "waitlist_enabled"
  | "product_type"
> & {
  schedule_slots: readonly {
    start_time: string;
    duration_minutes: number;
  }[];
};

export interface DeriveRegistrationStateArgs {
  product: RegistrationStateInputs;
  now: Date;
  /** Pass 0 until participations is wired up. */
  participationsCount: number;
}

const LATE_JOIN_LOCKED: Record<ProductType, boolean> = {
  consumer_club: false,
  municipality_club: false,
  camp: true,
  event: true,
};

/**
 * The absolute instant an event finishes: its single schedule slot's
 * wall-clock start on `start_date`, read in the product's own timezone, plus
 * the slot duration. Returns `null` when the row carries no slot (the admin
 * form requires one, so this is a type-level possibility rather than a real
 * one), and the caller then falls back to the date-only camp rule.
 *
 * An event is single-date with exactly one slot, so `schedule_slots[0]` is
 * the whole schedule; the weekday on it is derived from `start_date` and adds
 * nothing here.
 */
function eventEndInstant(product: RegistrationStateInputs): Date | null {
  if (product.schedule_slots.length === 0) return null;
  const slot = product.schedule_slots[0];
  const start = dateTimeInstant(
    product.start_date,
    slot.start_time,
    product.timezone,
  );
  return new Date(start.getTime() + slot.duration_minutes * 60_000);
}

/**
 * The seat trio, read straight off the row and the live participation count.
 * One helper rather than two copies because the signup-able states have to
 * agree exactly — the panel's whole no-shift guarantee rests on the bar being
 * identical either side of the pre-open → open swap.
 */
function seatAvailability(
  product: RegistrationStateInputs,
  participationsCount: number,
): SeatAvailability {
  return {
    seatCount: product.seat_count,
    seatsLeft:
      product.seat_count !== null
        ? Math.max(0, product.seat_count - participationsCount)
        : null,
    waitlistEnabled: product.waitlist_enabled,
  };
}

export function deriveRegistrationState({
  product,
  now,
  participationsCount,
}: DeriveRegistrationStateArgs): RegistrationState {
  const status = effectiveStatus(product, now);

  if (status === "completed") return { kind: "ended" };

  if (new Date(product.registration_opens_at).getTime() > now.getTime()) {
    return {
      kind: "closed_pre",
      opensAt: product.registration_opens_at,
      ...seatAvailability(product, participationsCount),
    };
  }

  // Camps and events lock late joins; clubs allow drop-in late joins (the
  // "running_late" state never fires for them). The two locked types differ
  // in *when*: a camp is a cohort that starts together, so it locks at local
  // midnight on start_date the moment effectiveStatus flips to running. An
  // event is one session — someone can still usefully sign up an hour before
  // the doors open, so it stays joinable (normal seat/waitlist rules apply)
  // right up to the instant the session ends. The server-side
  // `create_participation` gate accepts pending OR running, so it already
  // permits everything this window allows.
  if (status === "running" && LATE_JOIN_LOCKED[product.product_type]) {
    const endsAt =
      product.product_type === "event" ? eventEndInstant(product) : null;
    if (endsAt === null) return { kind: "running_late", phase: "underway" };
    if (now.getTime() >= endsAt.getTime()) {
      return { kind: "running_late", phase: "over" };
    }
    // Event still to finish — fall through to the seat-cap / open logic so a
    // full event shows full_waitlist / full_closed rather than "open".
  }

  if (product.seat_count !== null && participationsCount >= product.seat_count) {
    return product.waitlist_enabled
      ? { kind: "full_waitlist", seatCount: product.seat_count }
      : { kind: "full_closed", seatCount: product.seat_count };
  }

  return { kind: "open", ...seatAvailability(product, participationsCount) };
}

// How a state's browse-card CTA behaves:
//   "primary"  → the card opens: a worded "View" hint with a chevron, and the
//                whole card surface links to the detail page, where there is
//                something to do (sign up, join a waitlist).
//   "disabled" → a dead end — full with no waitlist, a camp already underway,
//                or an event already over. The label still appears, in the same
//                place at the same size but muted and without a chevron,
//                because it is the only thing saying *why* the card is inert.
//                The detail page has nothing actionable, so the parent is not
//                sent on a round-trip.
//   null       → no label at all (ended); the whole footer row gives way to a
//                one-line note.
//
// Lives next to the state it switches on so the CTA component
// (`useRegistrationCta`) and anything deciding "does this state have a detail
// page worth linking to" stay in agreement from one source. It's a pure
// function (no i18n), so server code can call it too — `useRegistrationCta`
// only wraps it to resolve the label.
export type RegistrationCtaKind = "primary" | "disabled" | null;

export function registrationCtaKind(
  state: RegistrationState,
): RegistrationCtaKind {
  switch (state.kind) {
    case "open":
    case "closed_pre":
    case "full_waitlist":
      return "primary";
    case "full_closed":
    case "running_late":
      return "disabled";
    case "ended":
      return null;
  }
}
