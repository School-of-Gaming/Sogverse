import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { openingLocaleTab } from "@/lib/i18n/locale-tabs";
import type {
  AdminSpotlight,
  SpotlightInput,
  SpotlightVersionInput,
} from "@/services/spotlights";

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

const EMPTY_VERSION: SpotlightVersionDraft = { title: "", body: "" };

/**
 * The editor's own state: a version per language tab, the open tab, and the
 * spotlight's picture. Switching tabs keeps what was typed in each.
 */
export interface SpotlightForm {
  versions: Partial<Record<SupportedLocale, SpotlightVersionDraft>>;
  activeLocale: SupportedLocale;
  picture: SpotlightPicture | null;
}

/** The version a tab holds, or an empty one for a tab not yet typed in. */
export function versionOf(
  form: Pick<SpotlightForm, "versions">,
  locale: SupportedLocale,
): SpotlightVersionDraft {
  return form.versions[locale] ?? EMPTY_VERSION;
}

/** The tabs open, in `SUPPORTED_LOCALES` order. */
export function formLocales(
  form: Pick<SpotlightForm, "versions">,
): SupportedLocale[] {
  return SUPPORTED_LOCALES.filter((locale) => form.versions[locale] !== undefined);
}

/** A new spotlight opens on one tab, in the admin's own UI locale. */
export function emptySpotlightForm(uiLocale: SupportedLocale): SpotlightForm {
  return {
    versions: { [uiLocale]: EMPTY_VERSION },
    activeLocale: uiLocale,
    picture: null,
  };
}

function isBlankVersion(version: SpotlightVersionDraft): boolean {
  return version.title.trim() === "" && version.body.trim() === "";
}

/** A version a reader can be shown: both its title and its body written. */
export function isCompleteSpotlightVersion(version: SpotlightVersionDraft): boolean {
  return version.title.trim() !== "" && version.body.trim() !== "";
}

/** Nothing written into a new spotlight's form yet: leaving it loses nothing. */
export function isBlankSpotlightForm(form: SpotlightForm): boolean {
  return (
    formLocales(form).every((locale) => isBlankVersion(versionOf(form, locale))) &&
    form.picture === null
  );
}

/**
 * A saved spotlight as the editor opens it: on the tab a reader of the
 * admin's UI locale would be shown (`openingLocaleTab`).
 */
export function spotlightFormFromSaved(
  spotlight: AdminSpotlight,
  uiLocale: SupportedLocale,
): SpotlightForm {
  const versions: SpotlightForm["versions"] = {};
  for (const { locale, title, body } of spotlight.versions) {
    versions[locale] = { title, body };
  }
  if (spotlight.versions.length === 0) versions[uiLocale] = EMPTY_VERSION;
  return {
    versions,
    activeLocale: openingLocaleTab(
      spotlight.versions.map((version) => version.locale),
      uiLocale,
    ),
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
  };
}

/**
 * The versions a save would store, trimmed, in locale order. A tab with
 * nothing typed in it is not a version — it is a tab opened and not used — so
 * it is left out.
 */
function versionsToSave(
  form: Pick<SpotlightForm, "versions">,
): SpotlightVersionInput[] {
  return formLocales(form).flatMap((locale) => {
    const version = versionOf(form, locale);
    if (isBlankVersion(version)) return [];
    return [{ locale, title: version.title.trim(), body: version.body.trim() }];
  });
}

/**
 * Why a save cannot go ahead, before it is tried — each a refusal the
 * database would otherwise make:
 *
 * - `noVersion` — no language written at all.
 * - `incomplete` — a language written without its title or its body.
 * - `pictureWhileOn` — the picture taken off a spotlight that is switched on,
 *   which cannot be without one.
 */
export type SpotlightSaveBlocker =
  | { kind: "noVersion" }
  | { kind: "incomplete"; locale: SupportedLocale }
  | { kind: "pictureWhileOn" };

export function spotlightSaveBlocker(
  form: SpotlightForm,
  enabled: boolean,
): SpotlightSaveBlocker | null {
  const versions = versionsToSave(form);
  if (versions.length === 0) return { kind: "noVersion" };
  const incomplete = versions.find(
    (version) => version.title === "" || version.body === "",
  );
  if (incomplete !== undefined) {
    return { kind: "incomplete", locale: incomplete.locale };
  }
  if (enabled && form.picture === null) return { kind: "pictureWhileOn" };
  return null;
}

/**
 * What a save sends. The service's contract validates it; the whole input
 * travels on every save, because the save assigns the picture and replaces
 * the whole version set.
 */
export function spotlightInputFromForm(form: SpotlightForm): SpotlightInput {
  return {
    versions: versionsToSave(form),
    imageId: form.picture?.id ?? null,
  };
}

/**
 * Whether the form holds exactly what is saved — compared as the save would
 * store it, trimmed.
 *
 * `editorBodies` maps a body the rich editor was seeded with to the editor's
 * own serialisation of it: the editor writes markdown back in its own dialect
 * and reports it whether or not anything was typed, so an untouched body can
 * arrive spelled differently from the stored one. Only the untouched document
 * serialises to that string, so a real edit still differs from both.
 */
export function sameAsSaved(
  form: SpotlightForm,
  spotlight: AdminSpotlight,
  editorBodies: ReadonlyMap<string, string> = new Map(),
): boolean {
  const versions = versionsToSave(form);
  if (versions.length !== spotlight.versions.length) return false;
  const sameVersions = versions.every((version, index) => {
    const saved = spotlight.versions[index];
    return (
      version.locale === saved.locale &&
      version.title === saved.title.trim() &&
      (version.body === saved.body.trim() ||
        version.body === editorBodies.get(saved.body)?.trim())
    );
  });
  return sameVersions && (form.picture?.id ?? null) === spotlight.imageId;
}
