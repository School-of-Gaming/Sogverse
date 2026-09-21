"use client";

import { useState } from "react";
import { MapPin, Radio } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SessionSubstitutionRequestForm,
  type SessionSubstitutionRequestDraft,
} from "@/components/gedu/session-feed";
import { Link } from "@/i18n/navigation";
import type { AppHrefObject } from "@/lib/constants/routes";
import type { GeduUpcomingSession } from "@/lib/gedu-upcoming-sessions";
import { useTimezone } from "@/providers";
import { cn, formatDate, formatTimeRange } from "@/lib/utils";

/**
 * **"Can't make a session?"** — the Substitutions page's way into filing an
 * absence, for a gedu who knows the date and does not want to go and find its
 * card.
 *
 * There are two entry points to one write and this is the deliberate second
 * one: each session card carries the same action in its overflow menu, and this
 * page carries it for the reader who arrived here *because* they cannot make
 * something. Neither is louder than it has to be — filing an absence is rare,
 * and the act colour on this page belongs to "Offer to substitute", which is
 * what the page is actually asking of whoever is reading it *(owner, 2026-09)*.
 *
 * **Two steps, one form.** Step one is the picker, and it follows the same
 * shape every picker over products does: each row carries what tells
 * same-named products apart — when it is, which group, and where — and a row
 * this write cannot be made on is shown disabled with the reason in place of
 * its facts rather than reached and refused. Step two is the *same* reason form
 * the card's dialog opens, imported rather than copied, so one edit to the
 * questions changes both ways in.
 *
 * **The flag is inline, because the dialog carries form content.** Its fields,
 * both footers and the picker behind them are disabled by the one `committing`
 * boolean, set synchronously before the write; the dialog closes itself once
 * the write lands, which is the shape the loading rule asks of a dialog that is
 * a form rather than a pure confirm.
 *
 * Renders **nothing at all** for a gedu with no upcoming session to file
 * against — an account awaiting certification holds no assignments, so there is
 * no absence for it to declare and a button that could only ever open an empty
 * list is worse than no button.
 */
export function GeduFileAbsenceEntry({
  sessions,
  filedSessionKeys = [],
  resolveWorkspaceHref,
  onFile,
}: {
  /** The viewer's own upcoming sessions, soonest first. */
  sessions: readonly GeduUpcomingSession[];
  /**
   * Sessions the viewer already holds a live request on, by
   * {@link GeduUpcomingSession.key} — shown disabled, with the reason in place.
   *
   * **Whatever the caller knows, and no more.** The page's own reads do not
   * carry the caller's requests: the assignment rows are per seat and the
   * summaries per card, so which dates a gedu has already filed on is not a
   * fact this page has without a read of its own. What is always known is what
   * *this* component just wrote, which it adds to this list itself. A caller
   * with a better source hands it over here; the write's own refusal is the
   * backstop either way, and it is read inside the dialog.
   */
  filedSessionKeys?: readonly string[];
  /**
   * Where a filed session's group workspace lives, for the confirmation's link
   * — or `null` where this surface has no destination for it.
   */
  resolveWorkspaceHref: (session: GeduUpcomingSession) => AppHrefObject | null;
  /**
   * File the absence. **Awaited**: the dialog holds its fields disabled from
   * the click until this settles, and closes only when it resolves, so a
   * refused write leaves the reason and the note where the gedu can try again.
   */
  onFile: (
    session: GeduUpcomingSession,
    draft: SessionSubstitutionRequestDraft,
  ) => Promise<void>;
}) {
  const t = useTranslations("gedu.substitution");
  const c = useTranslations("common");

  const [open, setOpen] = useState(false);
  /** The session picked in step one, or `null` while step one is up. */
  const [picked, setPicked] = useState<GeduUpcomingSession | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The last absence filed from here, and what it is called. */
  const [filed, setFiled] = useState<GeduUpcomingSession | null>(null);
  /**
   * What this component has filed in this visit.
   *
   * It is knowledge the page really has — it made the write — and it is what
   * stops the obvious second mistake: filing for Monday, reopening the picker,
   * and being offered Monday again.
   */
  const [filedHere, setFiledHere] = useState<readonly string[]>([]);

  if (sessions.length === 0) return null;

  const unavailable = new Set([...filedSessionKeys, ...filedHere]);

  const close = () => {
    if (committing) return;
    setOpen(false);
    setPicked(null);
    setError(null);
  };

  const file = async (draft: SessionSubstitutionRequestDraft) => {
    if (picked === null) return;
    setError(null);
    setCommitting(true);
    try {
      await onFile(picked, draft);
      setFiled(picked);
      setFiledHere((was) => [...was, picked.key]);
      setOpen(false);
      setPicked(null);
    } catch {
      setError(t("fileFailed"));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        // Outlined, not the act colour: the one act this page is asking for is
        // offering to substitute, and a second filled button beside it would be
        // two things competing for the same press.
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {t("fileAction")}
      </Button>

      {/* The confirmation stays on this page rather than sending the gedu
          somewhere: what they came to do is done, and the only thing left to
          say is where the absence now shows. */}
      {filed !== null && (
        <FiledConfirmation
          session={filed}
          href={resolveWorkspaceHref(filed)}
        />
      )}

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        {picked === null ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("filePickTitle")}</DialogTitle>
              <DialogDescription>{t("filePickBody")}</DialogDescription>
            </DialogHeader>

            <ul className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
              {sessions.map((session) => (
                <li key={session.key}>
                  <SessionPickerRow
                    session={session}
                    reason={
                      unavailable.has(session.key)
                        ? t("fileAlreadyRequested")
                        : null
                    }
                    onPick={() => {
                      setError(null);
                      setPicked(session);
                    }}
                  />
                </li>
              ))}
            </ul>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {c("cancel")}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : (
          <SessionSubstitutionRequestForm
            committing={committing}
            error={error}
            context={<SessionSummaryLine session={picked} />}
            // The way out of step two is back to step one, not out of the
            // dialog: the gedu picked the wrong session far more often than
            // they change their mind about filing at all.
            cancelLabel={c("back")}
            onCancel={() => {
              if (committing) return;
              setError(null);
              setPicked(null);
            }}
            onConfirm={(draft) => void file(draft)}
          />
        )}
      </Dialog>
    </div>
  );
}

