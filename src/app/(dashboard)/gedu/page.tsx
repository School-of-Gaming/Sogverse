import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GeduDashboardPageBody } from "@/components/gedu/gedu-dashboard-page-body";
import { createClient } from "@/lib/supabase/server";
import { isGeduVerified } from "@/services/gedu/gedu-profiles.service";
import {
  AssignmentsService,
  type MyAssignedProductSessionRow,
} from "@/services/assignments";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduDashboard"), description: "Spin up a voice room" };
}

/**
 * Server-prefetch the assignment rows so the Sessions section paints
 * on first frame. Errors fall back to an empty list — the section will
 * render its own empty-state copy, which is the right read in both the
 * truly-empty and could-not-load cases (the user can refresh).
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
 * Has an admin verified this gedu? Creating an instant voice room is gated on
 * it server-side (the create route 403s an unverified gedu); we mirror that gate
 * in the UI so the user sees a clear "awaiting verification" notice instead of a
 * button that fails. Fail-closed: any lookup error hides the card (the worst
 * case is a verified gedu briefly not seeing it, which a refresh fixes — better
 * than showing a button that 403s).
 */
async function getIsVerified(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;
    if (!userId) return false;
    return await isGeduVerified(supabase, userId);
  } catch {
    return false;
  }
}

export default async function GeduDashboardPage() {
  const [initialRows, verified] = await Promise.all([
    getInitialAssignmentRows(),
    getIsVerified(),
  ]);
  return <GeduDashboardPageBody initialRows={initialRows} verified={verified} />;
}
