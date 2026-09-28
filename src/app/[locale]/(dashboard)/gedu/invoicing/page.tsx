import type { Metadata } from "next";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MyGeduInvoicingHeading,
  MyGeduInvoicingPage,
} from "@/components/gedu-invoicing/my-gedu-invoicing-page";
import {
  invoicingWireReason,
  resolveInvoicingMonthStart,
} from "@/lib/invoicing/month-param";
import { createClient } from "@/lib/supabase/server";
import type { GeduInvoicingSnapshot } from "@/services/gedu-invoicing/gedu-invoicing.contracts";
import { geduInvoicingKeys } from "@/services/gedu-invoicing/gedu-invoicing.keys";
import { GeduInvoicingService } from "@/services/gedu-invoicing/gedu-invoicing.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduInvoicing") };
}

/** The read, or the reason it did not happen. Never both, never neither. */
type SnapshotResult =
  | { ok: true; snapshot: GeduInvoicingSnapshot }
  | { ok: false; reason: string | null };

/**
 * The calling gedu's month, awaited here so the page arrives finished. The RPC
 * answers for the caller alone and is guard-first on the gedu role, which the
 * proxy has already required of this path.
 *
 * A failure is carried rather than flattened into an empty month: "you have
 * nothing to invoice" is a wrong answer a gedu could act on.
 */
async function loadMonth(monthStart: string): Promise<SnapshotResult> {
  // Outside the `try`, for the reason the admin route gives.
  const supabase = await createClient();
  const service = new GeduInvoicingService(supabase);

  try {
    return { ok: true, snapshot: await service.getMyMonth(monthStart) };
  } catch (error) {
    return { ok: false, reason: invoicingWireReason(error) };
  }
}

/**
 * `/gedu/invoicing` — the month this gedu invoices School of Gaming for.
 *
 * A data shell: resolve the month (last month by default, because an invoice
 * is raised for a month that has finished), read it, hydrate it, and hand the
 * document to the client body.
 */
export default async function GeduInvoicingRoute({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const { month } = await searchParams;
  const monthStart = resolveInvoicingMonthStart(month);
  const result = await loadMonth(monthStart);

  if (!result.ok) {
    return <GeduInvoicingLoadFailure reason={result.reason} />;
  }

  const queryClient = new QueryClient();
  queryClient.setQueryData(
    geduInvoicingKeys.myMonth(monthStart),
    result.snapshot,
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MyGeduInvoicingPage
        monthStart={monthStart}
        initialSnapshot={result.snapshot}
      />
    </HydrationBoundary>
  );
}

/** The page's heading over a band saying why there is nothing under it. */
async function GeduInvoicingLoadFailure({ reason }: { reason: string | null }) {
  const t = await getTranslations("geduInvoicing");

  return (
    // Reserved like the page it stands in for, so a failed read shifts nothing
    // either (see the gutter rule in `src/components/layout/CLAUDE.md`).
    <div className="mx-auto max-w-5xl space-y-6 pb-24" data-reserve-scroll-gutter>
      <MyGeduInvoicingHeading />
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
