"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { SessionReportSendResult } from "./send-report";

interface SessionReportSendProps {
  /**
   * When this report was emailed to the families, already formatted in the
   * viewer's zone — and `null` until it has been, which is what decides which
   * half of this row renders.
   *
   * A formatted label rather than the instant, because the feed already holds
   * the viewer's locale and zone for every other clock face on the card, and a
   * second component reading the providers is a second chance to render a time
   * in the wrong zone.
   */
  sentAtLabel: string | null;
  /**
   * How many mails the send would produce: the seats with somebody to write to.
   * The dialog promises this number and the route's answer counts in the same
   * unit, so the promise and the receipt cannot disagree.
   */
  recipientCount: number;
  /** Whether this session's send is in flight. */
  sending: boolean;
  /**
   * What the send that just happened did, or `null`.
   *
   * A receipt for that one send, shown beside the sent line and only when some
   * of it failed. It comes from the response rather than from the row, so the
   * feed holds it in component state for as long as the gedu stays on the page
   * — including across the refetch that swaps the button for the sent line,
   * which is precisely what gives anybody the chance to read it — and it is
   * gone on a reload or a navigation, because nothing about it is stored. The
   * sent line is the record; these counts are not.
   */
  result: SessionReportSendResult | null;
  /** Why the last send was refused, or `null`. */
  error: string | null;
  onSend: () => void;
}

/**
 * The send affordance under a past session's report: one row that is either a
 * **Send to parents** button or the permanent line saying it went.
 *
 * **The two states are the same one row, and never both.** The line takes the
 * button's place at the same height, so nothing under it — the gedu note, the
 * attribution chip, the next card — moves when a send lands. Nothing is
 * reserved beside either of them either: the button and the line cannot
 * coexist, so a slot held open for the other one would be a hole in the card
 * for the whole of the session's life.
 *
 * **The sent line is rendered from the stored instant, not from the send.** It
 * therefore survives a reload, a second tab and another assigned gedu, which is
 * the whole point of recording the send on the row: the gedu who wonders
 * whether they already sent it can see that they did. The counts beside it are
 * the opposite kind of thing — a receipt for the send just made, held in the
 * feed's state while the gedu stays on the page and gone on a reload or a
 * navigation — and they appear only when some of the mail did not go out,
 * because "6 sent, 0 failed" is what the line above already says.
 *
 * **Confirming is deliberate friction.** The action mails every family in the
 * group and cannot be taken back, so it goes through a dialog that states the
 * number of mails it is about to send. There is no special case for a group
 * nobody can be mailed: the dialog says nought, the send claims the session,
 * and the staff copy is how somebody finds out the group has seats with no
 * contact.
 */
export function SessionReportSend({
  sentAtLabel,
  recipientCount,
  sending,
  result,
  error,
  onSend,
}: SessionReportSendProps) {
  const t = useTranslations("gedu.sessionFeed");
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-1">
      {/* `min-h-9` is the small button's own height, so the sent line lands in
          exactly the space the button vacated. Centered, because a button tucked
          at the left edge under a long report read as part of the report's
          furniture and was scrolled straight past. */}
      <div className="flex min-h-9 flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {sentAtLabel === null ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={sending}
            onClick={() => setConfirming(true)}
            className="gap-1.5"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Mail className="h-3.5 w-3.5" aria-hidden />
            )}
            {t("sendReportToParents")}
          </Button>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {t("reportSentToParents", { sentAt: sentAtLabel })}
          </span>
        )}

        {result !== null && result.failed > 0 && (
          <span className="text-xs text-warning">
            {t("reportSendPartial", {
              sent: result.sent,
              failed: result.failed,
            })}
          </span>
        )}
      </div>

      {error !== null && (
        <p role="alert" className="text-center text-xs text-destructive">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("sendReportConfirmTitle")}
        description={t("sendReportConfirmBody", { count: recipientCount })}
        confirmLabel={t("sendReportConfirmCta")}
        confirmVariant="default"
        onConfirm={onSend}
      />
    </div>
  );
}
