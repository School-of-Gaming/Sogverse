"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type {
  CalendarHoliday,
  HolidayCalendar,
  SiteDetails,
  SiteStaffDetails,
  TagTranslation,
  Tag,
  TopicTranslation,
  Topic,
} from "@/types";
import type { SupportedLocale } from "@/lib/constants/locales";

export type HolidayCalendarWithDates = HolidayCalendar & {
  calendar_holidays: Pick<CalendarHoliday, "date" | "reason">[];
};

// Topics and tags carry their translations alongside — pickers and lists
// resolve the user's locale via resolveTranslation(). Admins manage
// reference-data translations in a separate UI (not yet built); inline
// create only writes the admin's current locale.
export type TopicWithTranslations = Topic & {
  topic_translations: TopicTranslation[];
};

export type TagWithTranslations = Tag & {
  tag_translations: TagTranslation[];
};

export const referenceKeys = {
  topics: ["products", "topics"] as const,
  tags: ["products", "tags"] as const,
  holidayCalendars: ["products", "holiday-calendars"] as const,
  siteDetails: (locationId: string) =>
    ["products", "site-details", locationId] as const,
};

export type SiteDetailsBundle = {
  member: SiteDetails | null;
  staff: SiteStaffDetails | null;
};

export function useTopics() {
  const supabase = getClient();

  // Order by slug for stable, deterministic ordering. The visible label is
  // resolved from translations on the client; sorting in the user's locale
  // happens there too if needed.
  return useQuery<TopicWithTranslations[]>({
    queryKey: referenceKeys.topics,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("*, topic_translations(*)")
        .order("slug");
      if (error) throw error;
      return data as TopicWithTranslations[];
    },
  });
}

export function useTags() {
  const supabase = getClient();

  return useQuery<TagWithTranslations[]>({
    queryKey: referenceKeys.tags,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("*, tag_translations(*)")
        .order("slug");
      if (error) throw error;
      return data as TagWithTranslations[];
    },
  });
}

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

export interface CreateTopicInput {
  name: string;
  kind: "game" | "subject";
  description?: string | null;
  /** UI locale at creation time — the row is written under this locale only.
   *  Other-locale names get added later in the (yet-to-be-built) reference-data
   *  translation manager. See docs/products-redesign.md "Translations". */
  locale: SupportedLocale;
}

export function useCreateTopic() {
  const queryClient = useQueryClient();

  return useMutation<Topic, Error, CreateTopicInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/admin/topics/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to create topic");
      }
      return (await res.json()) as Topic;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: referenceKeys.topics });
    },
  });
}

export interface CreateTagInput {
  name: string;
  description?: string | null;
  /** UI locale at creation time. See CreateTopicInput.locale. */
  locale: SupportedLocale;
}

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation<Tag, Error, CreateTagInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/admin/tags/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to create tag");
      }
      return (await res.json()) as Tag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: referenceKeys.tags });
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
