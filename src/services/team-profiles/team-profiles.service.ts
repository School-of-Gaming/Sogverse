import type { QueryData } from "@supabase/supabase-js";
import { SUPPORTED_LOCALES, isSupportedLocale } from "@/lib/constants/locales";
import type { AppSupabaseClient } from "@/types";
import {
  TEAM_PHOTOS_BUCKET,
  TEAM_PHOTO_HEIGHT,
  TEAM_PHOTO_URL_TTL_SECONDS,
  TEAM_PHOTO_WIDTH,
  pickFromId,
  type GeduTeamProfileDecision,
  type TeamProfilePhoto,
  type TeamProfileRecord,
  type TeamProfileSaveInput,
  type TeamProfileTranslation,
  type UploadedTeamPhoto,
} from "./team-profiles.types";
import { saveTeamProfileResult } from "./team-profiles.contracts";

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
         nickname, title, pick, photo_path, opted_in, approval,
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
   * Save the caller's own profile together with their checkbox — a Gedu's
   * "ready", an admin's "show". The database refuses the checkbox on while the
   * profile is incomplete (`isTeamProfileIncompleteError`).
   */
  async saveOwnTeamProfile(
    userId: string,
    input: TeamProfileSaveInput,
    on: boolean,
  ): Promise<void> {
    await this.save(userId, input, on);
  }

  /**
   * An admin saves a Gedu's profile content. The Gedu's own checkbox is their
   * consent and is left exactly as they saved it; the approval is untouched
   * too, because admins are trusted.
   */
  async saveGeduTeamProfile(
    geduId: string,
    input: TeamProfileSaveInput,
  ): Promise<void> {
    await this.save(geduId, input, null);
  }

  /**
   * Store a freshly cropped photo in the person's folder and hand back its
   * path and a URL to show it by. Nothing references it until a save names the
   * path, so a photo picked and never saved changes nothing public.
   *
   * Each upload gets a new name: overwriting the saved photo in place would
   * change the public page before the person saved anything.
   */
  async uploadTeamPhoto(
    ownerId: string,
    photo: Blob,
  ): Promise<UploadedTeamPhoto> {
    const extension = photoExtension(photo.type);
    if (extension === null) {
      throw new Error(`A team photo is a JPEG or a WebP, not ${photo.type}`);
    }
    const path = `${ownerId}/${crypto.randomUUID()}.${extension}`;
    const bucket = this.supabase.storage.from(TEAM_PHOTOS_BUCKET);

    const upload = await bucket.upload(path, photo, {
      contentType: photo.type,
      // The bytes behind a name never change: every upload is a new name.
      cacheControl: "31536000",
      upsert: false,
    });
    if (upload.error) throw upload.error;

    return { path, photo: photoOf(await this.signedUrl(path)) };
  }

  /**
   * An admin approves a Gedu's profile, or withdraws an approved one. A
   * profile never goes back to pending.
   */
  async setGeduTeamProfileApproval(
    geduId: string,
    approval: GeduTeamProfileDecision,
  ): Promise<void> {
    const { error } = await this.supabase.rpc("set_team_profile_approval", {
      p_user_id: geduId,
      p_approval: approval,
    });
    if (error) throw error;
  }

  private async save(
    userId: string,
    input: TeamProfileSaveInput,
    on: boolean | null,
  ): Promise<void> {
    const { data, error } = await this.supabase.rpc(
      "save_team_profile",
      {
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
        p_photo_path: input.photoPath ?? undefined,
        p_opted_in: on ?? undefined,
      },
    );
    if (error) throw error;
    const supersededPath = saveTeamProfileResult.parse(data);

    // The photo the save replaced is referenced by nothing now. Removing it is
    // tidying, not part of the save: the save has landed, and a failure here
    // leaves an unreferenced object in a private bucket, which nobody can see.
    if (supersededPath !== null) {
      await this.supabase.storage
        .from(TEAM_PHOTOS_BUCKET)
        .remove([supersededPath]);
    }
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
          approval: saved?.approval ?? "pending",
        };
      default:
        return null;
    }
  }
}
