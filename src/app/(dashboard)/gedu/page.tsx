import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GeduDashboardPage } from "@/components/gedu/GeduDashboardPage";
import { createClient } from "@/lib/supabase/server";
import { isGeduCertified } from "@/services/gedu/gedu-profiles.service";
import {
  AssignmentsService,
  type MyAssignedProductSessionRow,
} from "@/services/assignments";
import {
  GeduSessionsService,
  type GeduAssignmentSummary,
} from "@/services/gedu-sessions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduDashboard"), description: "Spin up a voice room" };
}

/**
 * Server-prefetch the assignment rows so the cards paint on first frame.
 * Errors fall back to an empty list — the body will render its own empty-state
 * copy, which is the right read in both the truly-empty and could-not-load
 * cases (the user can refresh).
 *
 * TODO: distinguish "no assignments" from "load failed" in the UI. Today
 * a Supabase blip during the prefetch is indistinguishable from a real
 * empty state (the client-side refetch should self-heal in practice).
 * If we ever see this fire in the wild, render a "couldn't load — try
 * refreshing" surface instead of the empty-state copy.
 */
async function getInitialAssignmentRows(): Promise<MyAssignedProductSessionRow[]> {
  try {
    const supabase = await createClient();
    const service = new AssignmentsService(supabase);
    return await service.getMyAssignedProducts();
  } catch {
    return [];
  }
}

/**
 * Prefetch the per-assignment summaries — group name, group size, venue, and
 * the outstanding-write-up count each card's badge shows.
 *
 * **Failure answers `null`, not an empty list**, and the difference matters
 * here in a way it does not for the rows above: an empty summary list is a
 * perfectly plausible real answer (a gedu with no assignments), and taking it
 * on trust after an error would render every card with no group name and a zero
 * badge — a wrong number on the one thing this page exists to surface. `null`
 * tells the client to ask again, and to show its skeleton meanwhile.
 */
async function getInitialAssignmentSummaries(): Promise<
  GeduAssignmentSummary[] | null
> {
  try {
    const supabase = await createClient();
    const service = new GeduSessionsService(supabase);
    return await service.getMyAssignmentSummaries();
  } catch {
    return null;
  }
}

/**
 * Has an admin certified this gedu? Creating an instant voice room is gated on
 * it server-side (the create route 403s an uncertified gedu); we mirror that gate
 * in the UI so the user sees a clear "awaiting approval" notice instead of a
 * button that fails. Fail-closed: any lookup error hides the card (the worst
 * case is a certified gedu briefly not seeing it, which a refresh fixes — better
 * than showing a button that 403s).
 */
async function getIsCertified(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;
    if (!userId) return false;
    return await isGeduCertified(supabase, userId);
  } catch {
    return false;
  }
}

export default async function GeduDashboardRoute() {
  const [initialRows, initialSummaries, certified] = await Promise.all([
    getInitialAssignmentRows(),
    getInitialAssignmentSummaries(),
    getIsCertified(),
  ]);

  return (
    <GeduDashboardPage
      initialRows={initialRows}
      initialSummaries={initialSummaries}
      certified={certified}
    />
  );
}
