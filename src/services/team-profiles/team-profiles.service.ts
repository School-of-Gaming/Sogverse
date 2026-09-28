import type { QueryData } from "@supabase/supabase-js";
import { SUPPORTED_LOCALES, isSupportedLocale } from "@/lib/constants/locales";
import type { AppSupabaseClient } from "@/types";
import {
  TEAM_PHOTOS_BUCKET,
  TEAM_PHOTO_HEIGHT,
  TEAM_PHOTO_URL_TTL_SECONDS,
  TEAM_PHOTO_WIDTH,
  pickFromId,
  type TeamProfilePhoto,
  type TeamProfileRecord,
  TeamPhotoUploadError,
  type TeamPhotoToSave,
  type TeamProfileSaveInput,
  type TeamProfileTranslation,
} from "./team-profiles.types";
import { saveTeamProfileResult } from "./team-profiles.contracts";

/*
 * Team profiles: read, save, and the photos behind them.
 *
 * **A photo reaches storage only inside a save.** A crop stays in the browser
 * until the person saves; the save stores it, names it, and removes it again
 * if the database refuses the save, so the bucket holds no photo of a real
 * person that no profile names.
 *
 * **Photos are private and are read through short-lived signed URLs**, drawn
 * without the image optimiser: it would cache each one for a year under an
 * unauthenticated address, and with a new token on every read it would never
 * hit that cache anyway.
 *
 * **The public team page, when it is built, serves photos through the app's
 * own address**, which checks on every request that the profile is public,
 * backed by a storage read rule that anyone may read a photo while its profile
 * is public. Its responses cache for minutes, so a profile taken down stops
 * showing its photo soon after. Never a public bucket, which would leave a
 * taken-down photo readable by anyone holding its address, and never the
 * optimiser over signed URLs.
 */

/**
 * A person with their team profile embedded. The name and the spoken languages
 * are the person's own account data, never profile content, so they come from
 * `profiles`; the profile row is embedded through its own key (the table has a
 * second foreign key to `profiles`, the approving admin, which is why the
 * embed names the constraint).
 *
 * RLS decides whose row comes back: a person reads their own, an admin reads
 * everyone's, and anyone else gets nothing.
 */
function teamProfileQuery(supabase: AppSupabaseClient) {
  return supabase
    .from("profiles")
    .select(
      `id, role, first_name, last_name, spoken_languages,
       team_profile:team_profiles!team_profiles_user_id_fkey(
         nickname, title, pick, photo_path, opted_in, approved,
         translations:team_profile_translations(locale, short_description, long_description, fun_fact)
       )`,
    );
}

type TeamProfileQueryRow = QueryData<ReturnType<typeof teamProfileQuery>>[number];

