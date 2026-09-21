"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { AdminSubstitutionsPageBody } from "@/components/admin/substitutions/admin-substitutions-page-body";
import { buildAdminSubstitutionsData } from "@/components/admin/substitutions/build-admin-substitutions-data";
import {
  ADMIN_SUBSTITUTIONS_NOW,
  ADMIN_SUBSTITUTIONS_TIMEZONE,
  buildAdminSubstitutionsFixture,
  type AdminSubstitutionsScenario,
} from "@/components/admin/substitutions/mock-substitutions-fixtures";
import { resolveLocale } from "@/lib/constants/locales";

/**
 * `/admin/substitutions`, over fixtures.
 *
 * It renders the **same body the live route renders**, and it feeds that body
 * through the **same mapping** — the fixtures are the wire document, not the
 * view model, so the soonest-first sort, the 24-hour urgency threshold, the
 * occurrence resolution and the viewer's zone line are the real ones under the
 * preview rather than values a fixture asserted.
 *
 * **Pinned to Monday 17 August 2026, 09:20 in Helsinki**, which is what makes
 * "in 8 hours" and the urgent tint reproducible: every case here is arithmetic
 * against a known instant, and a live clock would make the scene say something
 * different on every visit and nothing at all after the fixture dates pass.
 * The viewer's zone is pinned beside it, so the Stockholm club's session reads
 * an hour later than it was authored and the page states which clock that is.
 *
 * **Approve works, against local state, and it has to be this shell that makes
 * it work.** The queue drops a row once the write resolves *and* the list it
 * was given stops offering that id — the second half is what protects it from a
 * receipt that outlives its fact, when a second admin clears the sub while this
 * page is open. Live, the shell awaits its own invalidation, so the refetched
 * document has already dropped the id by the time the promise resolves. A scene
 * that resolved an untouched fixture would satisfy the first half and fail the
 * second, leaving the row's offers unpressable for the rest of the sitting. So
 * the approved request ids are held here and filtered out, which is the same
 * two-part shape the live path has, with a `Set` where the RPC is.
 */
export function AdminSubstitutionsScene({
  scenario,
}: {
  scenario: AdminSubstitutionsScenario;
}) {
  const locale = resolveLocale(useLocale());
  const queue = useMemo(
    () => buildAdminSubstitutionsFixture(scenario),
    [scenario],
  );

  /**
   * Keyed by **request** rather than by offer: approving one offer settles the
   * request, and what leaves the list is the request.
   */
  const [substituted, setSubstituted] = useState<ReadonlySet<string>>(new Set());

  /**
   * Approvals belong to the scenario they were made in. The two scenarios are
   * the same component at the same position in the tree, so React keeps this
   * state across a step between them unless it is told not to — and without the
   * reset, approving in `queue`, stepping to `all-clear` and stepping back would
   * show `queue` already missing a row nobody touched there: a preview lying
   * about its own starting state.
   */
  const [shownScenario, setShownScenario] = useState(scenario);
  if (shownScenario !== scenario) {
    setShownScenario(scenario);
    setSubstituted(new Set());
  }

  const data = useMemo(() => {
    const mapped = buildAdminSubstitutionsData({
      queue,
      locale,
      viewerTimeZone: ADMIN_SUBSTITUTIONS_TIMEZONE,
      now: ADMIN_SUBSTITUTIONS_NOW,
    });
    return {
      ...mapped,
      open: mapped.open.filter((request) => !substituted.has(request.id)),
    };
  }, [queue, locale, substituted]);

  /**
   * Approving drops the request the offer belongs to, which is the fixture
   * standing in for the refetched document. The offer id is what the panel
   * hands over — it is what the RPC takes — so the request it settles is found
   * here rather than being carried alongside it, the way the live path finds it
   * by simply not returning it again.
   */
  const handleApproveOffer = useCallback(
    (offerId: string) => {
      const request = queue.open.find((candidate) =>
        candidate.offers.some((offer) => offer.id === offerId),
      );
      if (request !== undefined) {
        setSubstituted((current) => new Set(current).add(request.id));
      }
      return Promise.resolve();
    },
    [queue],
  );

  return (
    <AdminSubstitutionsPageBody data={data} onApproveOffer={handleApproveOffer} />
  );
}
