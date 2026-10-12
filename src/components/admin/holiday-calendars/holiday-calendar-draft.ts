import type { SupportedLocale } from "@/lib/constants/locales";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import {
  NO_RICH_BODIES,
  draftsToSave,
  newLocaleTabs,
  openLocaleTabs,
  sameLocaleDrafts,
  writtenLocales,
  type LocaleTabState,
} from "@/lib/i18n/locale-tabs";
import type {
  HolidayBreakInput,
  HolidayCalendarDetail,
  HolidayCalendarInput,
} from "@/services/holiday-calendars";

/**
 * One break as the form holds it. `key` is the row's identity in the form —
 * stable across edits, and the key each locale's names are filed under — and
 * `id` is the stored break it edits, `null` for a new one. Dates are bare
 * `YYYY-MM-DD`, or `""` until picked.
 */
export interface HolidayBreakDraft {
  key: string;
  id: string | null;
  startDate: string;
  endDate: string;
}

/**
 * The form's own state.
 *
 * **The names are filed by locale, then by break**, which is the shape the
 * shared locale tabs take: one draft per calendar language, holding every
 * break's name in that language. So a language is added to or removed from the
 * whole calendar at once — the tabs are the calendar's, not each break's — and
 * removing one discards every break's name in it. A break's name in a language
 * is missing when its entry is absent or blank, and a tab where every break's
 * name is missing is a blank tab, which the save leaves out.
 */
export interface HolidayCalendarDraft {
  /** Admin-only. */
  name: string;
  breaks: HolidayBreakDraft[];
  names: LocaleTabState<HolidayBreakNames>;
}

/** One language's tab: every break's name in it, by break key. */
export type HolidayBreakNames = Record<string, string>;

/** A tab with no break named in it. */
export const NO_BREAK_NAMES: HolidayBreakNames = {};

/** A new row's form key. Only unique within one form; never stored. */
export function newBreakKey(): string {
  return `new-${crypto.randomUUID()}`;
}

/** A blank draft for the create form: no breaks, one tab in the UI locale. */
export function emptyHolidayCalendarDraft(
  uiLocale: SupportedLocale,
): HolidayCalendarDraft {
  return { name: "", breaks: [], names: newLocaleTabs(uiLocale, NO_BREAK_NAMES) };
}

/**
 * A stored calendar as the edit form opens it. Its languages are every locale
 * any break is named in, and it opens on the tab a reader of the UI locale
 * would be shown; a calendar with no breaks opens on one tab in the UI locale.
 * The stored break's id is its form key, so an edited break stays that break.
 */
export function holidayCalendarDraft(
  calendar: Pick<HolidayCalendarDetail, "name" | "breaks">,
  uiLocale: SupportedLocale,
): HolidayCalendarDraft {
  const names: Partial<Record<SupportedLocale, HolidayBreakNames>> = {};
  for (const entry of calendar.breaks) {
    for (const { locale, name } of inLocaleOrder(entry.names)) {
      // exact-locale: fills each tab with its own saved names
      names[locale] = { ...names[locale], [entry.id]: name };
    }
  }

  return {
    name: calendar.name,
    breaks: calendar.breaks.map((entry) => ({
      key: entry.id,
      id: entry.id,
      startDate: entry.startDate,
      endDate: entry.endDate,
    })),
    names: openLocaleTabs(names, uiLocale, NO_BREAK_NAMES),
  };
}

/**
 * The first break, by position, with no name in `names` — or `null` when every
 * break is named in that tab.
 */
export function firstUnnamedBreak(
  breaks: readonly HolidayBreakDraft[],
  names: HolidayBreakNames,
): number | null {
  const index = breaks.findIndex(
    (entry) => (names[entry.key] ?? "").trim() === "",
  );
  return index === -1 ? null : index;
}

/**
 * The tabs once a break is removed: its name gone from every one of them, so a
 * tab that named only that break reads as blank again, and the comparison with
 * the saved copy does not count a name nobody can see any more.
 */
export function withoutBreakName(
  tabs: LocaleTabState<HolidayBreakNames>,
  key: string,
): LocaleTabState<HolidayBreakNames> {
  const drafts: LocaleTabState<HolidayBreakNames>["drafts"] = {};
  for (const locale of writtenLocales(tabs.drafts)) {
    const names = { ...tabs.drafts[locale] };
    delete names[key];
    drafts[locale] = names;
  }
  return { ...tabs, drafts };
}

/**
 * Whether the form still holds what it opened with: the calendar's name, its
 * breaks and their dates, and every tab's names. Which tab is shown is no
 * change, and a blank tab is no version on either side.
 */
