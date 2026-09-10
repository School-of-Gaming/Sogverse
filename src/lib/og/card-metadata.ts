import { getTranslations } from "next-intl/server";
import type { SupportedLocale } from "@/lib/constants/locales";
import { OG_CARD_SIZE, ogCardUrl, type OgCard } from "./cards";

/**
 * The `openGraph.images` entry a page emits for one of the cards, at the page's
 * own locale.
 *
 * **Pages emit this explicitly** — the file convention that used to do it is
 * gone (see `./cards`), and the card's URL now carries a locale only the page
 * knows. It is one object shared by `openGraph.images` and the twitter image,
 * because Next replaces a child's `twitter` block wholesale rather than merging
 * it and the two must not drift apart.
 *
 * The alt text is the card's own copy at the card's locale, so a reader on a
 * screen reader gets what the picture says rather than a brand name.
 */
export async function ogCardImage(
  card: OgCard,
  locale: SupportedLocale,
): Promise<{ url: string; alt: string; width: number; height: number }> {
  const t = await getTranslations({ locale, namespace: "metadata.og" });
  // The programme card's alt is its title verbatim — the card *is* the title,
  // drawn — while the site-wide card carries a sentence of its own.
  const alt = card === "site" ? t("site.alt") : t("roblox.title");

  return { url: ogCardUrl(card, locale), alt, ...OG_CARD_SIZE };
}
