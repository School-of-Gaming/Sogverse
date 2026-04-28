"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type {
  CalendarHolidayV2,
  HolidayCalendarV2,
  SiteDetailsV2,
  SiteStaffDetailsV2,
  TagTranslationV2,
  TagV2,
  TopicTranslationV2,
  TopicV2,
} from "@/types";
import type { SupportedLocale } from "@/lib/constants/locales";

export type HolidayCalendarWithDates = HolidayCalendarV2 & {
  calendar_holidays_v2: Pick<CalendarHolidayV2, "date" | "reason">[];
};

// Topics and tags carry their translations alongside — pickers and lists
// resolve the user's locale via resolveTranslation(). Admins manage
// reference-data translations in a separate UI (not yet built); inline
// create only writes the admin's current locale.
export type TopicV2WithTranslations = TopicV2 & {
  topic_translations_v2: TopicTranslationV2[];
};

export type TagV2WithTranslations = TagV2 & {
  tag_translations_v2: TagTranslationV2[];
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

  // Order by slug for stable, deterministic ordering. The visible label is
  // resolved from translations on the client; sorting in the user's locale
  // happens there too if needed.
  return useQuery<TopicV2WithTranslations[]>({
    queryKey: referenceKeys.topics,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics_v2")
        .select("*, topic_translations_v2(*)")
        .order("slug");
      if (error) throw error;
      return data as TopicV2WithTranslations[];
    },
  });
}

export function useTagsV2() {
  const supabase = getClient();

  return useQuery<TagV2WithTranslations[]>({
    queryKey: referenceKeys.tags,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_v2")
        .select("*, tag_translations_v2(*)")
        .order("slug");
      if (error) throw error;
      return data as TagV2WithTranslations[];
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

export interface CreateTopicV2Input {
  name: string;
  kind: "game" | "subject";
  description?: string | null;
  /** UI locale at creation time — the row is written under this locale only.
   *  Other-locale names get added later in the (yet-to-be-built) reference-data
   *  translation manager. See docs/products-redesign.md "Translations". */
  locale: SupportedLocale;
}

export function useCreateTopicV2() {
  const queryClient = useQueryClient();

  return useMutation<TopicV2, Error, CreateTopicV2Input>({
    mutationFn: async (input) => {
      const res = await fetch("/api/admin/topics-v2/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to create topic");
      }
      return (await res.json()) as TopicV2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: referenceKeys.topics });
    },
  });
}

export interface CreateTagV2Input {
  name: string;
  description?: string | null;
  /** UI locale at creation time. See CreateTopicV2Input.locale. */
  locale: SupportedLocale;
}

export function useCreateTagV2() {
  const queryClient = useQueryClient();

  return useMutation<TagV2, Error, CreateTagV2Input>({
    mutationFn: async (input) => {
      const res = await fetch("/api/admin/tags-v2/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to create tag");
      }
      return (await res.json()) as TagV2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: referenceKeys.tags });
    },
  });
}

export interface UpdateSiteNotesV2Input {
  location_id: string;
  member?: { address?: string | null; notes?: string | null };
  staff?: { notes?: string | null };
}

export function useUpdateSiteNotesV2() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, Error, UpdateSiteNotesV2Input>({
    mutationFn: async (input) => {
      const res = await fetch("/api/admin/site-notes-v2", {
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
