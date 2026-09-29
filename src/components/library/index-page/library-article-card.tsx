"use client";

import { useLocale } from "next-intl";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { AppHref } from "@/lib/constants/routes";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { LibraryCategory } from "../categories";
import { LibraryCategoryLabel } from "../library-category-label";
import { LibraryCover } from "../library-cover";

export interface LibraryArticleCardProps {
  /** Where the card opens: the article's own page. */
  href: AppHref;
  /**
   * An already-resolved image URL, or null for an article with no cover,
   * which paints the NO IMAGE placeholder in the same frame. Decorative: the
   * title beneath names the article, so it carries no alt.
   */
  coverSrc: string | null;
  title: string;
  summary: string;
  category: LibraryCategory;
  /**
   * When the article was first published — an instant, rendered as a date in
   * the reader's zone.
   */
  publishedAt: string;
}

/**
 * **One article, as a card that opens it** — the one card the Library draws,
 * on its index and under an article alike.
 *
 * The cover on top at 16:9, then the category, the title, a three-line summary
 * and the date along the bottom. A card without a cover keeps the same frame,
 * filled with the placeholder, so the grid stays even. The summary is clamped
 * and the cards are left to differ in height; a reserved height would be dead
 * space under every short summary.
 *
 * The whole card is the link, stretched from the title so the link's
 * accessible name is the title itself rather than a label written to repeat
 * it. That is also why the category here is words and not a link of its own:
 * a link inside the stretched one could not be reached.
 */
export function LibraryArticleCard({
  href,
  coverSrc,
  title,
  summary,
  category,
  publishedAt,
  titleAs: Title = "h2",
}: LibraryArticleCardProps & {
  /**
   * The title's heading level: `h2` in the index's grid, `h3` where the grid
   * sits under a heading of its own.
   */
  titleAs?: "h2" | "h3";
}) {
  const locale = useLocale();
  const timeZone = useTimezone();

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition-[box-shadow] focus-within:shadow-lg hover:shadow-lg">
      {/* The card's own width, breakpoint by breakpoint, read off the grid
          both pages share: one column in a `px-4` container, two from `sm`,
          three from `lg` inside the `max-w-6xl` column. Rounded up. */}
      <LibraryCover
        src={coverSrc}
        sizes="(min-width: 1152px) 368px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, calc(100vw - 2rem)"
        zoomOnHover
      />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <LibraryCategoryLabel category={category} />
        <Title className="line-clamp-3 text-base font-semibold">
          <Link
            href={href}
            className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-act"
          >
            {title}
          </Link>
        </Title>
        <p className="line-clamp-3 text-sm text-muted-foreground">{summary}</p>
        <p className="mt-auto pt-2 text-xs text-muted-foreground">
          <time dateTime={publishedAt}>
            {formatDate(publishedAt, locale, {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone,
            })}
          </time>
        </p>
      </div>
    </Card>
  );
}
