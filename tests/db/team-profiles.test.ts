import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { TeamProfilesService } from "@/services/team-profiles/team-profiles.service";
import {
  TEAM_PHOTOS_BUCKET,
  TEAM_PROFILE_INCOMPLETE_SQLSTATE,
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
 * minted per run — a second Gedu and a second admin — because the sharpest
 * refusals are between peers: a Gedu against another Gedu's profile, an admin
 * against another admin's.
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

function content(
  overrides: Partial<TeamProfileSaveInput> = {},
): TeamProfileSaveInput {
  return {
    nickname: "Creeperhug",
    title: null,
    pick: 6,
    photoPath: null,
    translations: [EN_COMPLETE],
    ...overrides,
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
        approval: "pending",
        photoPath: null,
        profile: { kind: "gedu", nickname: null, photo: null, translations: [] },
      });
    });

    it("uploads a photo, saves, and reads back what it saved", async () => {
      const service = new TeamProfilesService(geduAuth);
      const uploaded = await service.uploadTeamPhoto(TEST_IDS.GEDU, photoBlob());
      expect(uploaded.path.startsWith(`${TEST_IDS.GEDU}/`)).toBe(true);
      expect(uploaded.photo).toMatchObject({ width: 800, height: 1000 });

      await service.saveOwnTeamProfile(
        TEST_IDS.GEDU,
        content({
          photoPath: uploaded.path,
          translations: [FI_COMPLETE, EN_COMPLETE],
        }),
        true,
      );

      const record = await service.getTeamProfile(TEST_IDS.GEDU);
      expect(record?.role).toBe("gedu");
      if (record?.role !== "gedu") return;
      expect(record.ready).toBe(true);
      expect(record.approval).toBe("pending");
      expect(record.photoPath).toBe(uploaded.path);
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

      await service.saveOwnTeamProfile(
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
      await service.saveOwnTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: first }),
        false,
      );
      await service.saveOwnTeamProfile(
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

    it("refuses a Gedu a title, and keeps an admin's", async () => {
      const refused = await geduAuth.rpc("save_team_profile", {
        p_user_id: TEST_IDS.GEDU,
        p_translations: [],
        p_title: "Head Gedu",
        p_opted_in: false,
      });
      expect(refused.error?.code).toBe("22023");

      await new TeamProfilesService(adminAuth).saveOwnTeamProfile(
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

    it("refuses the owner a save that does not state their checkbox", async () => {
      const { error } = await geduAuth.rpc("save_team_profile", {
        p_user_id: TEST_IDS.GEDU,
        p_translations: [],
      });
      expect(error?.code).toBe("22004");
    });
  });

  // -------------------------------------------------------------------------
  // Completeness
  // -------------------------------------------------------------------------

  describe("the checkbox needs a complete profile", () => {
    async function saveOn(input: TeamProfileSaveInput) {
      return geduAuth.rpc("save_team_profile", {
        p_user_id: TEST_IDS.GEDU,
        p_translations: input.translations.map((row) => ({
          locale: row.locale,
          short_description: row.shortDescription,
          long_description: row.longDescription,
          fun_fact: row.funFact,
        })),
        p_photo_path: input.photoPath ?? undefined,
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
      await new TeamProfilesService(geduAuth).saveOwnTeamProfile(
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
      await new TeamProfilesService(geduAuth).saveOwnTeamProfile(
        TEST_IDS.GEDU,
        content(),
        false,
      );
      const { error } = await geduAuth.rpc("set_team_profile_approval", {
        p_user_id: TEST_IDS.GEDU,
        p_approval: "approved",
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
      await new TeamProfilesService(otherGeduAuth).saveOwnTeamProfile(
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
    it("edits a Gedu's content and leaves their checkbox and approval alone", async () => {
      const photo = await seedPhoto(TEST_IDS.GEDU);
      await new TeamProfilesService(geduAuth).saveOwnTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: photo }),
        true,
      );
      await new TeamProfilesService(adminAuth).setGeduTeamProfileApproval(
        TEST_IDS.GEDU,
        "approved",
      );

      const service = new TeamProfilesService(adminAuth);
      await service.saveGeduTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: photo, nickname: "Edited by the office" }),
      );

      const record = await service.getTeamProfile(TEST_IDS.GEDU);
      expect(record?.role).toBe("gedu");
      if (record?.role !== "gedu") return;
      expect(record.profile.nickname).toBe("Edited by the office");
      expect(record.ready).toBe(true);
      expect(record.approval).toBe("approved");
      expect(isTeamProfilePublic(record)).toBe(true);
    });

    it("cannot set a Gedu's checkbox", async () => {
      await new TeamProfilesService(geduAuth).saveOwnTeamProfile(
        TEST_IDS.GEDU,
        content(),
        false,
      );
      const { error } = await adminAuth.rpc("save_team_profile", {
        p_user_id: TEST_IDS.GEDU,
        p_translations: [],
        p_opted_in: false,
      });
      expect(error?.code).toBe(FORBIDDEN);
    });

    it("cannot keep an incomplete Gedu profile shown", async () => {
      const photo = await seedPhoto(TEST_IDS.GEDU);
      await new TeamProfilesService(geduAuth).saveOwnTeamProfile(
        TEST_IDS.GEDU,
        content({ photoPath: photo }),
        true,
      );
      await expect(
        new TeamProfilesService(adminAuth).saveGeduTeamProfile(
          TEST_IDS.GEDU,
          content({ photoPath: null }),
        ),
      ).rejects.toMatchObject({ code: TEAM_PROFILE_INCOMPLETE_SQLSTATE });
    });

    it("cannot write another admin's profile, or upload into their folder", async () => {
      const { error } = await adminAuth.rpc("save_team_profile", {
        p_user_id: otherAdminId,
        p_translations: [],
      });
      expect(error?.code).toBe(FORBIDDEN);

      const upload = await adminAuth.storage
        .from(TEAM_PHOTOS_BUCKET)
        .upload(`${otherAdminId}/${crypto.randomUUID()}.jpg`, photoBlob(), {
          contentType: "image/jpeg",
        });
      expect(upload.error).not.toBeNull();

      // …while a Gedu's folder takes one.
      const intoGedu = await adminAuth.storage
        .from(TEAM_PHOTOS_BUCKET)
        .upload(`${TEST_IDS.GEDU}/${crypto.randomUUID()}.jpg`, photoBlob(), {
          contentType: "image/jpeg",
        });
      expect(intoGedu.error).toBeNull();
    });

    it("reads any admin's or Gedu's profile and photo", async () => {
      const photo = await seedPhoto(otherAdminId);
      await new TeamProfilesService(otherAdminAuth).saveOwnTeamProfile(
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
      await new TeamProfilesService(geduAuth).saveOwnTeamProfile(
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
          p_approval: "approved",
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
  // The approval
  // -------------------------------------------------------------------------

  describe("the approval", () => {
    async function approval(): Promise<string | undefined> {
      const { data } = await admin
        .from("team_profiles")
        .select("approval, approval_decided_by, approval_decided_at")
        .eq("user_id", TEST_IDS.GEDU)
        .single();
      return data?.approval;
    }

    function set(decision: Database["public"]["Enums"]["team_profile_approval"]) {
      return adminAuth.rpc("set_team_profile_approval", {
        p_user_id: TEST_IDS.GEDU,
        p_approval: decision,
      });
    }

    it("moves pending → approved → withdrawn → approved, and never back to pending", async () => {
      await new TeamProfilesService(geduAuth).saveOwnTeamProfile(
        TEST_IDS.GEDU,
        content(),
        false,
      );

      expect((await set("withdrawn")).error?.code).toBe("22023");
      expect(await approval()).toBe("pending");

      expect((await set("approved")).error).toBeNull();
      const { data: stamped } = await admin
        .from("team_profiles")
        .select("approval_decided_by, approval_decided_at")
        .eq("user_id", TEST_IDS.GEDU)
        .single();
      expect(stamped?.approval_decided_by).toBe(TEST_IDS.ADMIN);
      expect(stamped?.approval_decided_at).not.toBeNull();

      expect((await set("withdrawn")).error).toBeNull();
      expect(await approval()).toBe("withdrawn");

      expect((await set("approved")).error).toBeNull();
      expect(await approval()).toBe("approved");
      // Saying it again is a no-op, not a refusal.
      expect((await set("approved")).error).toBeNull();

      expect((await set("pending")).error?.code).toBe("22023");
      expect(await approval()).toBe("approved");
    });

    it("survives the Gedu turning their checkbox off and on", async () => {
      const photo = await seedPhoto(TEST_IDS.GEDU);
      const service = new TeamProfilesService(geduAuth);
      await service.saveOwnTeamProfile(TEST_IDS.GEDU, content({ photoPath: photo }), true);
      expect((await set("approved")).error).toBeNull();
      await service.saveOwnTeamProfile(TEST_IDS.GEDU, content({ photoPath: photo }), false);
      await service.saveOwnTeamProfile(TEST_IDS.GEDU, content({ photoPath: photo }), true);
      expect(await approval()).toBe("approved");
    });

    it("refuses an admin's profile and a person with no profile", async () => {
      await new TeamProfilesService(adminAuth).saveOwnTeamProfile(
        TEST_IDS.ADMIN,
        content(),
        false,
      );
      const adminsOwn = await adminAuth.rpc("set_team_profile_approval", {
        p_user_id: TEST_IDS.ADMIN,
        p_approval: "approved",
      });
      expect(adminsOwn.error?.code).toBe("22023");

      const none = await adminAuth.rpc("set_team_profile_approval", {
        p_user_id: otherGeduId,
        p_approval: "approved",
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

    it("answers an admin for their own and a Gedu's, never another admin's", async () => {
      expect(await canEdit(adminAuth, TEST_IDS.ADMIN)).toBe(true);
      expect(await canEdit(adminAuth, TEST_IDS.GEDU)).toBe(true);
      expect(await canEdit(adminAuth, otherAdminId)).toBe(false);
      expect(await canEdit(adminAuth, TEST_IDS.CUSTOMER)).toBe(false);
    });

    it("answers false to a parent and a gamer, about themselves too", async () => {
      expect(await canEdit(customerAuth, TEST_IDS.CUSTOMER)).toBe(false);
      expect(await canEdit(customerAuth, TEST_IDS.GEDU)).toBe(false);
      expect(await canEdit(gamerAuth, TEST_IDS.GAMER)).toBe(false);
    });
  });
});
