import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { TeamProfilesService } from "@/services/team-profiles/team-profiles.service";
import {
  TEAM_PHOTOS_BUCKET,
  publicTeamPhotoUrl,
} from "@/services/team-profiles/team-profiles.types";
import {
  publicTeamProfileRows,
  type PublicTeamProfileRow,
} from "@/services/team-profiles/team-profiles.contracts";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_CREDENTIALS } from "./constants";

/**
 * The public team page's reads — the scope test for `list_public_team_profiles`,
 * `get_public_team_profile` and `is_public_team_photo`, and for the
 * team-photos public read policy that asks the last of them.
 *
 * All three answer every caller identically: they name no caller and read no
 * uid, so there is no per-caller scope to leak. What can leak is *which*
 * profiles and *which* columns, so that is what this file pins: only approved
 * profiles of people who are still an admin or a Gedu, an uncertified Gedu's
 * included; a Gedu's last name never; nothing from `profiles` beyond the
 * narrowed columns; and the same answer to anon and to every signed-in role.
 *
 * Every person here is minted for the run, with names chosen to pin the order,
 * and the list is filtered to them, so a profile another file leaves behind
 * cannot move an assertion.
 */

const PASSWORD = "testpassword123";

/** The columns a public profile carries, and not one more. */
const PUBLIC_COLUMNS = [
  "first_name",
  "last_name",
  "nickname",
  "photo_version",
  "pick",
  "role",
  "spoken_languages",
  "title",
  "translations",
  "user_id",
];

function photoBlob(): Blob {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01])], {
    type: "image/jpeg",
  });
}

