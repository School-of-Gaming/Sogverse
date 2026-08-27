"use client";

import { useGeduContractAcceptances } from "@/services/gedu";
import type { GeduContractAcceptance } from "@/types";
import {
  findGeduContractAcceptance,
  GEDU_CONTRACT_CURRENT_VERSION,
} from "./documents";
import { GeduContractSettingsCardView } from "./gedu-contract-settings-card-view";

/**
 * The gedu's own standing under the contract, on the settings page: what they
 * signed and when, or that they have not.
 *
 * **A summary and a way back to the document, never a second place to sign.**
 * The signing ceremony belongs on the page that shows the terms, because a
 * signature given anywhere else is a signature given without the text in front
 * of it. Both states link to the same page; only the invitation differs.
 *
 * This is the card's data shell — one read, and the choice of which row answers
 * it. The card itself is presentational and lives beside this file, so its
 * states can be looked at side by side without a query behind them.
 *
 * **The read is seeded from the route's own prefetch**, so the ordinary visit
 * paints the card in its real state — signed or not — on the first frame, with
 * no loading affordance at all and no growth after it. `null` for the prefetch
 * is not an empty list: it means the server read failed, so no `initialData` is
 * passed and the browser asks again. Until it answers the card's body is empty
 * rather than showing the sign prompt, because telling somebody who has already
 * signed that they have not is the one wrong answer here.
 *
 * **Nothing is reserved for that rare late answer, because the card is last on
 * the settings page.** The heading above the body does not move whatever lands
 * in it, and there is nothing below to be pushed down when it does — so a slot
 * held open at the taller of the two states would buy stability only on the
 * degraded path and cost a visible hole in the shorter state on every other
 * visit. The placement is what makes that true; see the settings page.
 */
export function GeduContractSettingsCard({
  geduId,
  initialAcceptances,
}: {
  geduId: string;
  /** Prefetched rows, or `null` when that read failed. */
  initialAcceptances: GeduContractAcceptance[] | null;
}) {
  const { data: acceptances } = useGeduContractAcceptances(
    geduId,
    initialAcceptances === null ? undefined : { initialData: initialAcceptances },
  );
  // Matched on the base version: a stored version names its language too, and
  // both languages of one version are the same agreement, so either signature
  // answers this card's question. The row that answers it is then shown with its
  // full stored version, because which text was signed is part of the record.
  const acceptance =
    acceptances === undefined
      ? undefined
      : findGeduContractAcceptance(acceptances, GEDU_CONTRACT_CURRENT_VERSION);

  return <GeduContractSettingsCardView acceptance={acceptance} />;
}