/** The file extension for a type the bucket admits, or `null` for any other. */
function photoExtension(type: string): string | null {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

function photoOf(src: string): TeamProfilePhoto {
  return { src, width: TEAM_PHOTO_WIDTH, height: TEAM_PHOTO_HEIGHT };
}

export class TeamProfilesService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * One person's team profile as saved, for the editor and the admin user
   * page — the person's own, or anyone's for an admin.
   *
   * `null` when the person has no profile to have: they are neither an admin
   * nor a Gedu, or the caller cannot see them. A person who has never saved
   * reads as an empty profile.
   */
  async getTeamProfile(userId: string): Promise<TeamProfileRecord | null> {
    const { data, error } = await teamProfileQuery(this.supabase)
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data === null) return null;
    return this.toRecord(data);
  }

  /**
   * Save a profile together with its checkbox — a Gedu's "ready", an admin's
   * "show": the caller's own, or any admin's or Gedu's for an admin. The
   * checkbox is a readiness mark, not consent, so whoever may edit the profile
   * sets it. The database refuses it on while the profile is incomplete
   * (`isTeamProfileIncompleteError`). An admin's save leaves a Gedu's
   * approval alone.
   *
   * A new crop is stored first and named by the save; a refused save removes
   * it again, and a landed one removes the photo it replaced.
   *
   * Resolves to the saved photo's object path, or `null` for none.
   */
  async saveTeamProfile(
    userId: string,
    input: TeamProfileSaveInput,
    on: boolean,
  ): Promise<string | null> {
    const stored = await this.storedPhotoPath(userId, input.photo);
    const photoPath = stored?.path ?? null;

    let supersededPath: string | null;
    try {
      supersededPath = await this.write(userId, input, photoPath, on);
    } catch (error) {
      // Nothing names the photo this save stored, so it goes with the save.
      // Best effort: the refusal is what the caller needs to hear, and a
      // leftover object in a private bucket is unreadable to anyone else.
      if (stored?.isNew) await this.removePhoto(stored.path);
      throw error;
    }

    // The photo the save replaced is referenced by nothing now. Removing it is
    // tidying, not part of the save: the save has landed, and a failure here
    // leaves an unreferenced object in a private bucket, which nobody can see.
    if (supersededPath !== null) await this.removePhoto(supersededPath);
    return photoPath;
  }

  /**
   * An admin approves a Gedu's profile, or takes the approval back. Either
   * way at any time; the checkbox is untouched.
   */
  async setGeduTeamProfileApproval(
    geduId: string,
    approved: boolean,
  ): Promise<void> {
    const { error } = await this.supabase.rpc("set_team_profile_approval", {
      p_user_id: geduId,
      p_approved: approved,
    });
    if (error) throw error;
  }

  /** The photo's object path, storing a new crop first; `null` for none. */
  private async storedPhotoPath(
    ownerId: string,
    photo: TeamPhotoToSave,
  ): Promise<{ path: string; isNew: boolean } | null> {
    if (photo === null) return null;
    if ("path" in photo) return { path: photo.path, isNew: false };
    try {
      return { path: await this.storePhoto(ownerId, photo.crop), isNew: true };
    } catch (error) {
      throw new TeamPhotoUploadError("The photo did not upload", {
        cause: error,
      });
    }
  }

  /**
   * Store a cropped photo in the person's folder under a new name, and hand
   * back its path. Overwriting the saved photo in place would change what the
   * profile shows before the save that names the new one has landed.
   */
  private async storePhoto(ownerId: string, photo: Blob): Promise<string> {
    const extension = photoExtension(photo.type);
    if (extension === null) {
      throw new Error(`A team photo is a JPEG or a WebP, not ${photo.type}`);
    }
    const path = `${ownerId}/${crypto.randomUUID()}.${extension}`;
    const upload = await this.supabase.storage
      .from(TEAM_PHOTOS_BUCKET)
      .upload(path, photo, {
        contentType: photo.type,
        // A browser may keep the bytes as long as the signed URL that fetched
        // them lives, and no longer. The bytes behind a name never change, but
        // the photo is private: a copy cached past its URL's expiry would stay
        // viewable on that browser after the photo was replaced, removed or
        // taken down.
        cacheControl: String(TEAM_PHOTO_URL_TTL_SECONDS),
        upsert: false,
      });
    if (upload.error) throw upload.error;
    return path;
  }

  private async removePhoto(path: string): Promise<void> {
    const { error } = await this.supabase.storage
      .from(TEAM_PHOTOS_BUCKET)
      .remove([path]);
    if (error) console.error("[team-profile] photo not removed:", error);
  }

  /** The database save. Resolves to the photo path it replaced, or `null`. */
  private async write(
    userId: string,
    input: TeamProfileSaveInput,
    photoPath: string | null,
    on: boolean,
  ): Promise<string | null> {
    const { data, error } = await this.supabase.rpc("save_team_profile", {
      p_user_id: userId,
      p_translations: input.translations.map((row) => ({
        locale: row.locale,
        short_description: row.shortDescription,
        long_description: row.longDescription,
        fun_fact: row.funFact,
      })),
      p_nickname: input.nickname ?? undefined,
      p_title: input.title ?? undefined,
      p_pick: input.pick ?? undefined,
      p_photo_path: photoPath ?? undefined,
      p_opted_in: on,
    });
    if (error) throw error;
    return saveTeamProfileResult.parse(data);
  }

  private async signedUrl(path: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(TEAM_PHOTOS_BUCKET)
      .createSignedUrl(path, TEAM_PHOTO_URL_TTL_SECONDS);
    if (error) throw error;
    return data.signedUrl;
  }

  /**
   * The saved photo, or `null` when it cannot be signed. The save refuses a
   * path with no object behind it, but an object can still go missing after
   * the row names it, and a profile with no photo is one the person can fix
   * from the editor; a page that throws is one they cannot open at all.
   */
  private async savedPhoto(path: string): Promise<TeamProfilePhoto | null> {
    try {
      return photoOf(await this.signedUrl(path));
    } catch (error) {
      console.error("[team-profile] saved photo could not be signed:", error);
      return null;
    }
  }

  private async toRecord(
    row: TeamProfileQueryRow,
  ): Promise<TeamProfileRecord | null> {
    const saved = row.team_profile;
    const storedPhotoPath = saved?.photo_path ?? null;
    const photo =
      storedPhotoPath === null ? null : await this.savedPhoto(storedPhotoPath);
    // A photo that could not be signed reads as none, path included: the
    // editor would otherwise save the missing path back and be refused.
    const photoPath = photo === null ? null : storedPhotoPath;

    const translations: TeamProfileTranslation[] = [];
    for (const t of saved?.translations ?? []) {
      // A locale the site no longer serves has no tab to open it in.
      if (!isSupportedLocale(t.locale)) continue;
      translations.push({
        locale: t.locale,
        shortDescription: t.short_description,
        longDescription: t.long_description,
        funFact: t.fun_fact,
      });
    }
    // In the site's own locale order, so the editor opens on the same tab
    // every time and two reads of one profile compare equal.
    translations.sort(
      (a, b) =>
        SUPPORTED_LOCALES.indexOf(a.locale) - SUPPORTED_LOCALES.indexOf(b.locale),
    );

    const common = {
      id: row.id,
      firstName: row.first_name,
      nickname: saved?.nickname ?? null,
      pick: pickFromId(saved?.pick ?? null),
      photo,
      translations,
      spokenLanguages: row.spoken_languages,
    };
    const on = saved?.opted_in ?? false;

    switch (row.role) {
      case "admin":
        return {
          role: "admin",
          profile: {
            ...common,
            kind: "admin",
            lastName: row.last_name,
            title: saved?.title ?? "",
          },
          photoPath,
          shown: on,
        };
      case "gedu":
        return {
          role: "gedu",
          profile: { ...common, kind: "gedu" },
          photoPath,
          ready: on,
          approved: saved?.approved ?? false,
        };
      default:
        return null;
    }
  }
}
