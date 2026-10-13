/**
 * The holiday calendar cache keys. In a file of their own so the product
 * mutations can invalidate them without importing the calendar queries, which
 * import the product keys in turn: saving a club changes which clubs a
 * calendar's list row counts and its page lists.
 */
export const holidayCalendarKeys = {
  all: ["holiday-calendars"] as const,
  list: () => [...holidayCalendarKeys.all, "list"] as const,
  details: () => [...holidayCalendarKeys.all, "detail"] as const,
  detail: (id: string) => [...holidayCalendarKeys.details(), id] as const,
};
