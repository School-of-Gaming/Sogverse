"use client";

import { useState } from "react";
import { useAuth } from "@/providers";
import {
  useAcceptGeduContract,
  useGeduContractAcceptances,
} from "@/services/gedu";
import type { GeduCriminalRecordCheck } from "@/services/gedu/gedu-profiles.service";
import type { GeduContractAcceptance } from "@/types";
import type { GeduContractDocument } from "./contract-document";
import {
  findGeduContractAcceptance,
  geduContractStoredVersion,
} from "./documents";
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
 *
 * **"The version on screen" is a base version, not a stored one.** A stored
 * version names a language as well, and the languages of one version are the
 * same agreement: somebody who signed the Finnish text and then switched the app
 * to English is already signed, and must not be asked again for a text they have
 * agreed to in the only other words it exists in.
 */
export function GeduContractPage({
  geduId,
  contract,
  initialAcceptances,
  criminalRecordCheck,
}: {
  geduId: string;
  contract: GeduContractDocument;
  /** Prefetched rows, or `null` when that read failed. */
  initialAcceptances: GeduContractAcceptance[] | null;
  /**
   * The gedu's criminal record check standing, resolved by the route, or `null`
   * when that read failed.
   *
   * Passed straight through rather than turned into a query: nothing on this
   * page can change it — only an admin can — so there is nothing for a cache
   * entry to keep fresh, and a value settled on the server is one the section
   * above the terms can paint with on the first frame.
   */
  criminalRecordCheck: GeduCriminalRecordCheck | null;
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
      : findGeduContractAcceptance(acceptances, contract.version);

  const signerName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ");

  /**
   * A failure belongs to the attempt that produced it. The dialog is mounted per
   * opening, so a flag left set outlives the ceremony it was raised in and the
   * next one opens with the last one's error already on screen — before the
   * reader has done anything at all. Cleared on the way *in* rather than on the
   * way out, because that is the moment the message stops being true.
   */
  const handleSignOpen = () => {
    setAcceptFailed(false);
  };

  const handleAccept = () => {
    setCommitting(true);
    setAcceptFailed(false);
    // The document on screen, encoded, not a constant read from somewhere else:
    // what is being accepted is the text this page just rendered, in the
    // language it rendered it in. The route only ever hands over the current
    // version, so base and language both agree with what is in force — and if
    // they ever stopped agreeing, recording the text the reader actually read is
    // the answer that stays defensible.
    acceptContract.mutate(geduContractStoredVersion(contract), {
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
      criminalRecordCheck={criminalRecordCheck}
      signerName={signerName}
      committing={committing}
      acceptFailed={acceptFailed}
      onSignOpen={handleSignOpen}
      onAccept={handleAccept}
    />
  );
}
