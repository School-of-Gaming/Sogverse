import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
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
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import type { CatalogueImageInsert } from "@/types";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";
import { CatalogueImagesService } from "@/services/catalogue-images/catalogue-images.service";
import { defaultLandingSlug } from "@/services/landing-pages/landing-pages.contracts";
import { landingPublishForecast } from "@/services/landing-pages/landing-pages.forecast";
import {
  LANDING_SECTIONS,
  buttonTarget,
  LANDING_SECTION_TYPES,
  LANDING_STICKY_TYPES,
  landingSectionBackground,
  landingSections,
  missingInLandingVersion,
  type LandingSection,
} from "@/lib/landing-pages/sections";
import {
  LANDING_PICTURE_SHAPES,
  type LandingPictureShape,
} from "@/lib/landing-pages/picture-shapes";
import { asObject } from "../helpers/json";
import { backgroundCases } from "../helpers/landing-background-cases";
import { BUTTON_TARGET_CASES } from "../helpers/landing-button-cases";
import { everySection, requiredTextCases } from "../helpers/landing-required-text-cases";

/**
 * Landing pages: `landing_pages` (a page's admin-only working copy, holding
 * the section structure), `landing_page_publications` (its public published
 * copy, whose row existing IS the page being live), each with its
 * per-language versions; the admin-guarded writers — whole, structure-only
 * and one-language, a language's removal and the clone — publish and unpublish; the stored, per-language slugs
 * and their rules; the derived completeness; pictures from the image
 * catalogue, with the catalogue's replace (`repoint_landing_images`) and
 * removal (a trigger) reaching both copies; the shapes each section's
 * pictures may be, held equal to the section registry's; the share card
 * override per language — a share picture held to every one of the
 * catalogue's guarantees, and to the wide shape, while any language of either
 * copy names it, and share words — with publishing, the clone and the
 * unpublished-changes digest reading it; the record of who last saved and
 * through which AI app; the SQL half of the required-text rule held equal to
 * the TypeScript half; and the products a products section picks — an id no
 * product has refused at save, and the admin read saying which picks the
 * listing shows, a municipality club included.
 *
 * No landing page table carries a write grant for any Data API role, so there
 * is no write-IDOR case to make: a direct write is refused at the grant, which
 * is asserted here once per table. Each wrong role is tried on every RPC with
 * a payload an admin would succeed with.
 *
 * Fixture UUIDs 834-83f and 913-917 (see the allocation registry in product-helpers.ts).
 * Every assertion is scoped to this file's own rows.
 */

/** A page seeded complete in English. */
const PAGE_A = "00000000-0000-0000-0000-000000000834";
/** A second page, for addresses two pages would share. */
const PAGE_B = "00000000-0000-0000-0000-000000000835";
/** A page id that must NEVER exist. */
const PAGE_MISSING = "00000000-0000-0000-0000-000000000836";

/** Landing pictures. */
const PIC_A = "00000000-0000-0000-0000-000000000837";
const PIC_B = "00000000-0000-0000-0000-000000000838";
/** A product picture — a purpose a landing page may not show. */
const PRODUCT_PICTURE = "00000000-0000-0000-0000-000000000839";
/** Two pictures removed during the run. */
const PIC_DOOMED = "00000000-0000-0000-0000-00000000083a";
const PIC_DOOMED_TOO = "00000000-0000-0000-0000-00000000083b";
/** Two square landing pictures and a portrait one; the second square is removed during the run. */
const SQUARE = "00000000-0000-0000-0000-000000000916";
const SQUARE_TOO = "00000000-0000-0000-0000-000000000917";
const PORTRAIT = "00000000-0000-0000-0000-000000000918";
const ENTRIES = [PIC_A, PIC_B, PRODUCT_PICTURE, PIC_DOOMED, PIC_DOOMED_TOO, SQUARE, SQUARE_TOO, PORTRAIT];

/** Products a products section picks: one the shop lists, one unlisted, one ended. */
const LISTED = "00000000-0000-0000-0000-00000000083c";
const UNLISTED = "00000000-0000-0000-0000-00000000083e";
const ENDED = "00000000-0000-0000-0000-00000000083f";
/** A product id that must NEVER exist. */
const NO_PRODUCT = "00000000-0000-0000-0000-00000000083d";
const PICKS = "00000000-0000-4000-8000-0000000008a8";

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
  { id: PIC_A, label: "Landing fixture A", sha256: hex("1a2c0837"), path: `${hex("1a2c0837")}.jpg`, purpose: "landing_image" },
  { id: PIC_B, label: "Landing fixture B", sha256: hex("1a2c0838"), path: `${hex("1a2c0838")}.jpg`, purpose: "landing_image" },
  { id: PRODUCT_PICTURE, label: "Landing fixture product", sha256: hex("1a2c0839"), path: `${hex("1a2c0839")}.jpg`, purpose: "product" },
  { id: PIC_DOOMED, label: "Landing fixture doomed", sha256: hex("1a2c083a"), path: `${hex("1a2c083a")}.jpg`, purpose: "landing_image" },
  { id: PIC_DOOMED_TOO, label: "Landing fixture doomed too", sha256: hex("1a2c083b"), path: `${hex("1a2c083b")}.jpg`, purpose: "landing_image" },
  { id: SQUARE, label: "Landing fixture square", sha256: hex("1a2c0916"), path: `${hex("1a2c0916")}.jpg`, purpose: "landing_square_image" },
  { id: SQUARE_TOO, label: "Landing fixture square too", sha256: hex("1a2c0917"), path: `${hex("1a2c0917")}.jpg`, purpose: "landing_square_image" },
  { id: PORTRAIT, label: "Landing fixture portrait", sha256: hex("1a2c0918"), path: `${hex("1a2c0918")}.jpg`, purpose: "landing_portrait_image" },
];

/** An entry as a copy's derived `pictures` holds it. */
const pictured = (entry: string) => {
  const row = ENTRY_ROWS.find((each) => each.id === entry);
  return { path: row?.path, purpose: row?.purpose };
};