/** One session, as the picker offers it — or refuses it. */
function SessionPickerRow({
  session,
  reason,
  onPick,
}: {
  session: GeduUpcomingSession;
  /** Why this row cannot be picked, or `null` when it can. */
  reason: string | null;
  onPick: () => void;
}) {
  const t = useTranslations("gedu.substitution");

  return (
    <button
      type="button"
      disabled={reason !== null}
      onClick={onPick}
      className={cn(
        "flex w-full flex-col items-start gap-0.5 rounded-md border border-border p-3 text-left transition-colors",
        reason === null
          ? "hover:border-act hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
          : "opacity-60",
      )}
    >
      <SessionSummaryLine session={session} />
      <span className="text-xs text-muted-foreground">
        {session.isRemote ? (
          <span className="inline-flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("poolRemote")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {session.siteName ?? t("poolSiteUnknown")}
          </span>
        )}
      </span>
      {/* In place of the row's status, exactly where a reader's eye already is
          — rather than a refusal one click later. */}
      {reason !== null && (
        <span className="text-xs font-medium text-warning">{reason}</span>
      )}
    </button>
  );
}

/**
 * When it is, and what it is — the two facts that tell one row from the next,
 * in that order because the reader came here holding a date.
 *
 * A `span` run rather than paragraphs, because the picker row is a button and
 * the form's context line is one line of prose.
 */
function SessionSummaryLine({ session }: { session: GeduUpcomingSession }) {
  const locale = useLocale();
  const timeZone = useTimezone();

  return (
    <>
      <span className="block text-sm font-medium tabular-nums text-foreground">
        {sessionWhen(session, locale, timeZone)}
      </span>
      <span className="block text-sm text-muted-foreground">
        {session.groupName === null
          ? session.productName
          : `${session.productName} — ${session.groupName}`}
      </span>
    </>
  );
}

/** What was filed, and where it now shows. */
function FiledConfirmation({
  session,
  href,
}: {
  session: GeduUpcomingSession;
  href: AppHrefObject | null;
}) {
  const t = useTranslations("gedu.substitution");
  const locale = useLocale();
  const timeZone = useTimezone();

  return (
    <StatusLine status="success" size="sm">
      <span>
        {t("fileFiled", {
          product: session.productName,
          when: sessionWhen(session, locale, timeZone),
        })}
      </span>
      {href !== null && (
        <>
          {" "}
          <Link
            href={href}
            className="font-medium text-act underline-offset-4 hover:underline"
          >
            {t("fileFiledLink")}
          </Link>
        </>
      )}
    </StatusLine>
  );
}

/**
 * The session's day and clock face, **in the viewer's zone** — a gedu deciding
 * which afternoon they cannot make is busy in their own timezone, not in the
 * club's.
 *
 * The same wording the pool's cards use for the same fact, so a page carrying
 * both says "when" one way.
 */
function sessionWhen(
  session: GeduUpcomingSession,
  locale: string,
  timeZone: string,
): string {
  return `${formatDate(session.startsAt, locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  })}, ${formatTimeRange(session.startsAt, session.endsAt, locale, timeZone)}`;
}
