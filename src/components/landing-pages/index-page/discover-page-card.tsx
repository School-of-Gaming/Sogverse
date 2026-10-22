import { Heading } from "@sog/ui";
import { useLocale } from "next-intl";
import { Card } from "@/components/ui/card";
import { FramedImage } from "@/components/ui/framed-image";
import { Link } from "@/i18n/navigation";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { AppHref } from "@/lib/constants/routes";

export interface DiscoverPageCardProps {
  /** The page's id, which keys the card in a list: titles need not be unique. */
  id: string;
  /** Where the card opens: the page's own address, in the index's locale. */
  href: AppHref;
  /**
   * The language the title and summary are written in, marked on them where
   * it is not the page's — a card showing the English fallback on a Swedish
   * index is English text, and a screen reader should say it as such.
   */
  textLocale: SupportedLocale;
  /**
   * The picture the page leads with, resolved, or null when its hero has
   * none. Decorative: the title beneath names the page, so it carries no alt.
   */
  pictureSrc: string | null;
  title: string;
  summary: string;
}

/**
 * **One landing page, as a card that opens it.** Its lead picture on top at
 * 16:9 where it has one, then its title and a three-line summary — the words
 * an admin wrote for a search result, which is what a card is too.
 *
 * A page without a picture has no frame rather than the NO IMAGE placeholder:
 * a landing page's hero needs no picture, so its absence is a design rather
 * than a gap, and the cards are left to differ in height, as the Library's do.
 *
 * The whole card is the link, stretched from the title so the link's
 * accessible name is the title itself.
 */
export function DiscoverPageCard({
  href,
  textLocale,
  pictureSrc,
  title,
  summary,
}: DiscoverPageCardProps) {
  const locale = useLocale();
  // exact-locale: marks text written in another language than the page with lang
  const lang = textLocale === locale ? undefined : textLocale;

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition-[box-shadow] focus-within:shadow-lg hover:shadow-lg">
      {pictureSrc !== null && (
        // The card's own width per breakpoint, read off the index's grid: one
        // column in a `px-4` container, two from `sm`, three from `lg` inside
        // the `max-w-6xl` column. Rounded up.
        <FramedImage
          purpose="landing_image"
          src={pictureSrc}
          sizes="(min-width: 1152px) 368px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, calc(100vw - 2rem)"
          zoomOnHover
        />
      )}

      <div className="flex flex-1 flex-col gap-2 p-4" lang={lang}>
        <div className="line-clamp-3">
          <Heading level={2} step="card-title">
            <Link
              href={href}
              className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-act"
            >
              {title}
            </Link>
          </Heading>
        </div>
        <p className="line-clamp-3 text-sm text-muted-foreground">{summary}</p>
      </div>
    </Card>
  );
}
