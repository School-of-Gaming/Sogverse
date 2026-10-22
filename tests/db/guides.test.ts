import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAnonTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { GUIDES_BUCKET } from "@/services/guides/guides.contracts";
import { GuidesService } from "@/services/guides/guides.service";

/**
 * Guides: `guides` (the admin-only label, who created and last saved each),
 * `guide_files` (one PDF per locale), their admin-guarded writers and the
 * private `guides` bucket.
 *
 * Pinned here: the store is an admin's alone — anon reads nothing and every
 * other role reads no row; a guide is created with its first file and its
 * last file cannot be removed; replacing a file answers the path it let go,
 * and removing one the path it removed; every path names its guide and
 * locale; no role deletes a guide; the triggers stamp who created, saved and
 * uploaded; and the bucket is private, an object readable by an admin's
 * session and by no other.
 *
 * The guides this file creates are found by a label prefix only it uses and
 * removed at the end on the service role. Fixture UUID 920 (product-helpers.ts
 * registry).
 */

/** A guide id that must NEVER exist. */
const MISSING = "00000000-0000-0000-0000-000000000920";

/** Every label this file writes starts with it, so cleanup finds them all. */
const PREFIX = "Fixture guide:";

const pathFor = (guideId: string, locale: string) => `${guideId}/${locale}/${randomUUID()}.pdf`;

/** A tiny file that is a PDF by its first bytes, which is all the bucket needs here. */
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n%fixture\n");

