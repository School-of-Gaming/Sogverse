"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MunicipalityInvoicingPage } from "@/components/admin/municipality-invoicing/municipality-invoicing-page";
import {
  MUNICIPALITY_INVOICING_NOW,
  MUNICIPALITY_INVOICING_WORKING_MONTH,
  municipalityInvoicingMonthFixture,
  resolvePreviewInvoicingMonth,
  type MunicipalityInvoicingPreviewScenario,
} from "@/components/admin/municipality-invoicing/mock-invoicing-fixtures";
import { previewSceneHref } from "@/components/preview/href";
import type { MonthHref } from "@/components/admin/municipality-invoicing/municipality-invoicing-page";

/**
 * **Municipality invoicing** — the CFO's monthly ledger, over fixtures.
 *
 * It renders the *same* client shell the live route renders, handed the same
 * wire document the RPC answers with: every figure on screen is produced by the
 * page's own pure build, so the scene cannot show an invoice the live page would
 * not. What the scene replaces is the three things the route supplies — the
 * document, the clock, and where the month stepper points — and nothing else.
 *
 * **The clock is pinned, and that is why the shell takes a `now`.** Every state
 * this page has is a statement about where a date sits relative to today:
 * recorded, missed, or not yet reached. Read off the live clock, the scene would
 * show a different set of those every day, and after May 2026 no upcoming line
 * at all. The fixture's month is chosen around its pinned instant, so the two
 * travel together — and the pin does *not* move when the reader steps the month,
 * because "today" is a property of the sitting rather than of the month on
 * screen.
 *
 * **The month stepper stays inside the preview, and it is how the empty month is
 * reached.** The stepper is one of the page's own controls, so a stepper that
 * navigated out to the live admin route would be the one control on the scene a
 * reviewer could not use twice. Instead the scene owns the `?month=` parameter
 * and answers it from the fixtures: the working month has the ledger, and every
 * other month is genuinely empty, because these clubs run one spring term. That
 * is why an empty month is not a scenario here — it is a step away and a step
 * back, on the same page, in the same chrome, which is more than a second link
 * could have shown.
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
 * **The club links still leave the preview.** A club name is a real link to its
 * real admin product page, which is the honest behaviour for a link whose whole
 * purpose is to be the way out of a row, and the same thing the admin dashboard
 * scene's queue rows do. The month stepper used to be in that company and no
 * longer is, for the reason above: it does not leave a row, it drives the page.
 *
 * Everything else the page does on its own works: expanding a municipality,
 * expanding a club's dated sessions, and the one control that opens and closes
 * the lot.
 */
export function MunicipalityInvoicingScene({
  scenario,
}: {
  scenario: MunicipalityInvoicingPreviewScenario;
}) {
  // `?month=` is the scene's own parameter, read here rather than threaded
  // through the renderer: it is not an axis over every scene, it is one control
  // on one page, and the page it belongs to is a client component already.
  const requested = useSearchParams().get("month");
  const monthStart = resolvePreviewInvoicingMonth(requested);

  const snapshot = useMemo(
    () => municipalityInvoicingMonthFixture(monthStart),
    [monthStart],
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
        monthStart={monthStart}
        initialSnapshot={snapshot}
        now={MUNICIPALITY_INVOICING_NOW}
        monthHref={(month) => previewMonthHref(scenario, month)}
      />
    </QueryClientProvider>
  );
}

/**
 * A step of the stepper, back at this scene's own path.
 *
 * The working month is spelled without a parameter, so the page the reviewer
 * first opened and the page they step back to are the same URL rather than two
 * URLs showing the same month.
 */
function previewMonthHref(
  scenario: MunicipalityInvoicingPreviewScenario,
  month: string,
): MonthHref {
  const href = previewSceneHref("municipality-invoicing", scenario);
  if (month === MUNICIPALITY_INVOICING_WORKING_MONTH) return href;
  return { ...href, query: { month: month.slice(0, 7) } };
}