/** The fixture structure: a hero with a picture, and a call to action. */
function structure(heroImage: string | null = PIC_A): LandingSection[] {
  return [
    heroImage === null
      ? { id: HERO, type: "hero" }
      : { id: HERO, type: "hero", imageId: heroImage },
    { id: CTA, type: "cta", background: "default", button: { kind: "internal", path: "/shop" } },
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

  /**
   * The whole save, `save_landing_page` — what `create_landing_page` runs in
   * SQL: the structure and the version set together, the set replacing what is
   * stored. No application writer sends it, so it is called here directly.
   */
  async function saveWhole(
    id: string,
    page: {
      sections: LandingSection[];
      versions: { locale: string; title: string; summary: string; slug: string; sectionTexts: Json }[];
    },
  ) {
    const { error } = await adminAuth.rpc("save_landing_page", {
      p_id: id,
      p_sections: page.sections,
      p_versions: page.versions.map(({ sectionTexts, ...rest }) => ({
        ...rest,
        section_texts: sectionTexts,
      })),
    });
    if (error) throw error;
  }

  async function draftVersions(id: string) {
    const { data } = await admin
      .from("landing_page_translations")
      .select("locale, slug, section_texts, is_complete")
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
    await deleteTestProducts(admin, [LISTED, UNLISTED, ENDED]);
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

  describe("the button check", () => {
    it("judges a button target in SQL as the registry does, on what the registry would store", async () => {
      const cases = BUTTON_TARGET_CASES.map((testCase) => {
        const parsed = buttonTarget.safeParse(testCase.target);
        return { ...testCase, accepted: parsed.success, stored: parsed.success ? parsed.data : testCase.target };
      });
      const answers = await Promise.all(
        cases.map((testCase) => admin.rpc("landing_button_is_valid", { p_button: testCase.stored })),
      );
      cases.forEach((testCase, index) => {
        const { data, error } = answers[index];
        expect(error, testCase.name).toBeNull();
        expect(testCase.accepted, testCase.name).toBe(testCase.valid);
        expect(data, testCase.name).toBe(testCase.valid);
      });
    });
  });

  describe("a section's background", () => {
    it("is judged in SQL as the registry judges it, on what the registry would store", async () => {
      const cases = backgroundCases().map((testCase) => {
        const parsed = landingSections.safeParse(testCase.sections);
        return {
          ...testCase,
          accepted: parsed.success,
          stored: parsed.success ? parsed.data : testCase.sections,
        };
      });
      const answers = await Promise.all(
        cases.map((testCase) =>
          admin.rpc("landing_sections_problem", { p_sections: testCase.stored }),
        ),
      );
      cases.forEach((testCase, index) => {
        const { data, error } = answers[index];
        expect(error, testCase.name).toBeNull();
        expect(testCase.accepted, testCase.name).toBe(testCase.valid);
        expect(data === null, `${testCase.name}: ${data}`).toBe(testCase.valid);
      });
    });

    it("is stored for adjacent card sections as sent, and kept by a picture's removal", async () => {
      await reseed();
      await service.saveStructure(PAGE_A, [
        ...structure(),
        {
          id: GALLERY,
          type: "image",
          background: "card",
          images: [
            { id: SHOT_1, imageId: PIC_DOOMED },
            { id: SHOT_2, imageId: PIC_B },
          ],
        },
        { id: FAQ, type: "faq", background: "card", items: [{ id: FAQ_1 }] },
      ]);
      await admin.from("catalogue_images").delete().eq("id", PIC_DOOMED);
      const view = await service.getAdminPage(PAGE_A);
      expect(view?.draft.sections.map(landingSectionBackground)).toEqual([
        "default",
        "default",
        "card",
        "card",
      ]);
    });

    it("reads as default on a section stored without one, in the working and the published copy", async () => {
      await reseed();
      // A structure written before sections had a background: no section names one.
      const bare = [
        { id: HERO, type: "hero", imageId: PIC_A },
        { id: CTA, type: "cta", button: { kind: "internal", path: "/shop" } },
      ];
      const stored = await admin.from("landing_pages").update({ sections: bare }).eq("id", PAGE_A);
      expect(stored.error).toBeNull();
      expect((await admin.rpc("landing_sections_problem", { p_sections: bare })).data).toBeNull();

      const draft = await service.getAdminPage(PAGE_A);
      expect(draft?.draft.sections.map(landingSectionBackground)).toEqual(["default", "default"]);

      await service.publishPage(PAGE_A);
      const { data: published } = await admin
        .from("landing_page_publications")
        .select("sections")
        .eq("page_id", PAGE_A)
        .single();
      expect(published?.sections).toEqual(bare);
      const live = await new LandingPageService(anon).getPublishedPage(PAGE_A);
      expect(live?.sections.map(landingSectionBackground)).toEqual(["default", "default"]);
      await service.unpublishPage(PAGE_A);
    });
  });

  // -------------------------------------------------------------------------
  // The working copy
  // -------------------------------------------------------------------------

  describe("create and save", () => {
    it("creates a page whole, stamping the admin and deriving a missing slug from the title", async () => {
      const { id } = await service.createPage({
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
        .select("author_id, sections, pictures")
        .eq("id", id)
        .single();
      expect(row?.author_id).toBe(TEST_IDS.ADMIN);
      expect(row?.sections).toEqual(structure(null));
      expect(row?.pictures).toEqual({});
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

    it("knows every section type the registry does", async () => {
      const { data, error } = await admin.rpc("landing_sections_problem", {
        p_sections: everySection(),
      });
      expect(error).toBeNull();
      expect(data).toBeNull();
    });

    it("lets a section be sticky exactly where the registry does, once per side and on a side", async () => {
      // Every type marked sticky alone, then a second sticky section beside
      // each type that may be one — on the other side, then on the same side —
      // then no sticky section at all.
      const sections = everySection();
      const marked = (id: string, side: string): Json[] =>
        sections.map((section) => (section.id === id ? { ...section, sticky: side } : section));
      const cases: { name: string; structure: Json[] }[] = [
        ...sections.map((section) => ({
          name: `a sticky ${section.type}`,
          structure: marked(section.id, section.type === "hero" ? "right" : "left"),
        })),
        ...sections
          .filter((section) => LANDING_STICKY_TYPES.includes(section.type))
          .flatMap((section) =>
            (["right", "left"] as const).map((second) => ({
              name: `a ${section.type} sticky on the left and another on the ${second}`,
              structure: [
                ...marked(section.id, "left"),
                { ...section, id: crypto.randomUUID(), sticky: second },
              ],
            })),
          ),
        { name: "no sticky section", structure: sections },
      ];
      const answers = await Promise.all(
        cases.map((testCase) =>
          admin.rpc("landing_sections_problem", { p_sections: testCase.structure }),
        ),
      );
      cases.forEach((testCase, index) => {
        const { data, error } = answers[index];
        expect(error, testCase.name).toBeNull();
        expect(data === null, testCase.name).toBe(
          landingSections.safeParse(testCase.structure).success,
        );
      });
      // A lone sticky section is accepted on some types and refused on others.
      const lone = answers.slice(0, sections.length).map(({ data }) => data === null);
      expect(lone).toContain(true);
      expect(lone).toContain(false);
      // A pair on two sides is accepted and a pair on one side refused, so
      // the parity above is not two refusals agreeing.
      const pairs = (second: string) =>
        cases.flatMap((testCase, index) =>
          testCase.name.endsWith(`and another on the ${second}`) ? [answers[index].data] : [],
        );
      expect(new Set(pairs("right"))).toEqual(new Set([null]));
      expect(new Set(pairs("left"))).toEqual(
        new Set(["A page has at most one sticky section on each side"]),
      );

      const [allowed] = sections.filter((section) => LANDING_STICKY_TYPES.includes(section.type));
      const side = marked(allowed.id, "top");
      const { data: sideProblem } = await admin.rpc("landing_sections_problem", {
        p_sections: side,
      });
      expect(sideProblem).toBe(`The sticky side of section ${allowed.id} is left or right`);
      expect(landingSections.safeParse(side).success).toBe(false);
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
      await saveWhole(PAGE_A, {
        sections: structure(),
        versions: [version("en", SLUG_A), version("fi", "fixture-landing-a-fi")],
      });
      expect((await draftVersions(PAGE_A)).map((v) => v.locale)).toEqual(["en", "fi"]);

      await saveWhole(PAGE_A, {
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
      // The page holding it is named by its title, so the admin knows which.
      expect(taken.error?.message).toContain('the landing page "Fixture landing en"');

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

    it("changes a live language's slug, which goes live with the next publish and retires the old address", async () => {
      await reseed();
      await service.publishPage(PAGE_A);
      const renamed = "fixture-landing-a-renamed";
      const reader = new LandingPageService(anon);

      // The page's own live slug never blocks it.
      await service.saveVersion(PAGE_A, version("en", renamed));
      expect((await draftVersions(PAGE_A))[0].slug).toBe(renamed);

      // Readers keep the old address until the next publish.
      expect((await reader.getPublishedPageBySlug("en", SLUG_A))?.id).toBe(PAGE_A);
      expect(await reader.getPublishedPageBySlug("en", renamed)).toBeNull();

      // The forecast names the move.
      const before = await service.getAdminPage(PAGE_A);
      expect(before && landingPublishForecast(before).slugsChanging).toEqual([
        { locale: "en", from: SLUG_A, to: renamed },
      ]);

      // Another page cannot take the address while it is still live here.
      const taken = await adminAuth.rpc("save_landing_page_version", {
        p_id: PAGE_B,
        p_locale: "en",
        p_title: "T",
        p_slug: SLUG_A,
      });
      expect(taken.error?.code).toBe("23505");
      expect(taken.error?.message).toContain('the landing page "Fixture landing en"');

      await service.publishPage(PAGE_A);
      expect((await reader.getPublishedPageBySlug("en", renamed))?.id).toBe(PAGE_A);
      expect(await reader.getPublishedPageBySlug("en", SLUG_A)).toBeNull();
      const after = await service.getAdminPage(PAGE_A);
      expect(after && landingPublishForecast(after).slugsChanging).toEqual([]);

      // Once no copy of any page holds it, the old address is free.
      await service.saveVersion(PAGE_B, { ...version("en", SLUG_A), sectionTexts: {} });
      expect((await draftVersions(PAGE_B))[0].slug).toBe(SLUG_A);
    });

    it("changes a slug after unpublishing", async () => {
      await reseed();
      await service.publishPage(PAGE_A);
      await service.unpublishPage(PAGE_A);
      const { error } = await adminAuth.rpc("save_landing_page_version", {
        p_id: PAGE_A,
        p_locale: "en",
        p_title: "T",
        p_slug: "fixture-landing-a-renamed",
      });
      expect(error).toBeNull();
      expect((await draftVersions(PAGE_A))[0].slug).toBe("fixture-landing-a-renamed");
    });

    it("writes a language again after a whole save removed it while live, its live slug still held from other pages", async () => {
      await reseed();
      await saveWhole(PAGE_A, {
        sections: structure(),
        versions: [version("en", SLUG_A), version("fi", "fixture-landing-a-fi")],
      });
      await service.publishPage(PAGE_A);
      await saveWhole(PAGE_A, { sections: structure(), versions: [version("en", SLUG_A)] });

      // Another page cannot take the address the live Finnish version holds.
      const taken = await adminAuth.rpc("save_landing_page_version", {
        p_id: PAGE_B,
        p_locale: "fi",
        p_title: "T",
        p_slug: "fixture-landing-a-fi",
      });
      expect(taken.error?.code).toBe("23505");

      // Written again with no slug, Finnish is a new version: its title's slug.
      const title = "Fixture: something else entirely";
      await service.saveVersion(PAGE_A, {
        locale: "fi",
        title,
        summary: "S",
        sectionTexts: words("fi"),
      });
      expect((await draftVersions(PAGE_A)).find((v) => v.locale === "fi")?.slug).toBe(
        defaultLandingSlug(title),
      );

      // The page itself may write its live slug back.
      await service.saveVersion(PAGE_A, version("fi", "fixture-landing-a-fi"));
      expect((await draftVersions(PAGE_A)).find((v) => v.locale === "fi")?.slug).toBe(
        "fixture-landing-a-fi",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Partial writes
  // -------------------------------------------------------------------------

  describe("partial writes", () => {
    it("a structure save drops a removed section's words from every language", async () => {
      await reseed();
      await saveWhole(PAGE_A, {
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
      await saveWhole(PAGE_A, {
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
  // Removing a language
  // -------------------------------------------------------------------------

  describe("removing a language", () => {
    it("removes that language from the working copy alone", async () => {
      await reseed();
      await service.saveVersion(PAGE_A, version("fi", "fixture-landing-a-fi"));
      await service.saveVersion(PAGE_A, version("sv", "fixture-landing-a-sv"));

      expect(await service.removeVersion(PAGE_A, "fi")).toBe(PAGE_A);

      const left = await draftVersions(PAGE_A);
      expect(left.map((v) => v.locale)).toEqual(["en", "sv"]);
      expect(left.find((v) => v.locale === "sv")).toMatchObject({
        slug: "fixture-landing-a-sv",
        section_texts: words("sv"),
        is_complete: true,
      });
      // Its slug is free again for another page.
      await service.saveVersion(PAGE_B, {
        locale: "fi",
        title: "B fi",
        summary: "",
        slug: "fixture-landing-a-fi",
        sectionTexts: {},
      });
      expect((await draftVersions(PAGE_B)).find((v) => v.locale === "fi")?.slug).toBe(
        "fixture-landing-a-fi",
      );
    });

    it("refuses the page's last language, an unknown language and an unknown page, removing nothing", async () => {
      await reseed();
      const last = await adminAuth.rpc("remove_landing_page_version", {
        p_id: PAGE_A,
        p_locale: "en",
      });
      expect(last.error?.code).toBe("23514");
      expect(last.error?.message).toContain("only language");

      const absent = await adminAuth.rpc("remove_landing_page_version", {
        p_id: PAGE_A,
        p_locale: "fi",
      });
      expect(absent.error?.code).toBe("P0002");

      const missing = await adminAuth.rpc("remove_landing_page_version", {
        p_id: PAGE_MISSING,
        p_locale: "en",
      });
      expect(missing.error?.code).toBe("P0002");

      expect((await draftVersions(PAGE_A)).map((v) => v.locale)).toEqual(["en"]);
    });

    it("leaves a live language live until the next publish, which takes it down and keeps the others", async () => {
      await reseed();
      await service.saveVersion(PAGE_A, version("fi", "fixture-landing-a-fi"));
      await service.publishPage(PAGE_A);

      await service.removeVersion(PAGE_A, "fi");

      const reader = new LandingPageService(anon);
      expect((await reader.getPublishedPage(PAGE_A))?.versions.map((v) => v.locale)).toEqual([
        "en",
        "fi",
      ]);
      const page = await service.getAdminPage(PAGE_A);
      expect(page?.hasUnpublishedChanges).toBe(true);
      expect(page && landingPublishForecast(page)).toEqual({
        canPublish: true,
        wouldPutLive: ["en"],
        wouldLeaveOut: [],
        wouldTakeDown: ["fi"],
        slugsChanging: [],
      });

      await service.publishPage(PAGE_A);

      expect((await reader.getPublishedPage(PAGE_A))?.versions.map((v) => v.locale)).toEqual([
        "en",
      ]);
      expect(await reader.getPublishedPageBySlug("fi", "fixture-landing-a-fi")).toBeNull();
      expect((await reader.getPublishedPageBySlug("en", SLUG_A))?.id).toBe(PAGE_A);
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
      await saveWhole(PAGE_A, {
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
      expect(live?.pictures).toEqual({ [PIC_A]: pictured(PIC_A) });
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
        await service.saveVersion(PAGE_A, version("fi", "fixture-landing-a-fi"));
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
          client.rpc("remove_landing_page_version", { p_id: PAGE_A, p_locale: "fi" }),
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

  describe("picked products", () => {
    /** The fixture structure with a products section after the hero. */
    const withPicks = (productIds: string[]): LandingSection[] => {
      const [hero, cta] = structure();
      return [hero, { id: PICKS, type: "products", background: "default", productIds }, cta];
    };

    beforeAll(async () => {
      await deleteTestProducts(admin, [LISTED, UNLISTED, ENDED]);
      await createTestProduct(admin, { id: LISTED, seatCount: null });
      await createTestProduct(admin, { id: UNLISTED, seatCount: null, isVisible: false });
      await createTestProduct(admin, {
        id: ENDED,
        seatCount: null,
        startDate: "2025-01-06",
        endDate: "2025-06-02",
      });
    });

    it("saves picks as structure, in order, and requires no words of them", async () => {
      await reseed();
      await service.saveStructure(PAGE_A, withPicks([ENDED, LISTED]));
      const { data } = await admin.from("landing_pages").select("sections").eq("id", PAGE_A).single();
      expect(data?.sections).toEqual(withPicks([ENDED, LISTED]));
      // The English version stays complete: a products section asks for no words.
      expect((await draftVersions(PAGE_A))[0].is_complete).toBe(true);
    });

    it("refuses a pick no product has, naming the section and the id, and saves nothing", async () => {
      await reseed();
      const { error } = await adminAuth.rpc("save_landing_page_structure", {
        p_id: PAGE_A,
        p_sections: withPicks([LISTED, NO_PRODUCT]),
      });
      expect(error?.code).toBe("23503");
      expect(error?.message).toBe(
        `Section 2 picks the product ${NO_PRODUCT}, and no product has that id`,
      );
      const created = await adminAuth.rpc("create_landing_page", {
        p_sections: withPicks([NO_PRODUCT]),
        p_versions: [{ locale: "en", title: "Fixture: no product" }],
      });
      expect(created.error?.code).toBe("23503");
      const { data } = await admin.from("landing_pages").select("sections").eq("id", PAGE_A).single();
      expect(data?.sections).toEqual(structure());
    });

    it("refuses a section with no picks, a pick twice, or a pick that is not an id", async () => {
      for (const productIds of [[], [LISTED, LISTED], ["a-club"]]) {
        const { error } = await adminAuth.rpc("save_landing_page_structure", {
          p_id: PAGE_A,
          p_sections: withPicks(productIds),
        });
        expect(error?.code, JSON.stringify(productIds)).toBe("23514");
      }
    });

    it("checks only the picks a save adds, so a pick gone since never blocks the page's other writes", async () => {
      await reseed();
      // A minted id, so no fixture range is spent on a product deleted mid-case.
      const doomed = await createTestProduct(admin, { seatCount: null });
      try {
        await service.saveStructure(PAGE_A, withPicks([doomed, LISTED]));
        await deleteTestProducts(admin, [doomed]);
        // Reordering keeps the stale pick and adds nothing new: accepted.
        await service.saveStructure(PAGE_A, withPicks([LISTED, doomed]));
        // A catalogue replace rewrites the structure around it: accepted.
        const { error } = await adminAuth.rpc("repoint_landing_images", {
          p_from: PIC_A,
          p_to: PIC_B,
        });
        expect(error).toBeNull();
        // It still reads as gone.
        const page = await service.getAdminPage(PAGE_A);
        expect(page?.productPicks[0].picks.map((pick) => [pick.productId, pick.reasons])).toEqual([
          [LISTED, []],
          [doomed, ["gone"]],
        ]);
      } finally {
        await deleteTestProducts(admin, [doomed]);
      }
    });

    it("reads which picks the shop's listing shows, and why each other one is not", async () => {
      await reseed();
      await service.saveStructure(PAGE_A, withPicks([UNLISTED, LISTED, ENDED]));
      const page = await service.getAdminPage(PAGE_A);
      expect(page?.productPicks).toEqual([
        {
          sectionId: PICKS,
          sectionNumber: 2,
          shownCount: 1,
          picks: [
            expect.objectContaining({ productId: UNLISTED, shown: false, reasons: ["notListed"] }),
            expect.objectContaining({ productId: LISTED, shown: true, reasons: [] }),
            expect.objectContaining({ productId: ENDED, shown: false, reasons: ["ended"] }),
          ],
        },
      ]);
    });

    it("shows a listed municipality club like any other pick, and reports an unlisted one as unlisted", async () => {
      await reseed();
      // Minted ids, so no fixture range is spent on them.
      const club = await createTestProduct(admin, {
        seatCount: null,
        productType: "municipality_club",
        billingMode: "external_contract",
        locationId: TEST_IDS.LOCATION_MUNICIPALITY,
        endDate: "2099-05-31",
      });
      const hidden = await createTestProduct(admin, {
        seatCount: null,
        productType: "municipality_club",
        billingMode: "external_contract",
        locationId: TEST_IDS.LOCATION_MUNICIPALITY,
        endDate: "2099-05-31",
        isVisible: false,
      });
      try {
        await service.saveStructure(PAGE_A, withPicks([club, hidden, LISTED]));
        const page = await service.getAdminPage(PAGE_A);
        expect(page?.productPicks[0]).toMatchObject({
          shownCount: 2,
          picks: [
            { productId: club, shown: true, reasons: [] },
            { productId: hidden, shown: false, reasons: ["notListed"] },
            { productId: LISTED, shown: true, reasons: [] },
          ],
        });
      } finally {
        await reseed();
        await deleteTestProducts(admin, [club, hidden]);
      }
    });

    it("publishes a stale pick as it is: the published copy carries no product check", async () => {
      await reseed();
      await service.saveStructure(PAGE_A, withPicks([ENDED]));
      await service.publishPage(PAGE_A);
      const live = await service.getPublishedPage(PAGE_A);
      expect(live?.sections).toEqual(withPicks([ENDED]));
      await service.unpublishPage(PAGE_A);
    });
  });

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
      expect(view?.draft.pictures).toEqual({ [PIC_B]: pictured(PIC_B) });
      expect(view?.publication?.pictures).toEqual({ [PIC_B]: pictured(PIC_B) });
      expect(view?.hasUnpublishedChanges).toBe(false);
    });

    it("refuses to repoint at a product picture, moving nothing", async () => {
      await reseed();
      const { error } = await adminAuth.rpc("repoint_landing_images", {
        p_from: PIC_A,
        p_to: PRODUCT_PICTURE,
      });
      expect(error?.code).toBe("23514");
      const { data } = await admin.from("landing_pages").select("pictures").eq("id", PAGE_A).single();
      expect(data?.pictures).toEqual({ [PIC_A]: pictured(PIC_A) });
    });

    it("a removal unlinks the picture from both copies, dropping an image section it leaves empty", async () => {
      await reseed();
      const gallery: LandingSection = {
        id: GALLERY,
        type: "image",
        background: "default",
        images: [{ id: SHOT_1, imageId: PIC_DOOMED_TOO }],
      };
      await saveWhole(PAGE_A, {
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
      expect(view?.draft.pictures).toEqual({});
      expect(view?.publication?.sections).toEqual(structure(null));
      expect(view?.publication?.pictures).toEqual({});
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
        background: "default",
        images: [{ id: SHOT_2, imageId: PIC_B }],
      });
      expect(view?.draft.pictures).toEqual({
        [PIC_A]: pictured(PIC_A),
        [PIC_B]: pictured(PIC_B),
      });
    });
  });

  // -------------------------------------------------------------------------
  // The share card override
  // -------------------------------------------------------------------------

  describe("the share card override", () => {
    const FI_SLUG = "fixture-landing-a-fi";

    async function copies(id: string) {
      const view = await service.getAdminPage(id);
      if (view === null) throw new Error(`no landing page ${id}`);
      return view;
    }

    /** Which copies of page A the catalogue's usage map lists under an entry. */
    async function usedBy(entry: string) {
      const usage = await new CatalogueImagesService(adminAuth).getUsage();
      return (usage[entry] ?? [])
        .filter((user) => user.kind === "landing-page" && user.id === PAGE_A)
        .map((user) => (user.kind === "landing-page" ? user.is_live : null));
    }

    it("refuses a share picture of another purpose, one that is not wide, and one no longer in the catalogue, saving nothing", async () => {
      await reseed();
      for (const [shareImageId, code] of [
        [PRODUCT_PICTURE, "23514"],
        [SQUARE, "23514"],
        [PORTRAIT, "23514"],
        [PAGE_MISSING, "23503"],
      ] as const) {
        const { error } = await adminAuth.rpc("save_landing_page_version", {
          p_id: PAGE_A,
          p_locale: "fi",
          p_title: "Fixture landing fi",
          p_share_image_id: shareImageId,
        });
        expect(error?.code).toBe(code);
        const created = await adminAuth.rpc("create_landing_page", {
          p_sections: structure(null),
          p_versions: [{ locale: "en", title: "Fixture share", share_image_id: shareImageId }],
        });
        expect(created.error?.code).toBe(code);
      }
      const { draft } = await copies(PAGE_A);
      expect(draft.versions.map((v) => v.locale)).toEqual(["en"]);
      expect(draft.pictures).toEqual({ [PIC_A]: pictured(PIC_A) });
    });

    it("is per language: a picture only Finnish names is in use, by its path, until Finnish lets it go", async () => {
      await reseed();
      await service.saveVersion(PAGE_A, {
        ...version("fi", FI_SLUG),
        shareTitle: "Liity kerhoon",
        shareImageId: PIC_B,
        shareImageAlt: "Kerho",
      });

      const { draft } = await copies(PAGE_A);
      expect(draft.versions.map((v) => [v.locale, v.shareTitle, v.shareImageId, v.shareImageAlt])).toEqual([
        ["en", "", null, ""],
        ["fi", "Liity kerhoon", PIC_B, "Kerho"],
      ]);
      expect(draft.pictures).toEqual({ [PIC_A]: pictured(PIC_A), [PIC_B]: pictured(PIC_B) });
      expect(await usedBy(PIC_B)).toEqual([false]);
      // None of it counts toward completeness.
      for (const row of await draftVersions(PAGE_A)) expect(row.is_complete).toBe(true);

      // A structure write leaves every language's card alone.
      await service.saveStructure(PAGE_A, structure());
      expect((await copies(PAGE_A)).draft.versions[1].shareImageId).toBe(PIC_B);

      // A write of Finnish without it lets it go.
      await service.saveVersion(PAGE_A, version("fi", FI_SLUG));
      expect((await copies(PAGE_A)).draft.pictures).toEqual({ [PIC_A]: pictured(PIC_A) });
      expect(await usedBy(PIC_B)).toEqual([]);
    });

    it("keeps a picture two languages name in use while either still does", async () => {
      await reseed();
      await service.saveVersion(PAGE_A, { ...version("en", SLUG_A), shareImageId: PIC_B });
      await service.saveVersion(PAGE_A, { ...version("fi", FI_SLUG), shareImageId: PIC_B });
      await service.saveVersion(PAGE_A, version("en", SLUG_A));

      expect((await copies(PAGE_A)).draft.pictures).toEqual({
        [PIC_A]: pictured(PIC_A),
        [PIC_B]: pictured(PIC_B),
      });
    });

    it("refuses a share title longer than a share card's", async () => {
      await reseed();
      const { error } = await adminAuth.rpc("save_landing_page_version", {
        p_id: PAGE_A,
        p_locale: "en",
        p_title: "Fixture landing en",
        p_share_title: "x".repeat(71),
      });
      expect(error?.code).toBe("23514");
    });

    it("is created with a page", async () => {
      await reseed();
      const { id } = await service.createPage({
        sections: structure(),
        versions: [
          {
            ...version("en", "fixture-share-created"),
            shareTitle: "Created with a card",
            shareImageId: PIC_B,
            shareImageAlt: "Created alt",
          },
        ],
      });
      minted.push(id);
      const { draft } = await copies(id);
      expect(draft.pictures).toEqual({ [PIC_A]: pictured(PIC_A), [PIC_B]: pictured(PIC_B) });
      expect(draft.versions[0]).toMatchObject({
        shareTitle: "Created with a card",
        shareImageId: PIC_B,
        shareImageAlt: "Created alt",
      });
    });

    it("is what publishing copies, per language, and a change to any part of it is an unpublished change", async () => {
      await reseed();
      const english = {
        ...version("en", SLUG_A),
        shareTitle: "Join a fixture club",
        shareImageAlt: "A fixture",
      };
      await service.saveVersion(PAGE_A, english);
      await service.saveVersion(PAGE_A, { ...version("fi", FI_SLUG), shareImageId: PIC_B });
      await service.publishPage(PAGE_A);

      const live = await new LandingPageService(anon).getPublishedPage(PAGE_A);
      expect(live?.pictures).toEqual({ [PIC_A]: pictured(PIC_A), [PIC_B]: pictured(PIC_B) });
      expect(live?.versions.map((v) => [v.locale, v.shareTitle, v.shareImageId, v.shareImageAlt])).toEqual([
        ["en", "Join a fixture club", null, "A fixture"],
        ["fi", "", PIC_B, ""],
      ]);
      expect(await usedBy(PIC_B)).toEqual([true]);

      const changed = async () => {
        const detail = (await copies(PAGE_A)).hasUnpublishedChanges;
        const listed = (await service.listAdminPages()).find((page) => page.id === PAGE_A);
        expect(listed?.hasUnpublishedChanges).toBe(detail);
        return detail;
      };
      expect(await changed()).toBe(false);

      // Each part, changed and then put back.
      for (const card of [
        { shareTitle: "Another line" },
        { shareImageAlt: "Another alt" },
        { shareImageId: PIC_DOOMED },
      ]) {
        await service.saveVersion(PAGE_A, { ...english, ...card });
        expect(await changed()).toBe(true);
      }
      await service.saveVersion(PAGE_A, english);
      expect(await changed()).toBe(false);

      // Taking Finnish's picture off is a change too, until it is published.
      await service.saveVersion(PAGE_A, version("fi", FI_SLUG));
      expect(await changed()).toBe(true);
      await service.publishPage(PAGE_A);
      const republished = await new LandingPageService(anon).getPublishedPage(PAGE_A);
      expect(republished?.versions[1].shareImageId).toBeNull();
      expect(republished?.pictures).toEqual({ [PIC_A]: pictured(PIC_A) });
      expect(await changed()).toBe(false);
      expect(await usedBy(PIC_B)).toEqual([]);
    });

    it("removing a language lets its share picture go from the working copy, and the next publish from the live one", async () => {
      await reseed();
      await service.saveVersion(PAGE_A, { ...version("fi", FI_SLUG), shareImageId: PIC_B });
      await service.publishPage(PAGE_A);

      await service.removeVersion(PAGE_A, "fi");
      expect((await copies(PAGE_A)).draft.pictures).toEqual({ [PIC_A]: pictured(PIC_A) });
      // Finnish is still live, its picture with it.
      expect(await usedBy(PIC_B)).toEqual([true]);

      await service.publishPage(PAGE_A);
      expect((await copies(PAGE_A)).publication?.pictures).toEqual({ [PIC_A]: pictured(PIC_A) });
      expect(await usedBy(PIC_B)).toEqual([]);

      // And an unpublish takes the live copy's with it.
      await service.saveVersion(PAGE_A, { ...version("en", SLUG_A), shareImageId: PIC_B });
      await service.publishPage(PAGE_A);
      await service.unpublishPage(PAGE_A);
      expect(await usedBy(PIC_B)).toEqual([false]);
    });

    it("a replace moves a language's share picture in both copies, a live page's without a republish", async () => {
      await reseed();
      // Finnish's share picture is page A's only use of PIC_B.
      await service.saveVersion(PAGE_A, { ...version("fi", FI_SLUG), shareImageId: PIC_B });
      await service.publishPage(PAGE_A);

      const { data: moved, error } = await adminAuth.rpc("repoint_landing_images", {
        p_from: PIC_B,
        p_to: PIC_DOOMED,
      });
      expect(error).toBeNull();
      expect(moved).toBe(1);

      const view = await copies(PAGE_A);
      expect(view.draft.versions[1].shareImageId).toBe(PIC_DOOMED);
      expect(view.publication?.versions[1].shareImageId).toBe(PIC_DOOMED);
      expect(view.draft.sections).toEqual(structure());
      for (const paths of [view.draft.pictures, view.publication?.pictures]) {
        expect(paths).toEqual({ [PIC_A]: pictured(PIC_A), [PIC_DOOMED]: pictured(PIC_DOOMED) });
      }
      expect(view.hasUnpublishedChanges).toBe(false);
    });

    it("a replace refused for its purpose or its shape moves no share picture", async () => {
      await reseed();
      await service.saveVersion(PAGE_A, { ...version("fi", FI_SLUG), shareImageId: PIC_B });
      const { error } = await adminAuth.rpc("repoint_landing_images", {
        p_from: PIC_B,
        p_to: PRODUCT_PICTURE,
      });
      expect(error?.code).toBe("23514");
      // A share picture is the page's only use of PIC_B, so a shape no share
      // picture takes is refused by the share picture alone.
      const square = await adminAuth.rpc("repoint_landing_images", { p_from: PIC_B, p_to: SQUARE });
      expect(square.error?.code).toBe("23514");
      expect(square.error?.message).toContain("A share picture must be wide 16:9");
      expect((await copies(PAGE_A)).draft.versions[1].shareImageId).toBe(PIC_B);
    });

    it("a removal unsets a language's share picture in both copies, and it falls back to its hero's", async () => {
      await reseed();
      await service.saveVersion(PAGE_A, {
        ...version("fi", FI_SLUG),
        shareImageId: PIC_DOOMED,
        shareImageAlt: "Tuhoon",
      });
      await service.publishPage(PAGE_A);
      const { data: before } = await admin.from("landing_pages").select("updated_at").eq("id", PAGE_A).single();

      const removed = await adminAuth.from("catalogue_images").delete().eq("id", PIC_DOOMED);
      expect(removed.error).toBeNull();

      const view = await copies(PAGE_A);
      expect(view.draft.versions[1]).toMatchObject({ shareImageId: null, shareImageAlt: "Tuhoon" });
      expect(view.publication?.versions[1].shareImageId).toBeNull();
      // The hero's picture stays, and is what the card falls back to.
      expect(view.draft.sections).toEqual(structure());
      expect(view.draft.pictures).toEqual({ [PIC_A]: pictured(PIC_A) });
      expect(view.publication?.pictures).toEqual({ [PIC_A]: pictured(PIC_A) });
      expect(view.hasUnpublishedChanges).toBe(false);
      // A removal moves the working copy's last-saved time, as for any picture.
      const { data: after } = await admin.from("landing_pages").select("updated_at").eq("id", PAGE_A).single();
      expect(Date.parse(after?.updated_at ?? "")).toBeGreaterThan(Date.parse(before?.updated_at ?? ""));
    });
  });

  // -------------------------------------------------------------------------
  // Picture shapes
  // -------------------------------------------------------------------------

  describe("picture shapes", () => {
    /** One landing picture of each shape. */
    const OF_SHAPE: Record<LandingPictureShape, string> = { wide: PIC_A, square: SQUARE, portrait: PORTRAIT };
    /** The guide a guide section places, which a save refuses unless it exists. */
    const SHAPES_GUIDE = "00000000-0000-0000-0000-000000000919";

    beforeAll(async () => {
      const guide = await admin.from("guides").insert({ id: SHAPES_GUIDE, label: "Picture shapes fixture guide" });
      expect(guide.error).toBeNull();
      const file = await admin.from("guide_files").insert({
        guide_id: SHAPES_GUIDE,
        locale: "en",
        storage_path: `${SHAPES_GUIDE}/en/00000000-0000-4000-8000-000000000919.pdf`,
        file_name: "shapes-fixture.pdf",
        byte_size: 100,
      });
      expect(file.error).toBeNull();
    });

    afterAll(async () => {
      await admin.from("guides").delete().eq("id", SHAPES_GUIDE);
    });

    /** The fixture structure with one more section, whose picture is `imageId`. */
    function withPicture(type: "hero" | "text" | "image" | "guide", imageId: string): LandingSection[] {
      const [hero, cta] = structure(null);
      if (type === "hero") return [{ id: HERO, type: "hero", imageId }, cta];
      if (type === "text") return [hero, { id: GALLERY, type: "text", background: "default", imageSide: "start", imageId }, cta];
      if (type === "guide") return [hero, { id: GALLERY, type: "guide", background: "default", guideId: SHAPES_GUIDE, imageId }, cta];
      return [hero, { id: GALLERY, type: "image", background: "default", images: [{ id: SHOT_1, imageId }] }, cta];
    }

    // The SQL half of which shapes a section takes, held equal to the section
    // registry's declaration: every type with a picture, with each shape.
    const PICTURED = ["hero", "text", "image", "guide"] as const;
    const cases = PICTURED.flatMap((type) =>
      LANDING_PICTURE_SHAPES.map((shape) => ({
        type,
        shape,
        takes: (LANDING_SECTIONS[type].pictureShapes as readonly LandingPictureShape[]).includes(shape),
      })),
    );

    it("covers every section type that takes a picture", () => {
      // A new pictured type fails here until `withPicture` can build one.
      expect(new Set(LANDING_SECTION_TYPES.filter((type) => LANDING_SECTIONS[type].pictureShapes.length > 0))).toEqual(
        new Set(PICTURED),
      );
    });

    it.each(cases)("a $type section takes a $shape picture: $takes, as the registry declares", async ({ type, shape, takes }) => {
      await reseed();
      const { error } = await adminAuth.rpc("save_landing_page_structure", {
        p_id: PAGE_A,
        p_sections: withPicture(type, OF_SHAPE[shape]),
      });
      if (takes) {
        expect(error).toBeNull();
      } else {
        expect(error?.code).toBe("23514");
        expect(error?.message).toContain("must be wide 16:9");
      }
    });

    it("derives each picture's purpose beside its path into both copies", async () => {
      await reseed();
      await saveWhole(PAGE_A, {
        sections: [
          ...structure(),
          { id: GALLERY, type: "image", background: "default", images: [{ id: SHOT_1, imageId: PORTRAIT }] },
        ],
        versions: [
          {
            ...version("en", SLUG_A),
            sectionTexts: { ...words("en"), [GALLERY]: { alts: { [SHOT_1]: "Portrait" } } },
          },
        ],
      });
      await service.publishPage(PAGE_A);
      const view = await service.getAdminPage(PAGE_A);
      const expected = { [PIC_A]: pictured(PIC_A), [PORTRAIT]: pictured(PORTRAIT) };
      expect(view?.draft.pictures).toEqual(expected);
      expect(view?.publication?.pictures).toEqual(expected);
      expect(view?.publication?.pictures[PORTRAIT].purpose).toBe("landing_portrait_image");
    });

    it("refuses an image section mixing shapes, naming both, and saves nothing", async () => {
      await reseed();
      const { error } = await adminAuth.rpc("save_landing_page_structure", {
        p_id: PAGE_A,
        p_sections: [
          ...structure(),
          {
            id: GALLERY,
            type: "image",
            images: [
              { id: SHOT_1, imageId: SQUARE },
              { id: SHOT_2, imageId: PIC_B },
            ],
          },
        ],
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toContain("must all be one shape");
      expect(error?.message).toContain("a square 1:1 picture beside a wide 16:9 one");
      const view = await service.getAdminPage(PAGE_A);
      expect(view?.draft.sections).toEqual(structure());
    });

    it("takes an image section of one shape that is not wide", async () => {
      await reseed();
      const gallery: LandingSection = {
        id: GALLERY,
        type: "image",
        background: "default",
        images: [
          { id: SHOT_1, imageId: SQUARE },
          { id: SHOT_2, imageId: SQUARE_TOO },
        ],
      };
      await service.saveStructure(PAGE_A, [...structure(), gallery]);
      const view = await service.getAdminPage(PAGE_A);
      expect(view?.draft.sections[2]).toEqual(gallery);
    });

    it("refuses a replace that would change a picture's shape under its section, moving nothing", async () => {
      await reseed();
      await service.saveStructure(PAGE_A, [
        ...structure(),
        {
          id: GALLERY,
          type: "image",
          images: [
            { id: SHOT_1, imageId: SQUARE },
            { id: SHOT_2, imageId: SQUARE_TOO },
          ],
        },
      ]);
      // The catalogue's replace hands the repoint an entry of the old one's
      // own purpose; another shape is refused by the section it would land in.
      const mixed = await adminAuth.rpc("repoint_landing_images", { p_from: SQUARE, p_to: PIC_B });
      expect(mixed.error?.code).toBe("23514");
      const hero = await adminAuth.rpc("repoint_landing_images", { p_from: PIC_A, p_to: SQUARE });
      expect(hero.error?.code).toBe("23514");

      const same = await adminAuth.rpc("repoint_landing_images", { p_from: SQUARE, p_to: SQUARE_TOO });
      expect(same.error).toBeNull();
      const view = await service.getAdminPage(PAGE_A);
      expect(view?.draft.sections[0]).toEqual({ id: HERO, type: "hero", imageId: PIC_A });
      expect(view?.draft.pictures).toEqual({ [PIC_A]: pictured(PIC_A), [SQUARE_TOO]: pictured(SQUARE_TOO) });
    });

    it("a removal unlinks a picture of any landing shape", async () => {
      await reseed();
      await service.saveStructure(PAGE_A, [
        ...structure(),
        { id: GALLERY, type: "text", imageSide: "end", imageId: SQUARE_TOO },
      ]);
      const removed = await adminAuth.from("catalogue_images").delete().eq("id", SQUARE_TOO);
      expect(removed.error).toBeNull();
      const view = await service.getAdminPage(PAGE_A);
      expect(view?.draft.sections[2]).toEqual({ id: GALLERY, type: "text", background: "default", imageSide: "end" });
      expect(view?.draft.pictures).toEqual({ [PIC_A]: pictured(PIC_A) });
    });
  });

  // -------------------------------------------------------------------------
  // Cloning
  // -------------------------------------------------------------------------

  describe("cloning", () => {
    const S_HERO = "00000000-0000-4000-8000-0000000008b1";
    const S_TEXT = "00000000-0000-4000-8000-0000000008b2";
    const S_GALLERY = "00000000-0000-4000-8000-0000000008b3";
    const S_POINTS = "00000000-0000-4000-8000-0000000008b4";
    const S_STEPS = "00000000-0000-4000-8000-0000000008b5";
    const S_FAQ = "00000000-0000-4000-8000-0000000008b6";
    const S_CTA = "00000000-0000-4000-8000-0000000008b7";
    const S_QUOTE = "00000000-0000-4000-8000-0000000008b8";
    const S_PICKS = "00000000-0000-4000-8000-0000000008b9";
    const S_GUIDE = "00000000-0000-4000-8000-0000000008bb";
    const S_SUBSCRIBE = "00000000-0000-4000-8000-0000000008ba";
    const item = (n: number) => `00000000-0000-4000-8000-0000000008c${n}`;
    /** The testimonial the fixture places, which a save refuses unless it exists. */
    const TESTIMONIAL = "00000000-0000-0000-0000-000000000913";
    /** The product the fixture picks, which a save refuses unless it exists. */
    const PICKED = "00000000-0000-0000-0000-000000000914";
    /** The guide the fixture places, likewise. */
    const GUIDE = "00000000-0000-0000-0000-000000000915";

    beforeAll(async () => {
      await deleteTestProducts(admin, [PICKED]);
      await createTestProduct(admin, { id: PICKED, seatCount: null });
      const { error } = await admin.from("testimonials").insert({ id: TESTIMONIAL });
      expect(error).toBeNull();
      const words = await admin
        .from("testimonial_translations")
        .insert({ testimonial_id: TESTIMONIAL, locale: "en", attribution: "Mum, fixture", quote: "Clone fixture quote" });
      expect(words.error).toBeNull();
      const guide = await admin.from("guides").insert({ id: GUIDE, label: "Clone fixture guide" });
      expect(guide.error).toBeNull();
      const file = await admin.from("guide_files").insert({
        guide_id: GUIDE,
        locale: "en",
        storage_path: `${GUIDE}/en/00000000-0000-4000-8000-000000000915.pdf`,
        file_name: "clone-fixture.pdf",
        byte_size: 100,
      });
      expect(file.error).toBeNull();
    });

    afterAll(async () => {
      await admin.from("testimonials").delete().eq("id", TESTIMONIAL);
      await deleteTestProducts(admin, [PICKED]);
      await admin.from("guides").delete().eq("id", GUIDE);
    });

    /** One section of every type, every item-bearing one with its items. */
    const RICH: LandingSection[] = [
      { id: S_HERO, type: "hero", imageId: PIC_A, button: { kind: "internal", path: "/shop" } },
      { id: S_TEXT, type: "text", background: "default", imageId: PIC_B, imageSide: "end" },
      { id: S_GALLERY, type: "image", background: "default", images: [{ id: item(1), imageId: PIC_A }, { id: item(2), imageId: PIC_B }] },
      { id: S_POINTS, type: "points", background: "default", items: [{ id: item(3), icon: "star" }, { id: item(4), icon: "rocket" }] },
      { id: S_STEPS, type: "steps", background: "default", items: [{ id: item(5) }, { id: item(6) }] },
      { id: S_FAQ, type: "faq", background: "default", items: [{ id: item(7) }] },
      { id: S_QUOTE, type: "testimonials", background: "default", arrangement: "feature", testimonialIds: [TESTIMONIAL] },
      { id: S_PICKS, type: "products", background: "default", productIds: [PICKED] },
      { id: S_GUIDE, type: "guide", background: "default", guideId: GUIDE, imageId: PIC_B },
      { id: S_SUBSCRIBE, type: "subscribe", background: "default" },
      { id: S_CTA, type: "cta", background: "default", button: { kind: "internal", path: "/shop" } },
    ];

    /** Every word of `RICH` in one language, each naming where it belongs. */
    function richWords(lang: string) {
      const w = (where: string) => `${where} ${lang}`;
      const pair = (n: number, kind: string) => ({ title: w(`${kind} ${n}`), body: w(`${kind} ${n} body`) });
      return {
        [S_HERO]: { headline: w("hero"), buttonLabel: w("hero button"), imageAlt: w("hero alt") },
        [S_TEXT]: { heading: w("text"), body: w("text body"), imageAlt: w("text alt") },
        [S_GALLERY]: { heading: w("gallery"), alts: { [item(1)]: w("shot 1"), [item(2)]: w("shot 2") } },
        [S_POINTS]: { heading: w("points"), items: { [item(3)]: pair(3, "point"), [item(4)]: pair(4, "point") } },
        [S_STEPS]: { heading: w("steps"), items: { [item(5)]: pair(5, "step"), [item(6)]: pair(6, "step") } },
        [S_FAQ]: { heading: w("faq"), items: { [item(7)]: { question: w("question 7"), answer: w("answer 7") } } },
        [S_QUOTE]: { heading: w("testimonials") },
        [S_PICKS]: { heading: w("products") },
        [S_GUIDE]: { heading: w("guide"), imageAlt: w("guide alt") },
        [S_SUBSCRIBE]: { heading: w("subscribe"), buttonLabel: w("subscribe button") },
        [S_CTA]: { heading: w("cta"), buttonLabel: w("cta button") },
      };
    }

    const MARKERS: Record<string, string> = { en: "(Copy)", fi: "(kopio)" };
    const marker = async (locale: string) => MARKERS[locale] ?? "(?)";

    /** No row this file did not mean to make carries this title. */
    const REFUSED_TITLE = "Fixture refused (Copy)";

    /** PAGE_A as a page of every section type, complete in English and Finnish. */
    async function richSource() {
      await reseed();
      await service.saveStructure(PAGE_A, RICH);
      await service.saveVersion(PAGE_A, { ...version("en", SLUG_A), sectionTexts: richWords("en") });
      await service.saveVersion(PAGE_A, { ...version("fi", "fixture-landing-a-fi"), sectionTexts: richWords("fi") });
      const page = await service.getAdminPage(PAGE_A);
      if (page === null) throw new Error("the source is missing");
      return page;
    }

    async function cloneOf(source: Parameters<LandingPageService["clonePage"]>[0]) {
      const id = await service.clonePage(source, marker);
      minted.push(id);
      const page = await service.getAdminPage(id);
      if (page === null) throw new Error("the clone is missing");
      return page;
    }

    async function refusedClones() {
      const { data } = await admin.from("landing_page_translations").select("page_id").eq("title", REFUSED_TITLE);
      return data ?? [];
    }

    /**
     * Every section and item id of a structure, in order. An item is what the
     * clone takes one to be: an object with a string `id` in any list a section
     * holds, whatever the list is called.
     */
    function idsOf(sections: readonly LandingSection[]): string[] {
      const itemId = (entry: unknown) =>
        typeof entry === "object" && entry !== null && "id" in entry && typeof entry.id === "string" ? [entry.id] : [];
      return sections.flatMap((section) => [
        section.id,
        ...Object.values(section).flatMap((field: unknown) => (Array.isArray(field) ? field.flatMap(itemId) : [])),
      ]);
    }

    it("copies the structure and every language's words with new ids, the words still on their sections and items", async () => {
      // A new section type fails here until `RICH` carries one of it.
      expect(new Set(RICH.map((section) => section.type))).toEqual(new Set(LANDING_SECTION_TYPES));
      const source = await richSource();
      expect(source.draft.versions.map((v) => v.missing)).toEqual([[], []]);
      const clone = await cloneOf(source.draft);

      const from = idsOf(source.draft.sections);
      const to = idsOf(clone.draft.sections);
      expect(to).toHaveLength(from.length);
      expect(new Set(to).size).toBe(to.length);
      for (const id of to) expect(from).not.toContain(id);

      // Re-keying the source by position gives exactly the clone.
      const rekey = (value: unknown): unknown =>
        JSON.parse(from.reduce((json, id, n) => json.replaceAll(id, to[n]), JSON.stringify(value)));
      expect(clone.draft.sections).toEqual(rekey(source.draft.sections));
      expect(clone.draft.versions.map((v) => v.locale)).toEqual(["en", "fi"]);
      for (const [n, copy] of clone.draft.versions.entries()) {
        const original = source.draft.versions[n];
        expect(copy.sectionTexts).toEqual(rekey(original.sectionTexts));
        expect(copy.summary).toBe(original.summary);
        expect(copy.missing).toEqual([]);
      }

      // The source is untouched.
      expect((await service.getAdminPage(PAGE_A))?.draft.sections).toEqual(RICH);
    });

    it("carries the pictures, their paths derived by the database", async () => {
      const source = await richSource();
      const clone = await cloneOf(source.draft);
      expect(clone.draft.pictures).toEqual({ [PIC_A]: pictured(PIC_A), [PIC_B]: pictured(PIC_B) });
    });

    it("carries each language's share card, its picture included", async () => {
      await richSource();
      for (const [locale, slug, picture] of [
        ["en", SLUG_A, null],
        ["fi", "fixture-landing-a-fi", PIC_DOOMED],
      ] as const) {
        await service.saveVersion(PAGE_A, {
          ...version(locale, slug),
          sectionTexts: richWords(locale),
          shareTitle: `Share ${locale}`,
          shareImageId: picture,
          shareImageAlt: `Alt ${locale}`,
        });
      }
      const source = await service.getAdminPage(PAGE_A);
      if (source === null) throw new Error("the source is missing");

      const clone = await cloneOf(source.draft);
      expect(clone.draft.pictures).toEqual({
        [PIC_A]: pictured(PIC_A),
        [PIC_B]: pictured(PIC_B),
        [PIC_DOOMED]: pictured(PIC_DOOMED),
      });
      expect(
        clone.draft.versions.map(({ locale, shareTitle, shareImageId, shareImageAlt }) => ({
          locale,
          shareTitle,
          shareImageId,
          shareImageAlt,
        })),
      ).toEqual([
        { locale: "en", shareTitle: "Share en", shareImageId: null, shareImageAlt: "Alt en" },
        { locale: "fi", shareTitle: "Share fi", shareImageId: PIC_DOOMED, shareImageAlt: "Alt fi" },
      ]);
    });

    it("marks each title in its own language and derives its slug from the new title", async () => {
      const source = await richSource();
      const clone = await cloneOf(source.draft);
      expect(clone.draft.versions.map(({ locale, title, slug }) => ({ locale, title, slug }))).toEqual([
        { locale: "en", title: "Fixture landing en (Copy)", slug: "fixture-landing-en-copy" },
        { locale: "fi", title: "Fixture landing fi (kopio)", slug: "fixture-landing-fi-kopio" },
      ]);
    });

    it("numbers a slug another page holds, working or only live, until it is free", async () => {
      const source = await richSource();
      // PAGE_B holds the English slug live only, and the Finnish one in its working copy.
      await service.saveStructure(PAGE_B, structure());
      await service.saveVersion(PAGE_B, { ...version("en", "fixture-landing-en-copy"), sectionTexts: words("en") });
      await service.publishPage(PAGE_B);
      await service.saveVersion(PAGE_B, version("en", "fixture-landing-b-moved"));
      await service.saveVersion(PAGE_B, version("fi", "fixture-landing-fi-kopio"));

      try {
        const first = await cloneOf(source.draft);
        const second = await cloneOf(source.draft);
        expect(first.draft.versions.map((v) => v.slug)).toEqual([
          "fixture-landing-en-copy-2",
          "fixture-landing-fi-kopio-2",
        ]);
        expect(second.draft.versions.map((v) => v.slug)).toEqual([
          "fixture-landing-en-copy-3",
          "fixture-landing-fi-kopio-3",
        ]);
      } finally {
        await service.unpublishPage(PAGE_B);
      }
    });

    it("cuts a numbered slug to the length cap", async () => {
      await reseed();
      const long = `fixture-${"a".repeat(72)}`;
      await service.saveVersion(PAGE_B, { ...version("en", long), sectionTexts: {} });
      const { data: id, error } = await adminAuth.rpc("clone_landing_page", {
        p_id: PAGE_A,
        p_versions: [{ locale: "en", title: "Fixture long (Copy)", default_slug: long }],
      });
      expect(error).toBeNull();
      if (id) minted.push(id);
      const [en] = await draftVersions(id ?? PAGE_MISSING);
      expect(en.slug).toBe(`fixture-${"a".repeat(70)}-2`);
      expect(en.slug).toHaveLength(80);
    });

    it("is unpublished, and records the admin and the AI app it came through as its saver", async () => {
      const source = await richSource();
      await service.publishPage(PAGE_A);
      const grant = await oauthGrantFor(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
        "Fixture clone AI app",
      );
      try {
        const viaApp = new LandingPageService(createBearerTestClient(grant.accessToken));
        const id = await viaApp.clonePage(source.draft, marker);
        minted.push(id);
        const { data: row } = await admin
          .from("landing_pages")
          .select("author_id, last_saved_by, last_saved_via")
          .eq("id", id)
          .single();
        expect(row).toEqual({
          author_id: TEST_IDS.ADMIN,
          last_saved_by: TEST_IDS.ADMIN,
          last_saved_via: grant.clientId,
        });
        expect((await service.getAdminPage(id))?.publication).toBeNull();
      } finally {
        await revokeOAuthGrant(grant);
        await service.unpublishPage(PAGE_A);
      }
    });

    it("copies only the languages named, and refuses one the page does not have", async () => {
      const source = await richSource();
      const english = await cloneOf({
        ...source.draft,
        versions: source.draft.versions.filter((v) => v.locale === "en"),
      });
      expect(english.draft.versions.map((v) => v.locale)).toEqual(["en"]);

      const { error } = await adminAuth.rpc("clone_landing_page", {
        p_id: PAGE_A,
        p_versions: [{ locale: "sv", title: REFUSED_TITLE, default_slug: "fixture-refused-copy" }],
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toBe("The page has no sv version to copy");
      expect(await refusedClones()).toEqual([]);
    });

    it("refuses an id no page has, creating nothing", async () => {
      await reseed();
      const { error } = await adminAuth.rpc("clone_landing_page", {
        p_id: PAGE_MISSING,
        p_versions: [{ locale: "en", title: REFUSED_TITLE, default_slug: "fixture-refused-copy" }],
      });
      expect(error?.code).toBe("P0002");
      expect(await refusedClones()).toEqual([]);
    });

    for (const role of WRONG_ROLES) {
      it(`refuses a ${role}, creating nothing`, async () => {
        await reseed();
        const { error } = await clientFor(role).rpc("clone_landing_page", {
          p_id: PAGE_A,
          p_versions: [{ locale: "en", title: REFUSED_TITLE, default_slug: "fixture-refused-copy" }],
        });
        expect(error?.code).toBe("42501");
        expect(await refusedClones()).toEqual([]);
      });
    }
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

    it("a removal is a save: it records the AI app and moves the last-saved time", async () => {
      await reseed();
      await service.saveVersion(PAGE_A, version("fi", "fixture-landing-a-fi"));
      const { data: before } = await admin.from("landing_pages").select("updated_at").eq("id", PAGE_A).single();

      await viaApp.removeVersion(PAGE_A, "fi");

      expect(await saver()).toEqual({ last_saved_by: TEST_IDS.ADMIN, last_saved_via: grant.clientId });
      const { data: after } = await admin.from("landing_pages").select("updated_at").eq("id", PAGE_A).single();
      expect(Date.parse(after?.updated_at ?? "")).toBeGreaterThan(Date.parse(before?.updated_at ?? ""));
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
