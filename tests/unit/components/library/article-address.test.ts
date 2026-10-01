import { describe, expect, it } from "vitest";
import {
  articleAddress,
  articleSlug,
  findArticleBySlug,
  type AddressableArticle,
} from "@/components/library/article-address";

const OLDER_ID = "482f0c6f-0fbc-4202-8790-a73a4520fb47";
const NEWER_ID = "5e0c7a3b-2f14-4e8d-9b6a-1d3c8f7e2a90";
const FINNISH_ID = "70f64c69-1681-4b3b-8ab6-420642e48598";

function article(
  id: string,
  firstPublishedAt: string,
  versions: AddressableArticle["versions"],
): AddressableArticle {
  return { id, firstPublishedAt: `${firstPublishedAt}T08:00:00Z`, versions };
}

const OLDER = article(OLDER_ID, "2026-05-01", [
  { locale: "en", title: "Screen time, explained" },
  { locale: "fi", title: "Ruutuaika selitettynä" },
]);
/** Retitled into the older article's English slug; its Finnish title is its own. */
const NEWER = article(NEWER_ID, "2026-08-01", [
  { locale: "en", title: "Screen Time — Explained!" },
  { locale: "fi", title: "Ruutuajan säännöt" },
]);
const FINNISH_ONLY = article(FINNISH_ID, "2026-06-01", [
  { locale: "fi", title: "Pelikerho koulupäivän jälkeen" },
]);

/** What is live, newest first — the order the list read hands it over in. */
const LIVE = [NEWER, FINNISH_ONLY, OLDER];

describe("an article's slug", () => {
  it("is derived from its title in that locale, accents folded", () => {
    expect(articleSlug(FINNISH_ONLY, "fi")).toBe("pelikerho-koulupaivan-jalkeen");
    expect(articleSlug(OLDER, "en")).toBe("screen-time-explained");
  });

  it("does not exist in a locale the article was not written in", () => {
    expect(articleSlug(FINNISH_ONLY, "en")).toBeNull();
  });
});

describe("resolving a slug", () => {
  it("finds the article whose title in the page's locale derives it", () => {
    expect(findArticleBySlug(LIVE, "fi", "ruutuajan-saannot")?.id).toBe(NEWER_ID);
    expect(findArticleBySlug(LIVE, "fi", "pelikerho-koulupaivan-jalkeen")?.id).toBe(
      FINNISH_ID,
    );
  });

  it("resolves in its own locale only", () => {
    expect(findArticleBySlug(LIVE, "en", "pelikerho-koulupaivan-jalkeen")).toBeNull();
    expect(findArticleBySlug(LIVE, "fi", "screen-time-explained")).toBeNull();
    expect(findArticleBySlug(LIVE, "sv", "screen-time-explained")).toBeNull();
  });

  it("gives a slug two titles derive to the older article, however the list is ordered", () => {
    expect(findArticleBySlug(LIVE, "en", "screen-time-explained")?.id).toBe(OLDER_ID);
    expect(
      findArticleBySlug([...LIVE].reverse(), "en", "screen-time-explained")?.id,
    ).toBe(OLDER_ID);
  });

  it("finds nothing for a slug no live title derives, or the empty slug", () => {
    expect(findArticleBySlug(LIVE, "en", "nothing-here")).toBeNull();
    expect(findArticleBySlug(LIVE, "en", "")).toBeNull();
  });
});

describe("an article's address", () => {
  it("is its slug in a locale it was written in", () => {
    expect(articleAddress(LIVE, OLDER, "en")).toBe("screen-time-explained");
    expect(articleAddress(LIVE, NEWER, "fi")).toBe("ruutuajan-saannot");
  });

  it("is its id where an older article's title takes the slug first", () => {
    expect(articleAddress(LIVE, NEWER, "en")).toBe(NEWER_ID);
  });

  it("is its id in a locale it was not written in", () => {
    expect(articleAddress(LIVE, FINNISH_ONLY, "en")).toBe(FINNISH_ID);
  });

  it("is its id for a title that derives no slug, or an article not in the list", () => {
    const unslugged = article(FINNISH_ID, "2026-06-01", [{ locale: "en", title: "李" }]);
    expect(articleAddress([unslugged], unslugged, "en")).toBe(FINNISH_ID);
    expect(articleAddress([OLDER], NEWER, "en")).toBe(NEWER_ID);
  });
});
