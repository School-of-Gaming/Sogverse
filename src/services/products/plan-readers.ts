import type { QueryClient } from "@tanstack/react-query";
import { adminDashboardKeys } from "@/services/admin-dashboard/admin-dashboard.keys";
import { adminSessionKeys } from "@/services/admin-sessions/admin-sessions.keys";
import { geduInvoicingKeys } from "@/services/gedu-invoicing/gedu-invoicing.keys";
import { geduSessionKeys } from "@/services/gedu-sessions/gedu-sessions.keys";
import { holidayBreakKeys } from "@/services/holiday-breaks/holiday-breaks.keys";
import { holidayCalendarKeys } from "@/services/holiday-calendars/holiday-calendars.keys";
import { municipalityInvoicingKeys } from "@/services/municipality-invoicing/municipality-invoicing.keys";
import { participationKeys } from "@/services/participations/participations.keys";
import { sessionSubstitutionKeys } from "@/services/session-substitution/session-substitution.keys";
import { productKeys } from "./products.keys";

/**
 * Every cache root whose data derives from a club's plan — its term, its weekly
 * slots and the holiday breaks of the calendar it follows.
 */
export const planReaderRoots = [
  productKeys.all,
  holidayBreakKeys.all,
  holidayCalendarKeys.all,
  participationKeys.all,
  geduSessionKeys.all,
  adminSessionKeys.all,
  sessionSubstitutionKeys.all,
  municipalityInvoicingKeys.all,
  geduInvoicingKeys.all,
  adminDashboardKeys.all,
] as const;

/**
 * Refreshes everything a change to a plan can move, together: what the plans
 * project and which breaks a club shows, which sessions a family and a gedu
 * see, the admin session document, which substitution requests have a session,
 * what a month invoices and pays, what the admin dashboard counts, and which
 * clubs a calendar lists. Both a product save (a term, slot or calendar edit)
 * and a calendar save move them. Invalidating a root costs nothing for the
 * readers not in this admin's cache. Resolves once every read has followed.
 */
export function invalidatePlanReaders(queryClient: QueryClient) {
  return Promise.all(
    planReaderRoots.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}
