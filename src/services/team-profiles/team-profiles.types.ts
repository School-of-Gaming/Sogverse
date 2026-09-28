import { PICKS, type PickId } from "@sog/ui";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { SpokenLanguageCode } from "@/types";

/**
 * The team profile's shapes, shared by the service that reads and writes them
 * and the components that render them. A plain module rather than a component
 * file, so a Server Component and the service can import the constants as
 * values.
 */

// ---------------------------------------------------------------------------
// The photo
// ---------------------------------------------------------------------------

/** The private bucket team photos live in, at `<person's id>/<name>`. */
export const TEAM_PHOTOS_BUCKET = "team-photos";

/** The size every uploaded photo is cropped to: 4:5, portrait. */
export const TEAM_PHOTO_WIDTH = 800;
export const TEAM_PHOTO_HEIGHT = 1000;

/**
 * How long a signed photo URL lives. Long enough to outlast an editing
 * session, and short because the URL is a bearer token for a private object.
 */
export const TEAM_PHOTO_URL_TTL_SECONDS = 60 * 60;

/**
 * The person's photo. Uploads are cropped to a 4:5 portrait of
 * `TEAM_PHOTO_WIDTH` × `TEAM_PHOTO_HEIGHT` before they are stored, and the
 * frame covers whatever it is handed, so a photo of another shape (the preview
 * art the fixtures borrow) is cropped to the middle rather than distorted.
 */
