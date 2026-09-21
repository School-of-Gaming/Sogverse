"use client";

import { useEffect, useId, useRef, useState } from "react";
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
import {
  groupSessionsByWeek,
  initiallyShownWeeks,
  weekHeadingKind,
  type GeduUpcomingSession,
} from "@/lib/gedu-upcoming-sessions";
import { useNow, useTimezone } from "@/providers";
import { cn, formatDate, formatDateOnly, formatTimeRange } from "@/lib/utils";

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
  /**
   * Which group the picker is narrowed to, and whether the weeks past the
   * opening two have been revealed.
   *
   * **Held here rather than inside the picker**, which unmounts while step two
   * is up: a gedu who picked the wrong session and pressed Back would otherwise
   * come back to an unfiltered, re-collapsed list and have to find their way
   * down it again. Both are cleared when the dialog closes, which is where the
   * task ends.
   */
  const [groupFilter, setGroupFilter] = useState("");
  const [showingLater, setShowingLater] = useState(false);

  if (sessions.length === 0) return null;

  const unavailable = new Set([...filedSessionKeys, ...filedHere]);

  const close = () => {
    if (committing) return;
    setOpen(false);
    setPicked(null);
    setError(null);
    setGroupFilter("");
    setShowingLater(false);
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
      setGroupFilter("");
      setShowingLater(false);
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
          // The body is what scrolls, not the dialog: the height cap and the
          // column are what keep Cancel on screen at 360×740 while a term's
          // worth of sessions runs past behind it.
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col">
            <DialogHeader>
              <DialogTitle>{t("filePickTitle")}</DialogTitle>
              <DialogDescription>{t("filePickBody")}</DialogDescription>
            </DialogHeader>

            <SessionPicker
              sessions={sessions}
              unavailable={unavailable}
              groupFilter={groupFilter}
              onGroupFilter={setGroupFilter}
              showingLater={showingLater}
              onShowLater={() => setShowingLater(true)}
              onPick={(session) => {
                setError(null);
                setPicked(session);
              }}
            />

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

/**
 * The list itself: a filter where there is more than one group, the sessions
 * under week headings, and the way to the weeks that are not shown yet.
 *
 * **Five weekly clubs over a term is sixty-odd rows, and almost every absence
 * is in the next fortnight** — somebody is ill tomorrow, or has something on
 * next Tuesday. So the list opens on this week and next, and the rest is one
 * press away *(owner, 2026-09)*. The reveal appends **below** what is already
 * on screen, which is the one direction the layout rule asks nothing for, and
 * nothing about it is animated.
 *
 * **The weeks are groups, not boxes.** The rows are boxed because they are a
 * control a reader chooses among; a border around each week as well would be
 * the card-in-card the card rule is about, so a week is a heading and some
 * spacing and nothing else.
 */
function SessionPicker({
  sessions,
  unavailable,
  groupFilter,
  onGroupFilter,
  showingLater,
  onShowLater,
  onPick,
}: {
  sessions: readonly GeduUpcomingSession[];
  /** Session keys that cannot be picked, by {@link GeduUpcomingSession.key}. */
  unavailable: ReadonlySet<string>;
  /** The group id the list is narrowed to, or `""` for all of them. */
  groupFilter: string;
  onGroupFilter: (groupId: string) => void;
  showingLater: boolean;
  onShowLater: () => void;
  onPick: (session: GeduUpcomingSession) => void;
}) {
  const t = useTranslations("gedu.substitution");
  const locale = useLocale();
  const timeZone = useTimezone();
  const now = useNow();
  const filterId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  /**
   * The row the reveal has to hand focus to — the first one that was not on
   * screen a moment ago.
   *
   * Parked rather than focused on the spot, because at the moment of the click
   * that row is not rendered yet. The effect below spends it once it is.
   */
  const revealFocusRef = useRef<string | null>(null);

  const groups = pickerGroups(sessions);
  const filtered =
    groupFilter === ""
      ? sessions
      : sessions.filter((session) => session.groupId === groupFilter);
  const weeks = groupSessionsByWeek(filtered, timeZone);
  const opening = initiallyShownWeeks(weeks, now, timeZone);
  /**
   * **A list that is one group's is never gated**, whether it is one group
   * because the reader narrowed to it or because that is all they teach. A
   * single club's term is a dozen rows, which is a scroll rather than a wall,
   * and the gate is there for the five-clubs-times-a-term case.
   */
  const gated = groups.length > 1 && groupFilter === "" && !showingLater;
  const shown = gated
    ? weeks.filter((week) => opening.includes(week.weekStart))
    : weeks;
  const hidden = weeks.length - shown.length;

  /** Which of the three headings a week takes, already translated. */
  const weekHeading = (weekStart: string) => {
    const kind = weekHeadingKind(weekStart, now, timeZone);
    if (kind === "this") return t("filePickWeekThis");
    if (kind === "next") return t("filePickWeekNext");
    return t("filePickWeekOf", {
      // The Monday is a bare calendar date, so it renders UTC-pinned like
      // every other zoneless date rather than re-anchored to a viewer's zone.
      date: formatDateOnly(weekStart, locale, {
        day: "numeric",
        month: "short",
      }),
    });
  };

  useEffect(() => {
    const key = revealFocusRef.current;
    if (key === null) return;
    revealFocusRef.current = null;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-session-key="${key}"]`)
      ?.focus();
  }, [showingLater]);

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
      {/* Absent for a gedu with one group: a filter over one value is a control
          that can only ever say what the list already says. */}
      {groups.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={filterId}
            className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            {t("filePickGroupLabel")}
          </label>
          <select
            id={filterId}
            value={groupFilter}
            onChange={(event) => onGroupFilter(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="">{t("filePickAllGroups")}</option>
            {groups.map((group) => (
              <option key={group.groupId} value={group.groupId}>
                {group.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* The scroll lives here so the footer never moves: the dialog is a
          column, this is the part of it that is allowed to overflow. */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {shown.map((week) => (
          <section key={week.weekStart} className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {weekHeading(week.weekStart)}
            </h3>
            {week.sessions.map((session) => (
              <SessionPickerRow
                key={session.key}
                session={session}
                reason={
                  unavailable.has(session.key)
                    ? t("fileAlreadyRequested")
                    : null
                }
                onPick={() => onPick(session)}
              />
            ))}
          </section>
        ))}

        {hidden > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              // The first row of the first week about to appear — parked for
              // the effect, because it does not exist until this render lands.
              revealFocusRef.current =
                weeks[shown.length]?.sessions[0]?.key ?? null;
              onShowLater();
            }}
          >
            {t("filePickShowLater")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** The groups the filter offers, in the order their next session runs. */
function pickerGroups(
  sessions: readonly GeduUpcomingSession[],
): Array<{ groupId: string; label: string }> {
  const seen = new Map<string, string>();
  for (const session of sessions) {
    if (seen.has(session.groupId)) continue;
    seen.set(
      session.groupId,
      session.groupName === null
        ? session.productName
        : `${session.productName} — ${session.groupName}`,
    );
  }
  return [...seen.entries()].map(([groupId, label]) => ({ groupId, label }));
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
      data-session-key={session.key}
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
