"use client";

import { useState } from "react";
import { CircleCheck, CircleDashed, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormSection } from "@/components/admin/products/form-primitives";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/ui/unsaved-changes-guard";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  LOCALE_CONFIG,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { formatCompactDateRange } from "@/lib/utils";
import type { HolidayCalendarInput } from "@/services/holiday-calendars";
import {
  breakNameLanguages,
  breaksInDateOrder,
  holidayCalendarFailureReason,
  newBreakKey,
  sameHolidayCalendarDraft,
  shownBreakName,
  validateHolidayCalendarDraft,
  withCommittedBreak,
  withoutBreakName,
  type HolidayBreakDraft,
  type HolidayCalendarDraft,
  type HolidayCalendarDraftProblem,
} from "./holiday-calendar-draft";
import type { HolidayImpactSummary } from "./holiday-calendar-impact";
import { HolidayCalendarImpactDialog } from "./holiday-calendar-impact-dialog";
import { HolidayBreakDialog } from "./holiday-break-dialog";
import { useBreakCheckLine } from "./use-break-check-line";

interface HolidayCalendarFormProps {
  /** What the form opens with: a blank draft, or a stored calendar's. */
  initialDraft: HolidayCalendarDraft;
  /** The submit button's words — "Create calendar" or "Save changes". */
  submitLabel: string;
  /** Today in the viewer's zone, for the date pickers. */
  today: string;
  /**
   * Save, then leave. **Throws** on refusal, so the form renders the reason.
   * On success the page navigates away, which is why the committing flag is
   * never cleared on that path.
   */
  onSubmit: (input: HolidayCalendarInput) => Promise<void>;
  /**
   * What saving would change, per club, asked before the save. Given only
   * where a club follows the calendar: a new calendar, or one nobody follows,
   * saves straight away. Throws on refusal, like `onSubmit`.
   */
  preview?: (input: HolidayCalendarInput) => Promise<HolidayImpactSummary[]>;
  onCancel: () => void;
  /**
   * A section shown after the breaks and before the form's actions — the edit
   * page's list of the clubs following the calendar.
   */
  children?: React.ReactNode;
}

/** The break the dialog has open: one being added, or one being edited. */
type OpenBreak = { mode: "add" | "edit"; key: string };

/**
 * The create and edit form for a holiday calendar: its admin-only name, and
 * its breaks — each a first and a last day, both inclusive, and a name in
 * every language the calendar is written in.
 *
 * **The page lists the breaks; a dialog edits one.** Each break is one line
 * for scanning — its name in the admin's language, its dates with their
 * weekdays, length and weeks, and which of the calendar's languages it is named
 * in — ordered by first day, with its edit and remove buttons. Adding or
 * editing opens the break dialog, which carries the dates, the language tabs
 * and the name, and files the break into the draft on its own Save; nothing is
 * written until the page's Save.
 *
 * **The calendar's languages are added and removed in the dialog's tab bar**,
 * the one per-locale grammar every editor shares, and the change applies to the
 * whole calendar: every line on the page then shows a language a break still
 * lacks a name in.
 *
 * **Presentational end to end**: it takes a draft, a save and an optional
 * preview, and knows nothing about React Query, so the create page and the
 * edit page render this exact component.
 *
 * **Saving a calendar some club follows asks first.** The save is live — every
 * following club gains or loses the dates at once, past months included — so
 * on Save the preview is asked with the same breaks, the button holding while
 * it runs (it is an aggregate over every following club's plan and records);
 * an edit that changes no club saves straight on, and one that does opens the
 * confirm dialog listing what each club's families will see.
 */
