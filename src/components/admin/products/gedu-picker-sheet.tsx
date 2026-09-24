"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Identicon } from "@/components/ui/identicon";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useScrollSentinel } from "@/hooks/use-scroll-sentinel";
import { useUserList, type UserListEntry } from "@/services/users";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  SPOKEN_LANGUAGES,
  type SpokenLanguageCode,
} from "@/lib/constants/spoken-languages";
import { cn } from "@/lib/utils";

/**
 * How far below the last row counts as reached — the same margin the sibling
 * participant picker uses, because both are the same narrow scrolling column.
 */
const SENTINEL_ROOT_MARGIN = "400px 0px";

/**
 * **Why the caller will not take a candidate.**
 *
 * The sheet owns two refusals of its own and neither is in this list: the
 * person already filling the slot, and an uncertified account, which it reads
 * off the row it is drawing. Everything else is a property of what the caller
 * is staffing, and the caller is the only side that can answer it — so it
 * arrives as a reason rather than as a bare id, and the row says *which* rule
 * refused it rather than being silently unpressable.
 *
 * - `assigned` — already on a group of this product. The permanent assignment
 *   editor's rule: a Gedu holds at most one group per product.
 * - `expected` — already due at the session being staffed. Seating them as
 *   somebody else's sub would collapse two seats onto one person and make "who
 *   did which job" unanswerable.
 * - `absent` — the Gedu being substituted for. Nobody subs for themselves.
 */
export type GeduPickerUnavailability = "assigned" | "expected" | "absent";

/** Which badge names each refusal. A literal map so `t()` keeps its key type. */
const UNAVAILABILITY_MESSAGE_KEY = {
  assigned: "alreadyAssigned",
  expected: "alreadyExpected",
  absent: "absentGedu",
} as const satisfies Record<GeduPickerUnavailability, string>;

interface GeduPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /**
   * The caller's own refusals, keyed by Gedu id — each row it names is drawn
   * disabled with that reason in place of its status.
   *
   * A map rather than a list of ids because "why" is the half that has to reach
   * the row: this sheet staffs a permanent assignment on one surface and a
   * single session's sub on another, and the two refuse different people for
   * different reasons. A candidate absent from the map is selectable unless one
   * of the sheet's own two rules refuses them.
   */
  unavailable?: ReadonlyMap<string, GeduPickerUnavailability>;
  /** The id currently filling this slot — shown with a "current" badge. */
  highlightId?: string;
  onSelect: (gedu: UserListEntry) => void;
}

/**
 * The picker that staffs a group: educators newest first, searched and filtered
 * server-side.
 *
 * **One page at a time, and the same read the admin users list and the
 * participant picker use.** There used to be a second definition of what
 * "matches what I typed" means here — a browser-side match over three fields of
 * a list of every gedu on the platform — and the two agreed only by habit,
 * which is exactly how this picker once became unable to find a surname the
 * users list could. Asking the shared read leaves one definition of a match,
 * and it reaches further than the local one ever could: a phone number
 * recognised before the tokenizer splits it, and both game handles, which live
 * in tables a `Profile` row cannot see.
 *
 * **Certification comes off the row.** It is a column of the read rather than a
 * separate whole-table lookup, so it is on screen with the name it is about,
 * and the fail-closed gate below cannot be left waiting on anything.
 *
 * **The sheet is mounted from the groups panel's first render and reads nothing
 * until it has been opened once** — staying mounted is what lets it animate,
 * and the latch is what stops a product page nobody staffed from fetching a
 * page of educators.
 */
