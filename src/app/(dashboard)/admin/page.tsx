import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminDashboardPage } from "@/components/admin/dashboard/AdminDashboardPage";
import { createClient } from "@/lib/supabase/server";
import {
  AdminDashboardService,
  type AdminDashboardSnapshot,
} from "@/services/admin-dashboard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminDashboard"), description: "Manage users, products, and system settings" };
}

/** The read, or the reason it did not happen. Never both, never neither. */
type SnapshotResult =
  | { ok: true; snapshot: AdminDashboardSnapshot }
  | { ok: false; reason: string | null };

/**
 * The whole dashboard, awaited here rather than asked for from the browser.
 *
 * It is one platform-wide read that the page cannot render a single band
 * without, which makes it exactly the read worth moving to the server: a
 * skeleton is what you show when the data is a round trip away *and* the trip
 * has to start in the browser, and neither is true here. The RPC is guard-first
 * on `assert_admin()`, so calling it with the admin's own server-side session is
 * the same call the browser was making — one network hop earlier, against a
 * client that already holds the session cookie.
 *
 * **A failure is carried, not flattened.** Every band on this page comes out of
 * this one document, so there is no partial page to fall back to and no empty
 * shape that would not be a lie; the route renders the failure instead of the
 * dashboard, and the message off the wire travels with it.
 */
async function loadSnapshot(): Promise<SnapshotResult> {
  try {
    const supabase = await createClient();
    const service = new AdminDashboardService(supabase);
    return { ok: true, snapshot: await service.getDashboard() };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error && error.message.length > 0
          ? error.message
          : null,
    };
  }
}

/**
 * `/admin` — the ops queue an admin starts their day in.
 *
 * The route reads the snapshot and hands it to the client shell, which seeds
 * React Query with it and owns everything after: the mapping, the clock, the
 * viewer's zone, and the one write on the page. **There is no loading state
 * anywhere below this line** — the first paint is the finished dashboard,
 * because the data was already in hand when the HTML was written.
 *
 * Nothing pins the route dynamic explicitly and nothing needs to: the Supabase
 * server client reads cookies, which is what makes a request-scoped render
 * request-scoped. It is the same reason every other dashboard route here has no
 * segment config either.
 *
 * The clock and the zone are deliberately *not* resolved here. They arrive
 * through the providers the root layout already seeds from the request — the
 * shell reads them with `useNow()` / `useTimezone()`, which return those same
 * seeded values during SSR and on the first client render alike. Resolving a
 * second "now" at this level would be a second clock on a page whose whole
 * design is that it has one.
 */
export default async function AdminDashboardRoute() {
  const result = await loadSnapshot();

  if (!result.ok) {
    return <AdminDashboardLoadFailure reason={result.reason} />;
  }

  return <AdminDashboardPage initialSnapshot={result.snapshot} />;
}

/**
 * The page's chrome over a band saying why there is nothing under it.
 *
 * The heading and its sub-line are the route's own words and wait on nothing, so
 * they are here exactly as they are on the loaded page. Below them is the
 * failure and nothing else — an empty queue and an empty schedule would say the
 * platform is fine when what happened is that nobody asked it.
 */
async function AdminDashboardLoadFailure({ reason }: { reason: string | null }) {
  const t = await getTranslations("admin.dashboard");

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      {/* The reason is a message off the wire, never translated copy — it is
          spliced into a sentence that is, which is why there are two keys rather
          than one with an optionally-empty argument. */}
      <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {reason === null ? t("loadError") : t("loadErrorWithReason", { reason })}
      </p>
    </div>
  );
}
