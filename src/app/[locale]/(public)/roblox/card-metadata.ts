import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { resolveLocale } from "@/lib/constants/locales";
import { ogCardImage } from "@/lib/og/card-metadata";

/**
 * The programme's social card, as the four pages that carry it declare it.
 *
 * **All four declare it explicitly.** The card used to reach the three
 * sub-pages through the `opengraph-image` file convention, which is gone (see
 * `@/lib/og/cards`) — and a sub-page that declared nothing would now fall back
 * to the site-wide card, so the link a family is sent to the privacy policy
 * would unfurl as something else entirely.
 *
 * The copy was French for every locale while the URL could not carry one: the
 * programme is shared into French channels, and a preview card is composed for
 * whoever the link is *sent* to. Locale-prefixed routing retires that
 * reasoning — `/fr/roblox` pins French for any recipient — so the card follows
 * the URL like every other, with today's French wording as the `fr` values.
 *
 * `type`, `siteName` and `card` are restated rather than inherited: Next
 * *assigns* a child's `openGraph` and `twitter` blocks over the parent's rather
 * than merging them, so declaring either block at all discards every key the
 * root set. They are verbatim copies of the root layout's values, not a second
 * decision — the repetition is what Next's merge costs, so keep them in step.
 */
export async function robloxCardMetadata(): Promise<Metadata> {
  const locale = resolveLocale(await getLocale());
  const t = await getTranslations({ locale, namespace: "metadata.og.roblox" });
  const image = await ogCardImage("roblox", locale);
  const title = t("title");
  const description = t("description");

  return {
    description,
    openGraph: {
      type: "website",
      siteName: "School of Gaming",
      title,
      description,
      locale,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

/** The whole of a programme page's metadata, shared by its three addresses. */
export async function programmePageMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  const card = await robloxCardMetadata();
  return {
    // The tab title follows the viewer's locale like every other page. So does
    // the card now: the programme's copy was French for every locale while the
    // URL could not carry one, and `/fr/roblox` pins French for whoever it is
    // sent to — so `openGraph` and `twitter` read the catalog like everything
    // else, with today's French wording as the `fr` values.
    title: t("roblox"),
    // The card's description, its `openGraph` and its `twitter` block, all at
    // this URL's locale — see `robloxCardMetadata` above, which the three
    // sub-pages share.
    ...card,
    // Copy is still pending SOG and Roblox signoff, so the page is shared by URL
    // rather than published. This tag is what actually keeps it out of search
    // results; the route is deliberately absent from sitemap.ts and has no nav
    // link anywhere.
    //
    // Note it is NOT disallowed in robots.txt, which would be the intuitive move
    // and is the wrong one: a disallowed URL is never fetched, so the crawler
    // never reads this tag, and the URL can still be indexed bare off an
    // external link. Disallow also publishes the path to anyone who reads
    // robots.txt. Allowing the crawl and serving noindex is what deindexes.
    robots: { index: false, follow: false },
  };
}
