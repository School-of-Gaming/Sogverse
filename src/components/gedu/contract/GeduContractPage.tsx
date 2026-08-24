"use client";

import { useState } from "react";
import { useAuth } from "@/providers";
import {
  useAcceptGeduContract,
  useGeduContractAcceptances,
} from "@/services/gedu";
import type { GeduContractAcceptance } from "@/types";
import type { GeduContractDocument } from "./contract-document";
import { GeduContractPageBody } from "./gedu-contract-page-body";

/**
 * The contract page's data shell: one read, one write, and the committing flag
 * that spans them.
 *
 * The read is seeded from the route's own prefetch, so the ordinary visit
 * paints the panel — prompt or record — on the first frame with no loading
 * state. `null` for the prefetch is not an empty list: it means the server read
 * failed and the browser must ask again, and until it answers the page shows
 * the terms with no panel rather than the sign prompt, because telling somebody
 * who already signed that they have not is the one wrong answer here.
 *
 * **Acceptance of the *current* version is the whole question.** A gedu who
 * signed an earlier version has a row, and it stays — it is the record of what
 * they agreed to then — but it does not answer for terms published since, so
 * this looks for the version the app is showing and nothing else.
 */
export function GeduContractPage({
  geduId,
  contract,
  initialAcceptances,
}: {
  geduId: string;
  contract: GeduContractDocument;
  /** Prefetched rows, or `null` when that read failed. */
  initialAcceptances: GeduContractAcceptance[] | null;
}) {
  const { profile } = useAuth();
  const { data: acceptances } = useGeduContractAcceptances(
    geduId,
    initialAcceptances === null ? undefined : { initialData: initialAcceptances },
  );
  const acceptContract = useAcceptGeduContract();

  /**
   * Live before any render after the click, and cleared only on the outcome
   * that asks the user to try again. On success the invalidation swaps the
   * panel and unmounts the dialog, so leaving it set is what keeps the button
   * from re-enabling in the gap React Query's `isPending` leaves open.
   */
  const [committing, setCommitting] = useState(false);
  const [acceptFailed, setAcceptFailed] = useState(false);

  const acceptance =
    acceptances === undefined
      ? undefined
      : (acceptances.find(
          (row) => row.contract_version === contract.version,
        ) ?? null);

  const signerName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ");

  const handleAccept = () => {
    setCommitting(true);
    setAcceptFailed(false);
    // The version on screen, not a constant read from somewhere else: what is
    // being accepted is the document this page just rendered. The route only
    // ever hands over the current one, so the two agree — and if they ever
    // stopped agreeing, signing the text the reader actually read is the
    // answer that stays defensible.
    acceptContract.mutate(contract.version, {
      onError: () => {
        setAcceptFailed(true);
        setCommitting(false);
      },
    });
  };

  return (
    <GeduContractPageBody
      contract={contract}
      acceptance={acceptance}
      signerName={signerName}
      committing={committing}
      acceptFailed={acceptFailed}
      onAccept={handleAccept}
    />
  );
}
