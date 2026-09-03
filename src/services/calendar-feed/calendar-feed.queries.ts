"use client";

import { useMutation } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { CalendarFeedService } from "./calendar-feed.service";
import type {
  CalendarFeedLookupResponse,
  CalendarFeedPreviewResponse,
} from "./calendar-feed.contracts";

export const calendarFeedKeys = {
  all: ["calendar-feed"] as const,
  lookups: () => [...calendarFeedKeys.all, "lookup"] as const,
  previews: () => [...calendarFeedKeys.all, "preview"] as const,
};

/**
 * Resolve a customer and mint their feed token.
 *
 * A mutation rather than a query even though it only reads: an admin *asks* for
 * a lookup by pressing a button, and nothing on the page should re-run it on a
 * window focus or a cache miss. Nothing to invalidate — minting writes nothing.
 */
export function useCalendarFeedLookup() {
  return useMutation<CalendarFeedLookupResponse, Error, string>({
    mutationKey: calendarFeedKeys.lookups(),
    mutationFn: (customer) =>
      new CalendarFeedService(getClient()).lookup(customer),
  });
}

/**
 * Load one feed URL's events and its raw document together.
 *
 * Both in one mutation because the card shows them together and they are two
 * renderings of one computation: fetching them separately would let the table
 * and the `.ics` below it describe two different polls.
 */
export function useCalendarFeedPreview() {
  return useMutation<
    { preview: CalendarFeedPreviewResponse; raw: string },
    Error,
    { jsonUrl: string; icsUrl: string }
  >({
    mutationKey: calendarFeedKeys.previews(),
    mutationFn: async ({ jsonUrl, icsUrl }) => {
      const service = new CalendarFeedService(getClient());
      const [preview, raw] = await Promise.all([
        service.preview(jsonUrl),
        service.previewRaw(icsUrl),
      ]);
      return { preview, raw };
    },
  });
}
