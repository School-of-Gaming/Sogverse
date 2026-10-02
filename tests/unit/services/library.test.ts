import { describe, it, expect, vi } from "vitest";
import {
  createFetchStubbedClient,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";
import {
  hasUnpublishedChanges,
  libraryArticleInput,
  localizeArticle,
  type ComparableArticleCopy,
  type PublishedLibraryArticle,
} from "@/services/library/library.contracts";
import { LibraryService } from "@/services/library/library.service";

const COVER_A = "4c3f3a4e-5f0b-4b9e-9d0e-5b7d9a1f2c01";
const COVER_B = "8a6e2d1c-3b4f-4e5a-8c7d-6f9e0a1b2c02";

describe("hasUnpublishedChanges", () => {
  const en = {
    locale: "en",
    title: "Title",
    summary: "Summary",
    body_md5: "d41d8cd98f00b204e9800998ecf8427e",
  };
  const fi = { ...en, locale: "fi", title: "Otsikko" };
  const copy: ComparableArticleCopy = {
    category: "learning",
    cover_image_id: COVER_A,
    versions: [en, fi],
  };

  it("is false for an article that is not live", () => {
    expect(hasUnpublishedChanges(copy, null)).toBe(false);
  });

  it("is false when the two copies match, in any order", () => {
    expect(
      hasUnpublishedChanges(copy, { ...copy, versions: [fi, en] }),
    ).toBe(false);
  });

  it.each([
    ["category", { category: "screen_time" }],
    ["cover", { cover_image_id: COVER_B }],
    ["cover's presence", { cover_image_id: null }],
    ["a version's title", { versions: [{ ...en, title: "Other" }, fi] }],
    ["a version's summary", { versions: [en, { ...fi, summary: "Other" }] }],
    [
      "a version's body",
      { versions: [en, { ...fi, body_md5: "0cc175b9c0f1b6a831c399e269772661" }] },
    ],
    ["the set of versions", { versions: [en] }],
    ["which languages", { versions: [en, { ...fi, locale: "sv" }] }],
  ] as const)("is true when %s differs", (_field, change) => {
    expect(hasUnpublishedChanges({ ...copy, ...change }, copy)).toBe(true);
  });

  it("counts a missing digest as a difference", () => {
    expect(
      hasUnpublishedChanges(
        { ...copy, versions: [{ ...en, body_md5: null }, fi] },
        copy,
      ),
    ).toBe(true);
  });
});

describe("libraryArticleInput", () => {
  it("trims text and keeps nulls", () => {
    expect(
      libraryArticleInput.parse({
        versions: [
          { locale: "fi", title: "  A title ", summary: " s ", body: "\n## Heading\n" },
        ],
        category: null,
        coverImageId: null,
      }),
    ).toEqual({
      versions: [{ locale: "fi", title: "A title", summary: "s", body: "## Heading" }],
      category: null,
      coverImageId: null,
    });
  });

  it("refuses no version, a blank title, a language twice, and a cover that is not a catalogue entry id", () => {
    const version = { locale: "en" as const, title: "T", summary: "", body: "" };
    const base = { versions: [version], category: null, coverImageId: null };
    expect(libraryArticleInput.safeParse(base).success).toBe(true);
    expect(libraryArticleInput.safeParse({ ...base, versions: [] }).success).toBe(
      false,
    );
    expect(
      libraryArticleInput.safeParse({
        ...base,
        versions: [{ ...version, title: "   " }],
      }).success,
    ).toBe(false);
    expect(
      libraryArticleInput.safeParse({ ...base, versions: [version, version] })
        .success,
    ).toBe(false);
    expect(
      libraryArticleInput.safeParse({
        ...base,
        coverImageId: `${"a".repeat(64)}.jpg`,
      }).success,
    ).toBe(false);
  });

  it("refuses a category the Library does not have, and a locale the site does not ship", () => {
    const version = { locale: "en" as const, title: "T", summary: "", body: "" };
    expect(
      libraryArticleInput.safeParse({
        versions: [version],
        category: "news",
        coverImageId: null,
      }).success,
    ).toBe(false);
    expect(
      libraryArticleInput.safeParse({
        versions: [{ ...version, locale: "de" }],
        category: null,
        coverImageId: null,
      }).success,
    ).toBe(false);
  });
});

describe("localizing a published article", () => {
  const article: PublishedLibraryArticle = {
    id: "a",
    category: "learning",
    coverPath: null,
    firstPublishedAt: "2026-09-01T00:00:00Z",
    publishedAt: "2026-09-02T00:00:00Z",
    versions: [
      { locale: "en", title: "Title", summary: "S", body: "B" },
      { locale: "fi", title: "Otsikko", summary: "T", body: "K" },
    ],
  };

  it("shows the reader's own version, else English, else the first written", () => {
    expect(localizeArticle(article, "fi")).toMatchObject({ locale: "fi", title: "Otsikko" });
    expect(localizeArticle(article, "sv")).toMatchObject({ locale: "en", title: "Title" });
    const finnishOnly = { ...article, versions: [article.versions[1]] };
    expect(localizeArticle(finnishOnly, "fr")).toMatchObject({ locale: "fi" });
  });
});

describe("LibraryService", () => {
  // The real client over a fake fetch transport (tests/mocks/postgrest-fetch),
  // so the genuine query builder builds every request.
  function serviceWith(fetchMock: FetchMock): LibraryService {
    return new LibraryService(createFetchStubbedClient(fetchMock));
  }

  it("creates with the slug mapped to the enum and nulls sent as omissions", async () => {
    const fetchMock: FetchMock = vi.fn(async () => postgrestJson("new-id"));
    const service = serviceWith(fetchMock);

    await expect(
      service.createArticle({
        versions: [{ locale: "en", title: "T", summary: "", body: "" }],
        category: "games_explained",
        coverImageId: null,
      }),
    ).resolves.toBe("new-id");

    const [input, init] = fetchMock.mock.calls[0];
    expect(requestedUrl(input).pathname).toBe("/rest/v1/rpc/create_library_article");
    // JSON drops an undefined key, so an omitted argument never reaches the
    // wire and the RPC's DEFAULT NULL applies.
    expect(JSON.parse(String(init?.body))).toEqual({
      p_versions: [{ locale: "en", title: "T", summary: "", body: "" }],
      p_category: "games_explained",
    });
  });

  it("saves a cover as the catalogue entry's id", async () => {
    const fetchMock: FetchMock = vi.fn(async () => postgrestJson("an-id"));
    const service = serviceWith(fetchMock);

    await service.saveArticle("an-id", {
      versions: [{ locale: "fi", title: "T", summary: "S", body: "B" }],
      category: null,
      coverImageId: COVER_A,
    });

    const [input, init] = fetchMock.mock.calls[0];
    expect(requestedUrl(input).pathname).toBe("/rest/v1/rpc/save_library_article");
    expect(JSON.parse(String(init?.body))).toEqual({
      p_id: "an-id",
      p_versions: [{ locale: "fi", title: "T", summary: "S", body: "B" }],
      p_cover_image_id: COVER_A,
    });
  });

  it("saves one language version, trimmed, and nothing else", async () => {
    const fetchMock: FetchMock = vi.fn(async () => postgrestJson("an-id"));
    const service = serviceWith(fetchMock);

    await service.saveArticleVersion("an-id", {
      locale: "sv",
      title: "  T  ",
      summary: "S ",
      body: " B",
    });

    const [input, init] = fetchMock.mock.calls[0];
    expect(requestedUrl(input).pathname).toBe(
      "/rest/v1/rpc/save_library_article_version",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      p_id: "an-id",
      p_locale: "sv",
      p_title: "T",
      p_summary: "S",
      p_body: "B",
    });
  });

  it("refuses a version with no title, or in a locale the site does not ship, without calling", async () => {
    const fetchMock: FetchMock = vi.fn();
    const service = serviceWith(fetchMock);

    await expect(
      service.saveArticleVersion("an-id", { locale: "en", title: " ", summary: "", body: "" }),
    ).rejects.toThrow();
    await expect(
      service.saveArticleVersion("an-id", {
        // @ts-expect-error -- a locale the site does not ship, which the schema must refuse
        locale: "de",
        title: "T",
        summary: "",
        body: "",
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sets the category alone, and clears it as an omission", async () => {
    const fetchMock: FetchMock = vi.fn(async () => postgrestJson("an-id"));
    const service = serviceWith(fetchMock);

    await service.setArticleCategory("an-id", "screen_time");
    await service.setArticleCategory("an-id", null);

    const [first, firstInit] = fetchMock.mock.calls[0];
    expect(requestedUrl(first).pathname).toBe(
      "/rest/v1/rpc/set_library_article_category",
    );
    expect(JSON.parse(String(firstInit?.body))).toEqual({
      p_id: "an-id",
      p_category: "screen_time",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      p_id: "an-id",
    });
  });

  it("sets the cover alone, clears it as an omission, and refuses a non-id", async () => {
    const fetchMock: FetchMock = vi.fn(async () => postgrestJson("an-id"));
    const service = serviceWith(fetchMock);

    await service.setArticleCover("an-id", COVER_B);
    await service.setArticleCover("an-id", null);
    await expect(service.setArticleCover("an-id", "cover.jpg")).rejects.toThrow();

    const [first, firstInit] = fetchMock.mock.calls[0];
    expect(requestedUrl(first).pathname).toBe(
      "/rest/v1/rpc/set_library_article_cover",
    );
    expect(JSON.parse(String(firstInit?.body))).toEqual({
      p_id: "an-id",
      p_cover_image_id: COVER_B,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      p_id: "an-id",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("answers a published read for a malformed id with null, without querying", async () => {
    const fetchMock: FetchMock = vi.fn();
    const service = serviceWith(fetchMock);

    await expect(service.getPublishedArticle("not-a-uuid")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers an admin read for a malformed id with null, without querying", async () => {
    const fetchMock: FetchMock = vi.fn();
    const service = serviceWith(fetchMock);

    await expect(service.getAdminArticle("not-a-uuid")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
