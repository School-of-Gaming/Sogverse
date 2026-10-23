"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LocaleTabs } from "@/components/ui/locale-tabs";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  LOCALE_CONFIG,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import {
  activeLocaleDraft,
  addLocaleTab,
  editActiveLocaleDraft,
  removeLocaleTab,
  selectLocaleTab,
  writtenLocales,
  type LocaleTabState,
} from "@/lib/i18n/locale-tabs";
import { cn } from "@/lib/cn";
import {
  NO_BREAK_NAMES,
  checkHolidayBreak,
  type HolidayBreakDraft,
  type HolidayBreakNames,
  type HolidayBreakProblem,
} from "./holiday-calendar-draft";
import { useBreakCheckLine } from "./use-break-check-line";

const START_ID = "holiday-break-start";
const END_ID = "holiday-break-end";
const NAME_ID = "holiday-break-name";

interface HolidayBreakDialogProps {
  /** Add opens on a blank break and offers "Save and add another". */
  mode: "add" | "edit";
  /** The break as the dialog opens it — blank, under a new key, to add one. */
  initialBreak: HolidayBreakDraft;
  /** The calendar's language tabs, holding every break's name. */
  initialNames: LocaleTabState<HolidayBreakNames>;
  /** Today in the viewer's zone, for the date pickers. */
  today: string;
  /**
   * The break, checked, and the calendar's tabs with its name in them. Nothing
   * is written anywhere: the form files both into its draft, which reaches the
   * database only on the page's own Save. `another` asks for a fresh blank
   * break once this one is filed.
   */
  onSave: (
    entry: HolidayBreakDraft,
    names: LocaleTabState<HolidayBreakNames>,
    another: boolean,
  ) => void;
  onClose: () => void;
}

/**
 * Adding or editing one break: its first and last day, then its name in each
 * of the calendar's languages.
 *
 * **The dates sit above the tab bar** because every language shares them; only
 * the name is per tab. The picker's calendar opens downward, and with the dates
 * at the top of the dialog it has the dialog's height and more below it — the
 * dialog clips nothing, so the calendar may run past its bottom edge.
 *
 * **The tabs are the calendar's.** The dialog edits a copy of the calendar's
 * whole tab set, so a language added here is added to every break and one
 * removed here takes every break's name in it — on Save, never on Cancel. A tab
 * is complete when this break is named in it.
 *
 * **What belongs to one break is checked here**: both days, an end not before
 * the start, and a name in every tab. Overlaps between breaks, and the
 * calendar's own name, are the page's Save to refuse. Enter in the name saves.
 *
 * Mounted per open, keyed on the break, so the copy is seeded at mount and a
 * "Save and add another" opens a fresh one.
 */
