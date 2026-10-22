import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { createAdminTestClient, createAnonTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS } from "./constants";
import { landingSections, type LandingSection } from "@/lib/landing-pages/sections";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";
import { guideDownloadRows, landingPageGuideRows } from "@/services/guides/guides.contracts";
import { GuidesService } from "@/services/guides/guides.service";

/**
 * A landing page's guide section: the structure check's two halves on a
 * guide's id, the refusal of an id no guide has (`check_landing_guide_picks`),
 * the public read `list_landing_page_guides` and the download read
 * `get_guide_download_files` — the scope test the authorization spine names
 * for both — and the admin read of where a guide is offered.
 *
 * Pinned on the public read: anon is answered the guides a LIVE page's
 * published copy places, with which locales have a file and how large each
 * is, and nothing more; never one placed only in a working copy; and every
 * caller is answered alike.
 *
 * Pinned on the download read: anon cannot call it; every signed-in role gets
 * a live guide's files and none of a guide placed only in a working copy; an
 * admin gets both; and the reader's file is picked in the app by the reader
 * fallback.
 *
 * Fixture UUIDs 921-923 (product-helpers.ts registry): two landing pages and a
 * guide id that must NEVER exist. Its guides are minted through the admin's
 * writer and found by a label prefix only this file uses.
 */

const PAGE_LIVE = "00000000-0000-0000-0000-000000000921";
const PAGE_DRAFT = "00000000-0000-0000-0000-000000000922";
const MISSING = "00000000-0000-0000-0000-000000000923";

const HERO = "00000000-0000-4000-8000-000000000b01";
const GUIDE = "00000000-0000-4000-8000-000000000b02";

const PREFIX = "Fixture landing guide:";

function structure(guideId: string): LandingSection[] {
  return [
    { id: HERO, type: "hero" },
    { id: GUIDE, type: "guide", guideId },
  ];
}

