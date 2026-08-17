"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Info, MapPin, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ROUTES, SUPPORT_EMAIL } from "@/lib/constants";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  LOCATION_SEARCH_MAX_QUERY,
  LOCATION_SEARCH_MIN_QUERY,
  useLocationSearch,
} from "@/services/locations";
import { municipalitySlug } from "@/lib/locations/municipality-slug";
import {
  buildMunicipalityEntry,
  groupByRegion,
  SCHOOLS_COUNTRY_CODE,
  type MunicipalityEntry,
  type RegionGroup,
} from "@/lib/schools/municipalities";
import type { LocationType } from "@/types";

/** The long-tail arm asks the index for municipalities, in Finland, and nothing else. */
const FALLBACK_TYPES: readonly LocationType[] = ["municipality"];

/**
 * How many times a failing fallback is retried before the arm gives up.
 *
 * React Query's default of three, with backoff, is roughly seven seconds — and
 * this results area renders *nothing* while a fallback for the current input is
 * unresolved, so every one of those seconds is a blank page under a query the
 * parent can see they typed. One retry covers the flaky hop this arm actually
 * meets (a cached, indexed route) and reaches the ordinary empty state fast
 * enough that the page stops looking broken.
 */
const FALLBACK_RETRIES = 1;

/** The hits one fallback response carries, as the hook itself types them. */
type FallbackHits = NonNullable<
  ReturnType<typeof useLocationSearch>["data"]
>["results"];

/** One stable empty answer, so the memo below is not recomputed per keystroke. */
const NO_HITS: FallbackHits = [];

/** The last fallback response that resolved, and the needle it answers. */
interface HeldBlock {
  needle: string;
  hits: FallbackHits;
}

/**
 * Whether two needles are close enough that one's answer may stand in for the
 * other's while the latter is still coming: one contains the other, ignoring
 * case. That covers typing forward ("lah" → "lahti") and backspacing
 * ("lahti" → "lah") — the two ways a parent walks a query — and excludes a
 * paste or a rewrite, where the block on screen would be answering a question
 * nobody is asking any more.
 */
function containmentRelated(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.includes(y) || y.includes(x);
}

/**
 * Public entry point for parents discovering municipality clubs. Two states
 * driven by the search box:
 *  - empty query → the curated default: the regions where we run clubs, each an
 *    expandable section that reveals its municipalities on click (collapsed by
 *    default to keep the list compact);
 *  - non-empty query → search, each row carrying its region sub-line and its
 *    status.
 *
 * `entries` is every municipality that runs a club, and nothing else — the page
 * is bounded by the club count rather than by Finland, so this is a small list
 * both to ship and to search. It is computed server-side, so the first frame is
 * complete: the default view never waits on anything, and the region sections
 * start collapsed so expanding is always user-initiated (CLAUDE.md
 * layout-stability rule).
 *
 * **Search is a union of two arms, not a cascade.** The local arm narrows those
 * club-bearing entries in memory and renders instantly. Every debounced query
 * of at least the route's minimum length *also* asks the indexed search route,
 * and its hits — deduped against what the local arm just rendered — append
 * below. The fallback is not conditional on the local arm coming up empty,
 * because 32 Finnish municipality names sit inside another municipality's name
 * (Lahti inside Vesilahti, Pori inside Raasepori): a parent typing their whole
 * town would otherwise see only the towns that contain it, and *which* towns
 * those are would shift silently as clubs open and close.
 *
 * **The fallback block persists across related keystrokes.** The two arms run
 * at different speeds — local on the keystroke, the index a debounce behind —
 * so clearing the appended block whenever a new fallback is in flight makes it
 * vanish and repopulate on every character typed. Instead the last resolved
 * response is held with the needle it answers, and it keeps rendering while the
 * next one flies as long as the two needles contain one another; the fresh
 * response replaces it wholesale when it lands. It is *never* re-matched
 * against the newer query text: the block narrows when the index says so and
 * not before, so nothing here becomes a second implementation of what counts as
 * a match. A paste or a rewrite is the one case where the held block goes at
 * once — its rows would be answers to a question that is no longer on screen.
 */