export function HolidayBreakDialog({
  mode,
  initialBreak,
  initialNames,
  today,
  onSave,
  onClose,
}: HolidayBreakDialogProps) {
  const t = useTranslations("admin.holidayCalendars");
  const c = useTranslations("common");
  const uiLocale = resolveLocale(useLocale());
  const languageName = useLanguageNames();
  const checkLine = useBreakCheckLine();

  const [entry, setEntry] = useState(initialBreak);
  const [names, setNames] = useState(initialNames);
  // Faults are shown once a save has been asked for, then follow the fields as
  // they are fixed.
  const [attempted, setAttempted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.getElementById(START_ID)?.focus();
  }, []);

  const problem = attempted ? checkHolidayBreak(entry, names) : null;
  const check = checkLine(entry);
  const activeLocale = names.active;

  function language(locale: SupportedLocale) {
    return languageName(locale, LOCALE_CONFIG[locale].label);
  }

  function named(locale: SupportedLocale) {
    return (names.drafts[locale]?.[entry.key] ?? "").trim() !== "";
  }

  function problemSentence(found: HolidayBreakProblem): string {
    switch (found.kind) {
      case "datesRequired":
        return t("breakErrors.datesRequired");
      case "endBeforeStart":
        return t("breakErrors.endBeforeStart");
      case "nameMissing":
        return t("breakErrors.nameMissing", { language: language(found.locale) });
    }
  }

  function save(another: boolean) {
    setAttempted(true);
    if (checkHolidayBreak(entry, names) !== null) return;
    onSave(entry, names, another);
  }

  /**
   * Escape is heard by every listener on the document, the date picker's
   * among them, so one press meant for an open calendar would also close the
   * dialog and lose the break. While a picker in here is open, the press is
   * the picker's alone.
   */
  function handleOpenChange(open: boolean) {
    if (open) return;
    if (contentRef.current?.querySelector('[aria-expanded="true"]')) return;
    onClose();
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        <div ref={contentRef}>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              save(false);
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>
                {mode === "add" ? t("addBreak") : t("dialog.editTitle")}
              </DialogTitle>
            </DialogHeader>

            <div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("fields.firstDay")} htmlFor={START_ID}>
                  <DatePicker
                    id={START_ID}
                    value={entry.startDate}
                    onChange={(startDate) =>
                      setEntry((current) => ({ ...current, startDate }))
                    }
                    today={today}
                    // A break is planned in whole weeks — "autumn break, week
                    // 42" — so a week pick lands on its Monday and Sunday.
                    weekPick={{ edge: "start", weekdays: [] }}
                    rangeEnd={entry.endDate === "" ? null : entry.endDate}
                  />
                </Field>
                <Field label={t("fields.lastDay")} htmlFor={END_ID}>
                  <DatePicker
                    id={END_ID}
                    value={entry.endDate}
                    onChange={(endDate) => setEntry((current) => ({ ...current, endDate }))}
                    today={today}
                    weekPick={{ edge: "end", weekdays: [] }}
                    rangeStart={entry.startDate === "" ? null : entry.startDate}
                  />
                </Field>
              </div>
              {/* Held open while the dates are incomplete, so the tabs and the
                  name do not drop a line the moment the second day is set. */}
              <p
                className={cn(
                  "mt-2 text-xs tabular-nums text-muted-foreground",
                  check === null && "invisible",
                )}
              >
                {check ?? " "}
              </p>
            </div>

            <Field label={t("fields.languages")}>
              <LocaleTabs
                written={writtenLocales(names.drafts)}
                active={activeLocale}
                onSelect={(locale) => setNames((tabs) => selectLocaleTab(tabs, locale))}
                onAdd={(locale) =>
                  setNames((tabs) => addLocaleTab(tabs, locale, NO_BREAK_NAMES))
                }
                onRemove={(locale) =>
                  setNames((tabs) => removeLocaleTab(tabs, locale, uiLocale))
                }
                isComplete={named}
                attention={(locale) =>
                  attempted && !named(locale)
                    ? t("breakErrors.nameMissing", { language: language(locale) })
                    : null
                }
              />
            </Field>

            <Field
              label={t("fields.breakName", { language: language(activeLocale) })}
              htmlFor={NAME_ID}
              hint={t("hints.languages")}
            >
              {({ hintId }) => (
                <Input
                  // A tab switch is a different field: remount, so the caret
                  // and any undo history do not carry across languages.
                  key={activeLocale}
                  id={NAME_ID}
                  lang={activeLocale}
                  value={activeLocaleDraft(names, NO_BREAK_NAMES)[entry.key] ?? ""}
                  onChange={(event) => {
                    const name = event.target.value;
                    setNames((tabs) =>
                      editActiveLocaleDraft(tabs, { [entry.key]: name }, NO_BREAK_NAMES),
                    );
                  }}
                  aria-describedby={hintId}
                  autoComplete="off"
                />
              )}
            </Field>

            {problem && (
              <p role="alert" className="text-sm text-destructive">
                {problemSentence(problem)}
              </p>
            )}

            {/* Negative first in the DOM, affirmative last; the footer is
                settled before the dialog opens, since the mode is. */}
            <DialogFooter className="mt-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                {c("cancel")}
              </Button>
              {mode === "add" && (
                <Button type="button" variant="outline" onClick={() => save(true)}>
                  {t("dialog.saveAndAddAnother")}
                </Button>
              )}
              <Button type="submit">{c("save")}</Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
