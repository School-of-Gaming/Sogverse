import { describe, expect, it } from "vitest";
import {
  defaultLandingSlug,
  hasUnpublishedChanges,
  landingCopyTitle,
  landingPageInput,
  landingSlug,
  landingVersionInput,
  landingWriteFailure,
  localizeLandingPageSummary,
  type ComparableLandingCopy,
  type PublishedLandingPageSummary,
} from "@/services/landing-pages/landing-pages.contracts";
import {
  CASE_IDS as I,
  everySection,
  everyText,
} from "../../helpers/landing-required-text-cases";

describe("landing page slugs", () => {
  it("takes lowercase words joined by single hyphens", () => {
    expect(landingSlug.safeParse("gaming-clubs-in-espoo").success).toBe(true);
    expect(landingSlug.safeParse("2026").success).toBe(true);
  });

  it("refuses capitals, other characters, stray hyphens and the over-long", () => {
    for (const slug of ["Gaming", "gaming_clubs", "-a", "a-", "a--b", "ä", "a".repeat(81)]) {
      expect(landingSlug.safeParse(slug).success, slug).toBe(false);
    }
  });

  it("refuses a slug shaped like an id, so the two addresses never collide, saying why", () => {
    const parsed = landingSlug.safeParse("123e4567-e89b-42d3-a456-426614174000");
    expect(parsed.error?.issues[0].message).toBe(
      "An address may not look like a page id: those are kept for each page's id address",
    );
  });

  it("suggests the lowercase form of a slug that is right but for its capitals", () => {
    expect(landingSlug.safeParse("Gaming-Clubs").error?.issues[0].message).toBe(
      'An address holds only lowercase letters a–z, digits and single hyphens between them — "gaming-clubs" would do',
    );
    expect(landingSlug.safeParse("Gaming_Clubs").error?.issues[0].message).toBe(
      "An address holds only lowercase letters a–z, digits and single hyphens between them",
    );
  });

  it("derives a default from the title, cut at a word boundary", () => {
    expect(defaultLandingSlug("Pelikerhot Espoon kouluissa")).toBe(
      "pelikerhot-espoon-kouluissa",
    );
    const long = defaultLandingSlug(`${"word ".repeat(30)}end`);
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("-")).toBe(false);
    expect(long).toMatch(/^(word-)*word$/);
    expect(defaultLandingSlug("!!!")).toBe("");
    expect(defaultLandingSlug("123e4567-e89b-42d3-a456-426614174000")).toBe("");
  });
});

describe("a clone's title", () => {
  it("follows the source's title with the language's copy marker, and derives the clone's slug", () => {
    expect(landingCopyTitle("Pelikerhot Espoossa", "(kopio)")).toBe("Pelikerhot Espoossa (kopio)");
    expect(defaultLandingSlug(landingCopyTitle("Gaming clubs in Espoo", "(Copy)"))).toBe(
      "gaming-clubs-in-espoo-copy",
    );
    expect(defaultLandingSlug(landingCopyTitle("Clubs de jeux à Paris", "(copie)"))).toBe(
      "clubs-de-jeux-a-paris-copie",
    );
  });

  it("cuts the source's title, never the marker, to stay within the length cap", () => {
    // The cut lands on a space, which is not kept before the marker.
    const title = landingCopyTitle(`${"a".repeat(112)} ${"b".repeat(7)}`, "(Copy)");
    expect(title).toBe(`${"a".repeat(112)} (Copy)`);
    expect(title.endsWith(" (Copy)")).toBe(true);
    expect(landingCopyTitle("x".repeat(120), "(Copy)")).toHaveLength(120);
  });
});

describe("a version as an admin writes it", () => {
  it("reads a blank slug as none given", () => {
    const version = landingVersionInput.parse({
      locale: "fi",
      title: " Otsikko ",
      summary: "",
      slug: "",
      sectionTexts: {},
    });
    expect(version.slug).toBeUndefined();
    expect(version.title).toBe("Otsikko");
  });

  it("refuses an over-long summary — it is the meta description", () => {
    expect(
      landingVersionInput.safeParse({
        locale: "en",
        title: "T",
        summary: "x".repeat(161),
        sectionTexts: {},
      }).success,
    ).toBe(false);
  });
});

