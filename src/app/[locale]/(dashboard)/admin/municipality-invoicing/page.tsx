import type { Metadata } from "next";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MunicipalityInvoicingHeading,
  MunicipalityInvoicingPage,
} from "@/components/admin/municipality-invoicing/municipality-invoicing-page";
import { wireErrorMessage } from "@/lib/api/wire-error-message";
import { earlierPeriodMonths } from "@/lib/finvoice";
import { InvoiceCustomersService } from "@/services/invoice-customers";
import { resolveInvoicingMonthStart } from "@/lib/invoicing/month-param";
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

/** The read, or the reason it did not happen. Never both, never neither. */
type SnapshotResult =
  | {
      ok: true;
      snapshot: MunicipalityInvoicingSnapshot;
      /** The earlier months of every billing period that ends in this one. */
      periodSnapshots: MunicipalityInvoicingSnapshot[];
    }
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
 *
 * **A month that ends a billing period reads the period's earlier months too.**
 * A quarterly or half-yearly customer's file is produced in its period's last
 * month and covers every month of it, and the page decides that file with the
 * same predicate the export route asks — over the whole period, so a club that
 * ran without a fee in January refuses the quarter in March. Which months to
 * read is decided by the cadences the customers are on, read from the customer
 * list rather than from this month's document: a buyer whose clubs stopped in
 * May still owes the quarter that ends in June, and June's document does not
 * mention it. Most months end no period of a cadence anybody is on, and read
 * nothing more.
 */
async function loadMonth(monthStart: string): Promise<SnapshotResult> {
  // Outside the `try` on purpose. Building the server client reads cookies, and
  // in the App Router a dynamic-render signal travels as a thrown control-flow
  // object — caught here it would be reported to the admin as a failed read and
  // silently break the render it was steering.
  const supabase = await createClient();
  const service = new MunicipalityInvoicingService(supabase);
  const customers = new InvoiceCustomersService(supabase);

  try {
    const [snapshot, customerRows] = await Promise.all([
      service.getMonth(monthStart),
      customers.listInvoiceCustomers(),
    ]);
    const earlier = earlierPeriodMonths(
      monthStart,
      new Set(customerRows.map((row) => row.billing_cadence)),
    );
    const periodSnapshots = await Promise.all(
      earlier.map((month) => service.getMonth(month)),
    );
    return { ok: true, snapshot, periodSnapshots };
  } catch (error) {
    return { ok: false, reason: wireErrorMessage(error) };
  }
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
  const monthStart = resolveInvoicingMonthStart(month);
  const result = await loadMonth(monthStart);

  if (!result.ok) {
    return <MunicipalityInvoicingLoadFailure reason={result.reason} />;
  }

  // Named through the hook's own key factory rather than a literal: a key one
  // segment off does not fail, it fills an entry nobody reads and buys nothing.
  const queryClient = new QueryClient();
  for (const snapshot of [result.snapshot, ...result.periodSnapshots]) {
    queryClient.setQueryData(
      municipalityInvoicingKeys.month(snapshot.month_start),
      snapshot,
    );
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MunicipalityInvoicingPage
        monthStart={monthStart}
        initialSnapshot={result.snapshot}
        initialPeriodSnapshots={result.periodSnapshots}
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
