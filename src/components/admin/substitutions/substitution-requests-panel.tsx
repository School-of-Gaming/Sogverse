"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, CircleCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SubstitutionRequest } from "./admin-substitutions-data";
import { SubstitutionRequestRow } from "./substitution-request-row";

/**
 * **Sessions somebody cannot make, and the offers to stand in.**
 *
 * The page's first panel and the reason it exists: every row is work an admin
 * can finish here — a colleague is out, somebody has volunteered, and one press
 * seats them — where the fortnight below it is a record to be consulted.
 *
 * **Empty collapses the panel to one row**, because the good news is the space
 * given back. It does not celebrate: this is a page an admin opens to find
 * work, and an empty queue is the ordinary state rather than an achievement.
 *
 * **The receipt lives here rather than a level down.** The list collapses, so
 * approving the last request would take the confirmation away at the moment
 * there is most to confirm. The state therefore belongs to the component that
 * survives the collapse, and the all-clear row carries the receipt beside it.
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
   * approval collapses the panel.
   */
  const openIds = new Set(requests.map((request) => request.id));
  const approved = withoutOpen(approvedIds, openIds);
  if (approved !== approvedIds) setApprovedIds(approved);

  const waiting = requests.filter((request) => !approved.has(request.id));

  /**
   * The receipt for an approval, which otherwise leaves no trace: a row simply
   * vanishing is indistinguishable from a row that was never there.
   */
  const receipt =
    approved.size > 0 ? (
      <p className="flex items-center gap-1.5 text-xs text-success">
        <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {t("justNow", { count: approved.size })}
      </p>
    ) : null;

  if (waiting.length === 0) {
    return (
      <Card>
        {/* The all-clear row. The title stays — "Sessions needing a substitute ·
            nothing needs a sub" reads as a report. The line, the receipt and
            the check ride in one right-packed group opposite, where the
            header's slack already sits, and wrap below the title at 360. */}
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-6 gap-y-2 space-y-0">
          <CardTitle className="text-xl">{t("listLabel")}</CardTitle>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {receipt}
            <p className="text-sm text-muted-foreground">{t("allClear")}</p>
            <CircleCheck className="h-5 w-5 shrink-0 text-success" aria-hidden />
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline gap-2 text-xl">
          {t("listLabel")}
          <span className="text-sm font-normal text-muted-foreground">
            {waiting.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {receipt}
        <ul aria-label={t("listLabel")} className="space-y-2">
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
      </CardContent>
    </Card>
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
