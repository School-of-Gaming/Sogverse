"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { adminSessionKeys } from "@/services/admin-sessions/admin-sessions.keys";
import { assignmentKeys } from "@/services/assignments/assignments.keys";
import { geduSessionKeys } from "@/services/gedu-sessions/gedu-sessions.keys";
import type { SubstitutionReason } from "@/types";
import { sessionSubstitutionKeys } from "./session-substitution.keys";
import { SessionSubstitutionService } from "./session-substitution.service";
import type {
  AdminSubstitutionQueue,
  OpenSubstitutionRequest,
} from "./session-substitution.contracts";

/** React Query bindings for session substitutions. */

/**
 * **What a substitution write invalidates, stated once.**
 *
 * Every one of the eight writes below moves the same four roots, so they all
 * call this rather than each listing three foreign ones and getting one of them
 * wrong. The four, and why each is in the list:
 *
 * - the substitution root — the pool a gedu picks from, which any approval
 *   shortens, and the admin page's own document, where an approval moves a row
 *   out of the queue and into the fortnight behind it;
 * - the gedu-sessions root — both the group feed's `substitutions` array and the
 *   dashboard summaries, whose per-card badge stops counting a session on a
 *   date its viewer has filed an absence for;
 * - the admin-sessions root — the admin product document's own `substitutions`, which
 *   is where the staffing editor reads a session's request from;
 * - the assignments root — a live substitution is a row in the gedu's assigned
 *   products, so approving one gives them a card and clearing one takes it
 *   away.
 *
 * Roots rather than leaves on purpose: a write can move a group the caller was
 * not looking at (the cascade withdraws a displaced sub's own request), so
 * naming the leaves would mean naming the ones this client cannot know about.
 */
function invalidateSubstitutionWrite(queryClient: QueryClient): void {
  for (const queryKey of [
    sessionSubstitutionKeys.all,
    geduSessionKeys.all,
    adminSessionKeys.all,
    assignmentKeys.all,
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * The pool: every open request the signed-in gedu could take.
 *
 * A small, indexed, bounded read — open requests inside a sixty-day window,
 * filtered by a predicate the database applies — so the section built on it
 * renders nothing while it lands rather than a skeleton.
 *
 * `enabled` is how the dashboard hides the section from an uncertified gedu: an
 * uncertified caller may substitute for nothing, so the honest answer is not to ask.
 * `initialData` is for a route that prefetches the same read server-side.
 */
export function useOpenSubstitutionRequests(options?: {
  enabled?: boolean;
  initialData?: OpenSubstitutionRequest[];
}) {
  const service = new SessionSubstitutionService(getClient());

  return useQuery({
    queryKey: sessionSubstitutionKeys.openRequests(),
    queryFn: () => service.getOpenRequests(),
    enabled: options?.enabled ?? true,
    initialData: options?.initialData,
  });
}

/**
 * The admin Substitutions page, whole.
 *
 * The route awaits this read server-side and hydrates it, so the first paint is
 * the finished page and there is **no loading state anywhere below it** — the
 * snapshot is a required prop, which is what makes `data` non-optional and the
 * absent loading branch a compile-time fact rather than a convention.
 */
export function useAdminSubstitutionQueue(initialQueue: AdminSubstitutionQueue) {
  const service = new SessionSubstitutionService(getClient());

  return useQuery({
    queryKey: sessionSubstitutionKeys.adminQueue(),
    queryFn: () => service.getAdminQueue(),
    initialData: initialQueue,
  });
}

/** File "I can't make this session" on a session the caller is expected at. */
export function useRequestSessionSubstitution() {
  const queryClient = useQueryClient();
  const service = new SessionSubstitutionService(getClient());

  return useMutation({
    mutationFn: (vars: {
      groupId: string;
      sessionDate: string;
      reason: SubstitutionReason;
      reasonNote?: string;
    }) => service.requestSubstitution(vars),
    onSuccess: () => invalidateSubstitutionWrite(queryClient),
  });
}

/** Take back an absence, while it is still open. */
export function useWithdrawSessionSubstitutionRequest() {
  const queryClient = useQueryClient();
  const service = new SessionSubstitutionService(getClient());

  return useMutation({
    mutationFn: (vars: { requestId: string }) =>
      service.withdrawRequest(vars.requestId),
    onSuccess: () => invalidateSubstitutionWrite(queryClient),
  });
}

/** "Offer to substitute." */
export function useOfferSessionSubstitution() {
  const queryClient = useQueryClient();
  const service = new SessionSubstitutionService(getClient());

  return useMutation({
    mutationFn: (vars: { requestId: string }) =>
      service.offerSubstitution(vars.requestId),
    onSuccess: () => invalidateSubstitutionWrite(queryClient),
  });
}

/** Take an offer back — keyed on the request, as the pool row knows it. */
export function useWithdrawSessionSubstitutionOffer() {
  const queryClient = useQueryClient();
  const service = new SessionSubstitutionService(getClient());

  return useMutation({
    mutationFn: (vars: { requestId: string }) =>
      service.withdrawOffer(vars.requestId),
    onSuccess: () => invalidateSubstitutionWrite(queryClient),
  });
}

/** Approve one offer, making that gedu the substitution. Admin-only. */
export function useApproveSessionSubstitutionOffer() {
  const queryClient = useQueryClient();
  const service = new SessionSubstitutionService(getClient());

  return useMutation({
    mutationFn: (vars: { offerId: string }) => service.approveOffer(vars.offerId),
    onSuccess: () => invalidateSubstitutionWrite(queryClient),
  });
}

/** Seat a sub outright, on any date the schedule projects. Admin-only. */
export function useSetSessionSubstitution() {
  const queryClient = useQueryClient();
  const service = new SessionSubstitutionService(getClient());

  return useMutation({
    mutationFn: (vars: {
      groupId: string;
      sessionDate: string;
      absentGeduId: string;
      subGeduId: string;
      reason?: SubstitutionReason;
      reasonNote?: string;
    }) => service.setSubstitution(vars),
    onSuccess: () => invalidateSubstitutionWrite(queryClient),
  });
}

/** Unseat the sub; the request goes back to the queue. Admin-only. */
export function useClearSessionSubstitution() {
  const queryClient = useQueryClient();
  const service = new SessionSubstitutionService(getClient());

  return useMutation({
    mutationFn: (vars: { requestId: string }) =>
      service.clearSubstitution(vars.requestId),
    onSuccess: () => invalidateSubstitutionWrite(queryClient),
  });
}

/** "The absent gedu is attending after all." Admin-only. */
export function useWithdrawSessionSubstitutionRequestAsAdmin() {
  const queryClient = useQueryClient();
  const service = new SessionSubstitutionService(getClient());

  return useMutation({
    mutationFn: (vars: { requestId: string }) =>
      service.withdrawRequestAsAdmin(vars.requestId),
    onSuccess: () => invalidateSubstitutionWrite(queryClient),
  });
}