export function HolidayCalendarForm({
  initialDraft,
  submitLabel,
  today,
  onSubmit,
  preview,
  onCancel,
  children,
}: HolidayCalendarFormProps) {
  const t = useTranslations("admin.holidayCalendars");
  const c = useTranslations("common");
  const marks = useTranslations("localeTabs");
  const uiLocale = resolveLocale(useLocale());
  const languageName = useLanguageNames();
  const checkLine = useBreakCheckLine();

  const [draft, setDraft] = useState<HolidayCalendarDraft>(initialDraft);
  // What the form opened with — the stored calendar or the blank new one —
  // held as it was at mount, like the draft seeded from it.
  const [opened] = useState<HolidayCalendarDraft>(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  // The save waiting on the confirm dialog. Kept after the dialog closes, so
  // its list does not empty out while it animates away.
  const [pending, setPending] = useState<{
    input: HolidayCalendarInput;
    impacts: HolidayImpactSummary[];
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [openBreak, setOpenBreak] = useState<OpenBreak | null>(null);

  // What leaving would lose: the name, a date, a break added or removed, or a
  // break's name in any language. From the save's press on there is nothing to
  // ask about — a save that lands leaves the page, and a refused one clears
  // `committing` and asks again; so does the confirm dialog opening, since
  // nothing is saved until it is answered. A break dialog's unsaved copy is
  // not counted: it is still on screen, in front of the admin.
  const unsaved = !committing && !sameHolidayCalendarDraft(draft, opened);

  function language(locale: SupportedLocale) {
    return languageName(locale, LOCALE_CONFIG[locale].label);
  }

  /** A break as a sentence names it: its name, and its dates once it has them. */
  function breakLabel(entry: HolidayBreakDraft): string {
    const name = shownBreakName(draft.names, entry.key, uiLocale)?.name ?? t("unnamedBreak");
    if (entry.startDate === "" || entry.endDate === "") return name;
    return `${name} (${formatCompactDateRange(entry.startDate, entry.endDate, uiLocale, today)})`;
  }

  function addBreak() {
    setOpenBreak({ mode: "add", key: newBreakKey() });
  }

  function removeBreak(key: string) {
    setDraft((current) => ({
      ...current,
      breaks: current.breaks.filter((entry) => entry.key !== key),
      names: withoutBreakName(current.names, key),
    }));
  }

  /** The first problem with the draft, as the admin reads it. */
  function problemSentence(problem: HolidayCalendarDraftProblem): string {
    switch (problem.kind) {
      case "nameRequired":
        return t("errors.nameRequired");
      case "datesRequired":
        return t("errors.datesRequired", { name: breakLabel(draft.breaks[problem.index]) });
      case "endBeforeStart":
        return t("errors.endBeforeStart", { name: breakLabel(draft.breaks[problem.index]) });
      case "breakNameMissing":
        return t("errors.breakNameMissing", {
          name: breakLabel(draft.breaks[problem.index]),
          language: language(problem.locale),
        });
      case "overlap":
        return t("errors.overlap", {
          first: breakLabel(draft.breaks[problem.first]),
          second: breakLabel(draft.breaks[problem.second]),
        });
    }
  }

  function failureSentence(failure: unknown): string {
    const reason = holidayCalendarFailureReason(failure);
    return reason === null
      ? t("errors.saveFailed")
      : t("errors.saveFailedWithReason", { reason });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const result = validateHolidayCalendarDraft(draft);
    if (!result.ok) {
      setError(problemSentence(result.problem));
      return;
    }

    // Live before the first render after the click: a second press while the
    // preview or the save is in flight would ask, or save, twice.
    setCommitting(true);
    try {
      if (preview) {
        const impacts = await preview(result.input);
        if (impacts.length > 0) {
          // The dialog owns the next press, and its own latch with it.
          setCommitting(false);
          setPending({ input: result.input, impacts });
          setConfirming(true);
          return;
        }
      }
      await onSubmit(result.input);
    } catch (failure) {
      // Cleared only here: the success path leaves the page.
      setCommitting(false);
      setError(failureSentence(failure));
    }
  }

  const listed = breaksInDateOrder(draft.breaks);
  const editing =
    openBreak === null
      ? null
      : (draft.breaks.find((entry) => entry.key === openBreak.key) ?? {
          key: openBreak.key,
          id: null,
          startDate: "",
          endDate: "",
        });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <UnsavedChangesGuard when={unsaved} />
      <FormSection title={t("sections.calendar")}>
        <Field
          label={t("fields.name")}
          htmlFor="holiday-calendar-name"
          hint={t("hints.name")}
        >
          {({ hintId }) => (
            <Input
              id="holiday-calendar-name"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              aria-describedby={hintId}
              autoComplete="off"
            />
          )}
        </Field>
      </FormSection>

      <FormSection
        title={t("sections.breaks")}
        description={t("sections.breaksDescription")}
      >
        {listed.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noBreaks")}</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {listed.map((entry) => {
              const shown = shownBreakName(draft.names, entry.key, uiLocale);
              const label = shown?.name ?? t("unnamedBreak");
              const languages = breakNameLanguages(draft.names, entry.key);
              return (
                <li key={entry.key} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    {/* The name, then the languages it is written in: they
                        wrap under it rather than push past the row, however
                        many languages the calendar takes on. */}
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span
                        lang={shown?.locale}
                        className={shown ? "font-medium" : "font-medium text-muted-foreground"}
                      >
                        {label}
                      </span>
                      <ul
                        aria-label={t("fields.languages")}
                        className="flex flex-wrap gap-x-2.5 gap-y-1"
                      >
                        {languages.map(({ locale, named }) => {
                          const Mark = named ? CircleCheck : CircleDashed;
                          return (
                            <li
                              key={locale}
                              className={
                                named
                                  ? "inline-flex items-center gap-1 text-xs text-muted-foreground"
                                  : "inline-flex items-center gap-1 text-xs text-foreground"
                              }
                            >
                              <Mark className="h-3 w-3" aria-hidden />
                              {LOCALE_CONFIG[locale].nativeLabel}
                              <span className="sr-only">
                                {named ? marks("complete") : marks("notComplete")}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {checkLine(entry)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setOpenBreak({ mode: "edit", key: entry.key })}
                      aria-label={t("editBreak", { name: label })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeBreak(entry.key)}
                      aria-label={t("removeBreak", { name: label })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div>
          <Button type="button" variant="outline" onClick={addBreak} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("addBreak")}
          </Button>
        </div>
      </FormSection>

      {children}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Negative first in the DOM, affirmative last: rightmost in a row, and
          topmost once the row reverses into a stack. */}
      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {c("cancel")}
        </Button>
        <Button type="submit" size="lg" disabled={committing}>
          {committing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>

      {openBreak !== null && editing !== null && (
        <HolidayBreakDialog
          key={openBreak.key}
          mode={openBreak.mode}
          initialBreak={editing}
          initialNames={draft.names}
          today={today}
          onSave={(entry, names, another) => {
            setDraft((current) => withCommittedBreak(current, entry, names));
            setOpenBreak(another ? { mode: "add", key: newBreakKey() } : null);
          }}
          onClose={() => setOpenBreak(null)}
        />
      )}

      <HolidayCalendarImpactDialog
        open={confirming}
        onOpenChange={setConfirming}
        impacts={pending?.impacts ?? []}
        onConfirm={async () => {
          if (!pending) return;
          // The form's own button is behind the dialog and must not re-enable
          // between the save landing and the page leaving.
          setCommitting(true);
          try {
            await onSubmit(pending.input);
          } catch (failure) {
            setCommitting(false);
            throw failure;
          }
        }}
        describeError={failureSentence}
      />
    </form>
  );
}
