import type { Metadata } from "next";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AdminGeduInvoicingHeading,
  AdminGeduInvoicingPage,
} from "@/components/gedu-invoicing/admin-gedu-invoicing-page";
import { wireErrorMessage } from "@/lib/api/wire-error-message";
import { resolveInvoicingMonthStart } from "@/lib/invoicing/month-param";
import { createClient } from "@/lib/supabase/server";
import type { GeduInvoicingSnapshot } from "@/services/gedu-invoicing/gedu-invoicing.contracts";
import { geduInvoicingKeys } from "@/services/gedu-invoicing/gedu-invoicing.keys";
import { GeduInvoicingService } from "@/services/gedu-invoicing/gedu-invoicing.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminGeduInvoicing") };
}

/** The read, or the reason it did not happen. Never both, never neither. */
type SnapshotResult =
  | { ok: true; snapshot: GeduInvoicingSnapshot }
  | { ok: false; reason: string | null };

/**
 * The month, awaited here so the page arrives finished. The RPC is guard-first
 * on `assert_admin()`, so the admin's own server-side session is the same call
 * the browser would make.
 *
 * **A failure is carried, not flattened**: an empty month and a failed read
 * must never look the same, because "nobody is owed anything" is an answer
 * somebody could act on.
 */
async function loadMonth(monthStart: string): Promise<SnapshotResult> {
  // Outside the `try`: building the server client reads cookies, and a
  // dynamic-render signal travels as a thrown control-flow object that must not
  // be reported as a failed read.
  const supabase = await createClient();
  const service = new GeduInvoicingService(supabase);

  try {
    return { ok: true, snapshot: await service.getAdminMonth(monthStart) };
  } catch (error) {
    return { ok: false, reason: wireErrorMessage(error) };
  }
}

/**
 * `/admin/gedu-invoicing` — what every gedu invoices School of Gaming for, one
 * month at a time.
 *
 * The route resolves the month, reads it and hydrates it into the query cache
 * the shell reads, the same arrangement as the municipality ledger: a step to
 * another month re-runs this route, and hydration writes the fresh answer into
 * the entry by recency where a seed would be ignored.
 */
export default async function AdminGeduInvoicingRoute({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const { month } = await searchParams;
  const monthStart = resolveInvoicingMonthStart(month);
  const result = await loadMonth(monthStart);

  if (!result.ok) {
    return <AdminGeduInvoicingLoadFailure reason={result.reason} />;
  }

  const queryClient = new QueryClient();
  queryClient.setQueryData(
    geduInvoicingKeys.adminMonth(monthStart),
    result.snapshot,
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminGeduInvoicingPage
        monthStart={monthStart}
        initialSnapshot={result.snapshot}
      />
    </HydrationBoundary>
  );
}

/** The page's heading over a band saying why there is nothing under it. */
async function AdminGeduInvoicingLoadFailure({
  reason,
}: {
  reason: string | null;
}) {
  const t = await getTranslations("geduInvoicing");

  return (
    <div className="space-y-3 pb-12">
      <AdminGeduInvoicingHeading />
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
