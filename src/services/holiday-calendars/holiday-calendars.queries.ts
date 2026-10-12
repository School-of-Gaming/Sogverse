"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { adminDashboardKeys } from "@/services/admin-dashboard/admin-dashboard.keys";
import { adminSessionKeys } from "@/services/admin-sessions/admin-sessions.keys";
import { geduInvoicingKeys } from "@/services/gedu-invoicing/gedu-invoicing.keys";
import { geduSessionKeys } from "@/services/gedu-sessions/gedu-sessions.keys";
import { municipalityInvoicingKeys } from "@/services/municipality-invoicing/municipality-invoicing.keys";
import { participationKeys } from "@/services/participations/participations.keys";
import { productKeys } from "@/services/products/products.queries";
import { sessionSubstitutionKeys } from "@/services/session-substitution/session-substitution.keys";
import { HolidayCalendarsService } from "./holiday-calendars.service";
import type {
  HolidayBreakInput,
  HolidayCalendarInput,
} from "./holiday-calendars.contracts";

export const holidayCalendarKeys = {
  all: ["holiday-calendars"] as const,
  list: () => [...holidayCalendarKeys.all, "list"] as const,
  details: () => [...holidayCalendarKeys.all, "detail"] as const,
  detail: (id: string) => [...holidayCalendarKeys.details(), id] as const,
};

/**
 * Everything a saved calendar can change, refreshed together.
 *
 * A calendar's breaks are dates missing from every club that follows it, past
 * months included, so a save moves what each of those clubs' plans project,
 * which sessions a family and a gedu see, what a month invoices and pays, which
 * substitution requests have a session, and what the admin dashboard counts.
 * Each of those reads keys under one of these roots; invalidating the roots
 * costs nothing for the ones not in this admin's cache.
 */
function invalidateCalendarReaders(queryClient: QueryClient) {
  return Promise.all(
    [
      holidayCalendarKeys.all,
      productKeys.all,
      participationKeys.all,
      geduSessionKeys.all,
      adminSessionKeys.all,
      sessionSubstitutionKeys.all,
      municipalityInvoicingKeys.all,
      geduInvoicingKeys.all,
      adminDashboardKeys.all,
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

/** Every calendar, ordered by name. Admin-only by RLS. */
export function useHolidayCalendars() {
  const service = new HolidayCalendarsService(getClient());

  return useQuery({
    queryKey: holidayCalendarKeys.list(),
    queryFn: () => service.listHolidayCalendars(),
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
    // Returned, so mutateAsync resolves only once the reads have followed.
    onSuccess: () => invalidateCalendarReaders(queryClient),
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
