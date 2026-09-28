import { PICKS, type PickId } from "@sog/ui";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { SpokenLanguageCode, TeamProfileApproval } from "@/types";

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

/**
 * Where an admin's decision about a Gedu's profile stands. It is independent
 * of the Gedu's own checkbox and survives it being turned off and on again:
 *
 * - `pending` — no admin has approved the profile yet.
 * - `approved` — an admin put it up; while the Gedu's checkbox is on it is
 *   public, and their later edits go live on save, with no second look.
 * - `withdrawn` — an admin took an approved profile down.
 */
export type GeduTeamProfileApproval = TeamProfileApproval;

/** The two decisions an admin can make; a profile never goes back to pending. */
export type GeduTeamProfileDecision = Exclude<GeduTeamProfileApproval, "pending">;

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
 * and, for a Gedu, `pending`.
 */
export type TeamProfileRecord =
  | {
      role: "gedu";
      profile: GeduTeamProfile;
      /** The photo's object name in the bucket, or `null` for none. */
      photoPath: string | null;
      /** The Gedu's saved checkbox: their consent to being public. */
      ready: boolean;
      approval: GeduTeamProfileApproval;
    }
  | {
      role: "admin";
      profile: AdminTeamProfile;
      photoPath: string | null;
      /** The admin's saved checkbox: the whole decision, with no approval. */
      shown: boolean;
    };

/** Whether a saved profile is on the public page. */
export function isTeamProfilePublic(record: TeamProfileRecord): boolean {
  if (record.role === "admin") return record.shown;
  return record.ready && record.approval === "approved";
}

/**
 * What a save writes: the content a person edits, with the photo named by its
 * object path rather than by the URL the form shows it through. `title` is an
 * admin's own; it must be `null` for a Gedu.
 */
export interface TeamProfileSaveInput {
  nickname: string | null;
  title: string | null;
  pick: PickId | null;
  photoPath: string | null;
  translations: readonly TeamProfileTranslation[];
}

/** A freshly uploaded photo: where it lives, and how to show it now. */
export interface UploadedTeamPhoto {
  path: string;
  photo: TeamProfilePhoto;
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/**
 * The SQLSTATE `save_team_profile` raises when the person's checkbox would be
 * on while the profile is incomplete: no photo, no language, or a language
 * missing either description. The editor already stops a person saving that,
 * so this is the database's own guarantee behind it.
 */
export const TEAM_PROFILE_INCOMPLETE_SQLSTATE = "P0026";

/** Whether a rejected save was refused for being incomplete. */
export function isTeamProfileIncompleteError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === TEAM_PROFILE_INCOMPLETE_SQLSTATE
  );
}