describe("landing page guides", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let others: SupabaseClient<Database>[];
  let anon: SupabaseClient<Database>;
  let pages: LandingPageService;
  /** g[0] the live page's (en + fi), g[1] the draft's (fi alone), g[2] never placed. */
  let g: string[];

  async function cleanUp() {
    await admin.from("landing_pages").delete().in("id", [PAGE_LIVE, PAGE_DRAFT]);
    const { data } = await admin.from("guides").select("id").like("label", `${PREFIX}%`);
    const ids = (data ?? []).map((row) => row.id);
    if (ids.length > 0) await admin.from("guides").delete().in("id", ids);
  }

  async function mint(locales: string[]): Promise<string> {
    const id = randomUUID();
    const [first, ...rest] = locales;
    const created = await adminAuth.rpc("create_guide", {
      p_id: id,
      p_label: `${PREFIX} ${locales.join("+")}`,
      p_locale: first,
      p_storage_path: `${id}/${first}/${randomUUID()}.pdf`,
      p_file_name: `guide-${first}.pdf`,
      p_byte_size: 1000,
    });
    expect(created.error).toBeNull();
    for (const locale of rest) {
      const saved = await adminAuth.rpc("save_guide_file", {
        p_id: id,
        p_locale: locale,
        p_storage_path: `${id}/${locale}/${randomUUID()}.pdf`,
        p_file_name: `guide-${locale}.pdf`,
        p_byte_size: 2000,
      });
      expect(saved.error).toBeNull();
    }
    return id;
  }

  /** The live page placing g[0] in its published copy, and the draft placing g[1], never published. */
  async function reseed() {
    await admin.from("landing_pages").delete().in("id", [PAGE_LIVE, PAGE_DRAFT]);
    const inserted = await admin.from("landing_pages").insert([
      { id: PAGE_LIVE, sections: structure(g[0]) },
      { id: PAGE_DRAFT, sections: structure(g[1]) },
    ]);
    expect(inserted.error).toBeNull();
    const words = (headline: string) => ({
      [HERO]: { headline },
      [GUIDE]: { heading: "The parents' guide" },
    });
    const versions = await admin.from("landing_page_translations").insert([
      {
        page_id: PAGE_LIVE,
        locale: "en",
        title: "Fixture guide page",
        summary: "A summary.",
        slug: "fixture-guides-live",
        section_texts: words("Guides"),
      },
      {
        page_id: PAGE_DRAFT,
        locale: "en",
        title: "Fixture guide draft",
        summary: "A summary.",
        slug: "fixture-guides-draft",
        section_texts: words("Draft guides"),
      },
    ]);
    expect(versions.error).toBeNull();
    await pages.publishPage(PAGE_LIVE);
  }

  async function liveIds(client: SupabaseClient<Database>, page: string): Promise<string[]> {
    const { data, error } = await client.rpc("list_landing_page_guides", { p_page_id: page });
    expect(error).toBeNull();
    return landingPageGuideRows.parse(data).map((row) => row.guide_id).sort();
  }

  async function downloadable(client: SupabaseClient<Database>, guide: string): Promise<string[]> {
    const { data, error } = await client.rpc("get_guide_download_files", { p_guide_id: guide });
    expect(error).toBeNull();
    return guideDownloadRows.parse(data).map((row) => row.locale).sort();
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
    pages = new LandingPageService(adminAuth);
    await cleanUp();
    g = [await mint(["en", "fi"]), await mint(["fi"]), await mint(["en"])];
    await reseed();
  });

  afterAll(async () => {
    await cleanUp();
  });

  // -------------------------------------------------------------------------
  // The structure check, both halves
  // -------------------------------------------------------------------------

  describe("the structure", () => {
    it("takes a guide's id and an optional picture, in SQL as in TypeScript", async () => {
      const cases: [string, { [key: string]: Json }, boolean][] = [
        ["a guide", { id: GUIDE, type: "guide", guideId: MISSING }, true],
        ["a guide with a picture", { id: GUIDE, type: "guide", guideId: MISSING, imageId: MISSING }, true],
        ["no guide", { id: GUIDE, type: "guide" }, false],
        ["a guide that is not an id", { id: GUIDE, type: "guide", guideId: "parents" }, false],
        ["a picture that is not an id", { id: GUIDE, type: "guide", guideId: MISSING, imageId: "cover" }, false],
      ];
      for (const [name, section, accepted] of cases) {
        const sections = [{ id: HERO, type: "hero" }, section];
        const { data, error } = await admin.rpc("landing_sections_problem", { p_sections: sections });
        expect(error, name).toBeNull();
        expect(data === null, name).toBe(accepted);
        expect(landingSections.safeParse(sections).success, name).toBe(accepted);
      }
      const { data } = await admin.rpc("landing_sections_problem", {
        p_sections: [{ id: HERO, type: "hero" }, { id: GUIDE, type: "guide" }],
      });
      expect(data).toBe(`Section ${GUIDE} needs its guide, as a guide's lowercase uuid`);
    });
  });

  describe("an id no guide has", () => {
    it("is refused loudly, naming the section and the id, and nothing is saved", async () => {
      await reseed();
      const { error } = await adminAuth.rpc("save_landing_page_structure", {
        p_id: PAGE_DRAFT,
        p_sections: structure(MISSING),
      });
      expect(error?.code).toBe("23503");
      expect(error?.message).toBe(`Section 2 places the guide ${MISSING}, and no guide has that id`);
      const { data } = await admin.from("landing_pages").select("sections").eq("id", PAGE_DRAFT).single();
      expect(data?.sections).toEqual(structure(g[1]));
    });

    it("is refused when a page is created with it", async () => {
      const { error } = await adminAuth.rpc("create_landing_page", {
        p_sections: structure(MISSING),
        p_versions: [{ locale: "en", title: "Fixture never created" }],
      });
      expect(error?.code).toBe("23503");
    });

    it("checks only the ids a save adds, so a placement already there never refuses a save", async () => {
      const doomed = await mint(["en"]);
      await pages.saveStructure(PAGE_DRAFT, structure(doomed));
      expect((await admin.from("guides").delete().eq("id", doomed)).error).toBeNull();

      const moved: LandingSection[] = [
        { id: HERO, type: "hero" },
        { id: GUIDE, type: "guide", guideId: doomed },
        { id: randomUUID(), type: "guide", guideId: g[2] },
      ];
      await pages.saveStructure(PAGE_DRAFT, moved);
      const { data } = await admin.from("landing_pages").select("sections").eq("id", PAGE_DRAFT).single();
      expect(data?.sections).toEqual(moved);
      await reseed();
    });
  });

  // -------------------------------------------------------------------------
  // The public read
  // -------------------------------------------------------------------------

  describe("the public read", () => {
    it("answers anon the guides a live page places, with their locales and sizes alone", async () => {
      await reseed();
      expect(await liveIds(anon, PAGE_LIVE)).toEqual([g[0]]);
      const { data } = await anon.rpc("list_landing_page_guides", { p_page_id: PAGE_LIVE });
      for (const row of landingPageGuideRows.parse(data)) {
        expect(Object.keys(row).sort()).toEqual(["files", "guide_id"]);
        for (const file of row.files) expect(Object.keys(file).sort()).toEqual(["byte_size", "locale"]);
      }
      expect(await new GuidesService(anon).listLandingPageGuides(PAGE_LIVE)).toEqual([
        {
          id: g[0],
          files: [
            { locale: "en", byteSize: 1000 },
            { locale: "fi", byteSize: 2000 },
          ],
        },
      ]);
    });

    it("never answers a guide placed only in a working copy", async () => {
      await reseed();
      expect(await liveIds(anon, PAGE_DRAFT)).toEqual([]);
      await pages.saveStructure(PAGE_LIVE, structure(g[2]));
      expect(await liveIds(anon, PAGE_LIVE)).toEqual([g[0]]);
      await pages.publishPage(PAGE_LIVE);
      expect(await liveIds(anon, PAGE_LIVE)).toEqual([g[2]]);
      await pages.unpublishPage(PAGE_LIVE);
      expect(await liveIds(anon, PAGE_LIVE)).toEqual([]);
      await reseed();
    });

    it("answers an unknown page, and no page, with nothing", async () => {
      expect(await liveIds(anon, MISSING)).toEqual([]);
      expect(await new GuidesService(anon).listLandingPageGuides("not-a-uuid")).toEqual([]);
    });

    it("answers every signed-in role exactly as it answers anon", async () => {
      await reseed();
      const asAnon = landingPageGuideRows.parse(
        (await anon.rpc("list_landing_page_guides", { p_page_id: PAGE_LIVE })).data,
      );
      for (const client of [adminAuth, ...others]) {
        const asRole = await client.rpc("list_landing_page_guides", { p_page_id: PAGE_LIVE });
        expect(asRole.error).toBeNull();
        expect(landingPageGuideRows.parse(asRole.data)).toEqual(asAnon);
      }
    });
  });

  // -------------------------------------------------------------------------
  // The download read
  // -------------------------------------------------------------------------

  describe("the download read", () => {
    it("is not anon's to call", async () => {
      const { error } = await anon.rpc("get_guide_download_files", { p_guide_id: g[0] });
      expect(error?.code).toBe("42501");
    });

    it("answers every signed-in role a live guide's files, and none of a draft's or an unplaced one's", async () => {
      await reseed();
      for (const client of others) {
        expect(await downloadable(client, g[0])).toEqual(["en", "fi"]);
        expect(await downloadable(client, g[1])).toEqual([]);
        expect(await downloadable(client, g[2])).toEqual([]);
        expect(await downloadable(client, MISSING)).toEqual([]);
      }
    });

    it("answers an admin any guide's files, for a preview of a working copy", async () => {
      await reseed();
      expect(await downloadable(adminAuth, g[0])).toEqual(["en", "fi"]);
      expect(await downloadable(adminAuth, g[1])).toEqual(["fi"]);
      expect(await downloadable(adminAuth, g[2])).toEqual(["en"]);
    });

    it("hands the stored path, name and size, picked by the reader fallback", async () => {
      await reseed();
      const reader = new GuidesService(others[0]);
      const { data } = await admin
        .from("guide_files")
        .select("locale, storage_path")
        .eq("guide_id", g[0]);
      const pathOf = (locale: string) => data?.find((row) => row.locale === locale)?.storage_path;

      expect(await reader.getGuideDownload(g[0], "fi")).toEqual({
        locale: "fi",
        storagePath: pathOf("fi"),
        fileName: "guide-fi.pdf",
        byteSize: 2000,
      });
      // No Swedish file: English.
      expect((await reader.getGuideDownload(g[0], "sv"))?.locale).toBe("en");
      // A draft's guide is nobody's but an admin's.
      expect(await reader.getGuideDownload(g[1], "fi")).toBeNull();
      // Only Finnish: the first uploaded, whatever the reader's language.
      expect((await new GuidesService(adminAuth).getGuideDownload(g[1], "sv"))?.locale).toBe("fi");
    });
  });

  // -------------------------------------------------------------------------
  // The admin reads
  // -------------------------------------------------------------------------

  describe("where a guide is offered", () => {
    it("lists each landing page placing it, live, working or both", async () => {
      await reseed();
      await pages.saveStructure(PAGE_LIVE, structure(g[2]));
      const service = new GuidesService(adminAuth);
      const usage = async (id: string) => (await service.getAdminGuide(id))?.usages;

      expect(await usage(g[0])).toEqual([
        {
          pageId: PAGE_LIVE,
          titles: [{ locale: "en", title: "Fixture guide page" }],
          inLiveCopy: true,
          inWorkingCopy: false,
        },
      ]);
      expect(await usage(g[2])).toMatchObject([{ pageId: PAGE_LIVE, inLiveCopy: false, inWorkingCopy: true }]);
      expect(await usage(g[1])).toMatchObject([{ pageId: PAGE_DRAFT, inLiveCopy: false, inWorkingCopy: true }]);

      const listed = await service.listAdminGuides();
      const guide = listed.find((row) => row.id === g[0]);
      expect(guide?.label).toBe(`${PREFIX} en+fi`);
      expect(guide?.files.map((file) => [file.locale, file.fileName])).toEqual([
        ["en", "guide-en.pdf"],
        ["fi", "guide-fi.pdf"],
      ]);
      expect(guide?.created.by).not.toBeNull();
      expect(await service.listGuideSummaries([g[1], MISSING])).toEqual([
        { id: g[1], files: [{ locale: "fi", byteSize: 1000 }] },
      ]);
      await reseed();
    });
  });
});
