"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import type { SeatSubstituteDraft } from "@/components/admin/substitutions/admin-substitutions-data";
import { AdminSubstitutionsPageBody } from "@/components/admin/substitutions/admin-substitutions-page-body";
import { buildAdminSubstitutionsData } from "@/components/admin/substitutions/build-admin-substitutions-data";
import {
  ADMIN_SUBSTITUTIONS_NOW,
  ADMIN_SUBSTITUTIONS_TIMEZONE,
  buildAdminSubstitutionsFixture,
  seatFixtureSubstitute,
  type AdminSubstitutionsScenario,
} from "@/components/admin/substitutions/mock-substitutions-fixtures";
import { resolveLocale } from "@/lib/constants/locales";

/**
 * `/admin/substitutions`, over fixtures.
 *
 * It renders the **same body the live route renders**, and it feeds that body
 * through the **same mapping** — the fixtures are the wire document, not the
 * view model, so the split by status, the soonest-first sort, the 24-hour
 * urgency threshold, the occurrence resolution and the viewer's zone line are
 * the real ones under the preview rather than values a fixture asserted.
 *
 * **Pinned to Monday 17 August 2026, 09:20 in Helsinki**, which is what makes
 * "in 8 hours" and the urgent tint reproducible: every case here is arithmetic
 * against a known instant, and a live clock would make the scene say something
 * different on every visit and nothing at all after the fixture dates pass.
 * The viewer's zone is pinned beside it, so the Stockholm club's session reads
 * an hour later than it was authored and the page states which clock that is.
 *
 * **Approve and "Seat someone else" work, against local state, and it has to
 * be this shell that makes them work.** The queue drops a row once the write
 * resolves *and* the list it
 * was given stops offering that id — the second half is what protects it from a
 * receipt that outlives its fact, when a second admin clears the sub while this
 * page is open. Live, the shell awaits its own invalidation, so the refetched
 * document already carries the request as substituted by the time the promise
 * resolves. So the seated substitutes are held here and applied to the fixture
 * document before the mapping sees it, which is the same two-part shape the
 * live path has — and the session moves into the second section, as it does
 * live. The picker behind "Seat someone else" is the real one and lists the
 * real gedus; only the write is local.
 */
export function AdminSubstitutionsScene({
  scenario,
}: {
  scenario: AdminSubstitutionsScenario;
}) {
  const locale = resolveLocale(useLocale());
  const fixture = useMemo(
    () => buildAdminSubstitutionsFixture(scenario),
    [scenario],
  );

  /**
   * The gedu seated on each request, keyed by **request**: an approval and a
   * seat from the card both settle the request, and what moves between the
   * sections is the request.
   */
  const [seats, setSeats] = useState<
    ReadonlyMap<string, SeatSubstituteDraft["sub"]>
  >(new Map());

  /**
   * Seats belong to the scenario they were made in. The two scenarios are
   * the same component at the same position in the tree, so React keeps this
   * state across a step between them unless it is told not to — and without the
   * reset, approving in `queue`, stepping to `all-clear` and stepping back would
   * show `queue` already missing a row nobody touched there: a preview lying
   * about its own starting state.
   */
  const [shownScenario, setShownScenario] = useState(scenario);
  if (shownScenario !== scenario) {
    setShownScenario(scenario);
    setSeats(new Map());
  }

  const data = useMemo(
    () =>
      buildAdminSubstitutionsData({
        requests: fixture.map((row) => {
          const sub = seats.get(row.id);
          return row.status === "open" && sub !== undefined
            ? seatFixtureSubstitute(row, sub)
            : row;
        }),
        locale,
        viewerTimeZone: ADMIN_SUBSTITUTIONS_TIMEZONE,
        now: ADMIN_SUBSTITUTIONS_NOW,
      }),
    [fixture, seats, locale],
  );

  /**
   * Approving settles the request the offer belongs to, which is the fixture
   * standing in for the refetched document. The offer id is what the panel
   * hands over — it is what the RPC takes — so the request it settles is found
   * here rather than being carried alongside it.
   *
   * **It takes about as long as the real one**, so the confirm dialog's held
   * moment — the disabled buttons and the spinner it owns — is on show rather
   * than skipped in a frame, which is the half of this flow a preview is opened
   * to look at.
   */
  const handleApproveOffer = useCallback(
    async (offerId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      for (const request of fixture) {
        const offer = request.offers.find((o) => o.id === offerId);
        if (offer === undefined) continue;
        setSeats((current) =>
          new Map(current).set(request.id, {
            id: offer.gedu_id,
            firstName: offer.first_name,
            lastName: offer.last_name,
          }),
        );
        return;
      }
    },
    [fixture],
  );

  /** A seat from the card, with the same held moment as an approval. */
  const handleSeatSubstitute = useCallback(
    async ({ request, sub }: SeatSubstituteDraft) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      setSeats((current) => new Map(current).set(request.id, sub));
    },
    [],
  );

  return (
    <AdminSubstitutionsPageBody
      data={data}
      onApproveOffer={handleApproveOffer}
      onSeatSubstitute={handleSeatSubstitute}
    />
  );
}
