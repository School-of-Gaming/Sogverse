"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { buildCoverPoolRows } from "@/lib/gedu-cover-pool";
import {
  sessionCoverKeys,
  useOfferSessionCover,
  useWithdrawSessionCoverOffer,
  type OpenCoverRequest,
} from "@/services/session-cover";
import { GeduCoverPoolSectionView } from "./GeduCoverPoolSectionView";

/**
 * The **Sessions needing cover** section: the pool's two writes, over rows the
 * page has already read.
 *
 * **The read is the page's, not this component's**, and that is what lets the
 * dashboard withhold the heading and the nav chip until the first answer is in.
 * A section that fetched its own rows could only render nothing while they
 * landed, leaving a heading with no body under it and then a card arriving
 * above what the reader was already looking at — a reveal on data's own
 * schedule, which is the one kind the layout rule forbids. So the page asks,
 * the page decides whether there is a section at all, and this component is
 * handed the answer.
 *
 * **The committing flag is set before the mutation runs and cleared on settle,
 * once the pool has been read again.** It holds every button on the section, so
 * leaving it set on success would freeze the whole queue for the rest of the
 * visit — nothing here unmounts when an offer lands, the row simply redraws as
 * the withdrawal beside it. What makes the clear safe is the awaited
 * invalidation in front of it: the mutation's own `onSuccess` fires five
 * invalidations and waits for none of them, so the write resolves on the
 * receipt, and the one document this section draws from is read again here
 * before the flag drops.
 */
export function GeduCoverPoolSection({
  requests,
}: {
  /**
   * Every open request this gedu could take, as the page read them. An empty
   * list is the all-clear line; "no answer yet" is not a value this component
   * can be in, because the page renders none of it until there is one.
   */
  requests: readonly OpenCoverRequest[];
}) {
  const t = useTranslations("gedu.cover");
  const locale = resolveLocale(useLocale());
  const [committingRequestId, setCommittingRequestId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<{
    requestId: string;
    message: string;
  } | null>(null);

  const offerCover = useOfferSessionCover();
  const withdrawOffer = useWithdrawSessionCoverOffer();
  const queryClient = useQueryClient();

  const rows = useMemo(
    () => buildCoverPoolRows(requests, locale),
    [requests, locale],
  );

  const run = async (requestId: string, write: () => Promise<unknown>) => {
    setError(null);
    setCommittingRequestId(requestId);
    try {
      await write();
      // The half the mutation does not supply: this section's own read, waited
      // on, so the row is already redrawn in its new state by the time every
      // button on the section comes back.
      await queryClient.invalidateQueries({ queryKey: sessionCoverKeys.all });
    } catch {
      // The row is still in the pool and the gedu may try again, so the refusal
      // is named on it.
      setError({ requestId, message: t("poolActionFailed") });
    } finally {
      setCommittingRequestId(null);
    }
  };

  return (
    <GeduCoverPoolSectionView
      rows={rows}
      committingRequestId={committingRequestId}
      error={error}
      onOffer={(requestId) =>
        void run(requestId, () => offerCover.mutateAsync({ requestId }))
      }
      onWithdraw={(requestId) =>
        void run(requestId, () => withdrawOffer.mutateAsync({ requestId }))
      }
    />
  );
}
