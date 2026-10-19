import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAnonTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS } from "./constants";
import { landingSections, type LandingSection } from "@/lib/landing-pages/sections";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";
import {
  landingPageTestimonialRows,
  type TestimonialVersionInput,
} from "@/services/testimonials/testimonials.contracts";
import { TestimonialsService } from "@/services/testimonials/testimonials.service";
import {
  SLOT_CASE_SECTION,
  testimonialSlotCases,
} from "../helpers/landing-testimonial-slot-cases";

/**
 * A landing page's testimonials section: the structure check's two halves on
 * the slot counts, the refusal of a testimonial named twice and of an id no
 * testimonial has (`check_landing_testimonial_picks`), the public read
 * `list_landing_page_testimonials` — the scope test the authorization spine
 * names — and the admin reads that list where a testimonial is used and what
 * a page's working copy places.
 *
 * Pinned on the public read: anon is answered the testimonials a LIVE page's
 * published copy places, with their current words, so an edit shows without
 * a republish; never one placed only in a working copy, nor on an unpublished
 * page; and every caller is answered alike, while the store itself stays
 * closed to anon.
 *
 * Fixture UUIDs 910-912 (product-helpers.ts registry): two landing pages and
 * a testimonial id that must NEVER exist. Its testimonials are minted through
 * the admin's writer and found by a quote prefix only this file uses.
 */

const PAGE_LIVE = "00000000-0000-0000-0000-000000000910";
const PAGE_DRAFT = "00000000-0000-0000-0000-000000000911";
const MISSING = "00000000-0000-0000-0000-000000000912";

const HERO = "00000000-0000-4000-8000-000000000a01";
const QUOTES = "00000000-0000-4000-8000-000000000a02";

const PREFIX = "Fixture landing testimonial:";

const quote = (n: number): TestimonialVersionInput => ({
  locale: "en",
  from: `Fixture parent ${n}`,
  quote: `${PREFIX} number ${n}`,
});

function structure(arrangement: "feature" | "pair" | "row", ids: string[]): LandingSection[] {
  return [
    { id: HERO, type: "hero" },
    { id: QUOTES, type: "testimonials", arrangement, testimonialIds: ids },
  ];
}