describe("a whole page as the editor saves it", () => {
  const version = {
    locale: "en" as const,
    title: "Clubs",
    summary: "",
    sectionTexts: everyText(),
  };

  it("checks every version's words against the structure", () => {
    const parsed = landingPageInput.parse({ sections: everySection(), versions: [version] });
    expect(parsed.versions[0].sectionTexts[I.cta]).toEqual(everyText()[I.cta]);
  });

  it("refuses words for a section the structure does not hold, naming where", () => {
    const result = landingPageInput.safeParse({
      sections: everySection().filter((section) => section.type !== "cta"),
      versions: [version],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path.slice(0, 3)).toEqual([
      "versions",
      0,
      "sectionTexts",
    ]);
  });

  it("refuses no version, or two of one language", () => {
    expect(landingPageInput.safeParse({ sections: everySection(), versions: [] }).success).toBe(
      false,
    );
    expect(
      landingPageInput.safeParse({ sections: everySection(), versions: [version, version] })
        .success,
    ).toBe(false);
  });
});

describe("unpublished changes", () => {
  const v = (locale: string, md5 = "t") => ({
    locale,
    title: "T",
    summary: "S",
    slug: "s",
    texts_md5: md5,
    share_title: "",
    share_image_id: null as string | null,
    share_image_alt: "",
  });
  const copy = (
    versions: ComparableLandingCopy["versions"],
    sections_md5: string | null = "s",
  ): ComparableLandingCopy => ({ sections_md5, versions });

  it("is false for a page that is not live", () => {
    expect(hasUnpublishedChanges(copy([v("en")]), null)).toBe(false);
  });

  it("is false when publishing would copy what is live", () => {
    expect(hasUnpublishedChanges(copy([v("en"), v("fi")]), copy([v("fi"), v("en")]))).toBe(false);
  });

  it("is true for a changed structure, word, slug or version set", () => {
    const live = copy([v("en")]);
    expect(hasUnpublishedChanges(copy([v("en")], "other"), live)).toBe(true);
    expect(hasUnpublishedChanges(copy([v("en", "changed")]), live)).toBe(true);
    expect(hasUnpublishedChanges(copy([{ ...v("en"), slug: "x" }]), live)).toBe(true);
    expect(hasUnpublishedChanges(copy([v("en"), v("fi")]), live)).toBe(true);
    expect(hasUnpublishedChanges(copy([]), live)).toBe(true);
  });

  it("is true for a language's changed share picture, share title or share picture alt text", () => {
    const live = copy([v("en"), v("fi")]);
    const sharing = { ...v("fi"), share_image_id: I.hero };
    expect(hasUnpublishedChanges(copy([v("en"), sharing]), live)).toBe(true);
    expect(hasUnpublishedChanges(live, copy([v("en"), sharing]))).toBe(true);
    expect(hasUnpublishedChanges(copy([{ ...v("en"), share_title: "Share" }, v("fi")]), live)).toBe(true);
    expect(hasUnpublishedChanges(copy([{ ...v("en"), share_image_alt: "Alt" }, v("fi")]), live)).toBe(true);
    expect(hasUnpublishedChanges(copy([v("en"), sharing]), copy([v("en"), sharing]))).toBe(false);
  });

  it("counts a digest the database failed to produce as a change", () => {
    expect(hasUnpublishedChanges(copy([v("en")], null), copy([v("en")], null))).toBe(true);
  });
});

describe("reading in a language", () => {
  const page: PublishedLandingPageSummary = {
    id: I.hero,
    firstPublishedAt: "2026-10-01T00:00:00Z",
    publishedAt: "2026-10-02T00:00:00Z",
    sections: [],
    pictures: {},
    versions: [
      { locale: "fi", title: "Kerhot", summary: "S", slug: "kerhot" },
      { locale: "sv", title: "Klubbar", summary: "S", slug: "klubbar" },
    ],
  };

  it("falls back from the reader's locale to English to the first written", () => {
    expect(localizeLandingPageSummary(page, "sv")?.slug).toBe("klubbar");
    expect(localizeLandingPageSummary(page, "fr")?.slug).toBe("kerhot");
    expect(
      localizeLandingPageSummary(
        { ...page, versions: [...page.versions, { locale: "en", title: "Clubs", summary: "S", slug: "clubs" }] },
        "fr",
      )?.slug,
    ).toBe("clubs");
  });
});

describe("a refused write", () => {
  it("quotes the database's sentence only under the codes written for an admin", () => {
    expect(landingWriteFailure({ code: "23505", message: "Taken" })).toEqual({
      kind: "reason",
      reason: "Taken",
    });
    expect(landingWriteFailure({ code: "22023", message: "p_versions" })).toEqual({
      kind: "unknown",
    });
    expect(landingWriteFailure(new Error("x"))).toEqual({ kind: "unknown" });
  });
});