describe("guides", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let others: SupabaseClient<Database>[];
  let anon: SupabaseClient<Database>;
  /** Objects this file put in the bucket, removed at the end. */
  const objects: string[] = [];

  async function cleanUp() {
    const { data } = await admin.from("guides").select("id").like("label", `${PREFIX}%`);
    const ids = (data ?? []).map((row) => row.id);
    if (ids.length > 0) await admin.from("guides").delete().in("id", ids);
    if (objects.length > 0) await admin.storage.from(GUIDES_BUCKET).remove(objects);
  }

  /** A guide with an English file at a fresh path; no object behind it. */
  async function mint(label = `${PREFIX} parents`): Promise<{ id: string; path: string }> {
    const id = randomUUID();
    const path = pathFor(id, "en");
    const { error } = await adminAuth.rpc("create_guide", {
      p_id: id,
      p_label: label,
      p_locale: "en",
      p_storage_path: path,
      p_file_name: "parents.pdf",
      p_byte_size: 1000,
    });
    expect(error).toBeNull();
    return { id, path };
  }

  async function files(id: string) {
    const { data } = await admin
      .from("guide_files")
      .select("locale, storage_path, file_name, byte_size, uploaded_by")
      .eq("guide_id", id)
      .order("locale");
    return data ?? [];
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    others = await Promise.all(
      [TEST_CREDENTIALS.CUSTOMER, TEST_CREDENTIALS.GEDU, TEST_CREDENTIALS.GAMER].map((who) =>
        createAuthenticatedClient(who.email, who.password),
      ),
    );
    anon = createAnonTestClient();
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
  });

  // -------------------------------------------------------------------------
  // Who reads the store
  // -------------------------------------------------------------------------

  describe("the store", () => {
    it("is read by an admin, and by no other role", async () => {
      const { id } = await mint();
      expect((await adminAuth.from("guides").select("id").eq("id", id)).data).toHaveLength(1);
      expect((await adminAuth.from("guide_files").select("locale").eq("guide_id", id)).data).toHaveLength(1);
      for (const client of others) {
        expect((await client.from("guides").select("id").eq("id", id)).data).toEqual([]);
        expect((await client.from("guide_files").select("locale").eq("guide_id", id)).data).toEqual([]);
      }
      expect((await anon.from("guides").select("id").limit(1)).error?.code).toBe("42501");
      expect((await anon.from("guide_files").select("locale").limit(1)).error?.code).toBe("42501");
    });

    it("lets no role but the service role delete a guide", async () => {
      const { id } = await mint();
      for (const client of [adminAuth, ...others]) {
        const { error } = await client.from("guides").delete().eq("id", id);
        expect(error?.code).toBe("42501");
      }
      expect((await admin.from("guides").select("id").eq("id", id)).data).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // The writers
  // -------------------------------------------------------------------------

  describe("creating a guide", () => {
    it("writes the guide with its first file, trimmed, stamped with its creator", async () => {
      const id = randomUUID();
      const path = pathFor(id, "fi");
      const { data, error } = await adminAuth.rpc("create_guide", {
        p_id: id,
        p_label: `  ${PREFIX} trimmed  `,
        p_locale: "fi",
        p_storage_path: path,
        p_file_name: "  opas.pdf ",
        p_byte_size: 2048,
      });
      expect(error).toBeNull();
      expect(data).toBe(id);

      const { data: guide } = await admin
        .from("guides")
        .select("label, created_by, last_saved_by, created_via")
        .eq("id", id)
        .single();
      expect(guide).toEqual({
        label: `${PREFIX} trimmed`,
        created_by: TEST_IDS.ADMIN,
        last_saved_by: TEST_IDS.ADMIN,
        created_via: null,
      });
      expect(await files(id)).toEqual([
        { locale: "fi", storage_path: path, file_name: "opas.pdf", byte_size: 2048, uploaded_by: TEST_IDS.ADMIN },
      ]);
    });

    it("refuses a label or file it cannot keep, with a sentence, and writes nothing", async () => {
      const cases: [string, Partial<Record<string, unknown>>, string][] = [
        ["a blank label", { p_label: "   " }, "A guide needs a label"],
        ["a label too long", { p_label: `${PREFIX} ${"x".repeat(200)}` }, "A guide's label is at most 200 characters"],
        ["a blank file name", { p_file_name: " " }, "The en file needs its file name"],
        ["an empty file", { p_byte_size: 0 }, "The en file is empty"],
        ["a file over 4 MB", { p_byte_size: 4 * 1024 * 1024 + 1 }, "The en file is larger than 4 MB"],
      ];
      for (const [name, change, message] of cases) {
        const id = randomUUID();
        const { error } = await adminAuth.rpc("create_guide", {
          p_id: id,
          p_label: `${PREFIX} refused`,
          p_locale: "en",
          p_storage_path: pathFor(id, "en"),
          p_file_name: "guide.pdf",
          p_byte_size: 1000,
          ...change,
        });
        expect(error?.code, name).toBe("23514");
        expect(error?.message, name).toBe(message);
        expect((await admin.from("guides").select("id").eq("id", id)).data, name).toEqual([]);
      }
    });

    it("refuses a path that does not name its own guide and locale, or is not a PDF's", async () => {
      const id = randomUUID();
      for (const path of [pathFor(randomUUID(), "en"), pathFor(id, "fi"), `${id}/en/${randomUUID()}.png`, `${id}/en/guide.pdf`]) {
        const { error } = await adminAuth.rpc("create_guide", {
          p_id: id,
          p_label: `${PREFIX} bad path`,
          p_locale: "en",
          p_storage_path: path,
          p_file_name: "guide.pdf",
          p_byte_size: 1000,
        });
        expect(error?.code, path).toBe("23514");
      }
      expect((await admin.from("guides").select("id").eq("id", id)).data).toEqual([]);
    });
  });

  describe("a language's file", () => {
    it("is added beside the others, answering no path to delete", async () => {
      const { id, path } = await mint();
      const fi = pathFor(id, "fi");
      const { data, error } = await adminAuth.rpc("save_guide_file", {
        p_id: id,
        p_locale: "fi",
        p_storage_path: fi,
        p_file_name: "opas.pdf",
        p_byte_size: 500,
      });
      expect(error).toBeNull();
      expect(data).toBeNull();
      expect((await files(id)).map((file) => [file.locale, file.storage_path])).toEqual([
        ["en", path],
        ["fi", fi],
      ]);
    });

    it("is replaced at a fresh path, answering the path it let go", async () => {
      const { id, path } = await mint();
      const next = pathFor(id, "en");
      const { data, error } = await adminAuth.rpc("save_guide_file", {
        p_id: id,
        p_locale: "en",
        p_storage_path: next,
        p_file_name: "parents-v2.pdf",
        p_byte_size: 1234,
      });
      expect(error).toBeNull();
      expect(data).toBe(path);
      expect(await files(id)).toEqual([
        { locale: "en", storage_path: next, file_name: "parents-v2.pdf", byte_size: 1234, uploaded_by: TEST_IDS.ADMIN },
      ]);

      // The same path sent again names the object now stored: nothing to delete.
      const again = await adminAuth.rpc("save_guide_file", {
        p_id: id,
        p_locale: "en",
        p_storage_path: next,
        p_file_name: "parents-v2.pdf",
        p_byte_size: 1234,
      });
      expect(again.error).toBeNull();
      expect(again.data).toBeNull();
    });

    it("is refused for a guide that does not exist", async () => {
      const { error } = await adminAuth.rpc("save_guide_file", {
        p_id: MISSING,
        p_locale: "en",
        p_storage_path: pathFor(MISSING, "en"),
        p_file_name: "guide.pdf",
        p_byte_size: 10,
      });
      expect(error?.code).toBe("P0002");
    });

    it("is removed, answering its path, but never the last one", async () => {
      const { id, path } = await mint();
      const fi = pathFor(id, "fi");
      await adminAuth.rpc("save_guide_file", {
        p_id: id,
        p_locale: "fi",
        p_storage_path: fi,
        p_file_name: "opas.pdf",
        p_byte_size: 500,
      });

      const removed = await adminAuth.rpc("remove_guide_file", { p_id: id, p_locale: "fi" });
      expect(removed.error).toBeNull();
      expect(removed.data).toBe(fi);

      const last = await adminAuth.rpc("remove_guide_file", { p_id: id, p_locale: "en" });
      expect(last.error?.code).toBe("23514");
      expect(last.error?.message).toBe("That is the guide's only file, and a guide needs one");
      expect((await files(id)).map((file) => file.storage_path)).toEqual([path]);

      const gone = await adminAuth.rpc("remove_guide_file", { p_id: id, p_locale: "sv" });
      expect(gone.error?.code).toBe("P0002");
      expect(gone.error?.message).toBe("The guide has no sv file");
    });
  });

  describe("the label", () => {
    it("is saved alone, stamping the save", async () => {
      const { id } = await mint();
      const before = await admin.from("guides").select("updated_at").eq("id", id).single();
      const { error } = await adminAuth.rpc("save_guide_label", { p_id: id, p_label: `${PREFIX} renamed ` });
      expect(error).toBeNull();
      const after = await admin.from("guides").select("label, updated_at").eq("id", id).single();
      expect(after.data?.label).toBe(`${PREFIX} renamed`);
      expect(Date.parse(after.data?.updated_at ?? "")).toBeGreaterThanOrEqual(
        Date.parse(before.data?.updated_at ?? ""),
      );
      expect((await adminAuth.rpc("save_guide_label", { p_id: MISSING, p_label: "x" })).error?.code).toBe("P0002");
    });
  });

  // -------------------------------------------------------------------------
  // The bucket
  // -------------------------------------------------------------------------

  describe("the bucket", () => {
    it("is private, PDF only, capped at 4 MB", async () => {
      const { data, error } = await admin.storage.getBucket(GUIDES_BUCKET);
      expect(error).toBeNull();
      expect(data).toMatchObject({
        public: false,
        file_size_limit: 4 * 1024 * 1024,
        allowed_mime_types: ["application/pdf"],
      });
    });

    it("lets an admin's session read an object, and no other role's", async () => {
      const { id } = await mint();
      const path = pathFor(id, "en");
      objects.push(path);
      const uploaded = await admin.storage
        .from(GUIDES_BUCKET)
        .upload(path, PDF_BYTES, { contentType: "application/pdf" });
      expect(uploaded.error).toBeNull();

      expect((await adminAuth.storage.from(GUIDES_BUCKET).download(path)).error).toBeNull();
      for (const client of [...others, anon]) {
        expect((await client.storage.from(GUIDES_BUCKET).download(path)).data).toBeNull();
        const signed = await client.storage.from(GUIDES_BUCKET).createSignedUrl(path, 60);
        expect(signed.data).toBeNull();
      }
    });

    it("loses a removed file's object when the service removes the file on an admin's session", async () => {
      const { id } = await mint();
      const fi = pathFor(id, "fi");
      objects.push(fi);
      expect(
        (await admin.storage.from(GUIDES_BUCKET).upload(fi, PDF_BYTES, { contentType: "application/pdf" })).error,
      ).toBeNull();
      await adminAuth.rpc("save_guide_file", {
        p_id: id,
        p_locale: "fi",
        p_storage_path: fi,
        p_file_name: "opas.pdf",
        p_byte_size: PDF_BYTES.byteLength,
      });

      await new GuidesService(adminAuth).removeGuideFile(id, "fi");

      const { data } = await admin.storage.from(GUIDES_BUCKET).list(`${id}/fi`);
      expect(data).toEqual([]);
    });
  });
});
