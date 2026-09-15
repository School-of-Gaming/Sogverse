"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { adminDashboardKeys } from "@/services/admin-dashboard/admin-dashboard.keys";
import { adminSessionKeys } from "@/services/admin-sessions/admin-sessions.keys";
import { assignmentKeys } from "@/services/assignments/assignments.keys";
import { geduSessionKeys } from "@/services/gedu-sessions/gedu-sessions.keys";
import type { CoverReason } from "@/types";
import { sessionCoverKeys } from "./session-cover.keys";
import { SessionCoverService } from "./session-cover.service";
import type { OpenCoverRequest } from "./session-cover.contracts";

/** React Query bindings for session covers. */

/**
 * **What a cover write invalidates, stated once.**
 *
 * Every one of the eight writes below moves the same five documents, so they
 * all call this rather than each listing four foreign roots and getting one of
 * them wrong. The five, and why each is in the list:
 *
 * - the cover root — the pool a gedu picks from, which any approval shortens;
 * - the gedu-sessions root — both the group feed's `covers` array and the
 *   dashboard summaries, whose per-card badge stops counting a session on a
 *   date its viewer has filed an absence for;
 * - the admin-sessions root — the admin product document's own `covers`, which
 *   is where the staffing editor reads a session's request from;
 * - the assignments root — a live cover is a row in the gedu's assigned
 *   products, so approving one gives them a card and clearing one takes it
 *   away;
 * - the admin dashboard — the cover queue is a member of that one document.
 *
 * Roots rather than leaves on purpose: a write can move a group the caller was
 * not looking at (the cascade withdraws a displaced sub's own request), so
 * naming the leaves would mean naming the ones this client cannot know about.
 */
function invalidateCoverWrite(queryClient: QueryClient): void {
  for (const queryKey of [
    sessionCoverKeys.all,
    geduSessionKeys.all,
    adminSessionKeys.all,
    assignmentKeys.all,
    adminDashboardKeys.all,
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
 * uncertified caller may cover nothing, so the honest answer is not to ask.
 * `initialData` is for a route that prefetches the same read server-side.
 */
export function useOpenCoverRequests(options?: {
  enabled?: boolean;
  initialData?: OpenCoverRequest[];
}) {
  const service = new SessionCoverService(getClient());

  return useQuery({
    queryKey: sessionCoverKeys.openRequests(),
    queryFn: () => service.getOpenRequests(),
    enabled: options?.enabled ?? true,
    initialData: options?.initialData,
  });
}

/** File "I can't make this session" on a session the caller is expected at. */
export function useRequestSessionCover() {
  const queryClient = useQueryClient();
  const service = new SessionCoverService(getClient());

  return useMutation({
    mutationFn: (vars: {
      groupId: string;
      sessionDate: string;
      reason: CoverReason;
      reasonNote?: string;
    }) => service.requestCover(vars),
    onSuccess: () => invalidateCoverWrite(queryClient),
  });
}

/** Take back an absence, while it is still open. */
export function useWithdrawSessionCoverRequest() {
  const queryClient = useQueryClient();
  const service = new SessionCoverService(getClient());

  return useMutation({
    mutationFn: (vars: { requestId: string }) =>
      service.withdrawRequest(vars.requestId),
    onSuccess: () => invalidateCoverWrite(queryClient),
  });
}

/** "I can cover this." */
export function useOfferSessionCover() {
  const queryClient = useQueryClient();
  const service = new SessionCoverService(getClient());

  return useMutation({
    mutationFn: (vars: { requestId: string }) =>
      service.offerCover(vars.requestId),
    onSuccess: () => invalidateCoverWrite(queryClient),
  });
}

/** Take an offer back — keyed on the request, as the pool row knows it. */
export function useWithdrawSessionCoverOffer() {
  const queryClient = useQueryClient();
  const service = new SessionCoverService(getClient());

  return useMutation({
    mutationFn: (vars: { requestId: string }) =>
      service.withdrawOffer(vars.requestId),
    onSuccess: () => invalidateCoverWrite(queryClient),
  });
}

/** Approve one offer, making that gedu the cover. Admin-only. */
export function useApproveSessionCoverOffer() {
  const queryClient = useQueryClient();
  const service = new SessionCoverService(getClient());

  return useMutation({
    mutationFn: (vars: { offerId: string }) => service.approveOffer(vars.offerId),
    onSuccess: () => invalidateCoverWrite(queryClient),
  });
}

/** Seat a sub outright, on any date the schedule projects. Admin-only. */
export function useSetSessionCover() {
  const queryClient = useQueryClient();
  const service = new SessionCoverService(getClient());

  return useMutation({
    mutationFn: (vars: {
      groupId: string;
      sessionDate: string;
      absentGeduId: string;
      subGeduId: string;
      reason?: CoverReason;
      reasonNote?: string;
    }) => service.setCover(vars),
    onSuccess: () => invalidateCoverWrite(queryClient),
  });
}

/** Unseat the sub; the request goes back to the queue. Admin-only. */
export function useClearSessionCover() {
  const queryClient = useQueryClient();
  const service = new SessionCoverService(getClient());

  return useMutation({
    mutationFn: (vars: { requestId: string }) =>
      service.clearCover(vars.requestId),
    onSuccess: () => invalidateCoverWrite(queryClient),
  });
}

/** "The absent gedu is attending after all." Admin-only. */
export function useWithdrawSessionCoverRequestAsAdmin() {
  const queryClient = useQueryClient();
  const service = new SessionCoverService(getClient());

  return useMutation({
    mutationFn: (vars: { requestId: string }) =>
      service.withdrawRequestAsAdmin(vars.requestId),
    onSuccess: () => invalidateCoverWrite(queryClient),
  });
}
