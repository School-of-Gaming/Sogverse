import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { TeamProfilesService } from "@/services/team-profiles/team-profiles.service";
import {
  TEAM_PHOTOS_BUCKET,
  TEAM_PROFILE_INCOMPLETE_SQLSTATE,
  TEAM_PROFILE_PHOTO_GONE_SQLSTATE,
  TeamPhotoUploadError,
  isTeamProfilePhotoGoneError,
  isTeamProfilePublic,
  type TeamProfileSaveInput,
} from "@/services/team-profiles/team-profiles.types";
import { saveTeamProfileResult } from "@/services/team-profiles/team-profiles.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";

/**
 * Team profiles: the two writers (`save_team_profile`,
 * `set_team_profile_approval`), the edit predicate the storage policies and
 * the save share (`can_edit_team_profile` — this file is its scope test), the
 * read policies, and the `team-photos` bucket's policies.
 *
 * The seeded admin and Gedu own the profiles under test. Two more accounts are
 * minted per run — a second Gedu and a second admin — because the lines worth
 * pinning run between peers: a Gedu is refused another Gedu's profile, while an
 * admin manages another admin's, checkbox included.
 *
 * Every refusal is paired with the call that must still succeed, so nothing
 * here passes because a fixture was missing.
 */

const FORBIDDEN = "42501";
const PASSWORD = "testpassword123";

/** Stands in for a cropped photo. The bucket checks the type, not the bytes. */
function photoBlob(): Blob {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01])], {
    type: "image/jpeg",
  });
}

const EN_COMPLETE = {
  locale: "en",
  shortDescription: "Redstone nerd and build-challenge enthusiast.",
  longDescription: "I run **Minecraft** sessions in Helsinki.",
  funFact: "I once built a working calculator.",
} as const;

const FI_COMPLETE = {
  locale: "fi",
  shortDescription: "Punakivinörtti.",
  longDescription: "Vedän Minecraft-sessioita Helsingissä.",
  funFact: null,
} as const;

/**
 * A save's input. `photoPath` names a stored photo to keep, the shape almost
 * every case here wants; `photo` overrides it with a new crop.
 */
function content(
  overrides: Partial<TeamProfileSaveInput> & { photoPath?: string | null } = {},
): TeamProfileSaveInput {
  const { photoPath = null, ...rest } = overrides;
  return {
    nickname: "Creeperhug",
    title: null,
    pick: 6,
    photo: photoPath === null ? null : { path: photoPath },
    translations: [EN_COMPLETE],
    ...rest,
  };
}