export function sameHolidayCalendarDraft(
  draft: HolidayCalendarDraft,
  opened: HolidayCalendarDraft,
): boolean {
  return (
    draft.name === opened.name &&
    draft.breaks.length === opened.breaks.length &&
    draft.breaks.every((entry, index) => {
      const before = opened.breaks[index];
      return (
        entry.key === before.key &&
        entry.startDate === before.startDate &&
        entry.endDate === before.endDate
      );
    }) &&
    sameLocaleDrafts(draft.names.drafts, opened.names.drafts, NO_RICH_BODIES)
  );
}

/**
 * The first thing wrong with a draft, in the order the form reads: the name,
 * then each break top to bottom, then two breaks that overlap. A break is named
 * by its position in the form (`index`, zero-based) and a language by its
 * locale code, so the form can put both into the reader's words.
 *
 * The functions refuse every one of these too, with sentences of their own;
 * checking here first lets the form point at the row rather than at dates.
 */
export type HolidayCalendarDraftProblem =
  | { kind: "nameRequired" }
  | { kind: "datesRequired"; index: number }
  | { kind: "endBeforeStart"; index: number }
  | { kind: "breakNameMissing"; index: number; locale: SupportedLocale }
  | { kind: "overlap"; first: number; second: number };

export type HolidayCalendarDraftResult =
  | { ok: true; input: HolidayCalendarInput }
  | { ok: false; problem: HolidayCalendarDraftProblem };

/**
 * Validate a draft and, when it holds, build what the writers take.
 *
 * **Every break needs a name in every language the calendar uses**: a family
 * reads a break's name in their own language where it is written, and a
 * calendar written in Finnish and English whose autumn break had only a Finnish
 * name would show an English reader a Finnish word for one break and English
 * for the rest. That is the product form's rule — no tab half-written — with a
 * tab complete only when every break is named in it, checked per break so the
 * refusal can point at the row. A tab with no break named in it is a blank
 * tab, and the save leaves it out; breaks named in no language at all are
 * refused against the tab being shown.
 */
export function validateHolidayCalendarDraft(
  draft: HolidayCalendarDraft,
): HolidayCalendarDraftResult {
  const fail = (
    problem: HolidayCalendarDraftProblem,
  ): HolidayCalendarDraftResult => ({ ok: false, problem });

  const name = draft.name.trim();
  if (name === "") return fail({ kind: "nameRequired" });

  const written = draftsToSave(draft.names.drafts);

  for (const [index, entry] of draft.breaks.entries()) {
    if (entry.startDate === "" || entry.endDate === "") {
      return fail({ kind: "datesRequired", index });
    }
    if (entry.endDate < entry.startDate) {
      return fail({ kind: "endBeforeStart", index });
    }
    if (written.length === 0) {
      return fail({ kind: "breakNameMissing", index, locale: draft.names.active });
    }
    const missing = written.find(
      (tab) => (tab.draft[entry.key] ?? "").trim() === "",
    );
    if (missing) {
      return fail({ kind: "breakNameMissing", index, locale: missing.locale });
    }
  }

  const overlap = firstOverlap(draft.breaks);
  if (overlap) return fail({ kind: "overlap", ...overlap });

  const breaks: HolidayBreakInput[] = draft.breaks.map((entry) => ({
    id: entry.id,
    start_date: entry.startDate,
    end_date: entry.endDate,
    names: written.map((tab) => ({
      locale: tab.locale,
      name: (tab.draft[entry.key] ?? "").trim(),
    })),
  }));

  return { ok: true, input: { name, breaks } };
}

/**
 * The first two breaks that share a day, by position in the form — both ends
 * are inclusive, so a break ending on the day the next begins overlaps it.
 * Dates are bare ISO dates, which compare correctly as strings.
 */
function firstOverlap(
  breaks: readonly HolidayBreakDraft[],
): { first: number; second: number } | null {
  for (let first = 0; first < breaks.length; first++) {
    for (let second = first + 1; second < breaks.length; second++) {
      const a = breaks[first];
      const b = breaks[second];
      if (a.startDate <= b.endDate && b.startDate <= a.endDate) {
        return { first, second };
      }
    }
  }
  return null;
}

/**
 * Why a save or a preview was refused, as the form says it. The calendar
 * functions raise sentences written to be read — "Another calendar is already
 * called …", "The breaks from … and from … overlap" — so anything carrying a
 * message is shown as it is; anything else (a network fault, a bug) has
 * nothing to quote.
 */
export function holidayCalendarFailureReason(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if (!("message" in error)) return null;
  const { message } = error;
  return typeof message === "string" && message.length > 0 ? message : null;
}
