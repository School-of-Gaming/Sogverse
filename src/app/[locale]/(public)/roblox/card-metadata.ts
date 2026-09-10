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
