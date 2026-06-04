"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type {
  CalendarHoliday,
  HolidayCalendar,
  SiteDetails,
  SiteStaffDetails,
} from "@/types";

export type HolidayCalendarWithDates = HolidayCalendar & {
  calendar_holidays: Pick<CalendarHoliday, "date" | "reason">[];
};

export const referenceKeys = {
  holidayCalendars: ["products", "holiday-calendars"] as const,
  siteDetails: (locationId: string) =>
    ["products", "site-details", locationId] as const,
};

export type SiteDetailsBundle = {
  member: SiteDetails | null;
  staff: SiteStaffDetails | null;
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

/**
 * Fetch both the member-visible and admin+gedu notes for a site location.
 * Either row may be missing (sites without any extra details return
 * `{ member: null, staff: null }`). RLS decides whether staff notes come
 * back non-null for the caller — admin sees them, other roles get null.
 */
export function useSiteDetails(locationId: string | null) {
  const supabase = getClient();

  return useQuery<SiteDetailsBundle>({
    queryKey: referenceKeys.siteDetails(locationId ?? ""),
    enabled: !!locationId,
    queryFn: async () => {
      const [member, staff] = await Promise.all([
        supabase
          .from("site_details")
          .select("*")
          .eq("location_id", locationId!)
          .maybeSingle(),
        supabase
          .from("site_staff_details")
          .select("*")
          .eq("location_id", locationId!)
          .maybeSingle(),
      ]);
      if (member.error) throw member.error;
      if (staff.error) throw staff.error;
      return { member: member.data, staff: staff.data };
    },
  });
}

export interface UpdateSiteNotesInput {
  location_id: string;
  member?: { address?: string | null; notes?: string | null };
  staff?: { notes?: string | null };
}

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
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to update site notes");
      }
      return (await res.json()) as { ok: true };
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: referenceKeys.siteDetails(vars.location_id),
      });
    },
  });
}
