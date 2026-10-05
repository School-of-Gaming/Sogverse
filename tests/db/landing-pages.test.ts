import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
  createBearerTestClient,
  oauthGrantFor,
  revokeOAuthGrant,
  type OAuthGrant,
} from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import type { CatalogueImageInsert } from "@/types";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";
import {
  missingInLandingVersion,
  type LandingSection,
} from "@/lib/landing-pages/sections";
import { asObject } from "../helpers/json";
import { requiredTextCases } from "../helpers/landing-required-text-cases";

/**
 * Landing pages: `landing_pages` (a page's admin-only working copy, holding
 * the section structure), `landing_page_publications` (its public published
 * copy, whose row existing IS the page being live), each with its
 * per-language versions; the admin-guarded writers — whole, structure-only
 * and one-language — publish and unpublish; the stored, per-language slugs
 * and their rules; the derived completeness; pictures from the image
 * catalogue, with the catalogue's replace (`repoint_landing_images`) and
 * removal (a trigger) reaching both copies; the record of who last saved
 * and through which AI app; and the SQL half of the required-text rule held
 * equal to the TypeScript half.
 *
 * No landing page table carries a write grant for any Data API role, so there
 * is no write-IDOR case to make: a direct write is refused at the grant, which
 * is asserted here once per table. Each wrong role is tried on every RPC with
 * a payload an admin would succeed with.
 *
 * Fixture UUIDs 82c-833 (see the allocation registry in product-helpers.ts).
 * Every assertion is scoped to this file's own rows.
 */

/** A page seeded complete in English. */
const PAGE_A = "00000000-0000-0000-0000-00000000082c";
/** A second page, for addresses two pages would share. */
const PAGE_B = "00000000-0000-0000-0000-00000000082d";
/** A page id that must NEVER exist. */
const PAGE_MISSING = "00000000-0000-0000-0000-00000000082e";

/** Landing pictures. */
const PIC_A = "00000000-0000-0000-0000-00000000082f";
const PIC_B = "00000000-0000-0000-0000-000000000830";
/** A product picture — a purpose a landing page may not show. */
const PRODUCT_PICTURE = "00000000-0000-0000-0000-000000000831";
/** Two pictures removed during the run. */
const PIC_DOOMED = "00000000-0000-0000-0000-000000000832";
const PIC_DOOMED_TOO = "00000000-0000-0000-0000-000000000833";
const ENTRIES = [PIC_A, PIC_B, PRODUCT_PICTURE, PIC_DOOMED, PIC_DOOMED_TOO];

/** Section and item ids inside the fixture structures. */
const HERO = "00000000-0000-4000-8000-0000000008a6";
const CTA = "00000000-0000-4000-8000-0000000008a7";
const GALLERY = "00000000-0000-4000-8000-0000000008a1";
const SHOT_1 = "00000000-0000-4000-8000-0000000008a2";
const SHOT_2 = "00000000-0000-4000-8000-0000000008a3";
const FAQ = "00000000-0000-4000-8000-0000000008a4";
const FAQ_1 = "00000000-0000-4000-8000-0000000008a5";

const hex = (seed: string): string => seed.repeat(8);

const ENTRY_ROWS: CatalogueImageInsert[] = [
  { id: PIC_A, label: "Landing fixture A", sha256: hex("1a2c082f"), path: `${hex("1a2c082f")}.jpg`, purpose: "landing_image" },
  { id: PIC_B, label: "Landing fixture B", sha256: hex("1a2c0830"), path: `${hex("1a2c0830")}.jpg`, purpose: "landing_image" },
  { id: PRODUCT_PICTURE, label: "Landing fixture product", sha256: hex("1a2c0831"), path: `${hex("1a2c0831")}.jpg`, purpose: "product" },
  { id: PIC_DOOMED, label: "Landing fixture doomed", sha256: hex("1a2c0832"), path: `${hex("1a2c0832")}.jpg`, purpose: "landing_image" },
  { id: PIC_DOOMED_TOO, label: "Landing fixture doomed too", sha256: hex("1a2c0833"), path: `${hex("1a2c0833")}.jpg`, purpose: "landing_image" },
];

