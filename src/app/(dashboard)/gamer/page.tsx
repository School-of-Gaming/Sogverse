import type { Metadata } from "next";
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
    description: "Your clubs, camps and events in the Sogverse",
  };
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
 * The third thing it resolves is the child's own **name**, because the greeting
 * says it. This was the one page in the product that did not know who was
 * reading it.
 */

/** See `parent/page.tsx` for the rationale on this prefetch shape. */
async function getInitialSessionRows(): Promise<MyUpcomingSessionRow[]> {
  try {
    const supabase = await createClient();
    const service = new ParticipationsService(supabase);
    return await service.getMyUpcomingSessions("gamer");
  } catch {
    return [];
  }
}

/** The waitlisted rows, read-only for this audience: a child can see where they
 *  are in a queue and cannot leave it. Same prefetch shape and the same
 *  `[]`-on-failure fallback as the sessions read above. */
async function getInitialWaitlistRows(): Promise<MyWaitlistRow[]> {
  try {
    const supabase = await createClient();
    const service = new ParticipationsService(supabase);
    return await service.getMyWaitlistEntries("gamer");
  } catch {
    return [];
  }
}

export default async function GamerDashboardPage() {
  // `getUserWithProfile` is request-cached and the dashboard layout has already
  // called it, so this costs nothing and shares that render's `profiles` row.
  const [viewer, initialSessionRows, initialWaitlistRows] = await Promise.all([
    getUserWithProfile(),
    getInitialSessionRows(),
    getInitialWaitlistRows(),
  ]);

  const t = await getTranslations("gamer");

  return (
    <GamerDashboardShell
      // The reads above are already RLS-scoped to this account; the roll-up
      // filters on the id as well, so a prefetch that ever asked with the wrong
      // audience produces an empty dashboard rather than a sibling's.
      gamerId={viewer?.user.id ?? ""}
      // The profile is all but guaranteed here — the proxy read this account's
      // role off it to let them onto `/gamer` at all — so a missing one means a
      // transient read failure within this render, not a real state. The
      // greeting goes nameless in that case, which is what this page said to
      // every child before this change, rather than bouncing a signed-in child
      // to a login screen they are already past.
      firstName={viewer?.profile?.first_name ?? t("fallbackName")}
      initialSessionRows={initialSessionRows}
      initialWaitlistRows={initialWaitlistRows}
    />
  );
}
