import type { MetadataRoute } from "next";
import { getPathname } from "@/i18n/navigation";
import type { StaticAppHref } from "@/lib/constants/routes";
import { INDEXED_LOCALES } from "@/lib/metadata/localized-page";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL!;

/**
 * The indexable route set, with the crawl hints each one carries. Index pages
 * only — no DB-backed per-product or per-municipality entries, and nothing
 * `noindex` (the programme pages, the API docs and every product page are all
 * deliberately absent).
 *
 * Each entry becomes one URL **per indexed locale**, and every one of those
 * carries the whole language set as `alternates.languages` — which is what tells
 * a search engine the four are one page in four languages rather than four
 * pages. Klingon is excluded here as it is from `hreflang`; see
 * `INDEXED_LOCALES`.
 */
const ROUTES: { pathname: StaticAppHref; entry: Omit<MetadataRoute.Sitemap[number], "url" | "alternates"> }[] = [
  { pathname: "/", entry: { changeFrequency: "weekly", priority: 1 } },
  { pathname: "/shop", entry: { changeFrequency: "weekly", priority: 0.8 } },
  { pathname: "/about", entry: { changeFrequency: "monthly", priority: 0.7 } },
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
 * No `lastModified` anywhere, deliberately.
 *
 * This function runs per request, so the only value it could put there is
 * "now" — which claims every URL on the site changed on every crawl. A search
 * engine that cannot trust a `lastmod` stops reading it, and one that is
 * always today is the clearest possible signal that it is generated rather
 * than true. We have no per-page modification time to offer (these are code-
 * and catalog-backed pages, not rows with an `updated_at`), and omitting the
 * field is a better answer than a fabricated one: the crawler falls back to
 * its own change detection, which is what it would do with a `lastmod` it
 * distrusted anyway. If a real per-page timestamp ever exists, that is the
 * thing to put here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.flatMap(({ pathname, entry }) => {
    const languages = Object.fromEntries(
      INDEXED_LOCALES.map((locale) => [locale, urlFor(pathname, locale)]),
    );

    return INDEXED_LOCALES.map((locale) => ({
      url: urlFor(pathname, locale),
      alternates: { languages },
      ...entry,
    }));
  });
}
