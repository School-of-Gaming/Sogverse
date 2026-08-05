import { runEndedOn, runLiveness, type RunLiveness } from "@/lib/product-run";
import type { ProductType } from "@/types";
import type { SessionCancellation } from "@/components/parent/session-card-badge";

/**
 * One **enrollment** — a family's participation in one product — rolled up to
 * the single card the parent and gamer dashboards both render.
 *
 * The family dashboards used to enumerate *occurrences*: a weekly club emitted
 * eight near-identical rows, a camp one per scheduled day, and a family with two
 * children met a screen of cards that mostly said the same thing twice. The
 * question a parent actually opens the page with is shorter — what is each of my
 * children signed up for, when does it run, and is anything wrong — so the unit
 * of the page is the enrollment, exactly as the gedu dashboard's unit is the
 * assignment.
 *
 * The summary is deliberately **flat and pre-derived**: the next session, the
 * schedule in words, and the three exceptional states (a waitlist place, a
 * failing card, a cancelled subscription) all arrive resolved. Nothing here
 * queries, and nothing here formats — a fixture and a live data shell can
 * produce the same shape, which is what lets one page body serve a preview scene
 * and the real route.
 */
export interface FamilyEnrollmentSummary {
  /** Stable key, and what a payment-problem badge routes its portal session by. */
  participationId: string;
  /** Translated product name — the card's title. */
  productName: string;
  productType: ProductType;
  /**
   * Start of the soonest session still worth showing, or `null` when there is
   * none: a waitlisted enrollment with no placement, or a run whose schedule has
   * been exhausted.
   */
  nextSessionStart: Date | null;
  /** End of that session. `null` exactly when `nextSessionStart` is. */
  nextSessionEnd: Date | null;
  /**
   * Whether this product has a voice room at all — true only for a remote one.
   * An in-person enrollment renders **no** Join affordance rather than a locked
   * one: a locked button promises it will open, and a camp in a library has no
   * room behind it that ever will.
   */
  hasVoiceRoom: boolean;
  /** Where the Join navigates. `"#"` keeps it inert. */
  voiceHref: string;
  /**
   * The venue an in-person enrollment runs at, `null` for a remote one. The
   * in-person counterpart of the Join button — the same question (where is this
   * happening) answered the other way a product can answer it.
   */
  siteName: string | null;
  /** Where a click anywhere on the card navigates — the product's own page. */
  openHref: string;
  /** The product's last day as a bare `YYYY-MM-DD`, or `null` when open-ended. */
  endDate: string | null;
  /** The zone `endDate` is a date **in** — the product's own. */
  timezone: string;
  /**
   * 1-based place in line when this enrollment is waitlisted, `null` when the
   * gamer holds a seat. A waitlisted enrollment is a card in the same list as
   * every other — the family is *in* something, they are just waiting on a seat
   * — so it is a state of this summary rather than a separate band.
   */
  waitlistPosition: number | null;
  /** The subscription behind this enrollment is `past_due`. */
  paymentProblem: boolean;
  /** Set when the parent has cancelled this club's subscription. */
  cancellation: SessionCancellation | null;
  /**
   * The product's schedule in words ("Mondays 16:30–18:00"), from the shared
   * product-schedule formatter, so a family reads the same sentence the public
   * product page shows them. Empty when the product has no slots yet.
   */
  scheduleLines: readonly string[];
}

/**
 * The last day of a finished run, or `null` while it is still going.
 *
 * The same question the gedu dashboard asks of an assignment, asked of an
 * enrollment: the underlying test is a zone-aware "is this product's final
 * calendar day behind us, with nothing left on the schedule", which is a fact
 * about the product and not about who is looking at it. Wrapped rather than
 * imported at each call site so a family surface names the family concept.
 */
export function enrollmentEndedOn(
  enrollment: Pick<
    FamilyEnrollmentSummary,
    "endDate" | "timezone" | "nextSessionStart"
  >,
  now: Date,
): string | null {
  return runEndedOn(enrollment, now);
}

/**
 * Whether this enrollment's next session is running, and whether its room is
 * open, as of one instant — asked together off one clock so the card's gradient,
 * its Live badge and its Join button can never disagree.
 */
export function enrollmentLiveness(
  enrollment: Pick<
    FamilyEnrollmentSummary,
    "nextSessionStart" | "nextSessionEnd" | "hasVoiceRoom"
  >,
  now: Date,
): RunLiveness {
  return runLiveness(enrollment, now);
}

/**
 * The three bands a card can be in, in the order a family reads them.
 *
 * 0. **Running** — a seat held and a session ahead. What the page is for.
 * 1. **Waiting** — a waitlist place, or a run whose schedule has been used up
 *    without the product having formally ended. Nothing to turn up to yet, but
 *    nothing over either.
 * 2. **Finished** — the run's last day is behind us.
 */
function bandOf(endedOn: string | null, nextSessionStart: Date | null): number {
  if (endedOn !== null) return 2;
  if (nextSessionStart === null) return 1;
  return 0;
}

/**
 * Sort one gamer's enrollments the way that gamer's week actually runs:
 * **soonest session first, with every finished run beneath every live one.**
 *
 * A finished run is demoted rather than dropped. Its reports and its record are
 * still worth reaching, and a camp that ended last week is the first thing a
 * parent goes looking for when they want the photos — but it contributes nothing
 * to "what is happening this week", which is the question the top of the list
 * has to answer. Inside the finished band the order is most-recently-ended
 * first: the bare `YYYY-MM-DD` dates compare chronologically as strings, so this
 * needs no parsing.
 *
 * Waitlist places sit between the two. They are not a fact about this week (no
 * session to turn up to) and they are emphatically not history — a seat could
 * open tomorrow — so they land after everything scheduled and before everything
 * over.
 */
export function sortFamilyEnrollments(
  enrollments: readonly FamilyEnrollmentSummary[],
  now: Date,
): FamilyEnrollmentSummary[] {
  // Endedness is resolved once per enrollment and carried through the sort
  // rather than recomputed inside the comparator: it is a zone-aware date parse,
  // and a comparator would run it O(n log n) times to answer the same question
  // about the same instant every time.
  const ranked = enrollments.map((enrollment) => {
    const endedOn = enrollmentEndedOn(enrollment, now);
    return {
      enrollment,
      endedOn,
      band: bandOf(endedOn, enrollment.nextSessionStart),
    };
  });

  ranked.sort((a, b) => {
    if (a.band !== b.band) return a.band - b.band;
    if (a.band === 0) {
      const aStart = a.enrollment.nextSessionStart;
      const bStart = b.enrollment.nextSessionStart;
      // Band 0 is defined by both being non-null; the guards keep that a fact
      // the compiler agrees with rather than one a comment asserts.
      if (aStart !== null && bStart !== null && aStart.getTime() !== bStart.getTime()) {
        return aStart.getTime() - bStart.getTime();
      }
    }
    if (a.band === 2 && a.endedOn !== null && b.endedOn !== null) {
      if (a.endedOn !== b.endedOn) return a.endedOn < b.endedOn ? 1 : -1;
    }
    return a.enrollment.productName.localeCompare(b.enrollment.productName);
  });

  return ranked.map((entry) => entry.enrollment);
}