export function SchoolsBrowse({ entries }: { entries: MunicipalityEntry[] }) {
  const t = useTranslations("schools");
  const c = useTranslations("common");
  const locale = useLocale();
  const [query, setQuery] = useState("");

  // Slugify the query so the local arm is diacritic-insensitive ("jarvi" finds
  // "Järvenpää") and matches the same normalisation as the slugs themselves.
  // This fold narrows the small club-bearing set only; the fallback arm folds
  // nothing and asks the database's own index instead.
  const normalizedQuery = municipalitySlug(query);
  const searching = normalizedQuery.length > 0;
  const trimmedQuery = query.trim();

  const debouncedQuery = useDebouncedValue(query);
  /** Has the debounce caught up with what is in the box right now? */
  const settled = debouncedQuery === query;

  /**
   * Whether the *current* input warrants a fallback at all. The local arm has
   * no minimum length, so a one-character query narrows locally and never
   * reaches the index — and, having no request in flight, has nothing for the
   * empty state to wait on. Input that folds to nothing is the default view,
   * which must fire no request either.
   */
  const fallbackExpected =
    searching && trimmedQuery.length >= LOCATION_SEARCH_MIN_QUERY;

  /**
   * The needle actually in front of the hook, and the identity of whatever it
   * answers with. Mid-debounce the hook's key would still name the *previous*
   * needle, so it is withheld until the debounce catches up: everything the
   * hook returns then belongs to this needle and to no other, which is what
   * lets the held block below be bookkept by needle at all.
   */
  const needle = fallbackExpected && settled ? debouncedQuery.trim() : "";

  const fallback = useLocationSearch(needle, {
    types: FALLBACK_TYPES,
    country: SCHOOLS_COUNTRY_CODE,
    // Same reason, one layer down: the hook's default would carry the previous
    // needle's hits into this needle's result, which is right for a panel made
    // only of them and wrong here — holding the previous block is this
    // component's own decision, made against needles the hook cannot see (a
    // debounce window is invisible to it, and so is a paste).
    keepPreviousResults: false,
    retry: FALLBACK_RETRIES,
  });

  /**
   * The last fallback response that resolved, kept so the appended block
   * survives the next keystroke instead of blinking out and back.
   *
   * Adjusted during render rather than in an effect, deliberately: an effect
   * runs *after* the paint, so a fresh response would show one frame of the
   * previous needle's rows before being replaced — the exact flicker this
   * exists to remove, moved rather than fixed. Both branches settle in one
   * extra render and cannot loop, because each writes the value its own
   * condition then reads as satisfied.
   */
  const [held, setHeld] = useState<HeldBlock | null>(null);
  const resolvedHits = needle ? fallback.data?.results : undefined;
  if (resolvedHits) {
    // Needle *and* identity: two needles can answer with deep-equal hits, which
    // React Query's structural sharing hands back as the same array, and a
    // refetch of one needle can answer with different ones.
    if (held?.needle !== needle || held.hits !== resolvedHits) {
      setHeld({ needle, hits: resolvedHits });
    }
  } else if (held && !containmentRelated(held.needle, trimmedQuery)) {
    // A paste or a rewrite: nothing on screen may claim to answer it.
    setHeld(null);
  }

  const activeGroups = useMemo(() => groupByRegion(entries), [entries]);

  const results = useMemo(
    () =>
      searching
        ? entries.filter((e) =>
            e.searchSlugs.some((s) => s.includes(normalizedQuery)),
          )
        : [],
    [entries, normalizedQuery, searching],
  );

  const entriesById = useMemo(
    () => new Map(entries.map((e) => [e.id, e])),
    [entries],
  );

  /**
   * The empty state is withheld only while the fallback for the *current* input
   * has not resolved — otherwise the page asserts "no municipality matches
   * this" and then contradicts itself a round trip later. Both halves are
   * load-bearing: during the debounce window the hook is not fetching yet and
   * its state still describes the previous needle, so the query state alone
   * would flash the card mid-typing.
   */
  const fallbackPending = fallbackExpected && (!settled || fallback.isPending);

  /**
   * Which resolved response the fallback arm is showing: this needle's own, or
   * — while this needle's is still coming — the related one it is replacing.
   *
   * Anything else shows nothing, and each case is a decision rather than a
   * leftover. A held block whose needle is unrelated to what is typed now would
   * be answering a question nobody asked. A fallback that *failed* leaves
   * `fallbackPending` false with no response of its own, so the previous
   * block goes too: nothing is coming to replace it, and holding it would make
   * a dead arm look like a live one.
   */
  const shownHits =
    held &&
    (held.needle === needle ||
      (fallbackPending && containmentRelated(held.needle, trimmedQuery)))
      ? held.hits
      : NO_HITS;

  /**
   * The fallback's contribution, in the index's own rank order.
   *
   * Deduped against **what the local arm rendered for this query**, never
   * against the club-bearing set: a fallback hit can legitimately be
   * club-bearing and still be one no local slug match could reach — typing a
   * postcode is the case the postal arm exists for — and dropping it would
   * remove exactly the row worth surfacing. Such a hit renders as a normal
   * link, reusing the entry the page already holds so its slug and region come
   * from the same place every other link's do; anything else is a real
   * municipality we run nothing in, and renders in the clubless state.
   *
   * Comparing ids is the *only* thing done to a held block against the newer
   * query — it settles which arm owns a row, not whether the row matches. Held
   * hits are deliberately never re-matched against the typed text: the second
   * fold this page already carries narrows the set the server shipped, and
   * widening it to narrow the index's answers as well is how one becomes a
   * standing reimplementation of the other.
   */
  const fallbackRows = useMemo(() => {
    const rendered = new Set(results.map((e) => e.id));
    return shownHits
      .filter((hit) => !rendered.has(hit.id))
      .map((hit) => {
        const known = entriesById.get(hit.id);
        return known
          ? { entry: known, hasClubs: true }
          : { entry: buildMunicipalityEntry(hit, locale), hasClubs: false };
      });
  }, [shownHits, results, entriesById, locale]);

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
          // The route refuses a longer needle outright, and a 400 here is a
          // results area that stays blank rather than the "no matches" a parent
          // would otherwise read. No place name comes close, so the only input
          // this stops is a paste of something that was never a search.
          maxLength={LOCATION_SEARCH_MAX_QUERY}
        />
      </div>

      <div className="mt-10">
        {searching ? (
          results.length + fallbackRows.length > 0 ? (
            <ul className="space-y-2">
              {results.map((m) => (
                <MunicipalityRow
                  key={m.id}
                  entry={m}
                  t={t}
                  hasClubs
                  searchView
                />
              ))}
              {fallbackRows.map((row) => (
                <MunicipalityRow
                  key={row.entry.id}
                  entry={row.entry}
                  t={t}
                  hasClubs={row.hasClubs}
                  searchView
                />
              ))}
            </ul>
          ) : fallbackPending ? null : (
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
            <MunicipalityRow key={m.id} entry={m} t={t} hasClubs />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Whether this row's municipality runs clubs is a property of *where the row
 * came from*, not of the entry — every entry the page holds is club-bearing by
 * construction, and a clubless municipality can only reach the list as a search
 * hit from outside that set. So it rides as a prop rather than as a field on
 * `MunicipalityEntry`, which would be a flag that is always true.
 */
function MunicipalityRow({
  entry,
  t,
  hasClubs,
  searchView = false,
}: {
  entry: MunicipalityEntry;
  t: Translate;
  hasClubs: boolean;
  // Search results aren't region-grouped, so they show the region sub-line and
  // the available/nothing-here status. The default view is already
  // region-grouped and lists only club-bearing municipalities, so both would be
  // redundant noise there.
  searchView?: boolean;
}) {
  const inner = (
    <>
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
      {searchView && <StatusPill hasClubs={hasClubs} t={t} />}
    </>
  );

  // A municipality with no clubs has nothing to browse — its URL 404s — so the
  // row isn't a link. Muted and non-interactive; the status pill carries the
  // "nothing here" meaning.
  if (!hasClubs) {
    return (
      <li>
        <div className="flex items-center justify-between gap-3 rounded-md border border-input bg-card px-4 py-3 text-muted-foreground">
          {inner}
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={ROUTES.schoolMunicipality(entry.slug)}
        className="flex items-center justify-between gap-3 rounded-md border border-input bg-card px-4 py-3 transition-colors hover:bg-accent"
      >
        {inner}
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
      {hasClubs ? t("status.available") : t("status.noClubs")}
    </span>
  );
}
