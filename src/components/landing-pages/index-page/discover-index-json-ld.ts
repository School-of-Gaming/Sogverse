import { organizationId } from "@/lib/seo/organization";
import type { DiscoverIndexEntry } from "./discover-index-props";

export interface DiscoverIndexJsonLdInput {
  /** The canonical site origin — `NEXT_PUBLIC_SITE_URL`. */
  siteUrl: string;
  /** The index's own path at the request's locale — its canonical. */
  path: string;
  /** The page's locale — the URL's. */
  locale: string;
  /** The index's `<title>` and meta description, the same words. */
  name: string;
  description: string;
  /** Exactly the entries the index renders, in its order. */
  entries: readonly DiscoverIndexEntry[];
}

/**
 * **The landing pages' index as one schema.org node**: a `CollectionPage`
 * whose `mainEntity` is an `ItemList` of the pages it lists.
 *
 * Built from the entries the index renders and nothing else, so it can never
 * name a page the reader does not see there. A list item carries its position,
 * the title its card shows and its page's canonical URL — the slug address of
 * the version the card shows — so no item points at a page that
 * canonicalises elsewhere, while the card's own link stays in the index's
 * locale for the reader. Every listed page is live, and every live landing
 * page is promoted. With no page live the node states none: an empty
 * `ItemList` would be a list asserting nothing, and the page is still a
 * collection of what it shows, which is no pages.
 *
 * The `publisher` names School of Gaming by the `@id` of the `Organization`
 * node the `[locale]` layout emits on every page. Pure, so the whole shape is
 * assertable without rendering a page.
 */
export function discoverIndexJsonLd({
  siteUrl,
  path,
  locale,
  name,
  description,
  entries,
}: DiscoverIndexJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    url: `${siteUrl}${path}`,
    name,
    description,
    inLanguage: locale,
    ...(entries.length > 0 && {
      mainEntity: {
        "@type": "ItemList",
        itemListElement: entries.map(({ card, canonicalPath }, index) => ({
          "@type": "ListItem",
          // 1-based, which is what schema.org's `position` means.
          position: index + 1,
          name: card.title,
          url: `${siteUrl}${canonicalPath}`,
        })),
      },
    }),
    publisher: {
      "@type": "Organization",
      "@id": organizationId(siteUrl),
      name: "School of Gaming",
    },
  };
}
