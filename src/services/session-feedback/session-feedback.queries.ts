"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import {
  SessionFeedbackService,
  type SaveSessionFeedbackInput,
} from "./session-feedback.service";

/**
 * React Query hooks for a child's own session feedback: one read to prefill the
 * form, one write to record what they pressed Done on.
 */

export const sessionFeedbackKeys = {
  all: ["session-feedback"] as const,
  /** The caller's own row for one group and one session window. */
  own: (groupId: string, sessionOpensAt: string) =>
    [...sessionFeedbackKeys.all, "own", groupId, sessionOpensAt] as const,
};

/**
 * What this viewer already answered in this window, read as they join.
 *
 * **Read early and held, so that leaving costs no round trip.** Both paths to
 * the question are abrupt — a Leave that has already disconnected, or a room
 * closing under everyone, which fires on any post-join drop including a failed
 * network — and waiting on a fresh read at that moment would delay the screen
 * exactly when the connection is least likely to answer.
 *
 * One row by its whole primary key: the near-instant category, so nothing
 * renders a loading state for it. `retry: false` because a refusal here is an
 * answer rather than a glitch, and the caller treats a failed read the same way
 * it treats one that never ran — the form opens empty and the write goes ahead
 * regardless.
 *
 * Disabled until the caller has both a reason to ask (a viewer the page asks)
 * and the window instant the row is keyed by.
 */
export function useOwnSessionFeedback(
  groupId: string,
  sessionOpensAt: string | null,
  enabled: boolean,
) {
  const service = new SessionFeedbackService(getClient());
  return useQuery({
    // The key a disabled query is filed under is never read, which is what the
    // empty stand-in instant is: the hook is enabled only once the real one is
    // in hand, and from then on the key is the row's own.
    queryKey: sessionFeedbackKeys.own(groupId, sessionOpensAt ?? ""),
    queryFn: () => {
      // Unreachable while `enabled` holds the query until the instant is in
      // hand; stated as a refusal rather than a cast so a future caller that
      // loosens the gate fails loudly instead of keying a read to nothing.
      if (sessionOpensAt === null) throw new Error("No session window instant");
      return service.getOwn({ groupId, sessionOpensAt });
    },
    enabled: enabled && sessionOpensAt !== null,
    retry: false,
    staleTime: Infinity,
  });
}

/**
 * Record the answers, replacing whatever this viewer had answered in this
 * window before.
 *
 * **Nothing is invalidated on success, and that is the whole of the story here**
 * rather than an omission: the one caller navigates the document away the moment
 * the write resolves, so there is no cache left to correct. The failure path
 * keeps the screen mounted with what the reader typed still in it, and pressing
 * Done again retries this same write.
 */
export function useSaveSessionFeedback() {
  const service = new SessionFeedbackService(getClient());
  return useMutation({
    mutationFn: (input: SaveSessionFeedbackInput) => service.save(input),
  });
}
