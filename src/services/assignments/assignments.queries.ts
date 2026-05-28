"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { getClient } from "@/lib/supabase/client";
import { resolveLocale } from "@/lib/constants/locales";
import {
  expandAssignedSessionsToCards,
  type GroupSessionItem,
} from "@/lib/assigned-sessions";
import { useNow } from "@/providers";
import {
  AssignmentsService,
  type MyAssignedProductSessionRow,
} from "./assignments.service";

export const assignmentKeys = {
  all: ["assignments"] as const,
  myAssignedProducts: () => [...assignmentKeys.all, "my-assigned-products"] as const,
};

/**
 * Drives the gedu dashboard's Sessions section. Fetches the signed-in
 * gedu's product assignments + product-wide aggregates, then expands
 * them into one card per (assignment, slot, future occurrence) sorted
 * ascending by `sessionStart`. Mirrors `useMyUpcomingSessions` on the
 * parent/gamer side, including the 8-occurrence cap for open-ended
 * products and the `voiceIsOpen` flip on the soonest item via `useNow()`.
 *
 * `initialData` is required — the gedu page server-prefetches the rows
 * so the section paints on first frame with no loading state.
 */
export function useMyAssignedSessions(options: {
  initialData: MyAssignedProductSessionRow[];
}): GroupSessionItem[] {
  const supabase = getClient();
  const service = new AssignmentsService(supabase);
  const locale = resolveLocale(useLocale());
  const now = useNow();

  const query = useQuery({
    queryKey: assignmentKeys.myAssignedProducts(),
    queryFn: () => service.getMyAssignedProducts(),
    initialData: options.initialData,
  });

  return useMemo(
    () => expandAssignedSessionsToCards(query.data, now, locale),
    [query.data, now, locale],
  );
}
