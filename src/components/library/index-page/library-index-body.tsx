import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BookOpen } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AppHref } from "@/lib/constants/routes";
import { cn } from "@/lib/utils";
import { LibraryClosingCta } from "../library-closing-cta";
import {
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_MESSAGE_KEY,
  type LibraryCategory,
} from "../categories";
import {
  LibraryArticleCard,
  type LibraryArticleCardProps,
} from "./library-article-card";

export interface LibraryIndexBodyProps {
  /** The published articles in the selected category — all of them under "All" — newest first. */
  articles: readonly LibraryArticleCardProps[];
  /** The category the index is filtered to, or `null` for all of them. */
  selectedCategory: LibraryCategory | null;
  /**
   * Where each filter chip goes: the index filtered to that category, or
   * unfiltered for `all`. The route resolves them to `?category=`.
   */
  filterHrefs: Record<LibraryCategory | "all", AppHref>;
}

/**
 * **The Library index — every article, newest first, filterable by category.**
 *
 * Presentational and props-driven: the page's data shell hands it the cards,
 * already filtered, every link already resolved. Top to bottom:
 *
 * - **The hero.** The public-page headline treatment — one phrase in act, a
 *   world rule under the headline — kept compact, because the articles are
 *   what the page is for and the first one should be on the first screen of a
 *   phone. The headline names the Library as ours, and the intro says what
 *   is in it. It runs the container's full width.
 * - **The filter.** One chip per category after "All", the selected one
 *   filled. Each is a link to its own address, so a filtered view can be
 *   shared and the back button walks the filters.
 * - **The grid.** One column on a phone, two from `sm`, three from `lg`. With
 *   nothing to show it says so in its place.
 * - **The closing call to action**, the home page's closing card: the one
 *   place the page turns from reading to doing.
 */
export function LibraryIndexBody({
  articles,
  selectedCategory,
  filterHrefs,
}: LibraryIndexBodyProps) {
  const t = useTranslations("library");

  return (
    <div className="container mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <header>
        {/* The headline and its rule are centred; the wrapper shrinks to the
            headline's longest line, so the rule runs exactly its measure. */}
        <div className="mx-auto w-fit text-center">
          <h1 className="text-h1-mobile font-bold tracking-tight md:text-5xl">
            {t.rich("index.title", {
              act: (chunks) => <span className="text-act">{chunks}</span>,
            })}
          </h1>
          <span className="mt-4 block h-1.5 w-full rounded-full bg-world" />
        </div>
        <p className="mt-5 text-base text-muted-foreground sm:text-lg">
          {t("index.intro")}
        </p>
      </header>

      <nav aria-label={t("index.filterLabel")} className="mt-8">
        <ul className="flex flex-wrap gap-2">
          <li>
            <FilterChip href={filterHrefs.all} selected={selectedCategory === null}>
              {t("index.all")}
            </FilterChip>
          </li>
          {LIBRARY_CATEGORIES.map((category) => (
            <li key={category}>
              <FilterChip
                href={filterHrefs[category]}
                selected={selectedCategory === category}
              >
                {t(`categories.${LIBRARY_CATEGORY_MESSAGE_KEY[category]}`)}
              </FilterChip>
            </li>
          ))}
        </ul>
      </nav>

      {articles.length > 0 ? (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <li key={article.title}>
              <LibraryArticleCard {...article} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-8 flex flex-col items-center py-16 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-4 font-medium">{t("index.empty")}</p>
        </div>
      )}

      <LibraryClosingCta className="mt-16 sm:mt-24" />
    </div>
  );
}

/**
 * One filter, drawn as the shop's filter chips are — the chosen one filled in
 * act, the rest outlined — but as a link, because here the choice is an
 * address rather than local state.
 *
 * `scroll={false}`: the chips, the hero and everything above the grid survive
 * a change of filter, so the page must not jump back to the top under a reader
 * who has scrolled to the chips; only the grid beneath them changes.
 */
function FilterChip({
  href,
  selected,
  children,
}: {
  href: AppHref;
  selected: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act",
        selected
          ? "bg-act text-act-foreground shadow-sm"
          : "bg-background text-foreground hover:bg-hover",
      )}
    >
      {children}
    </Link>
  );
}
