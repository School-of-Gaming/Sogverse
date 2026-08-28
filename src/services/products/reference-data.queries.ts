"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import {
  parseJsonResponse,
  readErrorMessage,
} from "@/lib/api/json-response";
import { adminSessionKeys } from "@/services/admin-sessions";
import { updateSiteNotesResponse } from "./reference-data.contracts";
import type { CalendarHoliday, HolidayCalendar } from "@/types";

export type HolidayCalendarWithDates = HolidayCalendar & {
  calendar_holidays: Pick<CalendarHoliday, "date" | "reason">[];
};

export const referenceKeys = {
  holidayCalendars: ["products", "holiday-calendars"] as const,
  consentDocuments: ["products", "consent-documents"] as const,
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
 * One consent document the platform has published, with the version that is
 * current *right now* — the row with the greatest `created_at` for that slug,
 * which is the same derivation the enrolment RPC makes when it stamps an
 * acceptance.
 *
 * `currentVersion` is null only for a slug with no published version at all,
 * which is a data state only a migration could create. The admin form says so
 * rather than hiding the document: a product requiring it would fail to enrol
 * anybody, and that is worth seeing before it is picked.
 */
export interface ConsentDocumentOption {
  slug: string;
  currentVersion: string | null;
}

/**
 * Every consent document a product can be made to require.
 *
 * A direct read through the caller's own client, like the holiday calendars
 * above: the table is a list of published document slugs with no personal data
 * in it, readable by `anon` and `authenticated` alike under migration 00210, so
 * a route would add nothing but a hop.
 *
 * The "current version" is resolved here rather than in SQL because PostgREST
 * has no greatest-n-per-group: the versions ride in on the embed and the
 * greatest `created_at` is picked in JS, with `version` descending as the
 * tiebreaker — the *same* order the database's own writer uses, so the version
 * an admin is shown is the version an enrolment would record.
 */
export function useConsentDocuments() {
  const supabase = getClient();

  return useQuery<ConsentDocumentOption[]>({
    queryKey: referenceKeys.consentDocuments,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consent_documents")
        .select("slug, consent_document_versions(version, created_at)")
        .order("slug");
      if (error) throw error;
      return data.map((row) => ({
        slug: row.slug,
        currentVersion: currentVersionOf(row.consent_document_versions),
      }));
    },
  });
}

function currentVersionOf(
  versions: { version: string; created_at: string }[],
): string | null {
  let current: { version: string; created_at: string } | null = null;
  for (const candidate of versions) {
    if (
      current === null ||
      candidate.created_at > current.created_at ||
      (candidate.created_at === current.created_at &&
        candidate.version > current.version)
    ) {
      current = candidate;
    }
  }
  return current?.version ?? null;
}

export interface UpdateSiteNotesInput {
  location_id: string;
  member?: { address?: string | null; notes?: string | null };
  staff?: { notes?: string | null };
}

/**
 * Write a site's member-visible address/notes and its staff notes.
 *
 * **The only read that carries any of this into a page is the admin product's
 * session document**, so that is what the write invalidates — the invalidation
 * belongs on the mutation rather than on whichever component happened to fire
 * it. The gedu group feed carries the same site fields, but it is not
 * invalidated here and must not be: this route is admin-only, so a client that
 * can reach this mutation has never held a gedu feed, and invalidating one
 * would be a no-op dressed up as thoroughness.
 *
 * Keyed at every product rather than one: a site is shared by every product at
 * the building, and this mutation is not told which of them is on screen. Only
 * mounted queries refetch, and exactly one product document is ever mounted.
 *
 * The invalidation is **returned** rather than fired and forgotten, so the
 * promise the caller awaits does not settle until the refetched address is in
 * the cache — an editor closing on the value it just wrote rather than on the
 * one it replaced.
 */
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
        throw new Error(
          await readErrorMessage(res, "Failed to update site notes")
        );
      }
      return parseJsonResponse(res, updateSiteNotesResponse);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: adminSessionKeys.products(),
      }),
  });
}
