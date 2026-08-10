"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { useNow, useTimezone } from "@/providers";
import { useFamily, type FamilyMember } from "@/services/family";
import {
  seedAge,
  useMyUpcomingSessionRows,
  useMyWaitlistRows,
  type MyUpcomingSessionRow,
  type MyWaitlistRow,
} from "@/services/participations";
import type { ProductType } from "@/types";
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
 * `openHref` is the one seam these hooks fill in, and filling it here lights up
 * every card on both dashboards at once. The roll-up never consults it for a
 * waitlist place or an unplaced seat — neither has a group, so neither has a
 * page — and those cards go on rendering no link at all.
 */

/**
 * Each role's card destination, defined once at module scope rather than inline.
 *
 * Both roll-ups run inside a `useMemo`, and a callback re-created on every
 * render is a dependency that changes on every render — the memo would recompute
 * the whole page's cards each time, which is exactly what it exists to avoid.
 * These close over nothing, so one instance each is all there ever needs to be.
 */
const parentOpenHref = ({
  participationId,
  productType,
}: {
  participationId: string;
  productType: ProductType;
}) => ROUTES.customer.enrollment(productType, participationId);

const gamerOpenHref = ({
  participationId,
  productType,
}: {
  participationId: string;
  productType: ProductType;
}) => ROUTES.gamer.enrollment(productType, participationId);

/**
 * The rows a family dashboard's route prefetches, as its client shell holds
 * them.
 *
 * **`null` is a failed prefetch, and it is deliberately not the same value as
 * an empty one.** Seeded data is stamped as fetched *now*, and against the
 * 60-second `staleTime` that means the client does not go and ask again — which
 * is right for a read that genuinely returned nothing, and quietly wrong for
 * one that threw. Flattened to `[]`, a transient failure became a dashboard
 * that told a family they were signed up for nothing and then never corrected
 * itself. Carrying the distinction is what lets the hooks below seed a failure
 * as already stale.
 */
interface FamilyEnrollmentRows {
  /** `status='active'` rows — seats held, placed and unplaced alike. */
  initialSessionRows: MyUpcomingSessionRow[] | null;
  /** `status='waitlisted'` rows, each with its live place in line. */
  initialWaitlistRows: MyWaitlistRow[] | null;
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
  options: FamilyEnrollmentRows & { initialFamily: FamilyMember[] | null },
): FamilyGamerEnrollments[] {
  const sessionRows = useMyUpcomingSessionRows("customer", {
    initialData: options.initialSessionRows ?? [],
    initialDataUpdatedAt: seedAge(options.initialSessionRows),
  });
  const waitlistRows = useMyWaitlistRows("customer", {
    initialData: options.initialWaitlistRows ?? [],
    initialDataUpdatedAt: seedAge(options.initialWaitlistRows),
  });
  // `useFamily`'s `initialData` is optional, so a failed prefetch says so by
  // passing nothing at all rather than by seeding an empty family and ageing
  // it. Same outcome — the query fetches on mount — reached by the plainer
  // route: there is no seed to be stale, because there is no seed.
  const { data: family } = useFamily(
    options.initialFamily === null
      ? undefined
      : { initialData: options.initialFamily },
  );
  const now = useNow();
  const locale = resolveLocale(useLocale());
  const timeZone = useTimezone();

  return useMemo(
    () =>
      rollUpFamilyEnrollments({
        sessionRows,
        waitlistRows,
        // `useFamily` types its data as optional because most of its callers
        // mount without a prefetch. This one normally has one — so `undefined`
        // here means the prefetch failed and the refetch has not landed yet,
        // which renders the no-children state for one beat and then corrects.
        family: family ?? [],
        now,
        locale,
        timeZone,
        openHref: parentOpenHref,
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
    initialData: options.initialSessionRows ?? [],
    initialDataUpdatedAt: seedAge(options.initialSessionRows),
  });
  const waitlistRows = useMyWaitlistRows("gamer", {
    initialData: options.initialWaitlistRows ?? [],
    initialDataUpdatedAt: seedAge(options.initialWaitlistRows),
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
        openHref: gamerOpenHref,
      }),
    [sessionRows, waitlistRows, gamerId, now, locale, timeZone],
  );
}
