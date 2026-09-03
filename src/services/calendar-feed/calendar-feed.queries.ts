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
 * Load one feed URL's events and the `.ics` document they serialize to.
 *
 * One request, because the route answers with both in one response: two fetches
 * would be two computations, and the card's table and the raw document beneath
 * it would be free to describe different ones.
 */
export function useCalendarFeedPreview() {
  return useMutation<CalendarFeedPreviewResponse, Error, string>({
    mutationKey: calendarFeedKeys.previews(),
    mutationFn: (jsonUrl) =>
      new CalendarFeedService(getClient()).preview(jsonUrl),
  });
}