function md5(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

interface Person {
  id: string;
  photoPath: string;
}

describe("public team profiles", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let callers: Record<string, SupabaseClient<Database>>;
  const minted: string[] = [];

  // Admins: Anna and Zed public, Hidden ready but never made public.
  let anna: Person;
  let zed: Person;
  let hiddenAdmin: Person;
  // Gedus: two Aaros told apart by nickname, and Bea, uncertified, with no
  // nickname. Each carries a surname the public read must never return.
  let aaroA: Person;
  let aaroB: Person;
  let bea: Person;
  // A parent whose profile row says approved: a row left behind by someone
  // whose role has since changed.
  let formerStaff: Person;

  async function mint(
    role: "admin" | "gedu" | "customer",
    firstName: string,
    lastName: string,
  ): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({
      email: `public-team-${firstName.toLowerCase()}-${Date.now()}-${minted.length}@test.local`,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });
    expect(error).toBeNull();
    const id = data.user?.id ?? "";
    expect(id).toBeTruthy();
    minted.push(id);
    if (role !== "customer") {
      await admin.from("profiles").update({ role }).eq("id", id);
      await admin.from("customer_profiles").delete().eq("user_id", id);
    }
    await admin
      .from("profiles")
      .update({ spoken_languages: ["fi", "en"] })
      .eq("id", id);
    return id;
  }

  /** Store a photo in the person's folder as the service role. */
  async function upload(userId: string): Promise<string> {
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await admin.storage
      .from(TEAM_PHOTOS_BUCKET)
      .upload(path, photoBlob(), { contentType: "image/jpeg" });
    expect(error).toBeNull();
    return path;
  }

  /**
   * A complete profile, written straight to the tables as the service role:
   * what is under test is the read, not the writers that team-profiles.test.ts
   * already pins.
   */
  async function profile(
    role: "admin" | "gedu" | "customer",
    firstName: string,
    lastName: string,
    {
      nickname,
      approved,
    }: { nickname: string | null; approved: boolean },
  ): Promise<Person> {
    const id = await mint(role, firstName, lastName);
    const photoPath = await upload(id);
    const { error } = await admin.from("team_profiles").insert({
      user_id: id,
      nickname,
      title: role === "admin" ? `Head of ${firstName}` : null,
      pick: 4,
      photo_path: photoPath,
      opted_in: true,
      approved,
      approval_decided_at: approved ? new Date().toISOString() : null,
    });
    expect(error).toBeNull();
    const translations = await admin.from("team_profile_translations").insert([
      {
        user_id: id,
        locale: "fi",
        short_description: `${firstName} lyhyesti.`,
        long_description: `${firstName} pitkästi.`,
        fun_fact: null,
      },
      {
        user_id: id,
        locale: "en",
        short_description: `${firstName} in short.`,
        long_description: `${firstName} at length.`,
        fun_fact: "A fun fact.",
      },
    ]);
    expect(translations.error).toBeNull();
    return { id, photoPath };
  }

  /** The public list as a caller sees it, narrowed to this file's people. */
  async function listAs(
    client: SupabaseClient<Database>,
  ): Promise<PublicTeamProfileRow[]> {
    const { data, error } = await client.rpc("list_public_team_profiles");
    expect(error).toBeNull();
    const ours = new Set(minted);
    return publicTeamProfileRows
      .parse(data)
      .filter((row) => ours.has(row.user_id));
  }

  async function downloadAs(
    client: SupabaseClient<Database>,
    path: string,
  ): Promise<boolean> {
    const { error } = await client.storage
      .from(TEAM_PHOTOS_BUCKET)
      .download(path);
    return error === null;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    anon = createAnonTestClient();

    zed = await profile("admin", "Zed", "Zimmerman", {
      nickname: "Zee",
      approved: true,
    });
    anna = await profile("admin", "Anna", "Andersson", {
      nickname: null,
      approved: true,
    });
    hiddenAdmin = await profile("admin", "Hilda", "Hidden", {
      nickname: null,
      approved: false,
    });
    bea = await profile("gedu", "Bea", "Secretbea", {
      nickname: null,
      approved: true,
    });
    aaroB = await profile("gedu", "Aaro", "Secretaarob", {
      nickname: "b-tag",
      approved: true,
    });
    aaroA = await profile("gedu", "aaro", "Secretaaroa", {
      nickname: "A-tag",
      approved: true,
    });
    formerStaff = await profile("customer", "Fiona", "Former", {
      nickname: "Gone",
      approved: true,
    });

    const [adminAuth, geduAuth, customerAuth, gamerAuth] = await Promise.all([
      createAuthenticatedClient(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.GEDU.email,
        TEST_CREDENTIALS.GEDU.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.CUSTOMER.email,
        TEST_CREDENTIALS.CUSTOMER.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.GAMER.email,
        TEST_CREDENTIALS.GAMER.password,
      ),
    ]);
    callers = {
      admin: adminAuth,
      gedu: geduAuth,
      customer: customerAuth,
      gamer: gamerAuth,
    };
  });

  afterAll(async () => {
    const bucket = admin.storage.from(TEAM_PHOTOS_BUCKET);
    for (const id of minted) {
      const { data } = await bucket.list(id);
      const names = (data ?? []).map((object) => `${id}/${object.name}`);
      if (names.length > 0) await bucket.remove(names);
      await admin.from("team_profiles").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  // -------------------------------------------------------------------------
  // list_public_team_profiles
  // -------------------------------------------------------------------------

  describe("list_public_team_profiles", () => {
    it("shows anon every approved admin and Gedu, admins first, each by first name then nickname", async () => {
      const rows = await listAs(anon);

      expect(rows.map((row) => row.user_id)).toEqual([
        anna.id,
        zed.id,
        aaroA.id,
        aaroB.id,
        bea.id,
      ]);
    });

    it("leaves out a profile not made public, and a row whose person is no longer staff", async () => {
      const ids = (await listAs(anon)).map((row) => row.user_id);

      expect(ids).not.toContain(hiddenAdmin.id);
      expect(ids).not.toContain(formerStaff.id);
    });

    it("includes an uncertified Gedu: trainee standing is never asked", async () => {
      const certification = await admin
        .from("gedu_profiles")
        .select("certified")
        .eq("user_id", bea.id)
        .maybeSingle();
      expect(certification.data?.certified ?? false).toBe(false);

      const ids = (await listAs(anon)).map((row) => row.user_id);
      expect(ids).toContain(bea.id);
    });

    it("returns the narrowed columns alone, through the contract", async () => {
      const { data, error } = await anon.rpc("list_public_team_profiles");
      expect(error).toBeNull();
      const ours = (data ?? []).filter((row) => minted.includes(row.user_id));
      expect(ours.length).toBeGreaterThan(0);
      for (const row of ours) {
        expect(Object.keys(row).sort()).toEqual(PUBLIC_COLUMNS);
      }
      expect(() => publicTeamProfileRows.parse(data)).not.toThrow();
    });

    it("gives an admin's full name and title, and a Gedu's first name and nickname alone", async () => {
      const rows = await listAs(anon);
      const annaRow = rows.find((row) => row.user_id === anna.id);
      const aaroRow = rows.find((row) => row.user_id === aaroA.id);

      expect(annaRow).toMatchObject({
        role: "admin",
        first_name: "Anna",
        last_name: "Andersson",
        title: "Head of Anna",
      });
      expect(aaroRow).toMatchObject({
        role: "gedu",
        first_name: "aaro",
        last_name: null,
        nickname: "A-tag",
        title: null,
      });
    });

    it("never carries a Gedu's last name, anywhere in the answer", async () => {
      const { data } = await anon.rpc("list_public_team_profiles");
      const text = JSON.stringify(data);

      for (const surname of ["Secretbea", "Secretaarob", "Secretaaroa"]) {
        expect(text).not.toContain(surname);
      }
    });

    it("names the photo by a version token, never by its object path", async () => {
      const rows = await listAs(anon);
      const annaRow = rows.find((row) => row.user_id === anna.id);

      expect(annaRow?.photo_version).toBe(md5(anna.photoPath));
      expect(JSON.stringify(rows)).not.toContain(anna.photoPath);
    });

    it("carries every translation, ordered by locale", async () => {
      const rows = await listAs(anon);
      const zedRow = rows.find((row) => row.user_id === zed.id);

      expect(zedRow?.translations).toEqual([
        {
          locale: "en",
          short_description: "Zed in short.",
          long_description: "Zed at length.",
          fun_fact: "A fun fact.",
        },
        {
          locale: "fi",
          short_description: "Zed lyhyesti.",
          long_description: "Zed pitkästi.",
          fun_fact: null,
        },
      ]);
    });

    it("answers every signed-in role exactly as it answers anon", async () => {
      const expected = await listAs(anon);

      for (const [role, client] of Object.entries(callers)) {
        expect(await listAs(client), role).toEqual(expected);
      }
    });
  });

  // -------------------------------------------------------------------------
  // get_public_team_profile
  // -------------------------------------------------------------------------

  describe("get_public_team_profile", () => {
    async function getAs(
      client: SupabaseClient<Database>,
      userId: string,
    ): Promise<PublicTeamProfileRow[]> {
      const { data, error } = await client.rpc("get_public_team_profile", {
        p_user_id: userId,
      });
      expect(error).toBeNull();
      return publicTeamProfileRows.parse(data);
    }

    it("returns the same row the list gives a public profile", async () => {
      const listed = (await listAs(anon)).find((row) => row.user_id === bea.id);

      expect(await getAs(anon, bea.id)).toEqual([listed]);
    });

    it("returns nothing for a profile not made public, a former staffer's row, or an id naming no one", async () => {
      expect(await getAs(anon, hiddenAdmin.id)).toEqual([]);
      expect(await getAs(anon, formerStaff.id)).toEqual([]);
      expect(await getAs(anon, "ffffffff-ffff-4fff-bfff-ffffffffffff")).toEqual([]);
    });

    it("answers every signed-in role exactly as it answers anon", async () => {
      const expected = await getAs(anon, aaroB.id);
      expect(expected).toHaveLength(1);

      for (const [role, client] of Object.entries(callers)) {
        expect(await getAs(client, aaroB.id), role).toEqual(expected);
        expect(await getAs(client, hiddenAdmin.id), role).toEqual([]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // The service, signed out
  // -------------------------------------------------------------------------

  describe("the service, signed out", () => {
    it("lists public profiles as the profiles the page renders, photos at the app's own address", async () => {
      const profiles = await new TeamProfilesService(anon).listPublicTeamProfiles();
      const ours = profiles.filter((p) => minted.includes(p.id));

      expect(ours.map((p) => p.id)).toEqual([
        anna.id,
        zed.id,
        aaroA.id,
        aaroB.id,
        bea.id,
      ]);
      const annaProfile = ours.at(0);
      expect(annaProfile).toMatchObject({
        kind: "admin",
        lastName: "Andersson",
        title: "Head of Anna",
        photo: {
          src: publicTeamPhotoUrl(anna.id, md5(anna.photoPath)),
          width: 800,
          height: 1000,
        },
      });
      expect(annaProfile?.translations.map((t) => t.locale)).toEqual([
        "en",
        "fi",
      ]);
      const beaProfile = ours.find((p) => p.id === bea.id);
      expect(beaProfile?.kind).toBe("gedu");
      expect(beaProfile && "lastName" in beaProfile).toBe(false);
    });

    it("reads one public profile, and null for anything that is not one", async () => {
      const service = new TeamProfilesService(anon);

      expect((await service.getPublicTeamProfile(zed.id))?.id).toBe(zed.id);
      expect(await service.getPublicTeamProfile(hiddenAdmin.id)).toBeNull();
      expect(await service.getPublicTeamProfile("not-an-id")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // is_public_team_photo and the public read policy
  // -------------------------------------------------------------------------

  describe("public photos", () => {
    it("is_public_team_photo answers yes for a public profile's current photo alone", async () => {
      const ask = async (name: string) => {
        const { data, error } = await anon.rpc("is_public_team_photo", {
          p_name: name,
        });
        expect(error).toBeNull();
        return data;
      };

      expect(await ask(anna.photoPath)).toBe(true);
      expect(await ask(hiddenAdmin.photoPath)).toBe(false);
      expect(await ask(formerStaff.photoPath)).toBe(false);
      expect(await ask(`${anna.id}/not-the-photo.jpg`)).toBe(false);
    });

    it("lets anon read a public profile's photo and nothing else in the bucket", async () => {
      expect(await downloadAs(anon, anna.photoPath)).toBe(true);
      expect(await downloadAs(anon, bea.photoPath)).toBe(true);
      expect(await downloadAs(anon, hiddenAdmin.photoPath)).toBe(false);
      expect(await downloadAs(anon, formerStaff.photoPath)).toBe(false);
    });

    it("shows anon only the current photo in a public person's folder", async () => {
      const stray = await upload(zed.id);

      const { data, error } = await anon.storage
        .from(TEAM_PHOTOS_BUCKET)
        .list(zed.id);
      expect(error).toBeNull();
      expect((data ?? []).map((object) => `${zed.id}/${object.name}`)).toEqual([
        zed.photoPath,
      ]);
      expect(await downloadAs(anon, stray)).toBe(false);

      await admin.storage.from(TEAM_PHOTOS_BUCKET).remove([stray]);
    });

    it("shows anon nothing in the folder of a person who is not public", async () => {
      for (const person of [hiddenAdmin, formerStaff]) {
        const { data, error } = await anon.storage
          .from(TEAM_PHOTOS_BUCKET)
          .list(person.id);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
    });

    it("names no person who is not public at the bucket's root", async () => {
      const { data, error } = await anon.storage
        .from(TEAM_PHOTOS_BUCKET)
        .list("", { limit: 10_000 });
      expect(error).toBeNull();
      const names = (data ?? []).map((entry) => entry.name);
      const notPublic = new Set(minted);
      for (const person of [anna, zed, bea, aaroA, aaroB]) {
        notPublic.delete(person.id);
      }
      expect(notPublic.size).toBeGreaterThan(0);
      for (const id of notPublic) expect(names).not.toContain(id);
    });

    it("lets a parent read a public photo too, which their own policies alone would refuse", async () => {
      expect(await downloadAs(callers.customer, aaroB.photoPath)).toBe(true);
      expect(await downloadAs(callers.customer, hiddenAdmin.photoPath)).toBe(false);
    });

    it("stops serving a photo the moment its profile is hidden, and its old photo once replaced", async () => {
      await admin
        .from("team_profiles")
        .update({ approved: false })
        .eq("user_id", aaroB.id);
      expect(await downloadAs(anon, aaroB.photoPath)).toBe(false);
      expect(await listAs(anon)).not.toContainEqual(
        expect.objectContaining({ user_id: aaroB.id }),
      );

      await admin
        .from("team_profiles")
        .update({ approved: true })
        .eq("user_id", aaroB.id);
      const replaced = aaroB.photoPath;
      const current = await upload(aaroB.id);
      await admin
        .from("team_profiles")
        .update({ photo_path: current })
        .eq("user_id", aaroB.id);
      aaroB = { ...aaroB, photoPath: current };

      expect(await downloadAs(anon, replaced)).toBe(false);
      expect(await downloadAs(anon, current)).toBe(true);
      const row = (await listAs(anon)).find((r) => r.user_id === aaroB.id);
      expect(row?.photo_version).toBe(md5(current));
      expect(row?.photo_version).not.toBe(md5(replaced));
    });
  });
});
