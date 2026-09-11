import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import {
  resolveLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import type { StaticAppHref } from "@/lib/constants/routes";
import { ogCardImage } from "@/lib/og/card-metadata";

/**
 * The locales that appear in `hreflang` annotations and in the sitemap.
 *
 * **Klingon is excluded, deliberately.** It gets working URLs like any locale,
 * but an easter egg does not belong in search results or in an
 * alternate-language annotation — a search engine offering a reader the Klingon
 * page as "their language" is the failure this prevents. Its pages carry
 * `noindex` instead of a robots disallow, because a disallowed URL is never
 * fetched and so the tag would never be read.
 */
export const INDEXED_LOCALES: readonly SupportedLocale[] =
  SUPPORTED_LOCALES.filter((locale) => locale !== "tlh");

/**
 * The `alternates` + `openGraph` block an indexable public page emits, built
 * from its route and the locale it is being rendered in.
 *
 * **Alternates are per-page, never layout-level**, and this helper is why they
 * can be: a layout has no pathname, so it cannot compute a self-referencing
 * canonical, and Next's metadata merge would cascade one layout-level canonical
 * onto every page under it. Each page in scope calls this from its own
 * `generateMetadata` with its own pathnames key, and the URLs come out of
 * `getPathname` — never hand-built — so a translated slug and its `hreflang`
 * cannot disagree.
 *
 * Three things it emits, each for its own reason:
 *
 * - **`languages`**, one entry per indexed locale, plus **`x-default` pointing
 *   at the bare URL**. The bare URL is the language detector — it redirects by
 *   the cookie → `Accept-Language` → English ladder — which is exactly what
 *   Google documents `x-default` for.
 * - **A self-referencing `canonical`**, the page's own external URL, so each
 *   language's page is the canonical of itself rather than of some other
 *   locale's.
 * - **`openGraph.locale`**, and the card image with it — because Next *assigns*
 *   a child's `openGraph` over its parent's rather than merging them, so a page
 *   that declares the block at all loses the layout's card. `type` and
 *   `siteName` are restated for the same reason; they are verbatim copies of
 *   the root layout's values rather than a second decision, so keep them in
 *   step. The title and description are deliberately absent: Next fills those
 *   from the page's own resolved `title`/`description`, which is what a page
 *   that has not thought about its card wants.
 *
 * A page that declares its own `openGraph` (login and register both do) spreads
 * this result's block into its own rather than replacing it, or it drops the
 * image again.
 */
export async function localizedPageMetadata(
  pathname: StaticAppHref,
  // Narrowed rather than demanded: `getLocale()` is typed as a bare string, and
  // validating here is what keeps every call site from restating the same
  // guard. The URL locale has already been validated by the `[locale]` layout,
  // so the fallback is unreachable in practice.
  requestLocale: string,
): Promise<Metadata> {
  const locale = resolveLocale(requestLocale);
  const languages = Object.fromEntries(
    INDEXED_LOCALES.map((alternate) => [
      alternate,
      getPathname({ href: pathname, locale: alternate }),
    ]),
  );

  return {
    alternates: {
      canonical: getPathname({ href: pathname, locale }),
      languages: { ...languages, "x-default": pathname },
    },
    openGraph: {
      type: "website",
      siteName: "School of Gaming",
      locale,
      images: [await ogCardImage("site", locale)],
    },
  };
}
