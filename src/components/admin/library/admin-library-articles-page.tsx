"use client";

import { useMemo } from "react";
import { Clock, Languages, Plus, Tag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import {
  AdminListSearchField,
  AdminListShowingLine,
} from "@/components/admin/admin-list-narrowing";
import {
  ADMIN_LIST_SEARCH_PARAM,
  useDebouncedUrlParamState,
} from "@/components/admin/admin-list-url-state";
import { LIBRARY_CATEGORY_MESSAGE_KEY } from "@/components/library/categories";
import { LibraryCover } from "@/components/library/library-cover";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { AdminLibraryArticleListItem } from "@/services/library";
import { libraryArticleStatus } from "./library-article-form";
import { LibraryArticleStatusChip } from "./library-article-status-chip";

/**
 * Every Library article, published or not, one row each — laid out as the
 * admin product lists are: the heading with its "new" button, a search row,
 * the count line, and a clickable row per article with its cover as the thumb.
 *
 * **Presentational**: the rows arrive as a prop, and the live page hands it a
 * read. `settled` is separate from the
 * rows because "no articles yet" and "the read has not answered" are different
 * pages, and only the first may print an empty state.
 *
 * **No loading affordance.** The read is one walk over a table of articles an
 * office writes by hand, without their bodies, and lands in a frame or two.
 * Until it does, nothing renders under the heading; the search, the count and
 * the rows arrive together, so none of them moves another.
 */
export function AdminLibraryArticlesPage({
  articles,
  settled,
}: {
  /** Most recently saved first — the order the read delivers. */
  articles: readonly AdminLibraryArticleListItem[];
  /** Whether the read has answered. Only then may the empty state appear. */
  settled: boolean;
}) {
  const t = useTranslations("admin.library");

  return (
    // The gutter is reserved because the search can flip the page between
    // needing a scrollbar and not, which would otherwise narrow everything
    // under the admin's typing — see the html:has() rule in globals.css.
    <div className="space-y-6" data-reserve-scroll-gutter>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link
          href={ROUTES.admin.libraryArticleNew}
          className={buttonVariants()}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t("newArticle")}
        </Link>
      </div>

      {settled && articles.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      )}

      {articles.length > 0 && <SearchableArticles articles={articles} />}
    </div>
  );
}

/**
 * The search row, the count line and the rows. Mounted only once there are
 * rows, which is also what keeps the URL-seeded search off the server render:
 * the live read is client-side, so the server never paints this.
 */
function SearchableArticles({
  articles,
}: {
  articles: readonly AdminLibraryArticleListItem[];
}) {
  const t = useTranslations("admin.library");
  const tCategory = useTranslations("library.categories");
  const uiLocale = resolveLocale(useLocale());

  // The same `?q=` the product lists mirror their search into, with the same
  // hook, so Back from an article returns to the list as it was narrowed.
  const [search, setSearch, flushSearch] = useDebouncedUrlParamState(
    ADMIN_LIST_SEARCH_PARAM,
  );

  // The category as its row names it, so the search matches the words the
  // admin can see. The row names the article by the version in the admin's
  // own language, falling back as a reader's would; the search reaches every
  // version's title, since an admin may remember an article by any of them.
  const rows = useMemo(
    () =>
      articles.map((article) => ({
        article,
        version: resolveTranslation(article.versions, uiLocale),
        categoryLabel:
          article.category === null
            ? t("noCategory")
            : tCategory(LIBRARY_CATEGORY_MESSAGE_KEY[article.category]),
      })),
    [articles, t, tCategory, uiLocale],
  );

  const needle = search.trim().toLowerCase();
  const shown =
    needle === ""
      ? rows
      : rows.filter(
          ({ article, categoryLabel }) =>
            article.versions.some((version) =>
              version.title.toLowerCase().includes(needle),
            ) || categoryLabel.toLowerCase().includes(needle),
        );

  function clear() {
    setSearch("");
    // One gesture with one value, so the URL takes it at once.
    flushSearch();
  }

  return (
    // One `space-y-4` for the search row, the count line and the rows, the
    // product lists' rhythm.
    <div className="space-y-4">
      {/* The product lists' four-column row, holding only the search, so the
          box is the same width here as on those pages. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminListSearchField
          label={t("search.label")}
          placeholder={t("search.placeholder")}
          value={search}
          onChange={setSearch}
          // Leaving the field settles the URL at once, so a click straight
          // from the box into a row cannot outrun the mirror.
          onBlur={flushSearch}
        />
      </div>

      <AdminListShowingLine
        showing={t("search.showing", {
          count: shown.length,
          total: articles.length,
        })}
        clearLabel={t("search.clear")}
        narrowed={needle !== ""}
        onClear={clear}
      />

      {shown.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("search.noMatches")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {shown.map(({ article, version, categoryLabel }) => (
            <ArticleRow
              key={article.id}
              article={article}
              title={version?.title ?? ""}
              summary={version?.summary ?? ""}
              categoryLabel={categoryLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One article, the product list row's shape: thumb, title and chip, facts —
 * among them the languages it is written in.
 */
function ArticleRow({
  article,
  title,
  summary,
  categoryLabel,
}: {
  article: AdminLibraryArticleListItem;
  title: string;
  summary: string;
  categoryLabel: string;
}) {
  const t = useTranslations("admin.library");
  const locale = useLocale();
  const timeZone = useTimezone();

  return (
    <Link
      href={ROUTES.admin.libraryArticle(article.id)}
      className="group flex items-center justify-between gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {/* The cover at the Library's own 16:9, the crop readers meet, at the
            product thumb's width. No cover paints NO IMAGE in the same frame,
            so rows with and without one line up. */}
        <LibraryCover
          src={catalogueImageSrc("library_cover", article.coverPath)}
          className="w-24 shrink-0 rounded-md"
          sizes="96px"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{title}</span>
            <LibraryArticleStatusChip status={libraryArticleStatus(article)} />
          </div>
          <p className="truncate text-sm text-muted-foreground">{summary}</p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {categoryLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <Languages className="h-3 w-3" aria-hidden />
              <span className="sr-only">{t("languagesLabel")}</span>
              {article.versions.map((version) => (
                <span key={version.locale} className="uppercase">
                  {version.locale}
                </span>
              ))}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <time dateTime={article.updatedAt}>
                {t("lastSaved", {
                  date: formatDate(article.updatedAt, locale, {
                    dateStyle: "medium",
                    timeZone,
                  }),
                })}
              </time>
            </span>
          </div>
        </div>
      </div>
      <NavChevron />
    </Link>
  );
}
