"use client";

import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { SessionReportSendResult } from "./send-report";

interface SessionReportSendProps {
  /**
   * When this report was emailed to the families, already formatted in the
   * viewer's zone — and `null` until it has been, which is what decides which
   * of the button's states it is in.
   *
   * A formatted label rather than the instant, because the feed already holds
   * the viewer's locale and zone for every other clock face on the card, and a
   * second component reading the providers is a second chance to render a time
   * in the wrong zone.
   */
  sentAtLabel: string | null;
  /** Whether this session's send is in flight. */
  sending: boolean;
  /**
   * What the send that just happened did, or `null`.
   *
   * A receipt for that one send, shown beside the sent button and only when
   * some of it failed. It comes from the response rather than from the row, so
   * the feed holds it in component state for as long as the gedu stays on the
   * page — including across the refetch that flips the button into its sent
   * state, which is precisely what gives anybody the chance to read it — and it
   * is gone on a reload or a navigation, because nothing about it is stored.
   * The sent state is the record; these counts are not.
   */
  result: SessionReportSendResult | null;
  /** Why the last send was refused, or `null`. */
  error: string | null;
  onSend: () => void;
}

/**
 * The send affordance under a past session's report: **one button in three
 * states** — Send to parents, sending, sent.
 *
 * **One control, never a control replaced by something else.** The same button
 * carries all three states, so the row's height is the button's height at every
 * moment of a session's life and nothing below it — the gedu note, the
 * attribution chip, the next card — moves when a send lands. The sent state is
 * that button disabled, wearing a check and a label that folds in when the mail
 * went; there is no separate line to make room for, and nothing is reserved
 * beside the button either, because the states cannot coexist.
 *
 * **The one thing that does change across the three is the button's weight.**
 * Send and sending are `secondary` — filled, because they mark work still to be
 * done on a card whose whole job is to say what a session still owes. Sent is
 * `outline`: the action is finished and the control has stopped being an
 * invitation, so what is left is a record of when the report went, and a record
 * should not go on drawing the eye of a gedu scanning the feed for the next
 * thing to do. Both variants are the same box at the same size, so this is
 * emphasis changing and not geometry.
 *
 * **The sent state is rendered from the stored instant, not from the send.** It
 * therefore survives a reload, a second tab and another assigned gedu, which is
 * the whole point of recording the send on the row: the gedu who wonders
 * whether they already sent it can see that they did. The counts beside it are
 * the opposite kind of thing — a receipt for the send just made, held in the
 * feed's state while the gedu stays on the page and gone on a reload or a
 * navigation — and they appear only when some of the mail did not go out,
 * because "6 sent, 0 failed" is what the button already says.
 *
 * **There is no confirmation step, and that is a decision rather than an
 * omission.** The route claims the session before it mails anybody, so a second
 * press — from this tab, another tab or another assigned gedu — cannot produce
 * a second send whatever the UI does; the at-most-once guarantee is the
 * server's and was never the dialog's. What the dialog added on top of that was
 * a headcount, and nobody was deciding anything with it: the send goes to the
 * group's families, which is what the button says, and a gedu who wants to know
 * who that is has the roster on the same page. Pressing a button that names its
 * own action is the whole gesture.
 *
 * There is likewise no special case for a group nobody can be mailed. The send
 * claims the session, the mail goes to nobody, and the staff copy that lands in
 * the office inbox is how somebody finds out the group has seats with no
 * contact.
 */
export function SessionReportSend({
  sentAtLabel,
  sending,
  result,
  error,
  onSend,
}: SessionReportSendProps) {
  const t = useTranslations("gedu.sessionFeed");
  const sent = sentAtLabel !== null;

  return (
    <div className="space-y-1">
      {/* Centered, because a button tucked at the left edge under a long report
          read as part of the report's furniture and was scrolled straight
          past. The row needs no reserved height of its own: the button is
          present in every state, so its own height is the slot. */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Button
          type="button"
          // Filled while there is something to do, outlined once there is not
          // — see the note above. Both are the same box at the same size, so
          // the change is in weight alone and nothing moves.
          variant={sent ? "outline" : "secondary"}
          size="sm"
          // Sent is as disabled as sending is: the report has gone, and the
          // control stays on screen to say so rather than to be pressed again.
          disabled={sending || sent}
          onClick={onSend}
          className="gap-1.5"
        >
          {/* Sent is read before sending, and has to be: the feed never clears
              its in-flight flag on a send that landed — the row arriving
              stamped is what ends that state — so the two are true together
              for the frames between the mail going out and the refetch, and
              the stamp is the newer fact. */}
          {sent ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          ) : sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Mail className="h-3.5 w-3.5" aria-hidden />
          )}
          {sentAtLabel !== null
            ? t("reportSentToParents", { sentAt: sentAtLabel })
            : sending
              ? t("sendingReportToParents")
              : t("sendReportToParents")}
        </Button>

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
    </div>
  );
}
