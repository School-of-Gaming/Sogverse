"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { useNow, useTimezone } from "@/providers";
import { useFamily, type FamilyMember } from "@/services/family";
import {
  useMyUpcomingSessionRows,
  useMyWaitlistRows,
  type MyUpcomingSessionRow,
  type MyWaitlistRow,
} from "@/services/participations";
import {
  rollUpFamilyEnrollments,
  rollUpGamerEnrollments,
  type FamilyEnrollmentSummary,
  type FamilyGamerEnrollments,
} from "./enrollment-rollup";

/**
 * The client half of the family dashboards' data path: **rows in, cards out.**
 *
 * The split between this and the route above it is not a style choice. Three of
 * the roll-up's inputs are things a server render cannot settle once:
 *
 * - the **viewer's locale**, which collates the child sections and the product
 *   names inside them;
 * - the **viewer's timezone**, which the schedule sentence is stated in and
 *   which the browser may correct after mount (a parent reading from a hotel in
 *   another zone);
 * - **now**, which decides which session is next, which band a card sorts into,
 *   and which has to keep advancing while the page is open — a summary computed
 *   at request time would still be naming a session the family is already
 *   sitting in an hour later.
 *
 * So the route prefetches the **rows** (which decide the page's geometry, and
 * therefore must be final on the first frame) and hands them here as
 * `initialData`; this hook re-derives the cards from them on every tick of the
 * shared 30-second clock. What it deliberately does *not* derive is whether a
 * voice room is open right now — that is the card's own job, off the same
 * clock, and a summary carrying an `isOpen` boolean would give one card two
 * clocks.
 *
 * `openHref` is left unset on both hooks, so every card's link is the inert
 * `"#"` the roll-up defaults to. The family product pages do not exist yet;
 * pointing a card at a route that would 404 is worse than pointing it nowhere,
 * and wiring it later changes nothing else about this path.
 */

/** The rows a family dashboard's route prefetches, as its client shell holds them. */
interface FamilyEnrollmentRows {
  /** `status='active'` rows — seats held, placed and unplaced alike. */
  initialSessionRows: MyUpcomingSessionRow[];
  /** `status='waitlisted'` rows, each with its live place in line. */
  initialWaitlistRows: MyWaitlistRow[];
}

/**
 * The parent dashboard's whole shape: one entry per child, in the order their
 * sections appear, each carrying that child's sorted cards.
 *
 * The family read is in here rather than beside it because it is *geometry* —
 * it decides how many sections the page has and what they are called — and the
 * roll-up needs it anyway to give a child with nothing booked a section of
 * their own. A child's absence from the enrollment rows is exactly the empty
 * state their section renders.
 */
export function useFamilyEnrollments(
  options: FamilyEnrollmentRows & { initialFamily: FamilyMember[] },
): FamilyGamerEnrollments[] {
  const sessionRows = useMyUpcomingSessionRows("customer", {
    initialData: options.initialSessionRows,
  });
  const waitlistRows = useMyWaitlistRows("customer", {
    initialData: options.initialWaitlistRows,
  });
  const { data: family } = useFamily({ initialData: options.initialFamily });
  const now = useNow();
  const locale = resolveLocale(useLocale());
  const timeZone = useTimezone();

  return useMemo(
    () =>
      rollUpFamilyEnrollments({
        sessionRows,
        waitlistRows,
        // `useFamily` types its data as optional because most of its callers
        // mount without a prefetch; this one always has one, so the fallback is
        // a shape guarantee rather than a state the parent dashboard reaches.
        family: family ?? [],
        now,
        locale,
        timeZone,
      }),
    [sessionRows, waitlistRows, family, now, locale, timeZone],
  );
}

/**
 * The same derivation for a child's own dashboard, which has exactly one person
 * on it: no family read, no grouping, just this gamer's sorted cards.
 *
 * The `gamerId` is passed and filtered on rather than assumed, because the reads
 * being self-scoped is a property of the audience the route asked for — and the
 * day somebody prefetches with the wrong one is the day a child's dashboard
 * quietly shows their sibling's club.
 */
export function useGamerEnrollments(
  options: FamilyEnrollmentRows & { gamerId: string },
): FamilyEnrollmentSummary[] {
  const sessionRows = useMyUpcomingSessionRows("gamer", {
    initialData: options.initialSessionRows,
  });
  const waitlistRows = useMyWaitlistRows("gamer", {
    initialData: options.initialWaitlistRows,
  });
  const now = useNow();
  const locale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const { gamerId } = options;

  return useMemo(
    () =>
      rollUpGamerEnrollments({
        sessionRows,
        waitlistRows,
        gamerId,
        now,
        locale,
        timeZone,
      }),
    [sessionRows, waitlistRows, gamerId, now, locale, timeZone],
  );
}
