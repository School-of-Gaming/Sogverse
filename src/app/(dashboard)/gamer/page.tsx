import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GamerDashboardShell } from "@/components/gamer/GamerDashboardShell";
import { createClient, getUserWithProfile } from "@/lib/supabase/server";
import {
  ParticipationsService,
  type MyUpcomingSessionRow,
  type MyWaitlistRow,
} from "@/services/participations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("gamerDashboard"),
    description: t("gamerDashboardDescription"),
  };
}

/**
 * See `parent/page.tsx` for the rationale on this prefetch shape — including
 * why failure answers `null` rather than `[]`. An empty seed is stamped as
 * freshly fetched and never asked about again, so flattening a transient
 * failure into one told a child they were signed up for nothing and then left
 * that on screen.
 */
async function getInitialSessionRows(): Promise<MyUpcomingSessionRow[] | null> {
  try {
    const supabase = await createClient();
    const service = new ParticipationsService(supabase);
    return await service.getMyUpcomingSessions("gamer");
  } catch {
    return null;
  }
}

/** The waitlisted rows, read-only for this audience: a child can see where they
 *  are in a queue and cannot leave it. Same prefetch shape and the same
 *  `null`-on-failure fallback as the sessions read above. */
async function getInitialWaitlistRows(): Promise<MyWaitlistRow[] | null> {
  try {
    const supabase = await createClient();
    const service = new ParticipationsService(supabase);
    return await service.getMyWaitlistEntries("gamer");
  } catch {
    return null;
  }
}

/**
 * The gamer dashboard's route — the parent route's shape, with less to do.
 *
 * Two reads instead of four: a child has no family to enumerate (their own page
 * has exactly one person on it) and no billing to resolve. Both reads pass
 * `audience: "gamer"`, so RLS keys them off `gamer_id` and this account sees its
 * own enrollments rather than every participation its parent has paid for
 * across siblings.
 *
 * The third thing it resolves is the child's own **identity**, and the two
 * halves of that are handled deliberately differently:
 *
 * - **No signed-in user is a dead end, so it redirects.** The id is what scopes
 *   every card on the page, and there is no honest value to carry on without
 *   one: a falsy stand-in would pass straight into the roll-up's equality filter,
 *   match no row, and render a child who has three clubs the empty state telling
 *   them to go and ask a parent for one. A page that quietly misreports what a
 *   family is enrolled in is worse than a page that asks them to sign in again.
 *   This duplicates the dashboard layout's own guard on purpose — the layout and
 *   the page render in parallel, so leaving it to the layout's redirect is
 *   leaving it to a race.
 * - **A missing name is not a dead end, so it degrades.** The greeting is the
 *   only thing that reads it and every card is unaffected. The profile is all
 *   but guaranteed here — the proxy read this account's role off it to let them
 *   onto `/gamer` at all — so its absence means a transient read failure inside
 *   this render, and the greeting falls back to the role noun, which is what
 *   this page said to every child before this change.
 */
export default async function GamerDashboardPage() {
  // `getUserWithProfile` is request-cached and the dashboard layout has also
  // called it, so this shares that render's `profiles` row rather than firing a
  // second query.
  const [viewer, initialSessionRows, initialWaitlistRows] = await Promise.all([
    getUserWithProfile(),
    getInitialSessionRows(),
    getInitialWaitlistRows(),
  ]);

  if (!viewer?.user) {
    redirect("/login");
  }

  const t = await getTranslations("gamer");

  return (
    <GamerDashboardShell
      // The reads above are already RLS-scoped to this account; the roll-up
      // filters on the id as well, so a prefetch that ever asked with the wrong
      // audience yields this child's cards rather than a sibling's.
      gamerId={viewer.user.id}
      firstName={viewer.profile?.first_name ?? t("fallbackName")}
      initialSessionRows={initialSessionRows}
      initialWaitlistRows={initialWaitlistRows}
    />
  );
}
