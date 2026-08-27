"use client";

import { useGeduContractAcceptances } from "@/services/gedu";
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
 * The read is a keyed lookup of a bounded set — at most one row per version
 * ever published — so it lands in a frame or two and gets **no** loading
 * affordance at all: the card's heading and description are there from the
 * first paint and the body is simply empty until the answer arrives.
 *
 * **Nothing is reserved for it, because the card is last on the settings
 * page.** The heading above the body does not move whatever lands in it, and
 * there is nothing below to be pushed down when it does — so a slot held open
 * at the taller of the two states would buy no stability and cost a visible
 * hole in the shorter one. The placement is what makes that true; see the
 * settings page.
 */
export function GeduContractSettingsCard({ geduId }: { geduId: string }) {
  const { data: acceptances } = useGeduContractAcceptances(geduId);
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
