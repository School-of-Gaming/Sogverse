"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { SubstitutionRequestState } from "@/lib/session-staffing";

/** What the panel reads off a request — the reader's own, live one. */
export type OwnSubstitutionRequest = Pick<
  SubstitutionRequestState,
  "id" | "status" | "substituteId" | "offerCount"
>;

/**
 * The reader's own live request, stated as loudly as a card states anything,
 * with the way to take it back.
 *
 * **One panel, two surfaces.** A session card on My SOG draws it under its
 * header, and the Substitutions page's "Your requests" draws it on each of its
 * cards; both render this component, so the two cannot disagree about what a
 * request is waiting on or when it can still be withdrawn.
 *
 * **The panel, not a line.** Once a gedu has asked for a substitute, that is
 * what the session is about: whether anybody is coming, and the way back if
 * they turn out to be free after all. Both existing status treatments are spent
 * on saying which of the two it is — **warning** while the seat is still open,
 * because a session with nobody in it is the thing this feature exists to
 * prevent, and **info** once somebody has been approved, because that is a
 * settled fact rather than a thing needing anybody. No new colour.
 *
 * **A null count is not zero.** `offerCount` is "not disclosed" wherever the
 * reader is not entitled to it, and nobody offering and nobody being told are
 * different facts — so the second line appears only where a number really
 * travelled, rather than inventing one.
 *
 * **Withdraw is offered on an open request alone**, because that is the only
 * one the write takes back: once a sub is approved the session is theirs, and
 * changing that is the office's call.
 *
 * `role="status"` rather than the alert the primitive defaults to: it is a
 * standing fact about the session for as long as the request lives, announced
 * when it *arrives* — which is the moment the gedu files — and silent on the
 * loads afterwards.
 */
export function OwnSubstitutionRequestPanel({
  request,
  onWithdraw,
}: {
  request: OwnSubstitutionRequest;
  /**
   * Take the request back. **Awaited**: the confirm dialog holds itself open
   * until the write settles, so a refusal is read before the gedu leaves
   * believing they are free.
   *
   * Absent on a surface that is not a gedu looking at their own request — an
   * admin shell hands the card its own menu instead — and the action is then
   * not rendered at all.
   */
  onWithdraw?: (requestId: string) => void | Promise<void>;
}) {
  const t = useTranslations("gedu.sessionFeed");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const substituted =
    request.status === "substituted" && request.substituteId !== null;
  const canWithdraw = request.status === "open" && onWithdraw !== undefined;

  return (
    <>
      <Alert variant={substituted ? "info" : "warning"} role="status">
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium text-foreground">
              {substituted && request.substituteId !== null
                ? t("substitutionRequestStatusSubstituted", {
                    name: request.substituteId.firstName,
                  })
                : t("substitutionRequestStatusOpen")}
            </p>
            {!substituted && request.offerCount !== null && (
              <p className="text-xs text-muted-foreground">
                {t("substitutionRequestStatusOffers", {
                  count: request.offerCount,
                })}
              </p>
            )}
          </div>
          {canWithdraw && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWithdrawOpen(true)}
              className="shrink-0"
            >
              {t("substitutionWithdrawAction")}
            </Button>
          )}
        </div>
      </Alert>

      {canWithdraw && (
        /* **It is confirmed, unlike a report's send on the same card**, and the
           difference is what the press costs somebody else. A send is
           idempotent at the server and says everything it does in its own
           label; withdrawing drops every offer colleagues have already made on
           a session they set aside time for, and a gedu who meant to press
           something else has no way back from it. So the dialog exists to name
           that consequence, which is the only thing it has to add — and it
           holds, because a refused withdraw is a fact the gedu has to read
           before they leave believing they are free. */
        <ConfirmDialog
          open={withdrawOpen}
          onOpenChange={setWithdrawOpen}
          title={t("substitutionWithdrawTitle")}
          description={t("substitutionWithdrawBody")}
          confirmLabel={t("substitutionWithdrawConfirm")}
          confirmVariant="default"
          holdWhileCommitting
          describeError={() => t("substitutionWithdrawFailed")}
          onConfirm={async () => {
            await onWithdraw(request.id);
          }}
        />
      )}
    </>
  );
}