export function GeduPickerSheet({
  open,
  onOpenChange,
  title,
  description,
  unavailable,
  highlightId,
  onSelect,
}: GeduPickerSheetProps) {
  const t = useTranslations("admin.products.geduPicker");
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] =
    useState<SpokenLanguageCode | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const languageName = useLanguageNames();

  // The open transition, in the shape the sibling sheets in this panel use: it
  // fires on the false → true edge, during the render that sees the new prop,
  // so a reopened sheet is a fresh one and nothing is rewritten underneath the
  // closing animation. `hasOpened` latches and never clears, which is what
  // keeps the reads off a product page nobody opened this on while leaving the
  // educators already in hand across a close and a reopen.
  const [wasOpen, setWasOpen] = useState(open);
  const [hasOpened, setHasOpened] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setHasOpened(true);
      setSearch("");
      setLanguageFilter(null);
    }
  }

  const list = useUserList(
    { search, role: "gedu", spokenLanguage: languageFilter },
    // The one surface with a count line, so the one surface that asks for it.
    { enabled: hasOpened, withTotal: true },
  );

  /**
   * The unfiltered educator count, for the second half of the count line.
   *
   * The same hook, so it is the same cache entry the picker itself lands on
   * whenever the box is empty and no chip is chosen — which is how the sheet
   * opens. An admin who then types pays for one more first page, and going
   * back to the unfiltered view costs nothing.
   */
  const everyGedu = useUserList(
    { search: "", role: "gedu", spokenLanguage: null },
    { enabled: hasOpened, withTotal: true },
  );

  const gedus = useMemo(
    () => list.data?.pages.flatMap((page) => page.rows) ?? [],
    [list.data],
  );

  // The sheet body is the scroller while a sheet is open, so that box is what
  // the sentinel is judged against. `isPlaceholderData` is in the gate because
  // the cursor the pages on screen yield belongs to the query they answered.
  const sentinelRef = useScrollSentinel({
    enabled:
      // `isFetching`, not `isFetchingNextPage`: asking for the next page
      // cancels a refresh in flight, so a sentinel firing while an invalidation
      // is re-reading the loaded pages would throw that refresh away and leave
      // the stale rows on screen marked fresh.
      list.hasNextPage && !list.isFetching && !list.isPlaceholderData,
    onReach: () => {
      void list.fetchNextPage();
    },
    rootMargin: SENTINEL_ROOT_MARGIN,
    root: bodyRef,
  });

  /**
   * The two numbers the count line states, or null while either is unknown.
   *
   * Both are server counts off a first page, and both deliberately come from
   * the *same* pair of queries that drew the rows — so the line always
   * describes what is on screen, including while a keystroke's page is in
   * flight and the previous one is still being shown. Null until the first
   * page of each has landed: printing zeros there would claim there are no
   * educators, which is the one thing nobody has asked yet.
   */
  const counts = useMemo(() => {
    const filtered = list.data?.pages[0]?.total;
    const total = everyGedu.data?.pages[0]?.total;
    if (filtered === undefined || filtered === null) return null;
    if (total === undefined || total === null) return null;
    return { filtered, total };
  }, [list.data, everyGedu.data]);

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => searchRef.current?.focus(), 120);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader onClose={() => onOpenChange(false)}>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="space-y-3 border-b border-border px-6 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 focus-visible:ring-border"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t("speaks")}:</span>
            <button
              type="button"
              onClick={() => setLanguageFilter(null)}
              className={cn(
                "rounded-full border border-border px-2 py-0.5 transition-colors",
                languageFilter === null
                  ? "text-act"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("any")}
            </button>
            {SPOKEN_LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() =>
                  setLanguageFilter((prev) => (prev === code ? null : code))
                }
                className={cn(
                  "rounded-full border border-border px-2 py-0.5 transition-colors",
                  languageFilter === code
                    ? "text-act"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {languageName(code)}
              </button>
            ))}
          </div>

          {/* The line keeps its own height while it has nothing to say, so the
              counts arriving fills a box that was already there rather than
              pushing the list below it down. */}
          <p className="min-h-4 text-xs text-muted-foreground">
            {counts === null ? "" : t("countSummary", counts)}
          </p>
        </div>

        <SheetBody ref={bodyRef}>
          <div className="space-y-2">
            {gedus.map((g) => {
              const isCurrent = g.id === highlightId;
              const refusal = unavailable?.get(g.id) ?? null;
              // Uncertified gedus can't be assigned until an admin approves
              // them (a UI-only gate — sufficient because only trusted admins
              // assign; see src/services/gedu/CLAUDE.md). The flag is a column
              // of this row, so the gate never has to decide what to do about
              // an answer that has not arrived: a row on screen carries its
              // own verdict.
              const isUncertified = !g.certified;
              const isDisabled = isCurrent || refusal !== null || isUncertified;
              return (
                <GeduRow
                  key={g.id}
                  gedu={g}
                  languageName={languageName}
                  isCurrent={isCurrent}
                  refusal={refusal}
                  isUncertified={isUncertified}
                  isDisabled={isDisabled}
                  onClick={() => {
                    if (isDisabled) return;
                    onSelect(g);
                    onOpenChange(false);
                  }}
                />
              );
            })}
            {/* Only once the first page has answered: "no results" is a claim
                about who exists, and a page of 25 off an indexed view lands in
                a frame or two, so nothing stands in for it in the meantime. */}
            {gedus.length === 0 && !list.isPending && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("noResults")}
              </p>
            )}
          </div>
          {/* Below every row, so a revealed page appends into the body's own
              slack and nothing already read moves. */}
          {list.hasNextPage && (
            <div ref={sentinelRef} aria-hidden className="h-px" />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

interface GeduRowProps {
  gedu: UserListEntry;
  /**
   * Threaded down rather than taken from the hook here. Every call to
   * `useLanguageNames` constructs an `Intl.DisplayNames`, and a row-level hook
   * would build one per educator on the page. The parent already holds one for
   * the filter chips, so the rows share it.
   */
  languageName: ReturnType<typeof useLanguageNames>;
  isCurrent: boolean;
  /** The caller's reason for refusing this row, or null where it has none. */
  refusal: GeduPickerUnavailability | null;
  isUncertified: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

function GeduRow({
  gedu,
  languageName,
  isCurrent,
  refusal,
  isUncertified,
  isDisabled,
  onClick,
}: GeduRowProps) {
  const t = useTranslations("admin.products.geduPicker");
  // The surname is what tells three Mikkos apart, so the row carries it — and
  // falls back to the first name alone when none is on file.
  const name = [gedu.first_name, gedu.last_name]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border border-border p-3 text-left text-sm transition-colors",
        isDisabled ? "cursor-default opacity-60" : "hover:bg-hover",
        isCurrent && "border-act opacity-100"
      )}
    >
      <Avatar className="h-9 w-9 shrink-0">
        <Identicon id={gedu.id} size={36} />
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{name}</p>
          {isCurrent && (
            <Badge variant="outline" className="shrink-0">
              <Check className="mr-1 h-3 w-3" />
              {t("current")}
            </Badge>
          )}
          {refusal !== null && !isCurrent && (
            <Badge variant="outline" className="shrink-0">
              {t(UNAVAILABILITY_MESSAGE_KEY[refusal])}
            </Badge>
          )}
          {isUncertified && !isCurrent && refusal === null && (
            <Badge variant="outline" className="shrink-0 text-destructive">
              {t("notCertified")}
            </Badge>
          )}
        </div>
        {gedu.email && (
          <p className="truncate text-xs text-muted-foreground">{gedu.email}</p>
        )}
        {gedu.spoken_languages.length > 0 && (
          <div className="mt-1.5 flex gap-1">
            {gedu.spoken_languages.map((code) => (
              <span
                key={code}
                className="rounded bg-lifted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {languageName(code)}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