export interface TeamProfilePhoto {
  src: string;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

/**
 * What the person wrote, in one site locale. The shape is the product
 * translation's — one row per locale, at least one row, any locale — so the
 * page picks the row to show with the product page's own resolver.
 */
export interface TeamProfileTranslation {
  locale: SupportedLocale;
  /** One line, plain text: their friendly opening line under the name. */
  shortDescription: string;
  /** "About me": markdown, rendered in the `profile` variant. */
  longDescription: string;
  /** Optional. `null` leaves the aside off the page. */
  funFact: string | null;
}

interface TeamProfileCommon {
  /** The person's account id. */
  id: string;
  firstName: string;
  /** What gamers know them as. A name the person chose: never translated. */
  nickname: string | null;
  /**
   * The colour the person picked as their accent, or `null` for none, which
   * is the default: the page then carries the brand's colours alone.
   */
  pick: PickId | null;
  /**
   * Never null on the public page, where a profile cannot go up without one.
   * It is null only in the editor's preview of an unfinished profile.
   */
  photo: TeamProfilePhoto | null;
  /**
   * At least one on the public page. Empty only in the editor's preview of a
   * profile with nothing written yet.
   */
  translations: readonly TeamProfileTranslation[];
  spokenLanguages: readonly SpokenLanguageCode[];
}

/**
 * Office staff. The title is theirs to write ("Chief Engineer"), because
 * an office role is a job, not a platform role with a fixed name.
 */
export interface AdminTeamProfile extends TeamProfileCommon {
  kind: "admin";
  lastName: string;
  title: string;
}

/**
 * A Gedu. Two differences from an admin, both in the type rather than in the
 * render, so a Gedu's page cannot show them by accident:
 *
 * - **No last name.** Whether a Gedu's surname belongs on a public page is
 *   the owner's open decision; until it is made, a Gedu profile has nowhere to
 *   carry one, so the data shell cannot hand one over. Reversing it is a field
 *   here, not a rule in the render.
 * - **No free title.** Their title is the role, "Gedu", glossed on this page
 *   because it is public and the word is never used cold.
 */
export interface GeduTeamProfile extends TeamProfileCommon {
  kind: "gedu";
}

export type TeamProfile = AdminTeamProfile | GeduTeamProfile;

/** The pick a stored id names, or `null` for none or for an id no pick has. */
export function pickFromId(id: number | null): PickId | null {
  if (id === null) return null;
  return PICKS.find((pick) => pick.id === id)?.id ?? null;
}

// ---------------------------------------------------------------------------
// The saved state
// ---------------------------------------------------------------------------

/**
 * One person's profile as saved, with the state around it that the editor
 * shows — the same fields the editor takes as props, plus the photo's object
 * path, which a save hands back.
 *
 * A person who has never saved reads as an empty profile with the checkbox off
 * and, for a Gedu, not public.
 *
 * The checkbox is a readiness mark, not consent: the person or any admin may
 * save it, while the profile is complete.
 */
export type TeamProfileRecord =
  | {
      role: "gedu";
      profile: GeduTeamProfile;
      /** The photo's object name in the bucket, or `null` for none. */
      photoPath: string | null;
      /** The saved checkbox: the profile is marked ready to be public. */
      ready: boolean;
      /**
       * An admin has made the profile public. Only ever true while `ready`:
       * unticking ready hides the profile, and ticking it again waits for an
       * admin. While it is true, saved edits go live with no second look.
       */
      approved: boolean;
    }
  | {
      role: "admin";
      profile: AdminTeamProfile;
      photoPath: string | null;
      /** The saved checkbox: the whole decision, with no admin step. */
      shown: boolean;
    };

/** Whether a saved profile is on the public page. */
export function isTeamProfilePublic(record: TeamProfileRecord): boolean {
  if (record.role === "admin") return record.shown;
  // A Gedu's is public once an admin has made it so, which the database
  // allows only while it is marked ready.
  return record.approved;
}

/**
 * The photo a save writes: the stored one, kept by its object path; a freshly
 * cropped one, whose bytes the save stores first; or `null` for none.
 */
export type TeamPhotoToSave = { path: string } | { crop: Blob } | null;

/**
 * What a save writes: the content a person edits, with the photo named by its
 * object path or handed over as bytes, never by the URL the form shows it
 * through. `title` is an admin's own; it must be `null` for a Gedu.
 */
export interface TeamProfileSaveInput {
  nickname: string | null;
  title: string | null;
  pick: PickId | null;
  photo: TeamPhotoToSave;
  translations: readonly TeamProfileTranslation[];
}

/**
 * A save that did not go out because its newly cropped photo could not be
 * stored. Nothing was written: the profile is as it was.
 */
export class TeamPhotoUploadError extends Error {}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/**
 * The SQLSTATE `save_team_profile` raises when the checkbox would be on while
 * the profile is incomplete: no photo, no language, or a language missing
 * either description. The editor already stops anyone saving that,
 * so this is the database's own guarantee behind it.
 */
export const TEAM_PROFILE_INCOMPLETE_SQLSTATE = "P0026";

/**
 * The SQLSTATE `save_team_profile` raises when the photo path it is given has
 * no object in the bucket. That is a save from a page opened before another
 * save replaced the photo and removed the one this page still names; the page
 * has to be reloaded to see the profile as it now is.
 */
export const TEAM_PROFILE_PHOTO_GONE_SQLSTATE = "P0027";

/**
 * The SQLSTATE `set_team_profile_approval` raises when an admin makes public
 * a profile that is not marked ready. The admin page keeps Make public
 * disabled until it is, so this reaches a page whose read is older than
 * someone unticking ready.
 */
export const TEAM_PROFILE_NOT_READY_SQLSTATE = "P0028";

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

/** Whether a rejected save was refused for being incomplete. */
export function isTeamProfileIncompleteError(error: unknown): boolean {
  return hasCode(error, TEAM_PROFILE_INCOMPLETE_SQLSTATE);
}

/** Whether a rejected save named a photo that is no longer stored. */
export function isTeamProfilePhotoGoneError(error: unknown): boolean {
  return hasCode(error, TEAM_PROFILE_PHOTO_GONE_SQLSTATE);
}

/** Whether a refused make-public was for a profile not marked ready. */
export function isTeamProfileNotReadyError(error: unknown): boolean {
  return hasCode(error, TEAM_PROFILE_NOT_READY_SQLSTATE);
}
