"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { Link } from "@/i18n/navigation";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { AppHref } from "@/lib/constants/routes";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { LibraryCategory } from "../categories";
import {
  LibraryArticleCard,
  type LibraryArticleCardProps,
} from "../index-page/library-article-card";
import { LibraryCategoryLabel } from "../library-category-label";
import { LibraryCover } from "../library-cover";
import { LibraryClosingCta } from "../library-closing-cta";
import { readingMinutes } from "./reading-time";
import { ShareSection } from "./share-section";

/**
 * A Library article as its page renders it: the five fields an admin writes
 * (title, summary, category, body, cover) and the two derived facts the page
 * shows: the date it was first published, and its reading time, which the
 * page counts from the body itself.
 */
export interface LibraryArticle {
  title: string;
  /** The standfirst: plain text, set under the title. */
  summary: string;
  category: LibraryCategory;
  /**
   * When the article was first published — an instant, not a calendar date,
   * so it renders as a date in the reader's zone. A later edit does not move
   * it.
   */
  publishedAt: string;
  /**
   * The cover's address, or null for an article published without one, which
   * paints the NO IMAGE placeholder in the same frame. Decorative — the title
   * above it names the article.
   */
  coverSrc: string | null;
  /** Authored markdown, rendered through the `article` variant. */
  bodyMarkdown: string;
}

/**
 * What the page draws. A published article always has a category; the admin
 * preview of a draft saved without one draws the page with no eyebrow rather
 * than refusing to draw it.
 */
export type LibraryArticlePageContent = Omit<LibraryArticle, "category"> & {
  category: LibraryCategory | null;
  /**
   * The language the title, summary and body are written in — the page's
   * own, or a fallback's, which the page marks on them.
   */
  locale: SupportedLocale;
};

/** Everything the page draws, the in-app destinations around the article included. */
export interface ArticlePageBodyProps {
  article: LibraryArticlePageContent;
  /** The Library's own page — the back link's destination. */
  libraryHref: AppHref;
  /**
   * The index filtered to this article's category — where its eyebrow goes.
   * Null exactly when the article has no category, and so no eyebrow.
   */
  categoryHref: AppHref | null;
  /** The article's absolute, canonical address, as it is shared. */
  shareUrl: string;
  /**
   * The articles offered next, already chosen by `selectMoreFromLibrary` and
   * resolved to cards. With none, the section is not drawn.
   */
  moreArticles: readonly LibraryArticleCardProps[];
}

/**
 * **A Library article, the page a parent lands on from a search result or a
 * shared link.**
 *
 * One reading column, top to bottom, because the article is the page. The
 * column is the comfortable measure for body copy at this size (`max-w-2xl`,
 * about 70 characters), and everything in the article shares its edges — the
 * back link, the category, the title, the cover, the body, the share row and
 * the invitation — so the eye never has to find a new left margin. The article
 * ends on sharing it and then on the invitation to try a club: what we want of
 * the reader comes after they have had what they came for.
 *
 * "More from the Library" follows the article rather than sitting inside it,
 * at the index's own width with the index's own card, because it is a way
 * onward and not part of the text: three cards squeezed into the reading
 * column would be a narrow card no other page draws.
 */
export function ArticlePageBody({
  article,
  libraryHref,
  categoryHref,
  shareUrl,
  moreArticles,
}: ArticlePageBodyProps) {
  const t = useTranslations("library");
  const locale = useLocale();
  const timeZone = useTimezone();
  // The article's words carry its language where it is not the page's; the
  // chrome around them — the eyebrow, the date, sharing — is the page's own.
  const lang = article.locale === locale ? undefined : article.locale;

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <article className="mx-auto max-w-2xl">
        <nav aria-label={t("article.breadcrumbLabel")}>
          <Link
            href={libraryHref}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            {t("name")}
          </Link>
        </nav>

        <header className="mt-6">
          {article.category !== null && (
            <LibraryCategoryLabel
              category={article.category}
              href={categoryHref ?? undefined}
            />
          )}
          <div lang={lang}>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-4xl">
              {article.title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {article.summary}
            </p>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            <time dateTime={article.publishedAt}>
              {formatDate(article.publishedAt, locale, {
                dateStyle: "long",
                timeZone,
              })}
            </time>
            <span className="before:mx-1.5 before:content-['·']">
              {t("readingTime", {
                minutes: readingMinutes(article.bodyMarkdown),
              })}
            </span>
          </p>
        </header>

        {/* Eager: the cover is above the fold on every width. The widths
            are the column's — 42rem from `md`, the `px-4` container's inner
            width below it. */}
        <LibraryCover
          src={article.coverSrc}
          eager
          sizes="(min-width: 768px) 672px, calc(100vw - 2rem)"
          className="mt-8 rounded-lg border border-border"
        />

        <div lang={lang} className="mt-8">
          <Markdown variant="article">{article.bodyMarkdown}</Markdown>
        </div>

        <ShareSection url={shareUrl} title={article.title} />

        <LibraryClosingCta className="mt-10" />
      </article>

      {moreArticles.length > 0 && (
        <section
          aria-labelledby="library-more-heading"
          className="mx-auto mt-16 max-w-6xl sm:mt-24"
        >
          <h2
            id="library-more-heading"
            className="text-xl font-bold tracking-tight sm:text-2xl"
          >
            {t("article.more")}
          </h2>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {moreArticles.map((more) => (
              <li key={more.id}>
                <LibraryArticleCard {...more} titleAs="h3" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
