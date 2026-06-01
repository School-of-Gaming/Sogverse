import { effectiveStatus } from "@/components/admin/products/effective-status";
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
//   running_late  ← effectiveStatus = running AND product_type in
//                   { camp, event }
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
  | { kind: "running_late" }
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
       * `null` when there is no cap — the card layer renders
       * "Waitlist available" if the product supports it, otherwise nothing.
       */
      seatCount: number | null;
      /** `null` until participations ships. */
      seatsLeft: number | null;
      waitlistEnabled: boolean;
    };

// Lifecycle-relevant columns. Keeping the input narrow lets callers
// project a smaller select without losing type-safety.
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
>;

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

  // Camps/events lock late joins once running. Clubs allow drop-in late
  // joins (the "running_late" state never fires for them).
  if (status === "running" && LATE_JOIN_LOCKED[product.product_type]) {
    return { kind: "running_late" };
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
