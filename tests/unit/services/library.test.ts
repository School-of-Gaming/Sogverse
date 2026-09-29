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
  type ComparableArticleCopy,
} from "@/services/library/library.contracts";
import { LibraryService } from "@/services/library/library.service";

const COVER_A = "4c3f3a4e-5f0b-4b9e-9d0e-5b7d9a1f2c01";
const COVER_B = "8a6e2d1c-3b4f-4e5a-8c7d-6f9e0a1b2c02";

describe("hasUnpublishedChanges", () => {
  const copy: ComparableArticleCopy = {
    title: "Title",
    summary: "Summary",
    category: "learning",
    cover_image_id: COVER_A,
    body_md5: "d41d8cd98f00b204e9800998ecf8427e",
  };

  it("is false for an article that is not live", () => {
    expect(hasUnpublishedChanges(copy, null)).toBe(false);
  });

  it("is false when the two copies match", () => {
    expect(hasUnpublishedChanges(copy, { ...copy })).toBe(false);
  });

  it.each([
    ["title", { title: "Other" }],
    ["summary", { summary: "Other" }],
    ["category", { category: "screen_time" }],
    ["cover", { cover_image_id: COVER_B }],
    ["cover's presence", { cover_image_id: null }],
    ["body", { body_md5: "0cc175b9c0f1b6a831c399e269772661" }],
  ] as const)("is true when the %s differs", (_field, change) => {
    expect(hasUnpublishedChanges({ ...copy, ...change }, copy)).toBe(true);
  });

  it("counts a missing digest as a difference", () => {
    expect(hasUnpublishedChanges({ ...copy, body_md5: null }, copy)).toBe(true);
  });
});

describe("libraryArticleInput", () => {
  it("trims text and keeps nulls", () => {
    expect(
      libraryArticleInput.parse({
        title: "  A title ",
        summary: " s ",
        body: "\n## Heading\n",
        category: null,
        coverImageId: null,
      }),
    ).toEqual({
      title: "A title",
      summary: "s",
      body: "## Heading",
      category: null,
      coverImageId: null,
    });
  });

  it("refuses a blank title and a cover that is not a catalogue entry id", () => {
    const base = { summary: "", body: "", category: null, coverImageId: null };
    expect(libraryArticleInput.safeParse({ ...base, title: "   " }).success).toBe(
      false,
    );
    expect(
      libraryArticleInput.safeParse({
        ...base,
        title: "T",
        coverImageId: `${"a".repeat(64)}.jpg`,
      }).success,
    ).toBe(false);
    expect(
      libraryArticleInput.safeParse({ ...base, title: "T", coverImageId: COVER_A })
        .success,
    ).toBe(true);
  });

  it("refuses a category the Library does not have", () => {
    expect(
      libraryArticleInput.safeParse({
        title: "T",
        summary: "",
        body: "",
        category: "news",
        coverImageId: null,
      }).success,
    ).toBe(false);
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
        title: "T",
        summary: "",
        body: "",
        category: "games_explained",
        coverImageId: null,
      }),
    ).resolves.toBe("new-id");

    const [input, init] = fetchMock.mock.calls[0];
    expect(requestedUrl(input).pathname).toBe("/rest/v1/rpc/create_library_article");
    // JSON drops an undefined key, so an omitted argument never reaches the
    // wire and the RPC's DEFAULT NULL applies.
    expect(JSON.parse(String(init?.body))).toEqual({
      p_title: "T",
      p_summary: "",
      p_body: "",
      p_category: "games_explained",
    });
  });

  it("saves a cover as the catalogue entry's id", async () => {
    const fetchMock: FetchMock = vi.fn(async () => postgrestJson("an-id"));
    const service = serviceWith(fetchMock);

    await service.saveArticle("an-id", {
      title: "T",
      summary: "S",
      body: "B",
      category: null,
      coverImageId: COVER_A,
    });

    const [input, init] = fetchMock.mock.calls[0];
    expect(requestedUrl(input).pathname).toBe("/rest/v1/rpc/save_library_article");
    expect(JSON.parse(String(init?.body))).toEqual({
      p_id: "an-id",
      p_title: "T",
      p_summary: "S",
      p_body: "B",
      p_cover_image_id: COVER_A,
    });
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