const pathOf = (entry: string): string | undefined =>
  ENTRY_ROWS.find((row) => row.id === entry)?.path;

/** The fixture structure: a hero with a picture, and a call to action. */
function structure(heroImage: string | null = PIC_A): LandingSection[] {
  return [
    heroImage === null
      ? { id: HERO, type: "hero" }
      : { id: HERO, type: "hero", imageId: heroImage },
    { id: CTA, type: "cta", button: { kind: "internal", path: "/shop" } },
  ];
}

/** Every required word of `structure()` in one language. */
function words(lang: string) {
  return {
    [HERO]: { headline: `Fixture headline ${lang}`, imageAlt: `Alt ${lang}` },
    [CTA]: { heading: `Ready ${lang}?`, buttonLabel: `Join ${lang}` },
  };
}

/** A complete version of the fixture structure. */
function version(locale: "en" | "fi" | "sv", slug: string) {
  return {
    locale,
    title: `Fixture landing ${locale}`,
    summary: `A summary in ${locale}.`,
    slug,
    sectionTexts: words(locale),
  };
}

const SLUG_A = "fixture-landing-a";
const SLUG_B = "fixture-landing-b";

/** Ids minted by create during the run, deleted with the rest at the end. */
const minted: string[] = [];

describe("landing pages", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let gedu: SupabaseClient<Database>;
  let gamer: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let service: LandingPageService;

  const WRONG_ROLES = ["customer", "gedu", "gamer"] as const;
  function clientFor(role: (typeof WRONG_ROLES)[number]): SupabaseClient<Database> {
    if (role === "customer") return customer;
    if (role === "gedu") return gedu;
    return gamer;
  }

  async function cleanUp() {
    await admin
      .from("landing_pages")
      .delete()
      .in("id", [PAGE_A, PAGE_B, ...minted]);
    await admin.from("catalogue_images").delete().in("id", ENTRIES);
  }

  /** Both fixture pages back to their seeded state, unpublished: A complete in English, B a draft. */
  async function reseed() {
    await cleanUp();
    const entries = await admin.from("catalogue_images").insert(ENTRY_ROWS);
    expect(entries.error).toBeNull();
    const pages = await admin.from("landing_pages").insert([
      { id: PAGE_A, sections: structure() },
      { id: PAGE_B, sections: structure(null) },
    ]);
    expect(pages.error).toBeNull();
    const versions = await admin.from("landing_page_translations").insert([
      {
        page_id: PAGE_A,
        locale: "en",
        title: "Fixture landing en",
        summary: "A summary.",
        slug: SLUG_A,
        section_texts: words("en"),
      },
      {
        page_id: PAGE_B,
        locale: "en",
        title: "Fixture landing draft",
        summary: "",
        slug: SLUG_B,
        section_texts: {},
      },
    ]);
    expect(versions.error).toBeNull();
  }

  async function draftVersions(id: string) {
    const { data } = await admin
      .from("landing_page_translations")
      .select("locale, slug, section_texts, is_complete, first_published_at")
      .eq("page_id", id)
      .order("locale");
    return data ?? [];
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    gedu = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
    gamer = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
    anon = createAnonTestClient();
    service = new LandingPageService(adminAuth);
    await reseed();
  });

  afterAll(async () => {
    await cleanUp();
  });

  // -------------------------------------------------------------------------
  // The required-text rule, both halves
  // -------------------------------------------------------------------------

  describe("the required-text rule", () => {
    it("answers in SQL exactly what it answers in TypeScript, on every case", async () => {
      const cases = requiredTextCases();
      const answers = await Promise.all(
        cases.map((testCase) =>
          admin.rpc("landing_version_missing", {
            p_sections: testCase.sections,
            p_title: testCase.title,
            p_summary: testCase.summary,
            p_slug: testCase.slug,
            p_section_texts: testCase.sectionTexts,
          }),
        ),
      );
      cases.forEach((testCase, index) => {
        const { data, error } = answers[index];
        expect(error, testCase.name).toBeNull();
        expect(data, testCase.name).toEqual(
          missingInLandingVersion(testCase.sections, testCase),
        );
        expect(data, testCase.name).toEqual(testCase.expected);
      });
    });

    it("derives each working version's completeness from it", async () => {
      await reseed();
      expect(
        (await draftVersions(PAGE_A)).map(({ locale, is_complete }) => [locale, is_complete]),
      ).toEqual([["en", true]]);
      expect((await draftVersions(PAGE_B))[0].is_complete).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // The working copy
  // -------------------------------------------------------------------------

  describe("create and save", () => {
    it("creates a page whole, stamping the admin and deriving a missing slug from the title", async () => {
      const id = await service.createPage({
        sections: structure(null),
        versions: [
          {
            locale: "fi",
            title: "Fixture: Pelikerhot Äänekoskella",
            summary: "",
            sectionTexts: {},
          },
        ],
      });
      minted.push(id);

      const { data: row } = await admin
        .from("landing_pages")
        .select("author_id, sections, image_paths")
        .eq("id", id)
        .single();
      expect(row?.author_id).toBe(TEST_IDS.ADMIN);
      expect(row?.sections).toEqual(structure(null));
      expect(row?.image_paths).toEqual({});
      const [fi] = await draftVersions(id);
      expect(fi.slug).toBe("fixture-pelikerhot-aanekoskella");
      expect(fi.is_complete).toBe(false);
    });

    it("refuses a structure without its hero first, naming the problem and creating nothing", async () => {
      const { data: before } = await admin.from("landing_pages").select("id");
      const { error } = await adminAuth.rpc("create_landing_page", {
        p_sections: [structure()[1]],
        p_versions: [{ locale: "en", title: "Fixture: no hero" }],
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toBe("A page starts with its hero section");
      const { data: after } = await admin.from("landing_pages").select("id");
      expect(after?.length).toBe(before?.length);
    });

    it("refuses a section of no known type, and a picture that is not a uuid", async () => {
      const unknown = await adminAuth.rpc("save_landing_page", {
        p_id: PAGE_A,
        p_sections: [...structure(null), { id: GALLERY, type: "video" }],
        p_versions: [{ locale: "en", title: "T" }],
      });
      expect(unknown.error?.code).toBe("23514");
      const badPicture = await adminAuth.rpc("save_landing_page_structure", {
        p_id: PAGE_A,
        p_sections: [{ id: HERO, type: "hero", imageId: "not-an-id" }],
      });
      expect(badPicture.error?.code).toBe("23514");
    });

    it("refuses words for a section the page does not have", async () => {
      await reseed();
      const { error } = await adminAuth.rpc("save_landing_page_version", {
        p_id: PAGE_A,
        p_locale: "en",
        p_title: "T",
        p_section_texts: { [GALLERY]: { heading: "Stray" } },
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toContain(GALLERY);
    });

    it("replaces the version set whole, removing a language left out", async () => {
      await reseed();
      await service.savePage(PAGE_A, {
        sections: structure(),
        versions: [version("en", SLUG_A), version("fi", "fixture-landing-a-fi")],
      });
      expect((await draftVersions(PAGE_A)).map((v) => v.locale)).toEqual(["en", "fi"]);

      await service.savePage(PAGE_A, {
        sections: structure(),
        versions: [version("fi", "fixture-landing-a-fi")],
      });
      expect((await draftVersions(PAGE_A)).map((v) => v.locale)).toEqual(["fi"]);
    });

    it("refuses an id no page has", async () => {
      const { error } = await adminAuth.rpc("save_landing_page", {
        p_id: PAGE_MISSING,
        p_sections: structure(null),
        p_versions: [{ locale: "en", title: "T" }],
      });
      expect(error?.code).toBe("P0002");
      const structureOnly = await adminAuth.rpc("save_landing_page_structure", {
        p_id: PAGE_MISSING,
        p_sections: structure(null),
      });
      expect(structureOnly.error?.code).toBe("P0002");
      const one = await adminAuth.rpc("save_landing_page_version", {
        p_id: PAGE_MISSING,
        p_locale: "en",
        p_title: "T",
      });
      expect(one.error?.code).toBe("P0002");
    });
  });

  // -------------------------------------------------------------------------
  // Addresses
  // -------------------------------------------------------------------------

  describe("slugs", () => {
    it("refuses a slug another page holds in the same locale, and allows it in another", async () => {
      await reseed();
      const taken = await adminAuth.rpc("save_landing_page_version", {
        p_id: PAGE_B,
        p_locale: "en",
        p_title: "T",
        p_slug: SLUG_A,
      });
      expect(taken.error?.code).toBe("23505");
      expect(taken.error?.message).toContain(SLUG_A);

      await service.saveVersion(PAGE_B, { ...version("sv", SLUG_A), sectionTexts: {} });
      expect((await draftVersions(PAGE_B)).find((v) => v.locale === "sv")?.slug).toBe(SLUG_A);
    });

    it("refuses a slug shaped like an id, or outside the format", async () => {
      await reseed();
      for (const slug of ["123e4567-e89b-42d3-a456-426614174000", "Not-Lowercase", "a--b"]) {
        const { error } = await adminAuth.rpc("save_landing_page_version", {
          p_id: PAGE_B,
          p_locale: "en",
          p_title: "T",
          p_slug: slug,
        });
        expect(error?.code, slug).toBe("23514");
      }
    });

    it("keeps the stored slug when a save sends none, whatever the title", async () => {
      await reseed();
      await service.saveVersion(PAGE_A, {
        locale: "en",
        title: "A different title altogether",
        summary: "A summary.",
        sectionTexts: words("en"),
      });
      expect((await draftVersions(PAGE_A))[0].slug).toBe(SLUG_A);
    });

    it("fixes a language's slug once it has been published, through unpublishing too", async () => {
      await reseed();
      await service.publishPage(PAGE_A);
      expect((await draftVersions(PAGE_A))[0].first_published_at).not.toBeNull();
      expect((await service.getAdminPage(PAGE_A))?.draft.versions[0].slugFixed).toBe(true);

      const changed = await adminAuth.rpc("save_landing_page_version", {
        p_id: PAGE_A,
        p_locale: "en",
        p_title: "T",
        p_slug: "fixture-landing-a-renamed",
      });
      expect(changed.error?.code).toBe("23514");
      expect(changed.error?.message).toContain(SLUG_A);

      await service.unpublishPage(PAGE_A);
      const afterUnpublish = await adminAuth.rpc("save_landing_page_version", {
        p_id: PAGE_A,
        p_locale: "en",
        p_title: "T",
        p_slug: "fixture-landing-a-renamed",
      });
      expect(afterUnpublish.error?.code).toBe("23514");
    });

    it("keeps a live language's slug when a whole save removes it and a later one writes it again", async () => {
      await reseed();
      await service.savePage(PAGE_A, {
        sections: structure(),
        versions: [version("en", SLUG_A), version("fi", "fixture-landing-a-fi")],
      });
      await service.publishPage(PAGE_A);
      await service.savePage(PAGE_A, { sections: structure(), versions: [version("en", SLUG_A)] });

      // Another page cannot take the address the live Finnish version holds.
      const taken = await adminAuth.rpc("save_landing_page_version", {
        p_id: PAGE_B,
        p_locale: "fi",
        p_title: "T",
        p_slug: "fixture-landing-a-fi",
      });
      expect(taken.error?.code).toBe("23505");

      // Written again with no slug, Finnish takes its live one back, fixed.
      await service.saveVersion(PAGE_A, {
        locale: "fi",
        title: "Fixture: something else entirely",
        summary: "S",
        sectionTexts: words("fi"),
      });
      const fi = (await draftVersions(PAGE_A)).find((v) => v.locale === "fi");
      expect(fi?.slug).toBe("fixture-landing-a-fi");
      expect(fi?.first_published_at).not.toBeNull();

      const renamed = await adminAuth.rpc("save_landing_page_version", {
        p_id: PAGE_A,
        p_locale: "fi",
        p_title: "T",
        p_slug: "fixture-landing-a-fi-2",
      });
      expect(renamed.error?.code).toBe("23514");
    });
  });

  // -------------------------------------------------------------------------
  // Partial writes
  // -------------------------------------------------------------------------

  describe("partial writes", () => {
    it("a structure save drops a removed section's words from every language", async () => {
      await reseed();
      await service.savePage(PAGE_A, {
        sections: structure(),
        versions: [version("en", SLUG_A), version("fi", "fixture-landing-a-fi")],
      });
      await service.saveStructure(PAGE_A, [structure()[0]]);

      for (const draft of await draftVersions(PAGE_A)) {
        expect(Object.keys(asObject(draft.section_texts))).toEqual([HERO]);
        expect(draft.is_complete).toBe(true);
      }
    });

    it("a structure save adding a section makes every version incomplete until it is written", async () => {
      await reseed();
      await service.saveStructure(PAGE_A, [
        ...structure(),
        { id: FAQ, type: "faq", items: [{ id: FAQ_1 }] },
      ]);
      const [en] = await draftVersions(PAGE_A);
      expect(en.is_complete).toBe(false);
      const view = await service.getAdminPage(PAGE_A);
      expect(view?.draft.versions[0].missing).toEqual([
        `sections.${FAQ}.heading`,
        `sections.${FAQ}.items.${FAQ_1}.question`,
        `sections.${FAQ}.items.${FAQ_1}.answer`,
      ]);

      // The words for the new section, through the one-language writer.
      await service.saveVersion(PAGE_A, {
        locale: "en",
        title: "Fixture landing en",
        summary: "A summary.",
        sectionTexts: {
          ...words("en"),
          [FAQ]: { heading: "Questions", items: { [FAQ_1]: { question: "Q?", answer: "A." } } },
        },
      });
      expect((await draftVersions(PAGE_A))[0].is_complete).toBe(true);
    });

    it("a one-language save touches no other language and not the structure", async () => {
      await reseed();
      await service.savePage(PAGE_A, {
        sections: structure(),
        versions: [version("en", SLUG_A), version("fi", "fixture-landing-a-fi")],
      });
      const before = await draftVersions(PAGE_A);
      await service.saveVersion(PAGE_A, {
        ...version("fi", "fixture-landing-a-fi"),
        title: "Fixture: uusi otsikko",
      });
      const after = await draftVersions(PAGE_A);
      expect(after.find((v) => v.locale === "en")).toEqual(before.find((v) => v.locale === "en"));
      const { data } = await admin.from("landing_pages").select("sections").eq("id", PAGE_A).single();
      expect(data?.sections).toEqual(structure());
    });
  });

  // -------------------------------------------------------------------------
  // Publishing
  // -------------------------------------------------------------------------

  describe("publish and unpublish", () => {
    it("refuses a page with no complete version, and an id no page has", async () => {
      await reseed();
      const incomplete = await adminAuth.rpc("publish_landing_page", { p_id: PAGE_B });
      expect(incomplete.error?.code).toBe("23514");
      const missing = await adminAuth.rpc("publish_landing_page", { p_id: PAGE_MISSING });
      expect(missing.error?.code).toBe("P0002");
      const unmissing = await adminAuth.rpc("unpublish_landing_page", { p_id: PAGE_MISSING });
      expect(unmissing.error?.code).toBe("P0002");
    });

    it("puts every complete version live at once and leaves an incomplete one out", async () => {
      await reseed();
      await service.savePage(PAGE_A, {
        sections: structure(),
        versions: [
          version("en", SLUG_A),
          { ...version("fi", "fixture-landing-a-fi"), summary: "" },
        ],
      });
      await service.publishPage(PAGE_A);

      const live = await new LandingPageService(anon).getPublishedPage(PAGE_A);
      expect(live?.versions.map((v) => v.locale)).toEqual(["en"]);
      expect(live?.sections).toEqual(structure());
      expect(live?.imagePaths).toEqual({ [PIC_A]: pathOf(PIC_A) });
      expect(live?.versions[0].sectionTexts).toEqual(words("en"));

      const bySlug = await new LandingPageService(anon).getPublishedPageBySlug("en", SLUG_A);
      expect(bySlug?.id).toBe(PAGE_A);
      expect(await new LandingPageService(anon).getPublishedPageBySlug("fi", SLUG_A)).toBeNull();

      const listed = await new LandingPageService(anon).listPublishedPages();
      expect(listed.find((page) => page.id === PAGE_A)?.versions).toEqual([
        { locale: "en", title: "Fixture landing en", summary: "A summary in en.", slug: SLUG_A },
      ]);
    });

    it("tells unpublished changes apart, and keeps the first publish date on a republish", async () => {
      await reseed();
      await service.publishPage(PAGE_A);
      const first = (await service.getAdminPage(PAGE_A))?.publication?.firstPublishedAt;
      expect((await service.getAdminPage(PAGE_A))?.hasUnpublishedChanges).toBe(false);

      await service.saveVersion(PAGE_A, {
        locale: "en",
        title: "Fixture landing en",
        summary: "A summary.",
        sectionTexts: { ...words("en"), [CTA]: { heading: "Changed", buttonLabel: "Join" } },
      });
      expect((await service.getAdminPage(PAGE_A))?.hasUnpublishedChanges).toBe(true);
      const listed = await service.listAdminPages();
      expect(listed.find((page) => page.id === PAGE_A)).toMatchObject({
        isPublished: true,
        hasUnpublishedChanges: true,
      });

      // A half-written new language is no change readers would see.
      await service.publishPage(PAGE_A);
      await service.saveVersion(PAGE_A, { locale: "sv", title: "Halvfärdig", summary: "", sectionTexts: {} });
      const after = await service.getAdminPage(PAGE_A);
      expect(after?.hasUnpublishedChanges).toBe(false);
      expect(after?.publication?.firstPublishedAt).toBe(first);
    });

    it("unpublishing takes the page down and keeps the working copy", async () => {
      await reseed();
      await service.publishPage(PAGE_A);
      await service.unpublishPage(PAGE_A);
      expect(await new LandingPageService(anon).getPublishedPage(PAGE_A)).toBeNull();
      expect((await draftVersions(PAGE_A)).length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Who may do what
  // -------------------------------------------------------------------------

  describe("access", () => {
    for (const role of WRONG_ROLES) {
      it(`refuses every writer to a ${role}, on a payload an admin would succeed with`, async () => {
        await reseed();
        const client = clientFor(role);
        const calls = [
          client.rpc("create_landing_page", {
            p_sections: structure(null),
            p_versions: [{ locale: "en", title: "T" }],
          }),
          client.rpc("save_landing_page", {
            p_id: PAGE_A,
            p_sections: structure(null),
            p_versions: [{ locale: "en", title: "T" }],
          }),
          client.rpc("save_landing_page_structure", { p_id: PAGE_A, p_sections: structure(null) }),
          client.rpc("save_landing_page_version", { p_id: PAGE_A, p_locale: "en", p_title: "T" }),
          client.rpc("publish_landing_page", { p_id: PAGE_A }),
          client.rpc("unpublish_landing_page", { p_id: PAGE_A }),
          client.rpc("repoint_landing_images", { p_from: PIC_A, p_to: PIC_B }),
        ];
        for (const { error } of await Promise.all(calls)) {
          expect(error?.code).toBe("42501");
        }
        const { data } = await client.from("landing_pages").select("id").eq("id", PAGE_A);
        expect(data).toEqual([]);
      });
    }

    it("lets anon read the published copy and nothing of the working one", async () => {
      await reseed();
      await service.publishPage(PAGE_A);
      const live = await anon.from("landing_page_publications").select("page_id").eq("page_id", PAGE_A);
      expect(live.data).toEqual([{ page_id: PAGE_A }]);
      const working = await anon.from("landing_pages").select("id");
      expect(working.error?.code).toBe("42501");
      const workingVersions = await anon.from("landing_page_translations").select("page_id");
      expect(workingVersions.error?.code).toBe("42501");
    });

    it("refuses even an admin writing the tables directly — the RPCs are the only way in", async () => {
      const tables = [
        adminAuth.from("landing_pages").insert({ sections: [] }),
        adminAuth
          .from("landing_page_translations")
          .insert({ page_id: PAGE_A, locale: "sv", title: "T" }),
        adminAuth
          .from("landing_page_publications")
          .insert({ page_id: PAGE_B, sections: [], published_at: "2026-01-01", first_published_at: "2026-01-01" }),
        adminAuth.from("landing_page_publication_translations").insert({
          page_id: PAGE_A,
          locale: "sv",
          title: "T",
          summary: "S",
          slug: "fixture-direct",
          section_texts: {},
        }),
      ];
      for (const { error } of await Promise.all(tables)) {
        expect(error?.code).toBe("42501");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Pictures
  // -------------------------------------------------------------------------

  describe("pictures from the image catalogue", () => {
    it("refuses a product picture, and one no longer in the catalogue", async () => {
      await reseed();
      const product = await adminAuth.rpc("save_landing_page_structure", {
        p_id: PAGE_A,
        p_sections: structure(PRODUCT_PICTURE),
      });
      expect(product.error?.code).toBe("23514");
      const gone = await adminAuth.rpc("save_landing_page_structure", {
        p_id: PAGE_A,
        p_sections: structure(PAGE_MISSING),
      });
      expect(gone.error?.code).toBe("23503");
    });

    it("a replace moves both copies' pictures, a live page's without a republish", async () => {
      await reseed();
      await service.publishPage(PAGE_A);
      const { data: moved, error } = await adminAuth.rpc("repoint_landing_images", {
        p_from: PIC_A,
        p_to: PIC_B,
      });
      expect(error).toBeNull();
      expect(moved).toBe(1);

      const view = await service.getAdminPage(PAGE_A);
      expect(view?.draft.sections[0]).toEqual({ id: HERO, type: "hero", imageId: PIC_B });
      expect(view?.draft.imagePaths).toEqual({ [PIC_B]: pathOf(PIC_B) });
      expect(view?.publication?.imagePaths).toEqual({ [PIC_B]: pathOf(PIC_B) });
      expect(view?.hasUnpublishedChanges).toBe(false);
    });

    it("refuses to repoint at a product picture, moving nothing", async () => {
      await reseed();
      const { error } = await adminAuth.rpc("repoint_landing_images", {
        p_from: PIC_A,
        p_to: PRODUCT_PICTURE,
      });
      expect(error?.code).toBe("23514");
      const { data } = await admin.from("landing_pages").select("image_paths").eq("id", PAGE_A).single();
      expect(data?.image_paths).toEqual({ [PIC_A]: pathOf(PIC_A) });
    });

    it("a removal unlinks the picture from both copies, dropping an image section it leaves empty", async () => {
      await reseed();
      const gallery: LandingSection = {
        id: GALLERY,
        type: "image",
        images: [{ id: SHOT_1, imageId: PIC_DOOMED_TOO }],
      };
      await service.savePage(PAGE_A, {
        sections: [...structure(PIC_DOOMED), gallery],
        versions: [
          {
            ...version("en", SLUG_A),
            sectionTexts: { ...words("en"), [GALLERY]: { alts: { [SHOT_1]: "Doomed" } } },
          },
        ],
      });
      await service.publishPage(PAGE_A);

      // Removed by the admin's own session, as the catalogue's route does.
      const hero = await adminAuth.from("catalogue_images").delete().eq("id", PIC_DOOMED);
      expect(hero.error).toBeNull();
      const shot = await adminAuth.from("catalogue_images").delete().eq("id", PIC_DOOMED_TOO);
      expect(shot.error).toBeNull();

      const view = await service.getAdminPage(PAGE_A);
      expect(view?.draft.sections).toEqual(structure(null));
      expect(view?.draft.imagePaths).toEqual({});
      expect(view?.publication?.sections).toEqual(structure(null));
      expect(view?.publication?.imagePaths).toEqual({});
      expect(Object.keys(view?.publication?.versions[0].sectionTexts ?? {})).toEqual(
        expect.arrayContaining([HERO, CTA]),
      );
      expect(view?.publication?.versions[0].sectionTexts[GALLERY]).toBeUndefined();
      expect(view?.draft.versions[0].sectionTexts[GALLERY]).toBeUndefined();
    });

    it("a removal keeps an image section that still has another picture", async () => {
      await reseed();
      await service.saveStructure(PAGE_A, [
        ...structure(),
        {
          id: GALLERY,
          type: "image",
          images: [
            { id: SHOT_1, imageId: PIC_DOOMED_TOO },
            { id: SHOT_2, imageId: PIC_B },
          ],
        },
      ]);
      await admin.from("catalogue_images").delete().eq("id", PIC_DOOMED_TOO);
      const view = await service.getAdminPage(PAGE_A);
      expect(view?.draft.sections[2]).toEqual({
        id: GALLERY,
        type: "image",
        images: [{ id: SHOT_2, imageId: PIC_B }],
      });
      expect(view?.draft.imagePaths).toEqual({
        [PIC_A]: pathOf(PIC_A),
        [PIC_B]: pathOf(PIC_B),
      });
    });
  });

  // -------------------------------------------------------------------------
  // The last saver
  // -------------------------------------------------------------------------

  describe("the last saver", () => {
    let grant: OAuthGrant;
    let viaApp: LandingPageService;

    beforeAll(async () => {
      grant = await oauthGrantFor(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
        "Fixture landing AI app",
      );
      viaApp = new LandingPageService(createBearerTestClient(grant.accessToken));
    });

    afterAll(async () => {
      await revokeOAuthGrant(grant);
    });

    async function saver() {
      const { data } = await admin
        .from("landing_pages")
        .select("last_saved_by, last_saved_via")
        .eq("id", PAGE_A)
        .single();
      return data;
    }

    it("records the AI app a save came through, and clears it on a save in Sogverse", async () => {
      await reseed();
      await viaApp.saveVersion(PAGE_A, version("en", SLUG_A));
      expect(await saver()).toEqual({ last_saved_by: TEST_IDS.ADMIN, last_saved_via: grant.clientId });
      expect((await service.getAdminPage(PAGE_A))?.draft.lastSavedVia).toEqual({
        clientId: grant.clientId,
        name: "Fixture landing AI app",
      });

      await viaApp.saveStructure(PAGE_A, structure());
      expect((await saver())?.last_saved_via).toBe(grant.clientId);

      await service.saveStructure(PAGE_A, structure());
      expect(await saver()).toEqual({ last_saved_by: TEST_IDS.ADMIN, last_saved_via: null });
    });

    it("publishing records no save", async () => {
      await reseed();
      await service.saveStructure(PAGE_A, structure());
      const { data: before } = await admin.from("landing_pages").select("updated_at").eq("id", PAGE_A).single();
      await viaApp.publishPage(PAGE_A);
      expect((await saver())?.last_saved_via).toBeNull();
      const { data: after } = await admin.from("landing_pages").select("updated_at").eq("id", PAGE_A).single();
      expect(after?.updated_at).toBe(before?.updated_at);
    });
  });
});
