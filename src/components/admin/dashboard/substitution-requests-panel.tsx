"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, CircleCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SubstitutionRequest } from "./admin-dashboard-data";
import { SubstitutionRequestRow } from "./substitution-request-row";

/**
 * **Sessions somebody cannot make, and the offers to stand in.**
 *
 * It sits between the attention queue and the certification section, and the
 * placement is the whole framing: this *is* work an admin can do today — a
 * colleague is out, somebody has volunteered, and one press seats them — which
 * is what the queue above it is for, while certification below it is standing
 * information about people waiting on somebody who is not in this building. It
 * is a second queue rather than a section of the first because the attention
 * queue is about *products* and every one of its cards is a link out to the
 * product that owns the problem; a substitution request is about a session and is
 * answered here, without leaving the page.
 *
 * **Empty collapses the panel to one row**, like the attention panel, because
 * the good news is the space given back. It does not celebrate: the attention
 * panel holds this page's one reward, and two celebrations on one screen leave
 * neither meaning anything.
 *
 * **The receipt lives here rather than a level down**, which is the opposite of
 * where the certification queue keeps its own — and for the same underlying
 * reason. That section is permanent, so its list cannot unmount out from under
 * its receipt; this one collapses, so approving the last request would take the
 * confirmation away at the moment there is most to confirm. The state therefore
 * belongs to the component that survives the collapse, and the all-clear row
 * carries the receipt beside it.
 *
 * **The write is the shell's, the ordering is this section's.** `onApproveOffer`
 * resolves once the approval has landed *and* the refetched snapshot has
 * dropped the request, so a row leaves only when both halves agree. A row that
 * left optimistically would have nowhere to put a failure, and the admin would
 * be told nothing at all. The order is the read's — date, then product — and
 * nothing here re-sorts it: it is the order the RPC promises and a second
 * ranking in the browser could only disagree with it.
 */
export function SubstitutionRequestsPanel({
  requests,
  onApproveOffer,
}: {
  requests: readonly SubstitutionRequest[];
  /** Approve one offer. Resolves once the write landed; rejects if it did not. */
  onApproveOffer: (offerId: string) => Promise<void>;
}) {
  const t = useTranslations("admin.dashboard.substitution");
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
        {/* The all-clear row. The title stays — "Substitution requests · nothing needs
            a sub" reads as a report, where the attention panel's "Needs
            attention · all clear" would have read as a heading denying itself,
            which is why that one replaces its title instead. The line, the
            receipt and the check ride in one right-packed group opposite, where
            the header's slack already sits, and wrap below the title at 360. */}
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-6 gap-y-2 space-y-0">
          <CardTitle className="text-xl">{t("title")}</CardTitle>
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
          {t("title")}
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
