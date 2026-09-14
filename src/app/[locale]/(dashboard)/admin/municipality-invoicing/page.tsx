import type { Metadata } from "next";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MunicipalityInvoicingHeading,
  MunicipalityInvoicingPage,
} from "@/components/admin/municipality-invoicing/municipality-invoicing-page";
import { monthsAfter } from "@/lib/calendar-date";
import { createClient } from "@/lib/supabase/server";
import {
  MunicipalityInvoicingService,
  municipalityInvoicingKeys,
  type MunicipalityInvoicingSnapshot,
} from "@/services/municipality-invoicing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminMunicipalityInvoicing") };
}

/**
 * The zone every month on this page is measured in.
 *
 * Municipalities are Finnish — that is what a municipality club is — so the
 * month an invoice defaults to is the month it is in Finland, not the month it
 * is wherever the server happens to be running. On the first and last day of a
 * month those are different answers, and the one that matters is the CFO's.
 */
const INVOICING_TIME_ZONE = "Europe/Helsinki";

/**
 * `?month=YYYY-MM`, and nothing else — with the year inside this century.
 *
 * The year bound is not tidiness. `0007-03` and `9999-12` are both spelled
 * correctly, so a regex on the *shape* alone hands them to Postgres, which
 * happily answers a month nobody has ever invoiced and never will. A value that
 * cannot be a month anybody means is the same kind of wrong as a malformed one,
 * and takes the same answer: the default month.
 */
const MONTH_PARAM = /^20\d{2}-(0[1-9]|1[0-2])$/;

/**
 * Which month the page is showing: the one the URL names, or the previous one.
 *
 * **The default is last month, not this one.** An invoice is raised for a month
 * that has finished — a half-month of sessions is not something anybody sends —
 * so the month the CFO wants on opening the page is the one that just ended,
 * and the stepper is right there for the two other months they might want.
 *
 * A malformed, absent or absurd parameter falls to that default rather than
 * refusing. There is nothing dangerous in the value — it selects a read that is
 * already admin-gated — and a 404 for a mistyped URL would cost the reader the
 * page they can plainly see the rest of.
 */
function resolveMonthStart(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value !== undefined && MONTH_PARAM.test(value)) return `${value}-01`;

  const today = formatInTimeZone(new Date(), INVOICING_TIME_ZONE, "yyyy-MM-dd");
  return monthsAfter(`${today.slice(0, 7)}-01`, -1);
}

/** The read, or the reason it did not happen. Never both, never neither. */
type SnapshotResult =
  | { ok: true; snapshot: MunicipalityInvoicingSnapshot }
  | { ok: false; reason: string | null };

/**
 * The month, awaited here rather than asked for from the browser.
 *
 * It is one platform-wide read that the page cannot render a single line
 * without, which makes it exactly the read worth moving to the server. The RPC
 * is guard-first on `assert_admin()`, so calling it with the admin's own
 * server-side session is the same call the browser was making — one network hop
 * earlier, against a client that already holds the session cookie.
 *
 * **A failure is carried, not flattened.** Every total on this page comes out of
 * this one document, and an empty invoice is a lie an accountant could act on:
 * "no clubs ran" and "nobody asked" must never look the same. The route renders
 * the failure instead of the invoice, and the message off the wire travels with
 * it — including the refusal a mid-month argument would raise, which is a
 * sentence an admin can act on.
 */
async function loadMonth(monthStart: string): Promise<SnapshotResult> {
  // Outside the `try` on purpose. Building the server client reads cookies, and
  // in the App Router a dynamic-render signal travels as a thrown control-flow
  // object — caught here it would be reported to the admin as a failed read and
  // silently break the render it was steering.
  const supabase = await createClient();
  const service = new MunicipalityInvoicingService(supabase);

  try {
    return { ok: true, snapshot: await service.getMonth(monthStart) };
  } catch (error) {
    return { ok: false, reason: wireReason(error) };
  }
}

/**
 * The message off the wire, or `null` for anything that is not one.
 *
 * Postgres refusing or failing produces an error carrying a `code` and a
 * `message` written to be read, and splicing that into the band tells the admin
 * something they can act on. A schema mismatch does not: a `ZodError`'s message
 * is a JSON dump of every issue, which would render as a wall of brackets. So
 * the reason is taken only from the wire-shaped error, and everything else — a
 * parse failure, a network fault, a bug — falls to the generic sentence.
 */
function wireReason(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if (!("code" in error) || !("message" in error)) return null;
  const { code, message } = error;
  if (typeof code !== "string" || typeof message !== "string") return null;
  return message.length > 0 ? message : null;
}

/**
 * `/admin/municipality-invoicing` — the month a municipality is billed for.
 *
 * The route resolves the month, reads it, and hands the document to the client
 * shell, which owns everything after: the counting, the totals and the clock.
 * **There is no loading state anywhere below this line** — the first paint is
 * the finished invoice, because the data was already in hand when the HTML was
 * written.
 *
 * **The document reaches the query cache by hydration.** A step to another month
 * re-runs this route, so the RPC is answered again; a seed handed down as
 * `initialData` would be ignored for a month already in the cache, and the
 * fresh answer dropped. Hydrating writes it into the entry instead, by recency.
 * The shell still takes the snapshot as a prop — that is what makes the query's
 * `data` non-optional and its no-loading-branch a compile-time fact.
 */
export default async function MunicipalityInvoicingRoute({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const { month } = await searchParams;
  const monthStart = resolveMonthStart(month);
  const result = await loadMonth(monthStart);

  if (!result.ok) {
    return <MunicipalityInvoicingLoadFailure reason={result.reason} />;
  }

  // Named through the hook's own key factory rather than a literal: a key one
  // segment off does not fail, it fills an entry nobody reads and buys nothing.
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    municipalityInvoicingKeys.month(monthStart),
    result.snapshot,
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MunicipalityInvoicingPage
        monthStart={monthStart}
        initialSnapshot={result.snapshot}
      />
    </HydrationBoundary>
  );
}

/**
 * The page's chrome over a band saying why there is nothing under it.
 *
 * The heading waits on nothing, so it is **the same component** the loaded page
 * renders rather than the same two lines written again. Written again, it drifted:
 * a display heading over the failure and a working-surface heading over the
 * ledger, so the page appeared to change size according to whether the read
 * succeeded — in precisely the state where the reader is already being told that
 * something went wrong. Below it is the failure and nothing else: an empty month
 * would say no municipality is owed anything, which is the one wrong answer this
 * page must never give.
 */
async function MunicipalityInvoicingLoadFailure({
  reason,
}: {
  reason: string | null;
}) {
  const t = await getTranslations("admin.municipalityInvoicing");

  return (
    <div className="space-y-3 pb-12">
      <MunicipalityInvoicingHeading />
      {/* The reason is a message off the wire, never translated copy — it is
          spliced into a sentence that is, which is why there are two keys rather
          than one with an optionally-empty argument. */}
      <Alert variant="destructive">
        <AlertDescription>
          {reason === null
            ? t("loadError")
            : t("loadErrorWithReason", { reason })}
        </AlertDescription>
      </Alert>
    </div>
  );
}
