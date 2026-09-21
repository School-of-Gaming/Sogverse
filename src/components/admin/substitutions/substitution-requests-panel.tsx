"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck } from "lucide-react";
import type { SubstitutionRequest } from "./admin-substitutions-data";
import { SubstitutionRequestRow } from "./substitution-request-row";

/**
 * **Sessions somebody cannot make, and the offers to stand in.**
 *
 * **A heading over a stack, with no edge of its own.** The requests are peers,
 * each with its own action, so the *requests* are the cards and this is the
 * heading that holds them — the card rule's own test applied: take the outer
 * edge away and the heading and the spacing still say these belong together, so
 * the edge was saying nothing, and every level of border costs width a 360px
 * screen does not have.
 *
 * **Empty is a line under the heading, not a card holding a line.** The good
 * news is the space given back, and an empty queue is the ordinary state of
 * this page rather than an achievement, so it does not celebrate.
 *
 * **The receipt lives here rather than a level down.** A row unmounts when its
 * approval lands, so approving the last request would take the confirmation
 * away at the moment there is most to confirm. The state therefore belongs to
 * the component that survives the collapse.
 *
 * **The write is the shell's, the ordering is the mapping's.** `onApproveOffer`
 * resolves once the approval has landed *and* the refetched document has
 * dropped the request, so a row leaves only when both halves agree. A row that
 * left optimistically would have nowhere to put a failure, and the admin would
 * be told nothing at all. The order is soonest-session-first and is settled
 * before the list is handed over; nothing here re-sorts it.
 */
export function SubstitutionRequestsPanel({
  requests,
  now,
  onApproveOffer,
}: {
  requests: readonly SubstitutionRequest[];
  /** The page's pinned clock, passed down to each row's relative phrase. */
  now: Date;
  /** Approve one offer. Resolves once the write landed; rejects if it did not. */
  onApproveOffer: (offerId: string) => Promise<void>;
}) {
  const t = useTranslations("admin.substitutions");
  const [approvedIds, setApprovedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  /**
   * Which requests this sitting has staffed, minus any the read is offering
   * again.
   *
   * A request enters the set only once its approval has landed and the refetch
   * behind it has returned, so an id in both places is not a race — it is the
   * source saying this request is open again, which is what a second admin
   * clearing the sub produces. Left unpruned, the row would be filtered out of
   * the list by a receipt for a fact that is no longer true, with no row left to
   * act on. So the source wins and the row comes back.
   *
   * An id the source has stopped offering stays in the set for the rest of the
   * sitting, which is what keeps the confirmation on screen after the last
   * approval empties the list.
   */
  const openIds = new Set(requests.map((request) => request.id));
  const approved = withoutOpen(approvedIds, openIds);
  if (approved !== approvedIds) setApprovedIds(approved);

  const waiting = requests.filter((request) => !approved.has(request.id));

  return (
    <section className="space-y-3">
      <h2 className="flex items-baseline gap-2 text-xl font-semibold">
        {t("listLabel")}
        {waiting.length > 0 && (
          <span className="text-sm font-normal text-muted-foreground">
            {waiting.length}
          </span>
        )}
      </h2>

      {/* The receipt for an approval, which otherwise leaves no trace: a row
          simply vanishing is indistinguishable from a row that was never
          there. It appears on the press that removed a row, so what it pushes
          down is a list that has just become shorter — a change the reader
          asked for, not one on data's own schedule. */}
      {approved.size > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("justNow", { count: approved.size })}
        </p>
      )}

      {waiting.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("allClear")}</p>
      ) : (
        <ul aria-label={t("listLabel")} className="space-y-3">
          {waiting.map((request) => (
            <li key={request.id}>
              <SubstitutionRequestRow
                request={request}
                now={now}
                onApproveOffer={(offerId) =>
                  onApproveOffer(offerId).then(() => {
                    setApprovedIds((current) =>
                      new Set(current).add(request.id),
                    );
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * `approved` less every id the read still offers, returning the original set
 * unchanged when there is nothing to drop — identity is what stops the state
 * adjustment above from looping.
 */
function withoutOpen(
  approved: ReadonlySet<string>,
  open: ReadonlySet<string>,
): ReadonlySet<string> {
  const kept = [...approved].filter((id) => !open.has(id));
  return kept.length === approved.size ? approved : new Set(kept);
}
