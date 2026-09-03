"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type { SandboxDefinition } from "@/lib/calendar-feed/sandbox";
import { CalendarFeedService } from "./calendar-feed.service";
import type {
  CalendarFeedLookupResponse,
  CalendarFeedPreviewResponse,
  CalendarFeedSandboxResponse,
} from "./calendar-feed.contracts";

export const calendarFeedKeys = {
  all: ["calendar-feed"] as const,
  lookups: () => [...calendarFeedKeys.all, "lookup"] as const,
  previews: () => [...calendarFeedKeys.all, "preview"] as const,
  sandbox: () => [...calendarFeedKeys.all, "sandbox"] as const,
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

/**
 * The caller's own sandbox family.
 *
 * A query rather than a mutation, unlike the lookup above: there is exactly one
 * sandbox per admin and the card wants it the moment it opens, with no button
 * to press. The route creates it from the seeded default on a first read, so
 * this never resolves to nothing.
 */
export function useCalendarFeedSandbox() {
  return useQuery<CalendarFeedSandboxResponse, Error>({
    queryKey: calendarFeedKeys.sandbox(),
    queryFn: () => new CalendarFeedService(getClient()).loadSandbox(),
  });
}

/** Replace the stored document with the editor's draft. */
export function useSaveCalendarFeedSandbox() {
  const queryClient = useQueryClient();
  return useMutation<CalendarFeedSandboxResponse, Error, SandboxDefinition>({
    mutationFn: (definition) =>
      new CalendarFeedService(getClient()).saveSandbox(definition),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: calendarFeedKeys.all });
    },
  });
}

/** Restore the seeded family, discarding whatever was stored. */
export function useResetCalendarFeedSandbox() {
  const queryClient = useQueryClient();
  return useMutation<CalendarFeedSandboxResponse, Error, void>({
    mutationFn: () => new CalendarFeedService(getClient()).resetSandbox(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: calendarFeedKeys.all });
    },
  });
}
