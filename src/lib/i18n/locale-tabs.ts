import { sameAuthoredBody, type AuthoredBodies } from "@/lib/authored-bodies";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "./resolve-translation";

/*
 * **The language tabs of an editor of content written per locale** — the
 * product, Library article, spotlight, Team profile and holiday calendar
 * editors alike, so an admin meets one behaviour in all of them. Pure, so each
 * form applies these inside its own state setter; the tab bar that drives them
 * is the shared `LocaleTabs` component.
 *
 * - An existing item opens on the tab a reader of the admin's UI locale would
 *   be shown (`resolveTranslation()`: the UI locale, then English, then the
 *   first written in `SUPPORTED_LOCALES` order); an item with nothing written
 *   at all opens on one empty tab in the UI locale.
 * - A new item opens on one empty tab, in the UI locale.
 * - Removing the tab being shown moves to the first remaining tab in
 *   `SUPPORTED_LOCALES` order, or to the UI locale when none remains.
 * - **A blank tab is not a version.** A tab where every field is blank, once
 *   trimmed, is a tab opened and not used: a save leaves it out, the check of
 *   what may be saved ignores it, and so does the comparison with the saved
 *   copy. A tab partly written is judged by the editor's own rule for a
 *   complete one.
 */

/** The tab an existing item opens on, given its written locales in `SUPPORTED_LOCALES` order (`writtenLocales`). */
export function openingLocaleTab(
  written: readonly SupportedLocale[],
  uiLocale: SupportedLocale,
): SupportedLocale {
  return (
    resolveTranslation(
      written.map((locale) => ({ locale })),
      uiLocale,
    )?.locale ?? uiLocale
  );
}

/**
 * The tab shown once `removed` is closed: the one already shown when it was
 * another, else the first of `remaining` (the tabs still open, after the
 * removal) in `SUPPORTED_LOCALES` order, else the UI locale.
 */
export function localeTabAfterRemoving(
  remaining: Partial<Record<SupportedLocale, unknown>>,
  active: SupportedLocale,
  removed: SupportedLocale,
  uiLocale: SupportedLocale,
): SupportedLocale {
  if (active !== removed) return active;
  return (
    SUPPORTED_LOCALES.find((locale) => remaining[locale] !== undefined) ??
    uiLocale
  );
}

/*
 * **The tab set itself**: one draft per written locale, keyed by locale, plus
 * the tab being shown. The draft is whatever that form writes per locale — an
 * article's title, summary and body, a calendar's break names — and every one
 * of its fields is text, which is what lets blankness be one rule for all of
 * them.
 */

/** A draft whose every field is text, as typed — untrimmed. */
export type LocaleDraft<T> = Record<keyof T, string>;

/** One draft per written locale, and the tab being shown. */
export interface LocaleTabState<T> {
  drafts: Partial<Record<SupportedLocale, T>>;
  active: SupportedLocale;
}

/** The locales that have a tab, in `SUPPORTED_LOCALES` order. */
export function writtenLocales(
  drafts: Partial<Record<SupportedLocale, unknown>>,
): SupportedLocale[] {
  return SUPPORTED_LOCALES.filter((locale) => drafts[locale] !== undefined);
}

/** A new item's tabs: one, in the UI locale, holding `empty`. */
export function newLocaleTabs<T>(
  uiLocale: SupportedLocale,
  empty: T,
): LocaleTabState<T> {
  return { drafts: { [uiLocale]: empty }, active: uiLocale };
}

/**
 * A saved item's tabs: one per saved draft, open on the tab `openingLocaleTab`
 * picks. An item with nothing saved opens as a new one does.
 */
export function openLocaleTabs<T>(
  drafts: Partial<Record<SupportedLocale, T>>,
  uiLocale: SupportedLocale,
  empty: T,
): LocaleTabState<T> {
  const written = writtenLocales(drafts);
  if (written.length === 0) return newLocaleTabs(uiLocale, empty);
  return { drafts, active: openingLocaleTab(written, uiLocale) };
}

/** Show `locale`'s tab. */
export function selectLocaleTab<T>(
  state: LocaleTabState<T>,
  locale: SupportedLocale,
): LocaleTabState<T> {
  return { ...state, active: locale };
}

/** Open a tab for `locale`, seeded with `draft`, and show it. */
export function addLocaleTab<T>(
  state: LocaleTabState<T>,
  locale: SupportedLocale,
  draft: T,
): LocaleTabState<T> {
  return { drafts: { ...state.drafts, [locale]: draft }, active: locale };
}

/**
 * Close `locale`'s tab, discarding what was written in it, and move to the tab
 * `localeTabAfterRemoving` picks. The tab bar never offers to close the last
 * tab, so an item always keeps at least one.
 */