describe("team profiles", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let otherGeduAuth: SupabaseClient<Database>;
  let otherAdminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;
  let otherGeduId: string;
  let otherAdminId: string;

  async function mint(role: "gedu" | "admin", label: string): Promise<string> {
    const email = `team-profile-${label}-${Date.now()}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: "Minted", last_name: label },
    });
    expect(error).toBeNull();
    const id = data.user?.id ?? "";
    expect(id).toBeTruthy();
    // handle_new_user lands every signup as a customer; the role is an admin's
    // doing, exactly as in the real flow.
    await admin.from("profiles").update({ role }).eq("id", id);
    await admin.from("customer_profiles").delete().eq("user_id", id);
    return email;
  }

  async function idOf(email: string): Promise<string> {
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();
    expect(error).toBeNull();
    return data?.id ?? "";
  }

  /** Remove a person's profile and every photo in their folder. */
  async function reset(userId: string): Promise<void> {
    await admin.from("team_profiles").delete().eq("user_id", userId);
    const bucket = admin.storage.from(TEAM_PHOTOS_BUCKET);
    const { data } = await bucket.list(userId);
    const names = (data ?? []).map((object) => `${userId}/${object.name}`);
    if (names.length > 0) await bucket.remove(names);
  }

  /** Upload a photo into a person's folder as the service role. */
  async function seedPhoto(userId: string): Promise<string> {
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await admin.storage
      .from(TEAM_PHOTOS_BUCKET)
      .upload(path, photoBlob(), { contentType: "image/jpeg" });
    expect(error).toBeNull();
    return path;
  }

  /** Whether an object is still in the bucket, asked as the service role. */
  async function stored(path: string): Promise<boolean> {
    const [folder, name] = path.split("/");
    const { data, error } = await admin.storage
      .from(TEAM_PHOTOS_BUCKET)
      .list(folder);
    expect(error).toBeNull();
    return (data ?? []).some((object) => object.name === name);
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    const otherGeduEmail = await mint("gedu", "gedu");
    const otherAdminEmail = await mint("admin", "admin");
    [otherGeduId, otherAdminId] = await Promise.all([
      idOf(otherGeduEmail),
      idOf(otherAdminEmail),
    ]);
    [
      adminAuth,
      geduAuth,
      otherGeduAuth,
      otherAdminAuth,
      customerAuth,
      gamerAuth,
    ] = await Promise.all([
      createAuthenticatedClient(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.GEDU.email,
        TEST_CREDENTIALS.GEDU.password,
      ),
      createAuthenticatedClient(otherGeduEmail, PASSWORD),
      createAuthenticatedClient(otherAdminEmail, PASSWORD),
      createAuthenticatedClient(
        TEST_CREDENTIALS.CUSTOMER.email,
        TEST_CREDENTIALS.CUSTOMER.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.GAMER.email,
        TEST_CREDENTIALS.GAMER.password,
      ),
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      reset(TEST_IDS.GEDU),
      reset(TEST_IDS.ADMIN),
      reset(otherGeduId),
      reset(otherAdminId),
    ]);
  });

  afterAll(async () => {
    await Promise.all([reset(TEST_IDS.GEDU), reset(TEST_IDS.ADMIN)]);
    await reset(otherGeduId);
    await reset(otherAdminId);
    await admin.auth.admin.deleteUser(otherGeduId);
    await admin.auth.admin.deleteUser(otherAdminId);
  });

  // -------------------------------------------------------------------------
  // The owner
  // -------------------------------------------------------------------------

  describe("the owner", () => {
    it("reads an empty profile before saving anything", async () => {
      const record = await new TeamProfilesService(geduAuth).getTeamProfile(
        TEST_IDS.GEDU,
      );
      expect(record).toMatchObject({
        role: "gedu",
        ready: false,
        approved: false,
        photoPath: null,
        profile: { kind: "gedu", nickname: null, photo: null, translations: [] },
      });
    });

    it("stores a new crop with the save, and reads back what it saved", async () => {
      const service = new TeamProfilesService(geduAuth);
      const savedPath = await service.saveTeamProfile(
        TEST_IDS.GEDU,
        content({
          photo: { crop: photoBlob() },
          translations: [FI_COMPLETE, EN_COMPLETE],
        }),
        true,
      );
      expect(savedPath?.startsWith(`${TEST_IDS.GEDU}/`)).toBe(true);
      expect(savedPath !== null && (await stored(savedPath))).toBe(true);

      const record = await service.getTeamProfile(TEST_IDS.GEDU);
      expect(record?.role).toBe("gedu");
      if (record?.role !== "gedu") return;
      expect(record.ready).toBe(true);
      expect(record.approved).toBe(false);
      expect(record.photoPath).toBe(savedPath);
      expect(record.profile.photo).toMatchObject({ width: 800, height: 1000 });
      expect(record.profile.photo?.src).toContain("token=");
      expect(record.profile.nickname).toBe("Creeperhug");
      expect(record.profile.pick).toBe(6);
      // In the site's locale order, whatever order they were sent in.
      expect(record.profile.translations).toEqual([EN_COMPLETE, FI_COMPLETE]);
      expect(isTeamProfilePublic(record)).toBe(false);
    });

    it("replaces the translation set whole and hands back the photo it replaced", async () => {
      const service = new TeamProfilesService(geduAuth);
      const first = await seedPhoto(TEST_IDS.GEDU);
      const second = await seedPhoto(TEST_IDS.GEDU);

      await service.saveTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: first, translations: [EN_COMPLETE, FI_COMPLETE] }),
        false,
      );
      const { data: replaced, error } = await geduAuth.rpc("save_team_profile", {
        p_user_id: TEST_IDS.GEDU,
        p_translations: [
          { locale: "fi", short_description: "Uusi.", long_description: "Uusi." },
        ],
        p_photo_path: second,
        p_opted_in: false,
      });
      expect(error).toBeNull();
      expect(saveTeamProfileResult.parse(replaced)).toBe(first);

      const { data: rows } = await admin
        .from("team_profile_translations")
        .select("locale, short_description, fun_fact")
        .eq("user_id", TEST_IDS.GEDU);
      expect(rows).toEqual([
        { locale: "fi", short_description: "Uusi.", fun_fact: null },
      ]);
    });

    it("removes the replaced photo from the bucket when the service saves", async () => {
      const service = new TeamProfilesService(geduAuth);
      const first = await seedPhoto(TEST_IDS.GEDU);
      const second = await seedPhoto(TEST_IDS.GEDU);
      await service.saveTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: first }),
        false,
      );
      await service.saveTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: second }),
        false,
      );

      const { data } = await admin.storage
        .from(TEAM_PHOTOS_BUCKET)
        .list(TEST_IDS.GEDU);
      expect((data ?? []).map((o) => `${TEST_IDS.GEDU}/${o.name}`)).toEqual([
        second,
      ]);
    });

    it("removes a new crop from the bucket when the save it came with is refused", async () => {
      const service = new TeamProfilesService(geduAuth);
      // On with no language: refused as incomplete, after the crop is stored.
      await expect(
        service.saveTeamProfile(
          TEST_IDS.GEDU,
          content({ photo: { crop: photoBlob() }, translations: [] }),
          true,
        ),
      ).rejects.toMatchObject({ code: TEAM_PROFILE_INCOMPLETE_SQLSTATE });

      const { data } = await admin.storage
        .from(TEAM_PHOTOS_BUCKET)
        .list(TEST_IDS.GEDU);
      expect(data ?? []).toEqual([]);
    });

    it("refuses a save whose crop cannot be stored, and writes nothing", async () => {
      const notAPhoto = new Blob(["hello"], { type: "text/plain" });
      await expect(
        new TeamProfilesService(geduAuth).saveTeamProfile(
          TEST_IDS.GEDU,
          content({ photo: { crop: notAPhoto } }),
          false,
        ),
      ).rejects.toBeInstanceOf(TeamPhotoUploadError);
      const { count } = await admin
        .from("team_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", TEST_IDS.GEDU);
      expect(count).toBe(0);
    });

    it("refuses a Gedu a title, and keeps an admin's", async () => {
      const refused = await geduAuth.rpc("save_team_profile", {
        p_user_id: TEST_IDS.GEDU,
        p_translations: [],
        p_title: "Head Gedu",
        p_opted_in: false,
      });
      expect(refused.error?.code).toBe("22023");

      await new TeamProfilesService(adminAuth).saveTeamProfile(
        TEST_IDS.ADMIN,
        content({ title: "Chief Engineer" }),
        false,
      );
      const record = await new TeamProfilesService(adminAuth).getTeamProfile(
        TEST_IDS.ADMIN,
      );
      expect(record?.role === "admin" && record.profile.title).toBe(
        "Chief Engineer",
      );
    });

    it("refuses a photo path with no object behind it, and writes nothing", async () => {
      const { error } = await geduAuth.rpc("save_team_profile", {
        p_user_id: TEST_IDS.GEDU,
        p_translations: [],
        p_photo_path: `${TEST_IDS.GEDU}/${crypto.randomUUID()}.jpg`,
        p_opted_in: false,
      });
      expect(error?.code).toBe(TEAM_PROFILE_PHOTO_GONE_SQLSTATE);
      expect(isTeamProfilePhotoGoneError(error)).toBe(true);
      const { count } = await admin
        .from("team_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", TEST_IDS.GEDU);
      expect(count).toBe(0);

      // …while a path the bucket holds goes through.
      const photo = await seedPhoto(TEST_IDS.GEDU);
      const ok = await geduAuth.rpc("save_team_profile", {
        p_user_id: TEST_IDS.GEDU,
        p_translations: [],
        p_photo_path: photo,
        p_opted_in: false,
      });
      expect(ok.error).toBeNull();
    });

    it("refuses a stale page's save of a photo another save removed, and keeps the new one", async () => {
      // Two pages open on one profile saved with the first photo.
      const pageA = new TeamProfilesService(geduAuth);
      const pageB = new TeamProfilesService(adminAuth);
      const original = await seedPhoto(TEST_IDS.GEDU);
      await pageA.saveTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: original }),
        false,
      );

      // A saves a new photo, which removes the original.
      const replacement = await seedPhoto(TEST_IDS.GEDU);
      await pageA.saveTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: replacement }),
        false,
      );
      expect(await stored(original)).toBe(false);

      // B still names the original.
      await expect(
        pageB.saveTeamProfile(
          TEST_IDS.GEDU,
          content({ photoPath: original, nickname: "Stale" }),
          false,
        ),
      ).rejects.toMatchObject({ code: TEAM_PROFILE_PHOTO_GONE_SQLSTATE });

      expect(await stored(replacement)).toBe(true);
      const { data } = await admin
        .from("team_profiles")
        .select("photo_path, nickname")
        .eq("user_id", TEST_IDS.GEDU)
        .single();
      expect(data).toEqual({ photo_path: replacement, nickname: "Creeperhug" });
    });

    it("reads a saved photo that can no longer be signed as no photo", async () => {
      const photo = await seedPhoto(TEST_IDS.GEDU);
      const service = new TeamProfilesService(geduAuth);
      await service.saveTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: photo }),
        false,
      );
      // The object goes behind the row's back.
      await admin.storage.from(TEAM_PHOTOS_BUCKET).remove([photo]);

      const record = await service.getTeamProfile(TEST_IDS.GEDU);
      expect(record).toMatchObject({
        role: "gedu",
        photoPath: null,
        profile: { photo: null, nickname: "Creeperhug" },
      });
    });

    it("keeps the stored checkbox when a save passes none", async () => {
      const photo = await seedPhoto(TEST_IDS.GEDU);
      await new TeamProfilesService(geduAuth).saveTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: photo }),
        true,
      );
      const { error } = await geduAuth.rpc("save_team_profile", {
        p_user_id: TEST_IDS.GEDU,
        p_translations: [
          {
            locale: EN_COMPLETE.locale,
            short_description: EN_COMPLETE.shortDescription,
            long_description: EN_COMPLETE.longDescription,
          },
        ],
        p_photo_path: photo,
      });
      expect(error).toBeNull();
      const { data } = await admin
        .from("team_profiles")
        .select("opted_in")
        .eq("user_id", TEST_IDS.GEDU)
        .single();
      expect(data?.opted_in).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Completeness
  // -------------------------------------------------------------------------

  describe("the checkbox needs a complete profile", () => {
    async function saveOn(input: TeamProfileSaveInput) {
      const photoPath =
        input.photo !== null && "path" in input.photo ? input.photo.path : null;
      return geduAuth.rpc("save_team_profile", {
        p_user_id: TEST_IDS.GEDU,
        p_translations: input.translations.map((row) => ({
          locale: row.locale,
          short_description: row.shortDescription,
          long_description: row.longDescription,
          fun_fact: row.funFact,
        })),
        p_photo_path: photoPath ?? undefined,
        p_opted_in: true,
      });
    }

    it("refuses it on with no photo", async () => {
      const { error } = await saveOn(content());
      expect(error?.code).toBe(TEAM_PROFILE_INCOMPLETE_SQLSTATE);
    });

    it("refuses it on with no language", async () => {
      const photo = await seedPhoto(TEST_IDS.GEDU);
      const { error } = await saveOn(content({ photoPath: photo, translations: [] }));
      expect(error?.code).toBe(TEAM_PROFILE_INCOMPLETE_SQLSTATE);
    });

    it("refuses it on while any language lacks a description", async () => {
      const photo = await seedPhoto(TEST_IDS.GEDU);
      const { error } = await saveOn(
        content({
          photoPath: photo,
          translations: [
            EN_COMPLETE,
            { ...FI_COMPLETE, longDescription: "" },
          ],
        }),
      );
      expect(error?.code).toBe(TEAM_PROFILE_INCOMPLETE_SQLSTATE);
    });

    it("keeps a refused save from writing anything", async () => {
      const { error } = await saveOn(content());
      expect(error?.code).toBe(TEAM_PROFILE_INCOMPLETE_SQLSTATE);
      const { count } = await admin
        .from("team_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", TEST_IDS.GEDU);
      expect(count).toBe(0);
    });

    it("accepts it on when complete, and then refuses a save that breaks completeness", async () => {
      const photo = await seedPhoto(TEST_IDS.GEDU);
      const ok = await saveOn(content({ photoPath: photo }));
      expect(ok.error).toBeNull();

      const broken = await saveOn(content({ photoPath: null }));
      expect(broken.error?.code).toBe(TEAM_PROFILE_INCOMPLETE_SQLSTATE);

      // Turning it off is what lets an incomplete profile be saved.
      const off = await geduAuth.rpc("save_team_profile", {
        p_user_id: TEST_IDS.GEDU,
        p_translations: [],
        p_opted_in: false,
      });
      expect(off.error).toBeNull();
    });

    it("stores a half-written language while the checkbox is off", async () => {
      await new TeamProfilesService(geduAuth).saveTeamProfile(
        TEST_IDS.GEDU,
        content({ translations: [{ ...EN_COMPLETE, longDescription: "" }] }),
        false,
      );
      const { data } = await admin
        .from("team_profile_translations")
        .select("long_description")
        .eq("user_id", TEST_IDS.GEDU)
        .single();
      expect(data?.long_description).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // Who may write whose
  // -------------------------------------------------------------------------

  describe("a Gedu", () => {
    it("cannot write another Gedu's profile or an admin's", async () => {
      for (const target of [otherGeduId, TEST_IDS.ADMIN]) {
        const { error } = await geduAuth.rpc("save_team_profile", {
          p_user_id: target,
          p_translations: [],
        });
        expect(error?.code).toBe(FORBIDDEN);
      }
      // …while their own goes through.
      const own = await geduAuth.rpc("save_team_profile", {
        p_user_id: TEST_IDS.GEDU,
        p_translations: [],
        p_opted_in: false,
      });
      expect(own.error).toBeNull();
    });

    it("cannot set an approval, their own included", async () => {
      await new TeamProfilesService(geduAuth).saveTeamProfile(
        TEST_IDS.GEDU,
        content(),
        false,
      );
      const { error } = await geduAuth.rpc("set_team_profile_approval", {
        p_user_id: TEST_IDS.GEDU,
        p_approved: true,
      });
      expect(error?.code).toBe(FORBIDDEN);
    });

    it("cannot upload into another person's folder, or read another's photo", async () => {
      const intoOther = await geduAuth.storage
        .from(TEAM_PHOTOS_BUCKET)
        .upload(`${otherGeduId}/${crypto.randomUUID()}.jpg`, photoBlob(), {
          contentType: "image/jpeg",
        });
      expect(intoOther.error).not.toBeNull();

      const theirs = await seedPhoto(otherGeduId);
      const read = await geduAuth.storage
        .from(TEAM_PHOTOS_BUCKET)
        .createSignedUrl(theirs, 60);
      expect(read.error).not.toBeNull();

      // …while their own folder takes an upload.
      const own = await geduAuth.storage
        .from(TEAM_PHOTOS_BUCKET)
        .upload(`${TEST_IDS.GEDU}/${crypto.randomUUID()}.jpg`, photoBlob(), {
          contentType: "image/jpeg",
        });
      expect(own.error).toBeNull();
    });

    it("cannot read another person's profile rows", async () => {
      await new TeamProfilesService(otherGeduAuth).saveTeamProfile(
        otherGeduId,
        content(),
        false,
      );
      const { data } = await geduAuth
        .from("team_profiles")
        .select("user_id")
        .eq("user_id", otherGeduId);
      expect(data).toEqual([]);
      const theirs = await otherGeduAuth
        .from("team_profiles")
        .select("user_id")
        .eq("user_id", otherGeduId);
      expect(theirs.data).toEqual([{ user_id: otherGeduId }]);
    });
  });

  describe("an admin", () => {
    it("edits a Gedu's profile and leaves the approval alone", async () => {
      const photo = await seedPhoto(TEST_IDS.GEDU);
      await new TeamProfilesService(geduAuth).saveTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: photo }),
        true,
      );
      await new TeamProfilesService(adminAuth).setGeduTeamProfileApproval(
        TEST_IDS.GEDU,
        true,
      );

      const service = new TeamProfilesService(adminAuth);
      await service.saveTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: photo, nickname: "Edited by the office" }),
        true,
      );

      const record = await service.getTeamProfile(TEST_IDS.GEDU);
      expect(record?.role).toBe("gedu");
      if (record?.role !== "gedu") return;
      expect(record.profile.nickname).toBe("Edited by the office");
      expect(record.ready).toBe(true);
      expect(record.approved).toBe(true);
      expect(isTeamProfilePublic(record)).toBe(true);
    });

    it("sets a Gedu's checkbox, once the profile is complete", async () => {
      const service = new TeamProfilesService(adminAuth);
      // The same completeness rule as the Gedu's own: no photo, no tick.
      await expect(
        service.saveTeamProfile(TEST_IDS.GEDU, content(), true),
      ).rejects.toMatchObject({ code: TEAM_PROFILE_INCOMPLETE_SQLSTATE });

      const photo = await seedPhoto(TEST_IDS.GEDU);
      await service.saveTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: photo }),
        true,
      );
      const ticked = await service.getTeamProfile(TEST_IDS.GEDU);
      expect(ticked?.role === "gedu" && ticked.ready).toBe(true);

      await service.saveTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: photo }),
        false,
      );
      const unticked = await service.getTeamProfile(TEST_IDS.GEDU);
      expect(unticked?.role === "gedu" && unticked.ready).toBe(false);
    });

    it("cannot keep an incomplete Gedu profile shown", async () => {
      const photo = await seedPhoto(TEST_IDS.GEDU);
      await new TeamProfilesService(geduAuth).saveTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: photo }),
        true,
      );
      await expect(
        new TeamProfilesService(adminAuth).saveTeamProfile(
          TEST_IDS.GEDU,
          content({ photoPath: null }),
          true,
        ),
      ).rejects.toMatchObject({ code: TEAM_PROFILE_INCOMPLETE_SQLSTATE });
    });

    it("writes another admin's profile and checkbox, photo included", async () => {
      // A new crop, stored into the other admin's folder by this admin.
      await new TeamProfilesService(adminAuth).saveTeamProfile(
        otherAdminId,
        content({ photo: { crop: photoBlob() }, title: "Head of Clubs" }),
        true,
      );
      const record = await new TeamProfilesService(otherAdminAuth).getTeamProfile(
        otherAdminId,
      );
      expect(record).toMatchObject({
        role: "admin",
        shown: true,
        profile: { title: "Head of Clubs" },
      });
      expect(record?.photoPath?.startsWith(`${otherAdminId}/`)).toBe(true);

      // …while a parent, who has no profile to have, stays out of reach.
      const { error } = await adminAuth.rpc("save_team_profile", {
        p_user_id: TEST_IDS.CUSTOMER,
        p_translations: [],
        p_opted_in: false,
      });
      expect(error?.code).toBe(FORBIDDEN);
      const upload = await adminAuth.storage
        .from(TEAM_PHOTOS_BUCKET)
        .upload(`${TEST_IDS.CUSTOMER}/${crypto.randomUUID()}.jpg`, photoBlob(), {
          contentType: "image/jpeg",
        });
      expect(upload.error).not.toBeNull();
    });

    it("reads any admin's or Gedu's profile and photo", async () => {
      const photo = await seedPhoto(otherAdminId);
      await new TeamProfilesService(otherAdminAuth).saveTeamProfile(
        otherAdminId,
        content({ photoPath: photo, title: "Head of Clubs" }),
        true,
      );
      const record = await new TeamProfilesService(adminAuth).getTeamProfile(
        otherAdminId,
      );
      expect(record).toMatchObject({
        role: "admin",
        shown: true,
        profile: { title: "Head of Clubs", lastName: "admin" },
      });
      expect(record?.profile.photo?.src).toContain("token=");
    });

    it("reads no team profile for a person who cannot have one", async () => {
      const record = await new TeamProfilesService(adminAuth).getTeamProfile(
        TEST_IDS.CUSTOMER,
      );
      expect(record).toBeNull();
    });
  });

  describe("a parent and a gamer", () => {
    it("can neither write, approve, read, nor upload", async () => {
      const photo = await seedPhoto(TEST_IDS.GEDU);
      await new TeamProfilesService(geduAuth).saveTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: photo }),
        true,
      );

      for (const [client, self] of [
        [customerAuth, TEST_IDS.CUSTOMER],
        [gamerAuth, TEST_IDS.GAMER],
      ] as const) {
        const own = await client.rpc("save_team_profile", {
          p_user_id: self,
          p_translations: [],
          p_opted_in: false,
        });
        expect(own.error?.code).toBe(FORBIDDEN);

        const approve = await client.rpc("set_team_profile_approval", {
          p_user_id: TEST_IDS.GEDU,
          p_approved: true,
        });
        expect(approve.error?.code).toBe(FORBIDDEN);

        const rows = await client.from("team_profiles").select("user_id");
        expect(rows.data).toEqual([]);
        const translations = await client
          .from("team_profile_translations")
          .select("user_id");
        expect(translations.data).toEqual([]);

        const read = await client.storage
          .from(TEAM_PHOTOS_BUCKET)
          .createSignedUrl(photo, 60);
        expect(read.error).not.toBeNull();

        const upload = await client.storage
          .from(TEAM_PHOTOS_BUCKET)
          .upload(`${self}/${crypto.randomUUID()}.jpg`, photoBlob(), {
            contentType: "image/jpeg",
          });
        expect(upload.error).not.toBeNull();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Removing a photo
  // -------------------------------------------------------------------------

  describe("removing a photo", () => {
    /**
     * Try to remove `path` as `client`. A remove the delete policy refuses
     * matches no row, so the storage API reports no error and removes nothing:
     * whether the object is still there is the only answer.
     */
    async function removeAs(
      client: SupabaseClient<Database>,
      path: string,
    ): Promise<void> {
      await client.storage.from(TEAM_PHOTOS_BUCKET).remove([path]);
    }

    it("leaves another Gedu's photo and an admin's to a Gedu", async () => {
      const otherGedus = await seedPhoto(otherGeduId);
      const admins = await seedPhoto(TEST_IDS.ADMIN);
      await removeAs(geduAuth, otherGedus);
      await removeAs(geduAuth, admins);
      expect(await stored(otherGedus)).toBe(true);
      expect(await stored(admins)).toBe(true);

      // …while their own goes.
      const own = await seedPhoto(TEST_IDS.GEDU);
      await removeAs(geduAuth, own);
      expect(await stored(own)).toBe(false);
    });

    it("lets an admin remove another admin's photo and a Gedu's", async () => {
      const otherAdmins = await seedPhoto(otherAdminId);
      await removeAs(adminAuth, otherAdmins);
      expect(await stored(otherAdmins)).toBe(false);

      const gedus = await seedPhoto(TEST_IDS.GEDU);
      await removeAs(adminAuth, gedus);
      expect(await stored(gedus)).toBe(false);

      // …while a parent's folder, which no profile has, keeps its object.
      const customers = await seedPhoto(TEST_IDS.CUSTOMER);
      await removeAs(adminAuth, customers);
      expect(await stored(customers)).toBe(true);
      await admin.storage.from(TEAM_PHOTOS_BUCKET).remove([customers]);
    });

    it("leaves everyone's photo to a parent and a gamer", async () => {
      const gedus = await seedPhoto(TEST_IDS.GEDU);
      const admins = await seedPhoto(TEST_IDS.ADMIN);
      for (const client of [customerAuth, gamerAuth]) {
        await removeAs(client, gedus);
        await removeAs(client, admins);
      }
      expect(await stored(gedus)).toBe(true);
      expect(await stored(admins)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // The approval
  // -------------------------------------------------------------------------

  describe("the approval", () => {
    async function stamp() {
      const { data, error } = await admin
        .from("team_profiles")
        .select("approved, approval_decided_by, approval_decided_at")
        .eq("user_id", TEST_IDS.GEDU)
        .single();
      expect(error).toBeNull();
      return data;
    }

    function set(approved: boolean) {
      return adminAuth.rpc("set_team_profile_approval", {
        p_user_id: TEST_IDS.GEDU,
        p_approved: approved,
      });
    }

    it("goes yes and no either way, stamping who last changed it", async () => {
      await new TeamProfilesService(geduAuth).saveTeamProfile(
        TEST_IDS.GEDU,
        content(),
        false,
      );
      expect(await stamp()).toEqual({
        approved: false,
        approval_decided_by: null,
        approval_decided_at: null,
      });

      // No to a profile no admin has decided about changes nothing.
      expect((await set(false)).error).toBeNull();
      expect((await stamp())?.approval_decided_at).toBeNull();

      expect((await set(true)).error).toBeNull();
      const approved = await stamp();
      expect(approved?.approved).toBe(true);
      expect(approved?.approval_decided_by).toBe(TEST_IDS.ADMIN);
      expect(approved?.approval_decided_at).not.toBeNull();

      // Saying it again is a no-op, not a refusal, and keeps the stamp.
      expect((await set(true)).error).toBeNull();
      expect(await stamp()).toEqual(approved);

      expect((await set(false)).error).toBeNull();
      const takenBack = await stamp();
      expect(takenBack?.approved).toBe(false);
      expect(takenBack?.approval_decided_by).toBe(TEST_IDS.ADMIN);
      expect(takenBack?.approval_decided_at).not.toBeNull();

      expect((await set(true)).error).toBeNull();
      expect((await stamp())?.approved).toBe(true);
    });

    it("refuses a decision that is neither yes nor no", async () => {
      await new TeamProfilesService(geduAuth).saveTeamProfile(
        TEST_IDS.GEDU,
        content(),
        false,
      );
      const { error } = await adminAuth.rpc("set_team_profile_approval", {
        p_user_id: TEST_IDS.GEDU,
        // @ts-expect-error -- the generated argument type forbids NULL; the call proves the function refuses one anyway
        p_approved: null,
      });
      expect(error?.code).toBe("22004");
      expect((await stamp())?.approved).toBe(false);
    });

    it("keeps an approval stamped, even for a direct write", async () => {
      await new TeamProfilesService(geduAuth).saveTeamProfile(
        TEST_IDS.GEDU,
        content(),
        false,
      );
      const { error } = await admin
        .from("team_profiles")
        .update({ approved: true })
        .eq("user_id", TEST_IDS.GEDU);
      expect(error?.code).toBe("23514");
    });

    it("survives the Gedu turning their checkbox off and on", async () => {
      const photo = await seedPhoto(TEST_IDS.GEDU);
      const service = new TeamProfilesService(geduAuth);
      await service.saveTeamProfile(TEST_IDS.GEDU, content({ photoPath: photo }), true);
      expect((await set(true)).error).toBeNull();
      await service.saveTeamProfile(TEST_IDS.GEDU, content({ photoPath: photo }), false);
      await service.saveTeamProfile(TEST_IDS.GEDU, content({ photoPath: photo }), true);
      expect((await stamp())?.approved).toBe(true);
    });

    it("refuses an admin's profile and a person with no profile", async () => {
      await new TeamProfilesService(adminAuth).saveTeamProfile(
        TEST_IDS.ADMIN,
        content(),
        false,
      );
      const adminsOwn = await adminAuth.rpc("set_team_profile_approval", {
        p_user_id: TEST_IDS.ADMIN,
        p_approved: true,
      });
      expect(adminsOwn.error?.code).toBe("22023");

      const none = await adminAuth.rpc("set_team_profile_approval", {
        p_user_id: otherGeduId,
        p_approved: true,
      });
      expect(none.error?.code).toBe("P0002");
    });
  });

  // -------------------------------------------------------------------------
  // can_edit_team_profile — the scope test the authorization spine names
  // -------------------------------------------------------------------------

  describe("can_edit_team_profile", () => {
    async function canEdit(
      client: SupabaseClient<Database>,
      target: string,
    ): Promise<boolean | null> {
      const { data, error } = await client.rpc("can_edit_team_profile", {
        p_user_id: target,
      });
      expect(error).toBeNull();
      return data;
    }

    it("answers a Gedu for their own profile and no one else's", async () => {
      expect(await canEdit(geduAuth, TEST_IDS.GEDU)).toBe(true);
      expect(await canEdit(geduAuth, otherGeduId)).toBe(false);
      expect(await canEdit(geduAuth, TEST_IDS.ADMIN)).toBe(false);
    });

    it("answers an admin for any admin's or Gedu's, never a parent's or a gamer's", async () => {
      expect(await canEdit(adminAuth, TEST_IDS.ADMIN)).toBe(true);
      expect(await canEdit(adminAuth, TEST_IDS.GEDU)).toBe(true);
      expect(await canEdit(adminAuth, otherAdminId)).toBe(true);
      expect(await canEdit(adminAuth, TEST_IDS.CUSTOMER)).toBe(false);
      expect(await canEdit(adminAuth, TEST_IDS.GAMER)).toBe(false);
    });

    it("answers false to a parent and a gamer, about themselves too", async () => {
      expect(await canEdit(customerAuth, TEST_IDS.CUSTOMER)).toBe(false);
      expect(await canEdit(customerAuth, TEST_IDS.GEDU)).toBe(false);
      expect(await canEdit(gamerAuth, TEST_IDS.GAMER)).toBe(false);
    });
  });
});
