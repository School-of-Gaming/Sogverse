import type { Metadata } from "next";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { getTranslations } from "next-intl/server";
import { AdminDashboardPage } from "@/components/admin/dashboard/AdminDashboardPage";
import { createClient } from "@/lib/supabase/server";
import {
  AdminDashboardService,
  adminDashboardKeys,
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
  // Outside the `try` on purpose. Building the server client reads cookies, and
  // in the App Router a dynamic-render signal travels as a thrown control-flow
  // object — caught here it would be reported to the admin as a failed read and
  // silently break the render it was steering.
  const supabase = await createClient();
  const service = new AdminDashboardService(supabase);

  try {
    return { ok: true, snapshot: await service.getDashboard() };
  } catch (error) {
    return { ok: false, reason: wireReason(error) };
  }
}

/**
 * The message off the wire, or `null` for anything that is not one.
 *
 * Two very different things throw out of that read. Postgres refusing or
 * failing produces an error carrying a `code` and a `message` written to be
 * read — "permission denied for function get_admin_dashboard" — and splicing
 * that into the band tells the admin something they can act on. The other is a
 * schema mismatch: the RPC answered and the answer did not parse, and a
 * `ZodError`'s `message` is a JSON dump of every issue, which would render as a
 * wall of brackets in a one-line band. So the reason is taken only from the
 * wire-shaped error and everything else — a parse failure, a network fault, a
 * bug — falls to the generic sentence. Nothing is lost by that: the detail
 * belongs in the server log, and none of it was addressed to an admin.
 */
function wireReason(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if (!("code" in error) || !("message" in error)) return null;
  const { code, message } = error;
  if (typeof code !== "string" || typeof message !== "string") return null;
  return message.length > 0 ? message : null;
}

/**
 * `/admin` — the ops queue an admin starts their day in.
 *
 * The route reads the snapshot and hands it to the client shell, which owns
 * everything after: the mapping, the clock, the viewer's zone, and the one write
 * on the page. **There is no loading state anywhere below this line** — the
 * first paint is the finished dashboard, because the data was already in hand
 * when the HTML was written.
 *
 * **The snapshot reaches the query cache by hydration, and that is what makes a
 * return visit worth the server's work.** A soft navigation back here re-runs
 * this route, so the RPC is answered again — but a seed handed down as
 * `initialData` is consulted only when the key is empty, and by then it is not.
 * The fresh document would be dropped, the stale entry rendered, and a second
 * copy of the same platform-wide aggregate fired off from the browser to catch
 * up. Hydrating writes it into the entry instead, by recency, so the newest
 * answer wins and nothing is fetched twice. The shell still takes the snapshot
 * as a prop — that is what makes the query's `data` non-optional and its
 * no-loading-branch a compile-time fact rather than a convention.
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

  // Named through the hook's own key factory rather than a literal: a key one
  // segment off does not fail, it fills an entry nobody reads and buys nothing.
  const queryClient = new QueryClient();
  queryClient.setQueryData(adminDashboardKeys.snapshot(), result.snapshot);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminDashboardPage initialSnapshot={result.snapshot} />
    </HydrationBoundary>
  );
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
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      {/* The reason is a message off the wire, never translated copy — it is
          spliced into a sentence that is, which is why there are two keys rather
          than one with an optionally-empty argument. */}
      <p className="rounded-lg border border-destructive bg-muted p-4 text-sm text-destructive">
        {reason === null ? t("loadError") : t("loadErrorWithReason", { reason })}
      </p>
    </div>
  );
}