describe("landing page testimonials", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let others: SupabaseClient<Database>[];
  let anon: SupabaseClient<Database>;
  let testimonials: TestimonialsService;
  let pages: LandingPageService;
  /** Minted testimonials: [0..2] the live row, [3] the working copy's alone, [4] never placed. */
  let t: string[];

  async function cleanUp() {
    await admin.from("landing_pages").delete().in("id", [PAGE_LIVE, PAGE_DRAFT]);
    const { data } = await admin
      .from("testimonial_translations")
      .select("testimonial_id")
      .like("quote", `${PREFIX}%`);
    const ids = [...new Set((data ?? []).map((row) => row.testimonial_id))];
    if (ids.length > 0) await admin.from("testimonials").delete().in("id", ids);
  }

  /**
   * The live page placing the row t[0..2] in its published copy, and the
   * draft page placing t[3] in its working copy, never published.
   */
  async function reseed() {
    await admin.from("landing_pages").delete().in("id", [PAGE_LIVE, PAGE_DRAFT]);
    const inserted = await admin.from("landing_pages").insert([
      { id: PAGE_LIVE, sections: structure("row", t.slice(0, 3)) },
      { id: PAGE_DRAFT, sections: structure("feature", [t[3]]) },
    ]);
    expect(inserted.error).toBeNull();
    const versions = await admin.from("landing_page_translations").insert([
      {
        page_id: PAGE_LIVE,
        locale: "en",
        title: "Fixture testimonials page",
        summary: "A summary.",
        slug: "fixture-testimonials-live",
        section_texts: { [HERO]: { headline: "Quotes" } },
      },
      {
        page_id: PAGE_DRAFT,
        locale: "en",
        title: "Fixture testimonials draft",
        summary: "A summary.",
        slug: "fixture-testimonials-draft",
        section_texts: { [HERO]: { headline: "Draft quotes" } },
      },
    ]);
    expect(versions.error).toBeNull();
    await pages.publishPage(PAGE_LIVE);
  }

  async function liveIds(client: SupabaseClient<Database>, page: string): Promise<string[]> {
    const { data, error } = await client.rpc("list_landing_page_testimonials", { p_page_id: page });
    expect(error).toBeNull();
    return landingPageTestimonialRows
      .parse(data)
      .map((row) => row.testimonial_id)
      .sort();
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
    testimonials = new TestimonialsService(adminAuth);
    pages = new LandingPageService(adminAuth);
    await cleanUp();
    t = [];
    for (let n = 0; n < 5; n++) t.push(await testimonials.createTestimonial({ versions: [quote(n)] }));
    await reseed();
  });

  afterAll(async () => {
    await cleanUp();
  });

  // -------------------------------------------------------------------------
  // The structure check, both halves
  // -------------------------------------------------------------------------

  describe("the slot counts", () => {
    it("are judged in SQL exactly as in TypeScript, on every arrangement and count", async () => {
      const cases = testimonialSlotCases();
      const answers = await Promise.all(
        cases.map((testCase) =>
          admin.rpc("landing_sections_problem", { p_sections: testCase.sections }),
        ),
      );
      cases.forEach((testCase, index) => {
        const { data, error } = answers[index];
        expect(error, testCase.name).toBeNull();
        expect(landingSections.safeParse(testCase.sections).success, testCase.name).toBe(
          testCase.problem === null,
        );
        // SQL names the section first, so its sentence continues in lower case.
        expect(data, testCase.name).toBe(
          testCase.problem === null
            ? null
            : `Section ${SLOT_CASE_SECTION}: ${testCase.problem.charAt(0).toLowerCase()}${testCase.problem.slice(1)}`,
        );
      });
    });

    it("refuses a save whose count does not fit, saying both, and saves nothing", async () => {
      await reseed();
      const { error } = await adminAuth.rpc("save_landing_page_structure", {
        p_id: PAGE_LIVE,
        p_sections: structure("pair", t.slice(0, 3)),
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toContain(
        "a pair arrangement shows exactly 2 testimonials; this section has 3",
      );
      const { data } = await admin.from("landing_pages").select("sections").eq("id", PAGE_LIVE).single();
      expect(data?.sections).toEqual(structure("row", t.slice(0, 3)));
    });

    it("refuses the same testimonial twice in one section", async () => {
      const { error } = await adminAuth.rpc("save_landing_page_structure", {
        p_id: PAGE_LIVE,
        p_sections: structure("row", [t[0], t[1], t[0]]),
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toBe(`Section ${QUOTES} names the testimonial ${t[0]} twice`);
    });
  });

  describe("an id no testimonial has", () => {
    it("is refused loudly, naming the section and the id, and nothing is saved", async () => {
      await reseed();
      const { error } = await adminAuth.rpc("save_landing_page_structure", {
        p_id: PAGE_LIVE,
        p_sections: structure("row", [t[0], t[1], MISSING]),
      });
      expect(error?.code).toBe("23503");
      expect(error?.message).toBe(
        `Section 2 places the testimonial ${MISSING}, and no testimonial has that id`,
      );
      await expect(
        pages.saveStructure(PAGE_DRAFT, structure("feature", [MISSING])),
      ).rejects.toMatchObject({ code: "23503" });
      const { data } = await admin.from("landing_pages").select("sections").eq("id", PAGE_DRAFT).single();
      expect(data?.sections).toEqual(structure("feature", [t[3]]));
    });

    it("is refused when a page is created with it", async () => {
      const { error } = await adminAuth.rpc("create_landing_page", {
        p_sections: structure("feature", [MISSING]),
        p_versions: [{ locale: "en", title: "Fixture never created" }],
      });
      expect(error?.code).toBe("23503");
    });

    it("checks only the ids a save adds, so a placement already there never refuses a save", async () => {
      // A testimonial the app never deletes, removed by hand behind the page.
      const doomed = await testimonials.createTestimonial({ versions: [quote(9)] });
      await pages.saveStructure(PAGE_DRAFT, structure("pair", [t[3], doomed]));
      expect((await admin.from("testimonials").delete().eq("id", doomed)).error).toBeNull();

      await pages.saveStructure(PAGE_DRAFT, structure("pair", [doomed, t[3]]));
      const { data } = await admin.from("landing_pages").select("sections").eq("id", PAGE_DRAFT).single();
      expect(data?.sections).toEqual(structure("pair", [doomed, t[3]]));
      await reseed();
    });
  });

  // -------------------------------------------------------------------------
  // The public read
  // -------------------------------------------------------------------------

  describe("the public read", () => {
    it("answers anon the testimonials a live page places, with their words alone", async () => {
      await reseed();
      expect(await liveIds(anon, PAGE_LIVE)).toEqual(t.slice(0, 3).sort());
      const { data } = await anon.rpc("list_landing_page_testimonials", { p_page_id: PAGE_LIVE });
      for (const row of landingPageTestimonialRows.parse(data)) {
        expect(Object.keys(row).sort()).toEqual(["testimonial_id", "versions"]);
        for (const version of row.versions) {
          expect(Object.keys(version).sort()).toEqual(["attribution", "locale", "quote"]);
        }
      }
    });

    it("never answers a testimonial placed only in a working copy", async () => {
      await reseed();
      // The draft page has never been published.
      expect(await liveIds(anon, PAGE_DRAFT)).toEqual([]);
      // The live page's working copy moves on; readers keep the published row.
      await pages.saveStructure(PAGE_LIVE, structure("feature", [t[3]]));
      expect(await liveIds(anon, PAGE_LIVE)).toEqual(t.slice(0, 3).sort());
      // Once published, the new placement is what readers get.
      await pages.publishPage(PAGE_LIVE);
      expect(await liveIds(anon, PAGE_LIVE)).toEqual([t[3]]);
      // Unpublished, nothing.
      await pages.unpublishPage(PAGE_LIVE);
      expect(await liveIds(anon, PAGE_LIVE)).toEqual([]);
      await reseed();
    });

    it("answers an unknown page, and no page, with nothing", async () => {
      expect(await liveIds(anon, MISSING)).toEqual([]);
      expect(await new TestimonialsService(anon).listLandingPageTestimonials("not-a-uuid")).toEqual([]);
    });

    it("shows an edit to a placed testimonial straight away, without a republish", async () => {
      await reseed();
      const before = await admin
        .from("landing_page_publications")
        .select("published_at")
        .eq("page_id", PAGE_LIVE)
        .single();
      await testimonials.saveTestimonialVersion(t[0], {
        locale: "en",
        from: "Fixture parent, edited",
        quote: `${PREFIX} edited words`,
      });
      await testimonials.saveTestimonialVersion(t[0], {
        locale: "fi",
        from: "Fixture vanhempi",
        quote: `${PREFIX} muokatut sanat`,
      });

      const live = await new TestimonialsService(anon).listLandingPageTestimonials(PAGE_LIVE);
      expect(live.find((row) => row.id === t[0])?.versions).toEqual([
        { locale: "en", from: "Fixture parent, edited", quote: `${PREFIX} edited words` },
        { locale: "fi", from: "Fixture vanhempi", quote: `${PREFIX} muokatut sanat` },
      ]);
      const after = await admin
        .from("landing_page_publications")
        .select("published_at")
        .eq("page_id", PAGE_LIVE)
        .single();
      expect(after.data?.published_at).toBe(before.data?.published_at);
    });

    it("answers every signed-in role exactly as it answers anon", async () => {
      await reseed();
      const asAnon = await anon.rpc("list_landing_page_testimonials", { p_page_id: PAGE_LIVE });
      for (const client of [adminAuth, ...others]) {
        const asRole = await client.rpc("list_landing_page_testimonials", { p_page_id: PAGE_LIVE });
        expect(asRole.error).toBeNull();
        expect(
          landingPageTestimonialRows.parse(asRole.data).sort((a, b) => a.testimonial_id.localeCompare(b.testimonial_id)),
        ).toEqual(
          landingPageTestimonialRows.parse(asAnon.data).sort((a, b) => a.testimonial_id.localeCompare(b.testimonial_id)),
        );
      }
    });

    it("keeps the store itself from anon", async () => {
      await reseed();
      expect((await anon.from("testimonials").select("id").limit(1)).error?.code).toBe("42501");
    });
  });

  // -------------------------------------------------------------------------
  // The admin reads
  // -------------------------------------------------------------------------

  describe("where a testimonial is used", () => {
    it("lists each landing page placing it, live, working or both", async () => {
      await reseed();
      // The live page's working copy keeps t[1] and t[2], drops t[0] and adds t[4].
      await pages.saveStructure(PAGE_LIVE, structure("row", [t[4], t[1], t[2]]));

      const usage = async (id: string) => (await testimonials.getAdminTestimonial(id))?.usages;

      expect(await usage(t[0])).toEqual([
        {
          pageId: PAGE_LIVE,
          titles: [{ locale: "en", title: "Fixture testimonials page" }],
          inLiveCopy: true,
          inWorkingCopy: false,
        },
      ]);
      expect(await usage(t[1])).toMatchObject([
        { pageId: PAGE_LIVE, inLiveCopy: true, inWorkingCopy: true },
      ]);
      expect(await usage(t[4])).toMatchObject([
        { pageId: PAGE_LIVE, inLiveCopy: false, inWorkingCopy: true },
      ]);
      expect(await usage(t[3])).toMatchObject([
        { pageId: PAGE_DRAFT, inLiveCopy: false, inWorkingCopy: true },
      ]);

      const listed = await testimonials.listAdminTestimonials();
      expect(listed.find((row) => row.id === t[1])?.usages).toEqual(
        (await testimonials.getAdminTestimonial(t[1]))?.usages,
      );
      await reseed();
    });

    it("carries the working copy's testimonials' words on the admin's page read", async () => {
      await reseed();
      const page = await pages.getAdminPage(PAGE_DRAFT);
      expect(Object.keys(page?.testimonials ?? {})).toEqual([t[3]]);
      expect(page?.testimonials[t[3]].versions).toEqual([
        { locale: "en", from: "Fixture parent 3", quote: `${PREFIX} number 3` },
      ]);
    });
  });
});
