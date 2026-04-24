"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type {
  CalendarHolidayV2,
  HolidayCalendarV2,
  SiteDetailsV2,
  SiteStaffDetailsV2,
  TagV2,
  TopicV2,
} from "@/types";

export type HolidayCalendarWithDates = HolidayCalendarV2 & {
  calendar_holidays_v2: Pick<CalendarHolidayV2, "date" | "reason">[];
};

export const referenceKeys = {
  topics: ["products-v2", "topics"] as const,
  tags: ["products-v2", "tags"] as const,
  holidayCalendars: ["products-v2", "holiday-calendars"] as const,
  siteDetails: (locationId: string) =>
    ["products-v2", "site-details", locationId] as const,
};

export type SiteDetailsBundle = {
  member: SiteDetailsV2 | null;
  staff: SiteStaffDetailsV2 | null;
};

export function useTopicsV2() {
  const supabase = getClient();

  return useQuery<TopicV2[]>({
    queryKey: referenceKeys.topics,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics_v2")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useTagsV2() {
  const supabase = getClient();

  return useQuery<TagV2[]>({
    queryKey: referenceKeys.tags,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_v2")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useHolidayCalendarsV2() {
  const supabase = getClient();

  return useQuery<HolidayCalendarWithDates[]>({
    queryKey: referenceKeys.holidayCalendars,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holiday_calendars_v2")
        .select("*, calendar_holidays_v2(date, reason)")
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
export function useSiteDetailsV2(locationId: string | null) {
  const supabase = getClient();

  return useQuery<SiteDetailsBundle>({
    queryKey: referenceKeys.siteDetails(locationId ?? ""),
    enabled: !!locationId,
    queryFn: async () => {
      const [member, staff] = await Promise.all([
        supabase
          .from("site_details_v2")
          .select("*")
          .eq("location_id", locationId!)
          .maybeSingle(),
        supabase
          .from("site_staff_details_v2")
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
