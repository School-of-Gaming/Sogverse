"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { buildSubstitutionPoolRows } from "@/lib/gedu-substitution-pool";
import {
  sessionSubstitutionKeys,
  useOfferSessionSubstitution,
  useWithdrawSessionSubstitutionOffer,
  type OpenSubstitutionRequest,
} from "@/services/session-substitution";
import { GeduSubstitutionPoolSectionView } from "./GeduSubstitutionPoolSectionView";

/**
 * The **Sessions needing a substitute** section: the pool's two writes, over rows the
 * page has already read.
 *
 * **The read is the page's, not this component's**, and that is what lets the
 * page decide whether there is a section at all — an uncertified gedu may
 * substitute for nothing, and a heading over a queue they are not in would be a
 * promise about somebody else's page. So the page asks and this component is
 * handed the answer, including the answer "not yet".
 *
 * **The two writes are answered in two different places, and that is the
 * caller's decision rather than the handler's.** An offer can be refused — the
 * request filled, the session started, the caller no longer eligible — and the
 * volunteer needs that answer before they move on, so it runs inside the
 * confirm dialog's holding mode: this component hands over a promise that
 * rejects on refusal, and the dialog owns the latch, the disabled buttons and
 * the failure line. The withdrawal is the undo of a decision already made, so
 * it keeps the inline flag: set before the mutation runs and cleared on settle,
 * once the pool has been read again.
 *
 * **Both resolve only after the awaited invalidation**, and that is what makes
 * either safe to hand back on: the mutation's own `onSuccess` fires five
 * invalidations and waits for none of them, so the write resolves on the
 * receipt, and the one document this section draws from is read again here
 * before the dialog closes or the flag drops.
 */
export function GeduSubstitutionPoolSection({
  requests,
}: {
  /**
   * Every open request this gedu could take, as the page read them — or
   * `undefined` while the read has not answered.
   *
   * An empty list is the all-clear line, and it is a different answer from
   * "not yet": telling a gedu that nothing needs a substitute on the strength
   * of a read that has not come back is the one thing this section must not do.
   */
  requests: readonly OpenSubstitutionRequest[] | undefined;
}) {
  const t = useTranslations("gedu.substitution");
  const locale = resolveLocale(useLocale());
  const [committingRequestId, setCommittingRequestId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<{
    requestId: string;
    message: string;
  } | null>(null);

  const offerSubstitution = useOfferSessionSubstitution();
  const withdrawOffer = useWithdrawSessionSubstitutionOffer();
  const queryClient = useQueryClient();

  const rows = useMemo(
    () =>
      requests === undefined ? null : buildSubstitutionPoolRows(requests, locale),
    [requests, locale],
  );

  /**
   * The half the mutation does not supply: this section's own read, waited on,
   * so the card is already redrawn in its new state by the time the dialog
   * closes over it or the button comes back.
   */
  const settle = () =>
    queryClient.invalidateQueries({ queryKey: sessionSubstitutionKeys.all });

  /**
   * Offering, for the dialog to hold on. **It does not catch**: a refusal is
   * what the dialog is still open to read out, and swallowing it here would
   * close the dialog on a write that did nothing.
   */
  const offer = async (requestId: string) => {
    await offerSubstitution.mutateAsync({ requestId });
    await settle();
  };

  const withdraw = async (requestId: string) => {
    setError(null);
    setCommittingRequestId(requestId);
    try {
      await withdrawOffer.mutateAsync({ requestId });
      await settle();
    } catch {
      // The card is still in the pool and the gedu may try again, so the
      // refusal is named on it.
      setError({ requestId, message: t("poolActionFailed") });
    } finally {
      setCommittingRequestId(null);
    }
  };

  return (
    <GeduSubstitutionPoolSectionView
      rows={rows}
      committingRequestId={committingRequestId}
      error={error}
      onOffer={offer}
      onWithdraw={(requestId) => void withdraw(requestId)}
    />
  );
}
