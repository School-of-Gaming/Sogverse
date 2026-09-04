"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { AdminDashboardPageBody } from "@/components/admin/dashboard/admin-dashboard-page-body";
import {
  buildAdminDashboardFixture,
  type AdminDashboardScenario,
} from "@/components/admin/dashboard/mock-dashboard-fixtures";
import { resolveLocale } from "@/lib/constants/locales";

/**
 * The `/admin` landing page, over fixtures.
 *
 * It renders the **same body the live route renders**, with a fixture set
 * standing in for the read that feeds it — a showcase that cannot drift, because
 * there is only one body and the scene is one of its two shells. Nothing here
 * queries, mutates or writes: every row link points at the real admin surface it
 * would open, and clicking one leaves the preview, which is the honest behaviour
 * for a link whose whole purpose is to be the way out of the queue.
 *
 * **Certify works, against local state, and it has to be this shell that makes
 * it work.** The queue drops a row once the write resolves *and* the list it was
 * given stops offering that id — the second half is what protects it from a
 * receipt that outlives the fact, when somebody un-certifies an account from the
 * users list while this page is open. Live, the mutation awaits its own
 * invalidation, so the refetched snapshot has already dropped the id by the time
 * the promise resolves. A scene that resolved an untouched fixture would satisfy
 * the first half and fail the second, and the row would sit at "Certifying…"
 * for the rest of the sitting — the button is deliberately never re-enabled on
 * success, because live the row is about to disappear. So the certified ids are
 * held here and filtered out of the list, which is the same two-part shape the
 * live path has, with a `Set` where the RPC is.
 *
 * The fixture is memoised rather than rebuilt per render. Nothing in it depends
 * on a live clock — the whole scene is pinned to a fixed Monday morning, because
 * a calendar page's cases (a term straddling the window, a today column) are
 * arithmetic against a known date — so this is about work, not about drift:
 * sixteen weeks resolved over sixty products is not something to redo every
 * time a tab is switched. It depends on the *locale* rather than being built
 * once and kept, because the one `Intl`-formatted string inside it (how long a
 * gedu has waited) has to follow a previewer who switches language.
 */
export function AdminDashboardScene({
  scenario,
}: {
  scenario: AdminDashboardScenario;
}) {
  const locale = resolveLocale(useLocale());
  const fixture = useMemo(
    () => buildAdminDashboardFixture(scenario, locale),
    [scenario, locale],
  );

  const [certified, setCertified] = useState<ReadonlySet<string>>(new Set());

  /**
   * Certifications belong to the scenario they were made in. The two scenarios
   * are the same component at the same position in the tree, so React keeps
   * this state across a step between them unless it is told not to — and
   * without the reset, certifying somebody in `busy`, stepping to `quiet` and
   * stepping back would show `busy` already missing a row nobody touched there:
   * a preview lying about its own starting state.
   */
  const [shownScenario, setShownScenario] = useState(scenario);
  if (shownScenario !== scenario) {
    setShownScenario(scenario);
    setCertified(new Set());
  }

  const data = useMemo(
    () => ({
      ...fixture,
      uncertifiedGedus: fixture.uncertifiedGedus.filter(
        (gedu) => !certified.has(gedu.id),
      ),
    }),
    [fixture, certified],
  );

  const handleCertify = useCallback((geduId: string) => {
    setCertified((current) => new Set(current).add(geduId));
    return Promise.resolve();
  }, []);

  return <AdminDashboardPageBody data={data} onCertifyGedu={handleCertify} />;
}
