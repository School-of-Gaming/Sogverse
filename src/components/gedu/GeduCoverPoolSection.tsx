"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { buildCoverPoolRows } from "@/lib/gedu-cover-pool";
import {
  useOfferSessionCover,
  useOpenCoverRequests,
  useWithdrawSessionCoverOffer,
  type OpenCoverRequest,
} from "@/services/session-cover";
import { GeduCoverPoolSectionView } from "./GeduCoverPoolSectionView";

/**
 * The data shell behind **Sessions needing cover**: one read, two writes.
 *
 * **The read is asked only of a certified gedu.** Certification is what gates
 * offering and holding a cover, server-side, so an uncertified caller may cover
 * nothing and the honest thing is not to ask — which is exactly what the hook's
 * `enabled` does. The section is then withheld whole by the page rather than
 * rendered empty: an all-clear line on the dashboard of somebody who could not
 * take a session anyway is a promise about a queue they are not in.
 *
 * **It renders nothing while the first answer lands.** The read is a small,
 * indexed, bounded one — open requests inside a sixty-day window, filtered by a
 * predicate the database applies — so it is the middle category of the loading
 * rule: a container that is already its final size, with nothing in it, and no
 * skeleton. The ordinary visit has it prefetched by the route and never sees
 * even that.
 *
 * **The committing flag is set before the mutation runs and cleared only where
 * the button has to come back.** An offer that lands is followed by the
 * invalidation that flips the row into its offered state, so the control stays
 * disabled straight through rather than re-enabling for a frame in which a
 * second press could land.
 */
export function GeduCoverPoolSection({
  certified,
  initialRequests,
}: {
  /**
   * Has an admin certified this gedu? It is what `enabled` is: an uncertified
   * caller may cover nothing, every write behind this section refuses them
   * server-side, and the read would come back empty for a reason the page
   * cannot explain. The dashboard withholds the whole section — heading, nav
   * entry and all — for the same account, so this flag is the *read's* gate
   * rather than the section's visibility; both exist because they answer
   * different questions and a page that rendered the node would otherwise make
   * the request anyway.
   */
  certified: boolean;
  /**
   * The route's own server-side copy of the read, or `undefined` when that
   * prefetch failed. `undefined` is not an empty list: it means "ask from the
   * browser", and the section renders nothing until the answer arrives rather
   * than telling a gedu that nothing needs cover.
   */
  initialRequests?: OpenCoverRequest[];
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

  const { data: requests } = useOpenCoverRequests({
    enabled: certified,
    initialData: initialRequests,
  });
  const offerCover = useOfferSessionCover();
  const withdrawOffer = useWithdrawSessionCoverOffer();

  const rows = useMemo(
    () => (requests === undefined ? [] : buildCoverPoolRows(requests, locale)),
    [requests, locale],
  );

  if (!certified || requests === undefined) return null;

  const run = async (requestId: string, write: () => Promise<unknown>) => {
    setError(null);
    setCommittingRequestId(requestId);
    try {
      await write();
    } catch {
      // The only outcome that hands the button back: the row is still in the
      // pool and the gedu may try again.
      setCommittingRequestId(null);
      setError({ requestId, message: t("poolActionFailed") });
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
