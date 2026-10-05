import { StorageApiError, type QueryData } from "@supabase/supabase-js";
import { z } from "zod";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { walkPages } from "@/lib/supabase/paging";
import type { AppSupabaseClient } from "@/types";
import {
  publicTeamProfileRows,
  type PublicTeamProfileRow,
} from "./team-profiles.contracts";
import {
  TEAM_PHOTOS_BUCKET,
  TEAM_PHOTO_HEIGHT,
  TEAM_PHOTO_URL_TTL_SECONDS,
  TEAM_PHOTO_WIDTH,
  pickFromId,
  publicTeamPhotoUrl,
  type PublicTeamProfile,
  type TeamProfilePhoto,
  type TeamProfileRecord,
  TeamPhotoUploadError,
  type TeamPhotoToSave,
  type TeamProfileSaveInput,
  type TeamProfileTranslation,
} from "./team-profiles.types";

/*
 * Team profiles: read, save, and the photos behind them.
 *
 * **A photo reaches storage only inside a save.** A crop stays in the browser
 * until the person saves; the save stores it, names it, and removes it again
 * if the database refuses the save. Every landed save then empties the
 * person's folder of all but the photo their profile names, so whatever an
 * interrupted or failed cleanup left behind lasts only until their next save.
 *
 * **Photos are private and are read through short-lived signed URLs**, drawn
 * without the image optimiser: it would cache each one for a year under an
 * unauthenticated address, and with a new token on every read it would never
 * hit that cache anyway.
 *
 * **The public team page reads through two database functions**, the list
 * and one profile, which return only approved profiles of admins and Gedus,
 * narrowed to what the page shows: no email, no dates, no certification, and
 * a Gedu's last name never. They work signed out, so the page reads them on
 * whatever client it has. Each profile comes back as the same `TeamProfile`
 * the editor previews, every translation the site serves included: the page
 * picks the one to show at render time, through the body's own resolver.
 *
 * **Public photos are served through the app's own address**,
 * `/api/team/photos/<id>?v=<version>`, which reads the photo with no session,
 * through a storage read rule that anyone may read an object while it is the
 * current photo of a public profile. So every request re-asks whether the
 * profile is public. Its responses cache for minutes, so a profile taken down
 * stops showing its photo soon after; the version token changes with the
 * photo, so a new photo is a new address. Never a public bucket, which would
 * leave a taken-down photo readable by anyone holding its address, and never
 * the optimiser over signed URLs.
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

/**
 * Whether storage answered that the object does not exist. It says so as a
 * 404, carried either as the response status or, from a server that answers
 * 400, as the body's `statusCode`.
 */
function isStorageObjectMissing(error: unknown): boolean {
  return (
    error instanceof StorageApiError &&
    (error.status === 404 || error.statusCode === "404")
  );
}

/**
 * Whether the database definitely refused a write: PostgREST answered with an
 * error code — the SQLSTATE Postgres raised, or its own — so nothing
 * committed. A failure with no code (supabase-js reports a dropped connection
 * or a timeout with an empty one) leaves open that it did.
 */
function isDatabaseRefusal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.length > 0
  );
}

function photoOf(src: string): TeamProfilePhoto {
  return { src, width: TEAM_PHOTO_WIDTH, height: TEAM_PHOTO_HEIGHT };
}

/**
 * The translations in the site's own locale order, leaving out any locale the
 * site no longer serves: the editor has no tab to open one in and the page no
 * reader to show it to. A fixed order also makes two reads of one profile
 * compare equal.
 */
function siteTranslations(
  rows: readonly {
    locale: string;
    short_description: string;
    long_description: string;
    fun_fact: string | null;
  }[],
): TeamProfileTranslation[] {
  return inLocaleOrder(rows).map((t) => ({
    locale: t.locale,
    shortDescription: t.short_description,
    longDescription: t.long_description,
    funFact: t.fun_fact,
  }));
}

