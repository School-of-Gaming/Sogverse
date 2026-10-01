import type { MetadataRoute } from "next";
import { createAnonClient } from "@/lib/supabase/anon";
import { teamMemberAddress } from "@/components/team/team-address";
import { teamMemberLocales } from "@/components/team/public/team-member-metadata";
import { articleAddress } from "@/components/library/article-address";
import { libraryArticleLocales } from "@/components/library/article/article-metadata";
import { SHOP_PRODUCT_TYPES } from "@/components/public/products/shop-categories";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { StaticAppHref } from "@/lib/constants/routes";
import { INDEXED_LOCALES } from "@/lib/metadata/localized-page";
import { translatedPageLocales } from "@/lib/metadata/translated-page";
import {
  productPagePath,
  productWrittenRows,
} from "@/lib/products/product-metadata";
import { LibraryService } from "@/services/library/library.service";
import { ProductsService } from "@/services/products/products.service";
import { TeamProfilesService } from "@/services/team-profiles/team-profiles.service";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL!;

/**
 * **Rendered per request.** The Team's profiles, the Library's articles and
 * the shop's listed products are read from the database, so the sitemap is no
 * longer a build artefact: a profile made public or hidden, an article
 * published or unpublished, or a product listed, unlisted or ended, is in or
 * out of the next fetch, as it is on the pages themselves, and no build has to
 * reach a database (CI's smoke build, a preview deploy built before its
 * migration ran). A crawler fetches it rarely, and each fetch is one read of
 * the public team, one of the live articles and one of the shop's listing.
 */
export const dynamic = "force-dynamic";

/**
 * The indexable static route set, with the crawl hints each one carries. No
 * per-municipality entries, and nothing `noindex` (the programme pages, the API
 * docs and the schools tree are all deliberately absent). The database-backed
 * sets are the Team's profiles, the Library's articles and the shop's listed
 * products, below.
 *
 * Each entry becomes one URL **per indexed locale**, and every one of those
 * carries the whole language set as `alternates.languages` — which is what tells
 * a search engine the four are one page in four languages rather than four
 * pages. Klingon is excluded here as it is from `hreflang`; see
 * `INDEXED_LOCALES`.
 */
const ROUTE_ENTRIES: { pathname: StaticAppHref; entry: Omit<MetadataRoute.Sitemap[number], "url" | "alternates"> }[] = [
  { pathname: "/", entry: { changeFrequency: "weekly", priority: 1 } },
  { pathname: "/shop", entry: { changeFrequency: "weekly", priority: 0.8 } },
  { pathname: "/about", entry: { changeFrequency: "monthly", priority: 0.7 } },
  { pathname: "/team", entry: { changeFrequency: "weekly", priority: 0.6 } },
  { pathname: "/library", entry: { changeFrequency: "weekly", priority: 0.6 } },
  { pathname: "/login", entry: { changeFrequency: "yearly", priority: 0.5 } },
  { pathname: "/register", entry: { changeFrequency: "yearly", priority: 0.5 } },
  { pathname: "/privacy", entry: { changeFrequency: "yearly", priority: 0.3 } },
  {
    pathname: "/terms-and-conditions",
    entry: { changeFrequency: "yearly", priority: 0.3 },
  },
  {
    pathname: "/anti-bullying-and-discipline",
    entry: { changeFrequency: "yearly", priority: 0.3 },
  },
  {
    pathname: "/attributions",
    entry: { changeFrequency: "yearly", priority: 0.3 },
  },
];

/**
 * Every URL is built with `getPathname` from the routing pathnames map, never
 * by joining a base to a hand-written slug: a translated slug edited in the map
 * and restated here would put a 404 in the sitemap, and the map is the only
 * thing that knows `/shop` is `/fr/boutique`.
 */
function urlFor(pathname: StaticAppHref, locale: (typeof INDEXED_LOCALES)[number]) {
  return `${baseUrl}${getPathname({ href: pathname, locale })}`;
}

/**
 * One URL per locale in `locales`, each carrying the whole set as its
 * language alternates.
 */
function localizedEntries(
  locales: readonly SupportedLocale[],
  urlAt: (locale: SupportedLocale) => string,
  entry: Omit<MetadataRoute.Sitemap[number], "url" | "alternates">,
): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    locales.map((locale) => [locale, urlAt(locale)]),
  );
  return locales.map((locale) => ({
    url: urlAt(locale),
    alternates: { languages },
    ...entry,
  }));
}

/** The public team, read with the anon key and no cookies. */
async function readPublicTeam() {
  const supabase = createAnonClient();
  return new TeamProfilesService(supabase).listPublicTeamProfiles();
}

