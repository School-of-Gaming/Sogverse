"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Info, MapPin, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ROUTES, SUPPORT_EMAIL } from "@/lib/constants";
import { municipalitySlug } from "@/lib/locations/municipality-slug";
import {
  groupByRegion,
  type MunicipalityEntry,
  type RegionGroup,
} from "@/lib/schools/municipalities";

/**
 * Public entry point for parents discovering municipality clubs. Two states
 * driven by the search box:
 *  - empty query → the curated default: the regions where we run clubs, each an
 *    expandable section that reveals its available municipalities on click
 *    (collapsed by default to keep the list compact);
 *  - non-empty query → search across *every* Finnish municipality, each row
 *    flagged "clubs available" or "nothing here yet" so a parent anywhere can
 *    find their town and see its status.
 *
 * `entries` is computed server-side, so the first frame is complete — search
 * only ever filters in place, and the region sections start collapsed so
 * expanding is always user-initiated (CLAUDE.md layout-stability rule).
 */
export function SchoolsBrowse({ entries }: { entries: MunicipalityEntry[] }) {
  const t = useTranslations("schools");
  const c = useTranslations("common");
  const [query, setQuery] = useState("");

  // Slugify the query so search is diacritic-insensitive ("jarvi" finds
  // "Järvenpää") and matches the same normalisation as the slugs themselves.
  const normalizedQuery = municipalitySlug(query);
  const searching = normalizedQuery.length > 0;

  const activeGroups = useMemo(
    () => groupByRegion(entries.filter((e) => e.hasClubs)),
    [entries],
  );

  const results = useMemo(
    () =>
      searching ? entries.filter((e) => e.slug.includes(normalizedQuery)) : [],
    [entries, normalizedQuery, searching],
  );

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t.rich("hero.title", {
            primary: (chunks) => <span className="text-primary">{chunks}</span>,
          })}
        </h1>
        <p className="text-lg text-muted-foreground">{t("hero.subtitle")}</p>
        <p className="text-base text-muted-foreground">{t("hero.howItWorks")}</p>
      </div>

      <div className="relative mt-8">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <label htmlFor="schools-search" className="sr-only">
          {t("search.label")}
        </label>
        <Input
          id="schools-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          className="pl-9"
          autoComplete="off"
        />
      </div>

      <div className="mt-10">
        {searching ? (
          results.length > 0 ? (
            <ul className="space-y-2">
              {results.map((m) => (
                <MunicipalityRow key={m.id} entry={m} t={t} searchView />
              ))}
            </ul>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {t("search.noMatches", { query })}
              </CardContent>
            </Card>
          )
        ) : (
          <DefaultView groups={activeGroups} t={t} />
        )}
      </div>

      <div className="mt-10 flex items-start gap-2.5 rounded-md bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{t("waitlistNote")}</p>
      </div>

      <div className="mt-6 rounded-md border border-input bg-card px-4 py-5 text-center">
        <p className="font-semibold">{t("notListed.title")}</p>
        <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
          {t("notListed.body")}{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-primary hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="mx-auto mt-3 max-w-prose text-sm text-muted-foreground">
          {t("notListed.openClubs")}
        </p>
        <Link
          href={ROUTES.shop}
          className={buttonVariants({ size: "sm", className: "mt-4" })}
        >
          {c("exploreClubs")}
        </Link>
      </div>
    </div>
  );
}

type Translate = ReturnType<typeof useTranslations<"schools">>;

function DefaultView({
  groups,
  t,
}: {
  groups: ReturnType<typeof groupByRegion>;
  t: Translate;
}) {
  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          {t("available.empty")}
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="space-y-2">
      {groups.map((group) => (
        <RegionSection key={group.regionId ?? "none"} group={group} t={t} />
      ))}
    </ul>
  );
}

/**
 * One region rendered as a collapsible disclosure: a button header with the
 * region name and its available-municipality count, expanding to the list of
 * those municipalities. Collapsed by default — a `<button>` (not a bare div)
 * so it's keyboard-operable, with `aria-expanded` for assistive tech.
 */
function RegionSection({ group, t }: { group: RegionGroup; t: Translate }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-input bg-card px-4 py-3 text-left transition-colors hover:bg-accent"
      >
        <span className="flex min-w-0 items-center gap-2.5 font-medium">
          <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{group.regionName}</span>
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {group.municipalities.length}
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-2 pl-4">
          {group.municipalities.map((m) => (
            <MunicipalityRow key={m.id} entry={m} t={t} />
          ))}
        </ul>
      )}
    </li>
  );
}

function MunicipalityRow({
  entry,
  t,
  searchView = false,
}: {
  entry: MunicipalityEntry;
  t: Translate;
  // Search results span every municipality and aren't region-grouped, so they
  // show the region sub-line and the available/coming-soon status. The default
  // view is already region-grouped and lists only active municipalities, so
  // both would be redundant noise there.
  searchView?: boolean;
}) {
  return (
    <li>
      <Link
        href={ROUTES.schoolMunicipality(entry.slug)}
        // The per-municipality page is out of scope for now. Keep the real href
        // (correct the moment it ships) but don't navigate to a 404 yet — drop
        // this handler once /schools/[slug] exists.
        onClick={(e) => e.preventDefault()}
        className="flex items-center justify-between gap-3 rounded-md border border-input bg-card px-4 py-3 transition-colors hover:bg-accent"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{entry.name}</span>
            {searchView && entry.regionName && (
              <span className="block truncate text-sm text-muted-foreground">
                {entry.regionName}
              </span>
            )}
          </span>
        </span>
        {searchView && <StatusPill hasClubs={entry.hasClubs} t={t} />}
      </Link>
    </li>
  );
}

function StatusPill({ hasClubs, t }: { hasClubs: boolean; t: Translate }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
        hasClubs
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {hasClubs ? t("status.available") : t("status.comingSoon")}
    </span>
  );
}
