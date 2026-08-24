"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import {
  parseJsonResponse,
  readErrorMessage,
} from "@/lib/api/json-response";
import { adminSessionKeys } from "@/services/admin-sessions";
import { updateSiteNotesResponse } from "./reference-data.contracts";
import type { CalendarHoliday, HolidayCalendar } from "@/types";

export type HolidayCalendarWithDates = HolidayCalendar & {
  calendar_holidays: Pick<CalendarHoliday, "date" | "reason">[];
};

export const referenceKeys = {
  holidayCalendars: ["products", "holiday-calendars"] as const,
};

export function useHolidayCalendars() {
  const supabase = getClient();

  return useQuery<HolidayCalendarWithDates[]>({
    queryKey: referenceKeys.holidayCalendars,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holiday_calendars")
        .select("*, calendar_holidays(date, reason)")
        .order("name");
      if (error) throw error;
      return data as HolidayCalendarWithDates[];
    },
  });
}

export interface UpdateSiteNotesInput {
  location_id: string;
  member?: { address?: string | null; notes?: string | null };
  staff?: { notes?: string | null };
}

/**
 * Write a site's member-visible address/notes and its staff notes.
 *
 * **The only read that carries any of this into a page is the admin product's
 * session document**, so that is what the write invalidates — the invalidation
 * belongs on the mutation rather than on whichever component happened to fire
 * it. The gedu group feed carries the same site fields, but it is not
 * invalidated here and must not be: this route is admin-only, so a client that
 * can reach this mutation has never held a gedu feed, and invalidating one
 * would be a no-op dressed up as thoroughness.
 *
 * Keyed at every product rather than one: a site is shared by every product at
 * the building, and this mutation is not told which of them is on screen. Only
 * mounted queries refetch, and exactly one product document is ever mounted.
 *
 * The invalidation is **returned** rather than fired and forgotten, so the
 * promise the caller awaits does not settle until the refetched address is in
 * the cache — an editor closing on the value it just wrote rather than on the
 * one it replaced.
 */
export function useUpdateSiteNotes() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, Error, UpdateSiteNotesInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/admin/site-notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error(
          await readErrorMessage(res, "Failed to update site notes")
        );
      }
      return parseJsonResponse(res, updateSiteNotesResponse);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: adminSessionKeys.products(),
      }),
  });
}
