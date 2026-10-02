"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminGeduInvoicingPage } from "@/components/gedu-invoicing/admin-gedu-invoicing-page";
import { MyGeduInvoicingPage } from "@/components/gedu-invoicing/my-gedu-invoicing-page";
import {
  GEDU_INVOICING_NOW,
  GEDU_INVOICING_WORKING_MONTH,
  MY_GEDU_INVOICING_VIEWERS,
  geduInvoicingMonthFixture,
  resolvePreviewGeduInvoicingMonth,
  type AdminGeduInvoicingPreviewScenario,
  type MyGeduInvoicingPreviewScenario,
} from "@/components/gedu-invoicing/mock-gedu-invoicing-fixtures";
import type { MonthHref } from "@/components/invoicing-ledger/month-stepper";
import { previewSceneHref } from "@/components/preview/href";

/**
 * **Gedu invoicing, both readers** — the admin's ledger of every gedu, and a
 * gedu's own month, over one fixture document.
 *
 * Each renders the *same* client shell its live route renders, handed the wire
 * document the RPC answers with, so every figure is the page's own pure build.
 * What the scene replaces is what the route supplies — the document, the clock
 * and where the month stepper points — and nothing else, for the reasons the
 * municipality invoicing scene gives: the clock is pinned because every line is
 * a claim about where a date sits against today, the stepper stays in the
 * preview because it is how the empty month is reached, and the query client
 * never refetches so the real role-gated read can never replace the fixtures.
 */
export function AdminGeduInvoicingScene({
  scenario,
}: {
  scenario: AdminGeduInvoicingPreviewScenario;
}) {
  const monthStart = usePreviewMonth();
  const snapshot = useMemo(
    () => geduInvoicingMonthFixture(monthStart),
    [monthStart],
  );

  return (
    <FixtureQueryClient>
      <AdminGeduInvoicingPage
        monthStart={monthStart}
        initialSnapshot={snapshot}
        now={GEDU_INVOICING_NOW}
        monthHref={(month) => adminPreviewMonthHref(scenario, month)}
      />
    </FixtureQueryClient>
  );
}

/**
 * The gedu's own month, as the scenario's viewer — the document narrowed to one
 * gedu, the way the gedu's read answers.
 */
export function MyGeduInvoicingScene({
  scenario,
}: {
  scenario: MyGeduInvoicingPreviewScenario;
}) {
  const monthStart = usePreviewMonth();
  const snapshot = useMemo(
    () =>
      geduInvoicingMonthFixture(
        monthStart,
        MY_GEDU_INVOICING_VIEWERS[scenario],
      ),
    [monthStart, scenario],
  );

  return (
    <FixtureQueryClient>
      <MyGeduInvoicingPage
        monthStart={monthStart}
        initialSnapshot={snapshot}
        now={GEDU_INVOICING_NOW}
        monthHref={(month) => myPreviewMonthHref(scenario, month)}
        // The downloads render as they do live and fetch nothing: the route
        // answers for the signed-in gedu, and the reviewer here is an admin
        // looking at fixtures.
        onDownloadClick={(event) => event.preventDefault()}
      />
    </FixtureQueryClient>
  );
}

/** `?month=` is the scene's own parameter — one control on one page. */
function usePreviewMonth(): string {
  return resolvePreviewGeduInvoicingMonth(useSearchParams().get("month"));
}

/**
 * One client for the sitting whose queries never go stale and never refetch:
 * the seed is the only answer the shell's hook ever has.
 */
function FixtureQueryClient({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: Infinity,
            gcTime: Infinity,
            retry: false,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function adminPreviewMonthHref(
  scenario: AdminGeduInvoicingPreviewScenario,
  month: string,
): MonthHref {
  return previewMonthHref("gedu-invoicing", scenario, month);
}

function myPreviewMonthHref(
  scenario: MyGeduInvoicingPreviewScenario,
  month: string,
): MonthHref {
  return previewMonthHref("gedu-my-invoicing", scenario, month);
}

/**
 * A step of the stepper, back at this scene's own path. The working month is
 * spelled without a parameter, so the page first opened and the page stepped
 * back to are one URL.
 */
function previewMonthHref(
  surface: string,
  scenario: string,
  month: string,
): MonthHref {
  const href = previewSceneHref(surface, scenario);
  if (`${month}-01` === GEDU_INVOICING_WORKING_MONTH) return href;
  return { ...href, query: { month } };
}
