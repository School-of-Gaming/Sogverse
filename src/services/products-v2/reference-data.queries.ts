"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type { HolidayCalendarV2, TagV2, TopicV2 } from "@/types";

export const referenceKeys = {
  topics: ["products-v2", "topics"] as const,
  tags: ["products-v2", "tags"] as const,
  holidayCalendars: ["products-v2", "holiday-calendars"] as const,
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

  return useQuery<HolidayCalendarV2[]>({
    queryKey: referenceKeys.holidayCalendars,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holiday_calendars_v2")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}
