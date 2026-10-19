"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { invalidatePlanReaders } from "@/services/products/plan-readers";
import { holidayCalendarKeys } from "./holiday-calendars.keys";
import { HolidayCalendarsService } from "./holiday-calendars.service";
import type {
  HolidayBreakInput,
  HolidayCalendarInput,
} from "./holiday-calendars.contracts";

export { holidayCalendarKeys };

/**
 * Every calendar, ordered by name. Admin-only by RLS. `enabled: false` keeps
 * the read off a page that only sometimes needs it.
 */
export function useHolidayCalendars({ enabled = true }: { enabled?: boolean } = {}) {
  const service = new HolidayCalendarsService(getClient());

  return useQuery({
    queryKey: holidayCalendarKeys.list(),
    queryFn: () => service.listHolidayCalendars(),
    enabled,
  });
}

/** One calendar by id, with its breaks and the clubs following it. */
export function useHolidayCalendar(id: string) {
  const service = new HolidayCalendarsService(getClient());

  return useQuery({
    queryKey: holidayCalendarKeys.detail(id),
    queryFn: () => service.getHolidayCalendar(id),
  });
}

export function useCreateHolidayCalendar() {
  const queryClient = useQueryClient();
  const service = new HolidayCalendarsService(getClient());

  return useMutation({
    mutationFn: (input: HolidayCalendarInput) =>
      service.createHolidayCalendar(input),
    // A new calendar is followed by nobody yet, so only the list moves.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: holidayCalendarKeys.all }),
  });
}

export function useUpdateHolidayCalendar() {
  const queryClient = useQueryClient();
  const service = new HolidayCalendarsService(getClient());

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: HolidayCalendarInput }) =>
      service.updateHolidayCalendar(id, input),
    // A calendar's breaks are dates missing from every club that follows it,
    // past months included, so a save moves every plan reader. Returned, so
    // mutateAsync resolves only once the reads have followed.
    onSuccess: () => invalidatePlanReaders(queryClient),
  });
}

/**
 * What saving would change, asked on demand at Save. A mutation rather than a
 * query: it is asked once per press with the form's current breaks, never
 * cached, and nothing else reads its answer.
 */
export function usePreviewHolidayCalendarChange() {
  const service = new HolidayCalendarsService(getClient());

  return useMutation({
    mutationFn: ({
      id,
      breaks,
    }: {
      id: string;
      breaks: readonly HolidayBreakInput[];
    }) => service.previewHolidayCalendarChange(id, breaks),
  });
}
