"use client";

import { useGeduContractAcceptances } from "@/services/gedu";
import type { GeduContractAcceptance } from "@/types";
import {
  findGeduContractAcceptance,
  GEDU_CONTRACT_CURRENT_VERSION,
} from "./documents";
import { GeduContractSettingsCardView } from "./gedu-contract-settings-card-view";

/**
 * A gedu's acceptances as the settings route read them, carrying the moment it
 * read them.
 *
 * **There is no failure value.** The route reads these rows outright and errors
 * if it cannot, so a rendered settings page always has them — which is what
 * gives the card below two states instead of three.
 *
 * `fetchedAt` is the seed's own age, and it is threaded rather than left to
 * default because a *rendered* payload can be served again out of the router
 * cache on a back-navigation. Stamped at the moment of the read, a payload
 * minutes old arrives already stale and the browser asks again; left unstamped,
 * React Query would treat it as fetched just now and sit on it for the whole
 * 60-second `staleTime`. Clock skew between the two machines can shift that by a
 * little, and the worst it buys is one extra fetch.
 */
export interface GeduContractSeed {
  /** Every version this gedu has accepted, newest first. */
  acceptances: GeduContractAcceptance[];
  /** `Date.now()` on the server, at the moment the rows were read. */
  fetchedAt: number;
}

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
 * **The seed is mandatory, so the card has exactly two states.** The route
 * fetches the rows and hands them over or fails outright, which means there is
 * no "not answered yet" for this card to render: it is born signed or unsigned,
 * paints at its final height on the first frame, and never grows into an answer
 * a hydration later. Passing the seed to the hook rather than rendering it
 * directly is what keeps the accept mutation's invalidation reaching this card.
 */
export function GeduContractSettingsCard({
  geduId,
  seed,
}: {
  geduId: string;
  seed: GeduContractSeed;
}) {
  const { data: acceptances } = useGeduContractAcceptances(geduId, {
    initialData: seed.acceptances,
    initialDataUpdatedAt: seed.fetchedAt,
  });
  // Matched on the base version: a stored version names its language too, and
  // both languages of one version are the same agreement, so either signature
  // answers this card's question. The row that answers it is then shown with its
  // full stored version, because which text was signed is part of the record.
  const acceptance = findGeduContractAcceptance(
    acceptances,
    GEDU_CONTRACT_CURRENT_VERSION,
  );

  return <GeduContractSettingsCardView acceptance={acceptance} />;
}
