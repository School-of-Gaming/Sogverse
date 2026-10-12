"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormSection } from "@/components/admin/products/form-primitives";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LocaleTabs } from "@/components/ui/locale-tabs";
import { useLanguageNames } from "@/hooks/use-language-names";
import { LOCALE_CONFIG, resolveLocale } from "@/lib/constants/locales";
import {
  addLocaleTab,
  removeLocaleTab,
  writtenLocales,
  type LocaleTabState,
} from "@/lib/i18n/locale-tabs";
import type { HolidayCalendarInput } from "@/services/holiday-calendars";
import {
  holidayCalendarFailureReason,
  newBreakKey,
  validateHolidayCalendarDraft,
  type HolidayBreakDraft,
  type HolidayCalendarDraft,
  type HolidayCalendarDraftProblem,
} from "./holiday-calendar-draft";
import type { HolidayImpactSummary } from "./holiday-calendar-impact";
import { HolidayCalendarImpactDialog } from "./holiday-calendar-impact-dialog";

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
}

/**
 * The create and edit form for a holiday calendar: its admin-only name, and
 * its breaks — each a first and a last day, both inclusive, and a name in
 * every language the calendar is written in.
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
}: HolidayCalendarFormProps) {
  const t = useTranslations("admin.holidayCalendars");
  const c = useTranslations("common");
  const uiLocale = resolveLocale(useLocale());
  const languageName = useLanguageNames();

  const [draft, setDraft] = useState<HolidayCalendarDraft>(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  // The save waiting on the confirm dialog. Kept after the dialog closes, so
  // its list does not empty out while it animates away.
  const [pending, setPending] = useState<{
    input: HolidayCalendarInput;
    impacts: HolidayImpactSummary[];
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const locales = writtenLocales(draft.names);
  const activeLanguage = languageName(
    draft.activeLocale,
    LOCALE_CONFIG[draft.activeLocale].label,
  );

  /** The draft's names as the shared tab-set helpers take them, and back. */
  function updateTabs(
    change: (
      tabs: LocaleTabState<Record<string, string>>,
    ) => LocaleTabState<Record<string, string>>,
  ) {
    setDraft((current) => {
      const next = change({ drafts: current.names, active: current.activeLocale });
      return { ...current, names: next.drafts, activeLocale: next.active };
    });
  }

  function updateBreak(key: string, patch: Partial<HolidayBreakDraft>) {
    setDraft((current) => ({
      ...current,
      breaks: current.breaks.map((entry) =>
        entry.key === key ? { ...entry, ...patch } : entry,
      ),
    }));
  }

  function setBreakName(key: string, name: string) {
    setDraft((current) => ({
      ...current,
      names: {
        ...current.names,
        [current.activeLocale]: {
          ...current.names[current.activeLocale],
          [key]: name,
        },
      },
    }));
  }

  function addBreak() {
    setDraft((current) => ({
      ...current,
      breaks: [
        ...current.breaks,
        { key: newBreakKey(), id: null, startDate: "", endDate: "" },
      ],
    }));
  }

  function removeBreak(key: string) {
    setDraft((current) => ({
      ...current,
      breaks: current.breaks.filter((entry) => entry.key !== key),
    }));
  }

  function language(locale: keyof typeof LOCALE_CONFIG) {
    return languageName(locale, LOCALE_CONFIG[locale].label);
  }

  /** The first problem with the draft, as the admin reads it. */
  function problemSentence(problem: HolidayCalendarDraftProblem): string {
    switch (problem.kind) {
      case "nameRequired":
        return t("errors.nameRequired");
      case "datesRequired":
        return t("errors.datesRequired", { number: problem.index + 1 });
      case "endBeforeStart":
        return t("errors.endBeforeStart", { number: problem.index + 1 });
      case "breakNameMissing":
        return t("errors.breakNameMissing", {
          number: problem.index + 1,
          language: language(problem.locale),
        });
      case "overlap":
        return t("errors.overlap", {
          first: problem.first + 1,
          second: problem.second + 1,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
        <Field label={t("fields.languages")} hint={t("hints.languages")}>
          <LocaleTabs
            written={locales}
            active={draft.activeLocale}
            onSelect={(locale) =>
              setDraft((current) => ({ ...current, activeLocale: locale }))
            }
            onAdd={(locale) => updateTabs((tabs) => addLocaleTab(tabs, locale, {}))}
            onRemove={(locale) =>
              updateTabs((tabs) => removeLocaleTab(tabs, locale, uiLocale))
            }
            addLabel={t("addLocale")}
            removeLabel={(name) => t("removeLocale", { language: name })}
          />
        </Field>

        {draft.breaks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noBreaks")}</p>
        ) : (
          <ol className="divide-y divide-border">
            {draft.breaks.map((entry, index) => {
              const number = index + 1;
              const startId = `holiday-break-${entry.key}-start`;
              const endId = `holiday-break-${entry.key}-end`;
              const nameId = `holiday-break-${entry.key}-name-${draft.activeLocale}`;
              return (
                <li
                  key={entry.key}
                  className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[11rem_11rem_1fr_auto] sm:items-end"
                >
                  {/* The number every refusal names a break by. */}
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground sm:col-span-4">
                    {t("breakNumber", { number })}
                  </p>
                  <Field label={t("fields.firstDay")} htmlFor={startId}>
                    <DatePicker
                      id={startId}
                      value={entry.startDate}
                      onChange={(startDate) => updateBreak(entry.key, { startDate })}
                      today={today}
                      // A break is planned in whole weeks — "autumn break, week
                      // 42" — so a week pick lands on its Monday and Sunday.
                      weekPick={{ edge: "start", weekdays: [] }}
                      rangeEnd={entry.endDate === "" ? null : entry.endDate}
                    />
                  </Field>
                  <Field label={t("fields.lastDay")} htmlFor={endId}>
                    <DatePicker
                      id={endId}
                      value={entry.endDate}
                      onChange={(endDate) => updateBreak(entry.key, { endDate })}
                      today={today}
                      weekPick={{ edge: "end", weekdays: [] }}
                      rangeStart={entry.startDate === "" ? null : entry.startDate}
                    />
                  </Field>
                  <Field
                    label={t("fields.breakName", { language: activeLanguage })}
                    htmlFor={nameId}
                  >
                    <Input
                      id={nameId}
                      lang={draft.activeLocale}
                      value={draft.names[draft.activeLocale]?.[entry.key] ?? ""}
                      onChange={(event) => setBreakName(entry.key, event.target.value)}
                      autoComplete="off"
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeBreak(entry.key)}
                    aria-label={t("removeBreak", { number })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}

        <Button type="button" variant="outline" onClick={addBreak} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t("addBreak")}
        </Button>
      </FormSection>

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