export function removeLocaleTab<T>(
  state: LocaleTabState<T>,
  locale: SupportedLocale,
  uiLocale: SupportedLocale,
): LocaleTabState<T> {
  const drafts = { ...state.drafts };
  delete drafts[locale];
  return {
    drafts,
    active: localeTabAfterRemoving(drafts, state.active, locale, uiLocale),
  };
}

/** The draft in the tab being shown, or `empty` for a tab with none. */
export function activeLocaleDraft<T>(state: LocaleTabState<T>, empty: T): T {
  return state.drafts[state.active] ?? empty;
}

/** Change fields of the draft in the tab being shown. */
export function editActiveLocaleDraft<T>(
  state: LocaleTabState<T>,
  patch: Partial<T>,
  empty: T,
): LocaleTabState<T> {
  return {
    ...state,
    drafts: {
      ...state.drafts,
      [state.active]: { ...activeLocaleDraft(state, empty), ...patch },
    },
  };
}

/** Every field blank once trimmed: a tab opened and not used. */
export function isBlankLocaleDraft<T extends LocaleDraft<T>>(draft: T): boolean {
  for (const field in draft) {
    if (draft[field].trim() !== "") return false;
  }
  return true;
}

/** A draft that is there and not blank — a version — or `undefined`. */
function versionIn<T extends LocaleDraft<T>>(
  drafts: Partial<Record<SupportedLocale, T>>,
  locale: SupportedLocale,
): T | undefined {
  const draft = drafts[locale];
  return draft === undefined || isBlankLocaleDraft(draft) ? undefined : draft;
}

/**
 * The drafts a save stores, in `SUPPORTED_LOCALES` order: every tab but the
 * blank ones. As typed — the editor trims each field as it builds its input.
 */
export function draftsToSave<T extends LocaleDraft<T>>(
  drafts: Partial<Record<SupportedLocale, T>>,
): { locale: SupportedLocale; draft: T }[] {
  return SUPPORTED_LOCALES.flatMap((locale) => {
    const draft = versionIn(drafts, locale);
    return draft === undefined ? [] : [{ locale, draft }];
  });
}

/**
 * What stops a set of per-locale drafts from being saved, under the rule
 * authored content follows: **something written, and every written tab
 * complete** by the editor's own `isComplete`. Blank tabs are left out first.
 * Any single locale is enough, because a reader is shown theirs, else English,
 * else the first written (`resolveTranslation()`); a tab partly written is
 * refused rather than saved as a gap, so what was added is either finished or
 * emptied.
 *
 * `none` when nothing is written; `incomplete` names the first written tab, in
 * `SUPPORTED_LOCALES` order, that is not complete. The locale is a code — the
 * caller turns it into the reader's language name.
 */
export type LocaleDraftsProblem =
  | { kind: "none" }
  | { kind: "incomplete"; locale: SupportedLocale };

export function checkLocaleDrafts<T extends LocaleDraft<T>>(
  drafts: Partial<Record<SupportedLocale, T>>,
  isComplete: (draft: T) => boolean,
): LocaleDraftsProblem | null {
  const written = draftsToSave(drafts);
  if (written.length === 0) return { kind: "none" };
  const half = written.find((entry) => !isComplete(entry.draft));
  return half ? { kind: "incomplete", locale: half.locale } : null;
}

/**
 * The fields of a draft written in the rich editor, and the record of how that
 * editor respells an untouched body (`AuthoredBodies`). Required wherever
 * drafts are compared, so an editor holding a rich body cannot compare
 * without it; an editor with plain text only states `NO_RICH_BODIES`.
 */
export interface RichBodyFields<T> {
  fields: readonly (keyof T)[];
  bodies: AuthoredBodies;
}

/** What an editor whose drafts are all plain text passes for its rich bodies. */
export const NO_RICH_BODIES = null;

/**
 * Whether `drafts` hold exactly what `saved` holds, locale by locale: the same
 * locales written, blank tabs on either side ignored, and every field equal
 * once trimmed — a rich body also when it is the editor's own serialisation of
 * the saved one.
 */
export function sameLocaleDrafts<T extends LocaleDraft<T>>(
  drafts: Partial<Record<SupportedLocale, T>>,
  saved: Partial<Record<SupportedLocale, T>>,
  rich: RichBodyFields<T> | typeof NO_RICH_BODIES,
): boolean {
  return SUPPORTED_LOCALES.every((locale) => {
    const draft = versionIn(drafts, locale);
    const stored = versionIn(saved, locale);
    if (draft === undefined || stored === undefined) return draft === stored;
    for (const field in draft) {
      const same =
        rich !== null && rich.fields.includes(field)
          ? sameAuthoredBody(draft[field], stored[field], rich.bodies)
          : draft[field].trim() === stored[field].trim();
      if (!same) return false;
    }
    return true;
  });
}
