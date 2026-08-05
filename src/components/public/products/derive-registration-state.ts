import { effectiveStatus } from "@/lib/products/effective-status";
import { dateTimeInstant } from "@/lib/schedule-occurrence";
import type { ProductType, Product } from "@/types";

// Registration state for the parent-facing browse + purchased cards.
//
// Centralising the decision tree here keeps the card rendering branchless
// beyond a single `kind` switch — same shape as `formatProductSchedule`
// and `formatProductPrice`. Same function powers today and the
// post-`participations` future: when participation counts go live,
// the richer `pending_thr` / `full_*` states light up automatically.
//
// Muni clubs are intentionally not modelled here — they don't get a
// browse landing page and their purchased-card surface doesn't need a
// status pill (the verb badge "Registered" already conveys "you're in",
// and registration goes through the city's own flow).
//
// Decision tree (top-down, first match wins):
//   ended         ← effectiveStatus in { completed, expired, cancelled }
//   closed_pre    ← registration_opens_at > now
//   running_late  ← effectiveStatus = running AND either
//                     product_type = camp (locks at local midnight on
//                     start_date — a cohort starts together), or
//                     product_type = event AND now >= the event's end
//                     instant (start_date + its slot's start_time +
//                     duration_minutes, read in product.timezone). An event
//                     with no slot falls back to the camp rule.
//   pending_thr   ← raw status = pending AND signup_threshold IS NOT NULL
//                   AND participations_count < signup_threshold
//   full_waitlist ← seat_count IS NOT NULL
//                   AND participations_count >= seat_count
//                   AND waitlist_enabled
//   full_closed   ← seat_count IS NOT NULL
//                   AND participations_count >= seat_count
//                   AND NOT waitlist_enabled
//   open          ← otherwise

export type RegistrationState =
  | { kind: "ended" }
  | { kind: "closed_pre"; opensAt: string }
  | {
      kind: "running_late";
      /**
       * Which flavour of "too late" this is, so the CTA label can say it.
       * `underway` — a camp mid-term (or an event we can't time, see the
       * zero-slot fallback). `over` — an event whose session has finished.
       */
      phase: "underway" | "over";
    }
  | {
      kind: "pending_thr";
      threshold: number;
      /** 0 today; real once participations ships. */
      count: number;
    }
  | {
      kind: "full_waitlist";
      seatCount: number;
    }
  | {
      kind: "full_closed";
      seatCount: number;
    }
  | {
      kind: "open";
      /**
       * `null` when there is no cap — the card layer then renders no
       * capacity hint at all.
       */
      seatCount: number | null;
      /** `null` until participations ships. */
      seatsLeft: number | null;
      waitlistEnabled: boolean;
    };

// Lifecycle-relevant columns. Keeping the input narrow lets callers
// project a smaller select without losing type-safety.
//
// `schedule_slots` is the one joined field: an event's registration closes at
// the moment its session ends, which needs the slot's clock time. Structural,
// not the full row type, so any select carrying at least these two columns
// (the browse and detail queries both do) satisfies it.
export type RegistrationStateInputs = Pick<
  Product,
  | "status"
  | "start_date"
  | "end_date"
  | "signup_threshold"
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
 * the slot duration. Returns `null` when the row can't be timed — no
 * start_date, or no slot (the admin form requires one, so this is a
 * type-level possibility rather than a real one) — and the caller then falls
 * back to the date-only camp rule.
 *
 * An event is single-date with exactly one slot, so `schedule_slots[0]` is
 * the whole schedule; the weekday on it is derived from `start_date` and adds
 * nothing here.
 */
function eventEndInstant(product: RegistrationStateInputs): Date | null {
  if (product.start_date === null || product.schedule_slots.length === 0) {
    return null;
  }
  const slot = product.schedule_slots[0];
  const start = dateTimeInstant(
    product.start_date,
    slot.start_time,
    product.timezone,
  );
  return new Date(start.getTime() + slot.duration_minutes * 60_000);
}

export function deriveRegistrationState({
  product,
  now,
  participationsCount,
}: DeriveRegistrationStateArgs): RegistrationState {
  const status = effectiveStatus(product, now, participationsCount);

  if (status === "completed" || status === "expired" || status === "cancelled") {
    return { kind: "ended" };
  }

  if (new Date(product.registration_opens_at).getTime() > now.getTime()) {
    return { kind: "closed_pre", opensAt: product.registration_opens_at };
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

  // Threshold-bearing pending products that haven't met their threshold
  // yet show the "pending" pill. Once the threshold is met, effectiveStatus
  // promotes to `running`, so this branch only fires while truly under-met.
  if (
    product.status === "pending" &&
    product.signup_threshold !== null &&
    participationsCount < product.signup_threshold
  ) {
    return {
      kind: "pending_thr",
      threshold: product.signup_threshold,
      count: participationsCount,
    };
  }

  if (product.seat_count !== null && participationsCount >= product.seat_count) {
    return product.waitlist_enabled
      ? { kind: "full_waitlist", seatCount: product.seat_count }
      : { kind: "full_closed", seatCount: product.seat_count };
  }

  return {
    kind: "open",
    seatCount: product.seat_count,
    seatsLeft:
      product.seat_count !== null
        ? Math.max(0, product.seat_count - participationsCount)
        : null,
    waitlistEnabled: product.waitlist_enabled,
  };
}

// How a state's browse-card CTA behaves:
//   "primary"  → a working "View" button into the detail page (something to do
//                there: sign up, watch the threshold, join the waitlist).
//   "disabled" → a dead end — full with no waitlist, a camp already underway,
//                or an event already over; the detail page has nothing
//                actionable, so the parent isn't sent on a round-trip.
//   null       → no button at all (ended).
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
    case "pending_thr":
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
