import { createClient } from "@/lib/supabase/server";
import {
  AssignmentsService,
  type MyAssignedProductSessionRow,
} from "@/services/assignments";
import {
  GeduSessionsService,
  type GeduAssignmentSummary,
} from "@/services/gedu-sessions";
// The service class rather than the package index, for the same reason the
// two above are imported by name: that index re-exports `"use client"` query
// hooks, which a server component would pull in as client references.
import { SessionSubstitutionService } from "@/services/session-substitution/session-substitution.service";
import type { OpenSubstitutionRequest } from "@/services/session-substitution/session-substitution.contracts";
import { isGeduCertified } from "@/services/gedu/gedu-profiles.service";

/**
 * The server reads two gedu pages share — My SOG and Substitutions.
 *
 * They are here rather than in either route because **what a failure answers is
 * a policy, not a detail**: an empty list and a failed read are different
 * answers on three of these four, and a second copy of that decision is a
 * second chance to get it backwards on one page and not the other.
 */

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
export async function getInitialAssignmentRows(): Promise<
  MyAssignedProductSessionRow[]
> {
  try {
    const supabase = await createClient();
    const service = new AssignmentsService(supabase);
    return await service.getMyAssignedProducts();
  } catch {
    return [];
  }
}

/**
 * Prefetch the per-assignment summaries — group name, group size, site, and
 * the outstanding-write-up count each card's badge shows.
 *
 * **Failure answers `null`, not an empty list**, and the difference matters
 * here in a way it does not for the rows above: an empty summary list is a
 * perfectly plausible real answer (a gedu with no assignments), and taking it
 * on trust after an error would render every card with no group name and a zero
 * badge — a wrong number on the one thing these pages exist to surface. `null`
 * tells the client to ask again, and to show nothing meanwhile.
 */
export async function getInitialAssignmentSummaries(): Promise<
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
 * Prefetch the substitution pool — every open request this gedu could take.
 *
 * **Asked only of a certified gedu**, because certification is what gates
 * offering and holding a substitution server-side: an uncertified caller may
 * substitute for nothing, the queue is withheld from them whole, and a read
 * made for a section nobody will see is a read nobody wanted.
 *
 * **Failure answers `null`, not an empty list**, the same distinction the
 * summaries above draw: an empty pool is a real and common answer, and rendering
 * "nothing needs a substitute" on the strength of a Supabase blip would tell a gedu the
 * queue is clear when it is not. `null` sends the client to ask again.
 */
export async function getInitialSubstitutionRequests(
  certified: boolean,
): Promise<OpenSubstitutionRequest[] | null> {
  if (!certified) return null;
  try {
    const supabase = await createClient();
    return await new SessionSubstitutionService(supabase).getOpenRequests();
  } catch {
    return null;
  }
}

/**
 * Has an admin certified this gedu? Creating an instant voice room and offering
 * to substitute are both gated on it server-side; we mirror that gate in the UI
 * so the user meets a clear notice instead of a button that fails. Fail-closed:
 * any lookup error withholds the gated surface (the worst case is a certified
 * gedu briefly not seeing it, which a refresh fixes — better than showing a
 * control that 403s).
 */
export async function getIsCertified(): Promise<boolean> {
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