/** A row of the public read as the profile the page renders. */
function toPublicProfile(row: PublicTeamProfileRow): PublicTeamProfile {
  const common = {
    id: row.user_id,
    firstName: row.first_name,
    nickname: row.nickname,
    pick: pickFromId(row.pick),
    photo:
      row.photo_version === null
        ? null
        : photoOf(publicTeamPhotoUrl(row.user_id, row.photo_version)),
    translations: siteTranslations(row.translations),
    spokenLanguages: row.spoken_languages,
    createdAt: row.created_at,
  };
  return row.role === "admin"
    ? {
        ...common,
        kind: "admin",
        // Never NULL for an admin: the column is NOT NULL, and a public
        // admin's profile was complete, title included, when it was saved.
        lastName: row.last_name ?? "",
        title: row.title ?? "",
      }
    : { ...common, kind: "gedu" };
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
   * Every public team profile, for the public team page: each approved
   * profile of an admin or a Gedu, trainee Gedus included. Admins first, then
   * Gedus; within each by first name, then nickname. Works signed out.
   *
   * Walked, because nothing bounds the team's size by construction. The
   * function's own order ends in the person's id, so it is total, and a page
   * of it is read off the function's result in that order.
   */
  async listPublicTeamProfiles(): Promise<PublicTeamProfile[]> {
    const rows = await walkPages("list_public_team_profiles", (from, to) =>
      this.supabase
        .rpc("list_public_team_profiles", undefined, { count: "exact" })
        .range(from, to),
    );
    return publicTeamProfileRows.parse(rows).map(toPublicProfile);
  }

  /**
   * One person's public team profile, or `null` when it is not public, they
   * are neither an admin nor a Gedu, or the id names no one — anything that is
   * not an id included, so a page can answer every one of those with a 404.
   * Works signed out.
   */
  async getPublicTeamProfile(userId: string): Promise<PublicTeamProfile | null> {
    if (!z.string().uuid().safeParse(userId).success) return null;
    const { data, error } = await this.supabase.rpc("get_public_team_profile", {
      p_user_id: userId,
    });
    if (error) throw error;
    const row = publicTeamProfileRows.parse(data).at(0);
    return row === undefined ? null : toPublicProfile(row);
  }

  /**
   * Save a profile together with its "ready" checkbox: the caller's own, or
   * any admin's or Gedu's for an admin. The checkbox is a readiness mark, so
   * whoever may edit the profile sets it. The database refuses it
   * on while the profile is incomplete (`isTeamProfileIncompleteError`). A
   * save that leaves the profile not ready also hides it, whoever saves, so
   * ticking ready again waits for an admin to make it public; a save that
   * keeps it ready leaves it as it was.
   *
   * A new crop is stored first and named by the save. A save the database
   * refused removes it again; one that failed without the database's answer
   * (a dropped connection) may have committed, so it keeps the crop the row
   * may now name. A landed save — one that clears the photo included — then
   * sweeps the person's folder (`sweepFolder`).
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

    try {
      await this.write(userId, input, photoPath, on);
    } catch (error) {
      // A refused save names nothing, so the photo it stored goes with it.
      // A failure without the database's answer may have committed, and the
      // row may now name the photo: it stays, and if it is an orphan after
      // all the person's next save collects it. Best effort either way: the
      // failure is what the caller needs to hear.
      if (stored?.isNew && isDatabaseRefusal(error)) {
        await this.removePhotos([stored.path]);
      }
      throw error;
    }

    await this.sweepFolder(userId);
    return photoPath;
  }

  /**
   * An admin makes an admin's or a Gedu's profile public, or hides it — their
   * own included. Making public needs the profile marked ready, and the
   * database refuses one that is not (`isTeamProfileNotReadyError`); hiding is
   * open whenever it is public. The checkbox is untouched.
   */
  async setTeamProfileApproval(
    userId: string,
    approved: boolean,
  ): Promise<void> {
    const { error } = await this.supabase.rpc("set_team_profile_approval", {
      p_user_id: userId,
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

  /**
   * Remove every object in the person's folder but the photo their profile
   * names, run after each landed save. That collects the photo the save
   * replaced, and with it anything an earlier save left behind: a crop whose
   * refused save could not remove it, a replaced photo whose removal failed,
   * a crop from a tab closed between its upload and its save. A failure here
   * is logged, never thrown — the save has landed — and the next save retries.
   *
   * What is kept is what the row names when the sweep runs, not what this
   * save wrote: when another tab's save lands between this save and its
   * sweep, the row names that tab's photo, and keeping this save's instead
   * would leave the profile pointing at nothing. The listing is taken before
   * the row is read, so only a save landing inside that short window, naming
   * a crop uploaded before the listing, can still lose its photo — which then
   * reads as none, as any missing photo does.
   *
   * Two tabs on one profile are last write wins, and the sweep is part of
   * that: one tab's sweep can remove the other's crop between its upload and
   * its save. That save is then refused as naming a photo that is no longer
   * stored (P0027), and the person is asked to reload — the accepted outcome.
   */
  private async sweepFolder(userId: string): Promise<void> {
    try {
      const names = await this.folderObjects(userId);
      if (names.length === 0) return;
      const { data, error } = await this.supabase
        .from("team_profiles")
        .select("photo_path")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      const kept = data?.photo_path ?? null;
      await this.removePhotos(
        names.map((name) => `${userId}/${name}`).filter((path) => path !== kept),
      );
    } catch (error) {
      console.error("[team-profile] photo folder not swept:", error);
    }
  }

  /** The names of the objects in the person's folder, every page of them. */
  private async folderObjects(userId: string): Promise<string[]> {
    const pageSize = 100;
    const names: string[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await this.supabase.storage
        .from(TEAM_PHOTOS_BUCKET)
        .list(userId, {
          limit: pageSize,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
      if (error) throw error;
      // A folder entry has no id. The write policy admits no subfolder, so
      // there is nothing under one to collect.
      for (const object of data) if (object.id !== null) names.push(object.name);
      if (data.length < pageSize) return names;
    }
  }

  /** Remove objects from the bucket, logging rather than throwing a failure. */
  private async removePhotos(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { error } = await this.supabase.storage
      .from(TEAM_PHOTOS_BUCKET)
      .remove(paths);
    if (error) console.error("[team-profile] photos not removed:", error);
  }

  /**
   * The database save. It also returns the photo path it replaced, which the
   * folder sweep collects along with everything else, so it is not read here.
   */
  private async write(
    userId: string,
    input: TeamProfileSaveInput,
    photoPath: string | null,
    on: boolean,
  ): Promise<void> {
    const { error } = await this.supabase.rpc("save_team_profile", {
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
  }

  private async signedUrl(path: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(TEAM_PHOTOS_BUCKET)
      .createSignedUrl(path, TEAM_PHOTO_URL_TTL_SECONDS);
    if (error) throw error;
    return data.signedUrl;
  }

  /**
   * The saved photo, or `null` when storage says it no longer exists. The save
   * refuses a path with no object behind it, but an object can still go
   * missing after the row names it, and a profile with no photo is one the
   * person can fix from the editor; a page that throws is one they cannot
   * open at all.
   *
   * Any other failure throws. Reading a photo that is still stored as none
   * would open the editor without it, and the next save would clear the path
   * and let the folder sweep remove the real object.
   */
  private async savedPhoto(path: string): Promise<TeamProfilePhoto | null> {
    try {
      return photoOf(await this.signedUrl(path));
    } catch (error) {
      if (!isStorageObjectMissing(error)) throw error;
      console.error("[team-profile] saved photo is no longer stored:", error);
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
    // A photo no longer stored reads as none, path included: the editor would
    // otherwise save the missing path back and be refused.
    const photoPath = photo === null ? null : storedPhotoPath;

    // In the site's own locale order, so the editor opens on the same tab
    // every time.
    const translations = siteTranslations(saved?.translations ?? []);

    const common = {
      id: row.id,
      firstName: row.first_name,
      nickname: saved?.nickname ?? null,
      pick: pickFromId(saved?.pick ?? null),
      photo,
      translations,
      spokenLanguages: row.spoken_languages,
    };
    const visibility = {
      photoPath,
      ready: saved?.opted_in ?? false,
      approved: saved?.approved ?? false,
    };

    switch (row.role) {
      case "admin":
        return {
          profile: {
            ...common,
            kind: "admin",
            lastName: row.last_name,
            title: saved?.title ?? "",
          },
          ...visibility,
        };
      case "gedu":
        return { profile: { ...common, kind: "gedu" }, ...visibility };
      default:
        return null;
    }
  }
}
