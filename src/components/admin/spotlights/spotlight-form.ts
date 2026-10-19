import type { AuthoredBodies } from "@/lib/authored-bodies";
import type { SupportedLocale } from "@/lib/constants/locales";
import {
  checkLocaleDrafts,
  draftsToSave,
  newLocaleTabs,
  openLocaleTabs,
  sameLocaleDrafts,
  type LocaleTabState,
} from "@/lib/i18n/locale-tabs";
import type {
  AdminSpotlight,
  SpotlightInput,
  SpotlightVersionInput,
} from "@/services/spotlights/spotlights.contracts";

/**
 * The picture the form points at: the catalogue entry's id, which is what a
 * save writes, and its label and path, which the picker shows. They travel
 * together so the frame can never show one entry while the save links another.
 */
export interface SpotlightPicture {
  id: string;
  label: string;
  path: string;
}

/** One language's text as typed — untrimmed, so nothing moves under the cursor. */
export interface SpotlightVersionDraft {
  title: string;
  /** Authored markdown. */
  body: string;
}

export const EMPTY_VERSION: SpotlightVersionDraft = { title: "", body: "" };

/**
 * The editor's own state: the language tabs, a version in each, the
 * spotlight's picture and whether it is in session report emails. The tabs
 * are the shared per-locale tab set (`@/lib/i18n/locale-tabs`), so switching
 * tabs keeps what was typed in each.
 *
 * `enabled` is never true while `picture` is null: the control is disabled
 * without a picture, and taking the picture off switches it off
 * (`withPicture`), which is the database's CHECK held on the form.
 */
export interface SpotlightForm {
  tabs: LocaleTabState<SpotlightVersionDraft>;
  picture: SpotlightPicture | null;
  enabled: boolean;
}

/** A new spotlight opens on one tab, in the admin's own UI locale. */
export function emptySpotlightForm(uiLocale: SupportedLocale): SpotlightForm {
  return {
    tabs: newLocaleTabs(uiLocale, EMPTY_VERSION),
    picture: null,
    enabled: false,
  };
}

/** The form with its picture set or taken off; taking it off switches the spotlight off. */
export function withPicture(
  form: SpotlightForm,
  picture: SpotlightPicture | null,
): SpotlightForm {
  return {
    ...form,
    picture,
    enabled: picture === null ? false : form.enabled,
  };
}

/**
 * The spotlight's content rule: a version a reader can be shown has both its
 * title and its body written. The save refuses any written tab short of it.
 */
export function isCompleteSpotlightVersion(version: SpotlightVersionDraft): boolean {
  return version.title.trim() !== "" && version.body.trim() !== "";
}

/** Nothing written into a new spotlight's form yet: leaving it loses nothing. */
export function isBlankSpotlightForm(form: SpotlightForm): boolean {
  return (
    draftsToSave(form.tabs.drafts).length === 0 &&
    form.picture === null &&
    !form.enabled
  );
}

/** The saved spotlight's versions, one per locale. */
function savedVersions(
  spotlight: AdminSpotlight,
): LocaleTabState<SpotlightVersionDraft>["drafts"] {
  const versions: LocaleTabState<SpotlightVersionDraft>["drafts"] = {};
  for (const { locale, title, body } of spotlight.versions) {
    // exact-locale: each saved version fills the tab of its own locale
    versions[locale] = { title, body };
  }
  return versions;
}

/**
 * A saved spotlight as the editor opens it: on the tab a reader of the
 * admin's UI locale would be shown (`openingLocaleTab`).
 */
export function spotlightFormFromSaved(
  spotlight: AdminSpotlight,
  uiLocale: SupportedLocale,
): SpotlightForm {
  return {
    tabs: openLocaleTabs(savedVersions(spotlight), uiLocale, EMPTY_VERSION),
    // The database derives the path from the id and the read embeds the label
    // through it, so all three are present or all absent.
    picture:
      spotlight.imageId === null ||
      spotlight.imagePath === null ||
      spotlight.imageLabel === null
        ? null
        : {
            id: spotlight.imageId,
            label: spotlight.imageLabel,
            path: spotlight.imagePath,
          },
    enabled: spotlight.enabled,
  };
}

/**
 * Why a save cannot go ahead, before it is tried — each a refusal the
 * database would otherwise make:
 *
 * - `noVersion` — no language written at all.
 * - `incomplete` — a language written without its title or its body.
 */
export type SpotlightSaveBlocker =
  | { kind: "noVersion" }
  | { kind: "incomplete"; locale: SupportedLocale };

export function spotlightSaveBlocker(
  form: Pick<SpotlightForm, "tabs">,
): SpotlightSaveBlocker | null {
  const problem = checkLocaleDrafts(form.tabs.drafts, isCompleteSpotlightVersion);
  if (problem === null) return null;
  return problem.kind === "none"
    ? { kind: "noVersion" }
    : { kind: "incomplete", locale: problem.locale };
}

/**
 * What a save sends. The service's contract validates it; the whole input
 * travels on every save, because the save assigns the picture and the switch
 * and replaces the whole version set, in one write. Blank tabs are left out.
 */
export function spotlightInputFromForm(form: SpotlightForm): SpotlightInput {
  const versions: SpotlightVersionInput[] = draftsToSave(form.tabs.drafts).map(
    ({ locale, draft }) => ({
      locale,
      title: draft.title.trim(),
      body: draft.body.trim(),
    }),
  );
  return {
    versions,
    imageId: form.picture?.id ?? null,
    enabled: form.enabled,
  };
}

/**
 * Whether the form holds exactly what is saved: the versions as the shared
 * per-locale comparison judges them — trimmed, blank tabs ignored, and a body
 * also unchanged when it is the rich editor's own respelling of the saved one
 * (`bodies`) — and the same picture and the same switch.
 */
export function sameAsSaved(
  form: SpotlightForm,
  spotlight: AdminSpotlight,
  bodies: AuthoredBodies,
): boolean {
  return (
    sameLocaleDrafts(form.tabs.drafts, savedVersions(spotlight), {
      fields: ["body"],
      bodies,
    }) &&
    (form.picture?.id ?? null) === spotlight.imageId &&
    form.enabled === spotlight.enabled
  );
}
