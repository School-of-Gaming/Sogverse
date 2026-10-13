"use client";

import { formatInTimeZone } from "date-fns-tz";
import { useNow, useTimezone } from "@/providers";

/**
 * Today as a bare date in the viewer's own zone. A holiday break is a bare
 * date range read in each club's zone, and a calendar belongs to no one club,
 * so the admin's own today is what "the next break" and the date pickers'
 * today marker are measured from.
 */
export function useViewerToday(): string {
  return formatInTimeZone(useNow(), useTimezone(), "yyyy-MM-dd");
}
