"use client";

import { useMemo } from "react";
import { CircleCheck, CircleDashed, Clock, Languages, Plus } from "lucide-react";
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
import { ROUTES } from "@/lib/constants";
import { LOCALE_CONFIG, resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { cn, formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { AdminLandingPageListItem } from "@/services/landing-pages";
import { landingPageStatus } from "./landing-page-form";
import { LandingPageStatusChip } from "./landing-page-status-chip";

/**
 * Every landing page, live or not, one row each — the Library list's layout:
 * the heading with its "new" button, a search row, the count line, and a
 * clickable row per page with its title, its status and its languages, each
 * marked complete or not.
 *
 * **Presentational**: the rows arrive as a prop. `settled` is separate from
 * the rows because "no pages yet" and "the read has not answered" are
 * different pages, and only the first may print an empty state.
 *
 * **No loading affordance.** The read is one walk over a hand-written table,
 * without the pages' words, and lands in a frame or two; the search, the
 * count and the rows arrive together, so none of them moves another.
 */
export function AdminLandingPagesPage({
  pages,
  settled,
}: {
  /** Most recently saved first — the order the read delivers. */
  pages: readonly AdminLandingPageListItem[];
  settled: boolean;
}) {
  const t = useTranslations("admin.landingPages");

  return (
    <div className="space-y-6" data-reserve-scroll-gutter>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href={ROUTES.admin.landingPageNew} className={buttonVariants()}>
          <Plus className="mr-1 h-4 w-4" />
          {t("newPageButton")}
        </Link>
      </div>

      {settled && pages.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      )}

      {pages.length > 0 && <SearchablePages pages={pages} />}
    </div>
  );
}

function SearchablePages({ pages }: { pages: readonly AdminLandingPageListItem[] }) {
  const t = useTranslations("admin.landingPages");
  const uiLocale = resolveLocale(useLocale());
  const [search, setSearch, flushSearch] = useDebouncedUrlParamState(ADMIN_LIST_SEARCH_PARAM);

  // A row names the page by its version in the admin's own language, falling
  // back as a reader's would; the search reaches every version's title and
  // address, since an admin may remember a page by any of them.
  const rows = useMemo(
    () => pages.map((page) => ({ page, version: resolveTranslation(page.versions, uiLocale) })),
    [pages, uiLocale],
  );

  const needle = search.trim().toLowerCase();
  const shown =
    needle === ""
      ? rows
      : rows.filter(({ page }) =>
          page.versions.some(
            (version) =>
              version.title.toLowerCase().includes(needle) ||
              version.slug.toLowerCase().includes(needle),
          ),
        );

  function clear() {
    setSearch("");
    flushSearch();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminListSearchField
          label={t("search.label")}
          placeholder={t("search.placeholder")}
          value={search}
          onChange={setSearch}
          onBlur={flushSearch}
        />
      </div>

      <AdminListShowingLine
        showing={t("search.showing", { count: shown.length, total: pages.length })}
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
          {shown.map(({ page, version }) => (
            <PageRow
              key={page.id}
              page={page}
              title={version?.title ?? ""}
              summary={version?.summary ?? ""}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One page: title and chip, summary, then its languages and when it was last saved. */
function PageRow({
  page,
  title,
  summary,
}: {
  page: AdminLandingPageListItem;
  title: string;
  summary: string;
}) {
  const t = useTranslations("admin.landingPages");
  const locale = useLocale();
  const timeZone = useTimezone();

  return (
    <Link
      href={ROUTES.admin.landingPage(page.id)}
      className="group flex items-center justify-between gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          <LandingPageStatusChip status={landingPageStatus(page)} />
        </div>
        <p className="truncate text-sm text-muted-foreground">{summary}</p>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Languages className="h-3 w-3" aria-hidden />
            <span className="sr-only">{t("languagesLabel")}</span>
            {page.versions.map((version) => {
              const Mark = version.isComplete ? CircleCheck : CircleDashed;
              return (
                <span
                  key={version.locale}
                  className={cn(
                    "inline-flex items-center gap-0.5",
                    version.isComplete && "text-success",
                  )}
                >
                  <span className="uppercase">{version.locale}</span>
                  <Mark className="h-3 w-3" aria-hidden />
                  <span className="sr-only">
                    {LOCALE_CONFIG[version.locale].nativeLabel}:{" "}
                    {version.isComplete ? t("versionComplete") : t("versionIncomplete")}
                  </span>
                </span>
              );
            })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden />
            <time dateTime={page.updatedAt}>
              {t("lastSaved", {
                date: formatDate(page.updatedAt, locale, { dateStyle: "medium", timeZone }),
              })}
            </time>
          </span>
        </div>
      </div>
      <NavChevron />
    </Link>
  );
}
