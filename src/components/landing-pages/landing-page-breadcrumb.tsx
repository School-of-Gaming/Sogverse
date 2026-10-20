import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { getPathname, Link } from "@/i18n/navigation";
import { ROUTES, type StaticAppHref } from "@/lib/constants/routes";
import type { SupportedLocale } from "@/lib/constants/locales";

/**
 * **Where a landing page sits: Home › the landing pages' index › the page.**
 * One trail, drawn twice from the same names — on the page, and as its
 * `BreadcrumbList` — so the structured data states exactly the trail a reader
 * sees.
 */
export interface LandingBreadcrumb {
  /** The home page's name in the page's locale, as the navigation says it. */
  homeName: string;
  /** The index's name in the page's locale, as the footer says it. */
  indexName: string;
  /** The page's title — the shown version's, the same words as `<title>`. */
  title: string;
}

/** The trail's two links, each to a page in the page's own locale. */
const TRAIL_LINKS: readonly { href: StaticAppHref; name: keyof LandingBreadcrumb }[] = [
  { href: ROUTES.home, name: "homeName" },
  { href: ROUTES.discover, name: "indexName" },
];

/**
 * The trail as schema.org's `BreadcrumbList`, with absolute URLs: the home
 * page and the index in the page's locale, as the visible links go, and the
 * page itself at its canonical — the slug address of the version shown — so
 * the last step names the address the page tells crawlers it is. Pure, so the
 * whole shape is assertable without rendering a page.
 */
export function landingBreadcrumbJsonLd({
  siteUrl,
  locale,
  canonicalPath,
  trail,
}: {
  /** The canonical site origin — `NEXT_PUBLIC_SITE_URL`. */
  siteUrl: string;
  /** The page's locale — the URL's. */
  locale: SupportedLocale;
  /** The page's canonical path (`landingPageCanonicalPath`). */
  canonicalPath: string;
  trail: LandingBreadcrumb;
}) {
  const steps = [
    ...TRAIL_LINKS.map(({ href, name }) => ({
      name: trail[name],
      url: `${siteUrl}${getPathname({ href, locale })}`,
    })),
    { name: trail.title, url: `${siteUrl}${canonicalPath}` },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: steps.map(({ name, url }, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: url,
    })),
  };
}

/**
 * **The trail, on the page**: a quiet line above the hero, the two links and
 * then the page's own title as plain text marked current. The title carries
 * the language of the version shown where it is not the page's, as the body
 * beneath it does.
 */
export function LandingPageBreadcrumb({
  trail,
  label,
  textLocale,
  locale,
}: {
  trail: LandingBreadcrumb;
  /** The trail's accessible name — "Breadcrumb", in the page's locale. */
  label: string;
  /** The language the shown version is written in. */
  textLocale: SupportedLocale;
  /** The page's locale — the URL's. */
  locale: SupportedLocale;
}) {
  return (
    // The hero's own container and column, so the trail starts where the
    // headline and the picture do.
    <nav aria-label={label} className="container mx-auto px-4 pt-6">
      <ol className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {TRAIL_LINKS.map(({ href, name }) => (
          <Fragment key={href}>
            <li>
              <Link href={href} className="hover:text-foreground">
                {trail[name]}
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="h-3 w-3" />
            </li>
          </Fragment>
        ))}
        <li
          aria-current="page"
          // exact-locale: marks text written in another language than the page with lang
          lang={textLocale === locale ? undefined : textLocale}
          className="text-foreground"
        >
          {trail.title}
        </li>
      </ol>
    </nav>
  );
}
