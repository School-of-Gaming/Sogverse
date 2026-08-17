/**
 * One key, because there is one query. The hierarchy is still written out so a
 * mutation elsewhere that changes what the dashboard says can invalidate
 * `adminDashboardKeys.all` and have this read follow — and four of them do:
 * certifying a gedu (the shell that owns the action, since the gedu mutation is
 * a general one), every action in the admin group panel including waitlist
 * promote/demote (the groups feature invalidates both keys together), and
 * creating or updating a product.
 *
 * They are all *admin* writes, which is the line: this entry only ever exists in
 * an admin's own cache, so a customer-side write has nothing here to invalidate
 * and reaches the dashboard through its own next read instead.
 *
 * **Deliberately not in `admin-dashboard.queries.ts`,** for the same reason the
 * family-feed, participations and gedu-session factories are not in theirs: that
 * file is `"use client"`, so a server component importing from it gets a client
 * reference rather than the object. The `/admin` route hydrates this cache entry
 * server-side and has to name the very key the hook reads.
 */
export const adminDashboardKeys = {
  all: ["admin-dashboard"] as const,
  snapshot: () => [...adminDashboardKeys.all, "snapshot"] as const,
};