/**
 * Each public profile at its canonical address, in the indexed locales the
 * person wrote — the language versions its own `hreflang` names, and nothing
 * else: a locale they did not write canonicalises to one they did, so it is
 * not a page of its own. Read anonymously with no cookies, which is all the
 * public read needs and keeps the response the same for whoever asks.
 *
 * **A failed read leaves the profiles out rather than failing the sitemap.**
 * A sitemap is a set of hints, not a declaration of everything that exists:
 * a fetch missing the profiles costs nothing the next fetch does not restore,
 * while a failing sitemap takes every other URL down with them.
 */
async function teamEntries(): Promise<MetadataRoute.Sitemap> {
  const team = await readPublicTeam().catch((error: unknown) => {
    console.error("[sitemap] the public team was not read:", error);
    return null;
  });
  if (team === null) return [];
  return team.flatMap((person) => {
    const address = teamMemberAddress(team, person);
    return localizedEntries(
      teamMemberLocales(person),
      (locale) =>
        `${baseUrl}${getPathname({ href: ROUTES.teamMember(address), locale })}`,
      { changeFrequency: "monthly", priority: 0.5 },
    );
  });
}

/** The live Library articles, read with the anon key and no cookies. */
async function readLiveArticles() {
  return new LibraryService(createAnonClient()).listPublishedArticles();
}

/**
 * Each live article at its slug address in every indexed locale it was
 * written in — the language versions its own `hreflang` names, and nothing
 * else: a locale it was not written in canonicalises to one it was, so it is
 * not a page of its own. Read anonymously with no cookies, like the team, and
 * left out on a failed read for the same reason.
 *
 * **Dated by when its live versions were published** — the one real
 * per-page modification time the sitemap has (see below).
 */
async function libraryEntries(): Promise<MetadataRoute.Sitemap> {
  const published = await readLiveArticles().catch((error: unknown) => {
    console.error("[sitemap] the live Library articles were not read:", error);
    return null;
  });
  if (published === null) return [];
  return published.flatMap((article) =>
    localizedEntries(
      libraryArticleLocales(article),
      (locale) =>
        `${baseUrl}${getPathname({
          href: ROUTES.libraryArticle(articleAddress(published, article, locale)),
          locale,
        })}`,
      {
        lastModified: article.publishedAt,
        changeFrequency: "monthly",
        priority: 0.5,
      },
    ),
  );
}

/** The shop's listing, read with the anon key and no cookies. */
async function readListedProducts() {
  return new ProductsService(createAnonClient()).listVisibleListingByTypes(
    SHOP_PRODUCT_TYPES,
  );
}

/**
 * Each product on the shop's listing — the products whose pages are promoted,
 * by the very query the shop grid reads — at its shop address in every indexed
 * locale its text was written in: the language versions its own `hreflang`
 * names. An unlisted, ended or municipality product is not on the listing, so
 * it is not here. Read anonymously and left out on a failed read, like the
 * team.
 *
 * **Undated.** A product row does carry an update time, but the page shows
 * more than the row — seats left and whether registration is open change with
 * every signup and with the clock, and the prices and schedule live in other
 * tables — so that time is not when the page changed.
 */
async function productEntries(): Promise<MetadataRoute.Sitemap> {
  const listed = await readListedProducts().catch((error: unknown) => {
    console.error("[sitemap] the shop listing was not read:", error);
    return null;
  });
  if (listed === null) return [];
  return listed.flatMap((product) =>
    localizedEntries(
      translatedPageLocales(productWrittenRows(product.product_translations)),
      (locale) => `${baseUrl}${productPagePath(product.id)(locale)}`,
      { changeFrequency: "weekly", priority: 0.6 },
    ),
  );
}

/**
 * `lastModified` only where the date is real: a Library article's.
 *
 * We have no per-page modification time for anything else: the static routes
 * are code- and catalog-backed pages, not rows with an `updated_at`, a
 * profile's read carries no date either, and a product's update time is not
 * when its page changed (above). The only value available would be the
 * time of the fetch — one date on every URL whether or not that page changed —
 * and a search engine that cannot trust a `lastmod` stops reading it; one that
 * moves in lockstep across every URL is the clearest possible signal that it
 * is generated rather than true. Omitting the field is a better answer than a
 * fabricated one: the crawler falls back to its own change detection, which
 * is what it would do with a `lastmod` it distrusted anyway. An article is
 * the exception because publishing is what changes it, and the publish time
 * is stored.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = ROUTE_ENTRIES.flatMap(({ pathname, entry }) =>
    localizedEntries(INDEXED_LOCALES, (locale) => urlFor(pathname, locale), entry),
  );
  const [team, library, products] = await Promise.all([
    teamEntries(),
    libraryEntries(),
    productEntries(),
  ]);
  return [...routes, ...team, ...library, ...products];
}
