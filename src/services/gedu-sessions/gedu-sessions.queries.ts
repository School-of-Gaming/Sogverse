"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GeduSessionsService } from "./gedu-sessions.service";
import type {
  AttendanceStatus,
  GeduAssignmentSummary,
} from "./gedu-sessions.contracts";

/**
 * React Query bindings for the gedu session feed.
 *
 * The key hierarchy is what makes the invalidations cheap to reason about: a
 * write to any part of one group's workspace invalidates that group's feed key,
 * and anything that can change a backlog also invalidates the dashboard summary
 * key — because the badge on the card and the alerts in the feed are two views
 * of one number and must never disagree.
 */
export const geduSessionKeys = {
  all: ["gedu-sessions"] as const,
  feeds: () => [...geduSessionKeys.all, "feed"] as const,
  feed: (groupId: string) => [...geduSessionKeys.feeds(), groupId] as const,
  summaries: () => [...geduSessionKeys.all, "summaries"] as const,
};

/**
 * One group's whole workspace.
 *
 * A perceptibly heavy call by design — it carries a club's entire history — so
 * the surface built on it renders a structured skeleton immediately rather than
 * nothing.
 */
export function useGeduGroupFeed(groupId: string | null) {
  const service = new GeduSessionsService(getClient());

  return useQuery({
    queryKey: geduSessionKeys.feed(groupId ?? ""),
    queryFn: () => service.getGroupFeed(groupId ?? ""),
    enabled: groupId !== null && groupId.length > 0,
  });
}

/**
 * Every assignment card's facts, including its outstanding-work count.
 *
 * `initialData` is how the dashboard normally gets it: the route prefetches the
 * same RPC server-side, so the cards paint complete on first frame rather than
 * filling their group names and badges in a beat later. It is optional because
 * a prefetch can fail, and a card grid built on half the facts is worse than
 * one skeleton — without it the hook fetches and the page shows its loading
 * state, which is the honest answer to not knowing yet.
 */
export function useGeduAssignmentSummaries(options?: {
  initialData?: GeduAssignmentSummary[];
}) {
  const service = new GeduSessionsService(getClient());

  return useQuery({
    queryKey: geduSessionKeys.summaries(),
    queryFn: () => service.getMyAssignmentSummaries(),
    initialData: options?.initialData,
  });
}

export function useSetSessionNotes(groupId: string) {
  const queryClient = useQueryClient();
  const service = new GeduSessionsService(getClient());

  return useMutation({
    mutationFn: (vars: {
      sessionDate: string;
      report: string;
      geduNote: string;
    }) => service.setSessionNotes({ groupId, ...vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: geduSessionKeys.feed(groupId),
      });
      // A report is the top rung of the completeness ladder, so writing one can
      // move a session from "recorded" to "complete" — which the card's badge
      // is counting.
      void queryClient.invalidateQueries({
        queryKey: geduSessionKeys.summaries(),
      });
    },
  });
}

export function useRecordAttendance(groupId: string) {
  const queryClient = useQueryClient();
  const service = new GeduSessionsService(getClient());

  return useMutation({
    mutationFn: (vars: {
      sessionDate: string;
      gamerId: string;
      status: AttendanceStatus | null;
    }) => service.recordAttendance({ groupId, ...vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: geduSessionKeys.feed(groupId),
      });
      void queryClient.invalidateQueries({
        queryKey: geduSessionKeys.summaries(),
      });
    },
  });
}

export function useSetGroupNotes(groupId: string) {
  const queryClient = useQueryClient();
  const service = new GeduSessionsService(getClient());

  return useMutation({
    mutationFn: (vars: { publicNote: string; geduNote: string }) =>
      service.setGroupNotes({ groupId, ...vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: geduSessionKeys.feed(groupId),
      });
    },
  });
}

export function useSetSiteNotes(groupId: string) {
  const queryClient = useQueryClient();
  const service = new GeduSessionsService(getClient());

  return useMutation({
    mutationFn: (vars: {
      locationId: string;
      address: string;
      publicNote: string;
      geduNote: string;
    }) => service.setSiteNotes(vars),
    onSuccess: () => {
      // Site notes are shared by every product at the building, so in principle
      // every feed could be stale. Only the group being looked at is worth
      // refetching now; the rest pick the change up when they are next opened.
      void queryClient.invalidateQueries({
        queryKey: geduSessionKeys.feed(groupId),
      });
    },
  });
}
