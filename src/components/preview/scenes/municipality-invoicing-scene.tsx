"use client";

import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MunicipalityInvoicingPage } from "@/components/admin/municipality-invoicing/municipality-invoicing-page";
import {
  MUNICIPALITY_INVOICING_NOW,
  buildMunicipalityInvoicingFixture,
  type MunicipalityInvoicingPreviewScenario,
} from "@/components/admin/municipality-invoicing/mock-invoicing-fixtures";

/**
 * **Municipality invoicing** — the CFO's monthly ledger, over fixtures.
 *
 * It renders the *same* client shell the live route renders, handed the same
 * wire document the RPC answers with: every figure on screen is produced by the
 * page's own pure build, so the scene cannot show an invoice the live page would
 * not. What the scene replaces is the two things the route supplies — the
 * document and the clock — and nothing else.
 *
 * **The clock is pinned, and that is why the shell takes a `now`.** Every state
 * this page has is a statement about where a date sits relative to today:
 * recorded, missed, or not yet reached. Read off the live clock, the scene would
 * show a different set of those every day, and after May 2026 no upcoming line
 * at all. The fixture's month is chosen around its pinned instant, so the two
 * travel together.
 *
 * **Nothing here reaches the network, and it is the query client that guarantees
 * it.** The shell's read is a React Query hook seeded with the document it is
 * given; live, the route hydrates the same cache entry server-side. A client
 * whose queries never go stale and never refetch is what keeps that seed the
 * only answer the hook ever has — without it the default one-minute staleness
 * would let a window focus fire the real admin RPC behind the preview and
 * replace these fixtures with production's own month, minutes after the page was
 * opened. It is this shell's business rather than the page's: the route's
 * hydration boundary is the same kind of thing in the other shell.
 *
 * **The month stepper and the club links leave the preview.** Both are real
 * links to the real admin surface — the stepper to another month of the live
 * page, a club name to its product page — which is the honest behaviour for a
 * link whose whole purpose is to be the way out of a row, and the same thing the
 * admin dashboard scene's queue rows do. The scene's own month is the one its
 * scenario names; the empty month is a scenario rather than a step away.
 *
 * Everything the page does on its own works: expanding a municipality, expanding
 * a club's dated sessions, and the one control that opens and closes the lot.
 */
export function MunicipalityInvoicingScene({
  scenario,
}: {
  scenario: MunicipalityInvoicingPreviewScenario;
}) {
  const snapshot = useMemo(
    () => buildMunicipalityInvoicingFixture(scenario),
    [scenario],
  );

  // One client for the sitting, built once. Its defaults are the whole of the
  // no-network guarantee, so they are stated here rather than left to the app's.
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
    <QueryClientProvider client={queryClient}>
      <MunicipalityInvoicingPage
        monthStart={snapshot.month_start}
        initialSnapshot={snapshot}
        now={MUNICIPALITY_INVOICING_NOW}
      />
    </QueryClientProvider>
  );
}
