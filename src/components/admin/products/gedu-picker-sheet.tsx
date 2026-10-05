"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
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
import { useGedusCoveringProduct } from "@/services/gedu-locations";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  SPOKEN_LANGUAGES,
  type SpokenLanguageCode,
} from "@/lib/constants/spoken-languages";
import {
  missingRequirementKey,
  missingRequirements,
  type MissingRequirement,
  type SessionRequirements,
} from "@/lib/products/session-requirements";
import { cn } from "@/lib/utils";
import { useQualificationNames } from "@/components/admin/qualification-names";

/**
 * How far below the last row counts as reached — the same margin the sibling
 * participant picker uses, because both are the same narrow scrolling column.
 */
const SENTINEL_ROOT_MARGIN = "400px 0px";

/**
 * **Why the caller will not take a candidate.**
 *
 * The sheet owns two refusals of its own and neither is in this list: the
 * person already filling the slot, and an uncertified account on a `staff`
 * seat, which it reads off the row it is drawing. Everything else is a property of what the caller
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
 * - `trainee` — already a trainee on a group of this product. The same
 *   one-seat-per-product rule as `assigned`, seen from the other kind of seat:
 *   the database refuses a gedu holding both.
 */
export type GeduPickerUnavailability =
  | "assigned"
  | "expected"
  | "absent"
  | "trainee";

/** Which badge names each refusal. A literal map so `t()` keeps its key type. */
const UNAVAILABILITY_MESSAGE_KEY = {
  assigned: "alreadyAssigned",
  expected: "alreadyExpected",
  absent: "absentGedu",
  trainee: "alreadyTrainee",
} as const satisfies Record<GeduPickerUnavailability, string>;

/**
 * What a pick seats, which decides whether certification is asked about.
 *
 * - `staff` — a Gedu doing the job: an assignment or a substitute. An
 *   uncertified educator is refused.
 * - `trainee` — a gedu shadowing a group. Certification gates nothing here, so
 *   every row the caller does not refuse is selectable; the not-certified badge
 *   stays as information rather than as a refusal.
 */
export type GeduPickerSeat = "staff" | "trainee";

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
  /** What the pick seats; `staff` unless said otherwise. */
  seat?: GeduPickerSeat;
  /**
   * `staff` seats only: tell the admin, on each uncertified row, that the
   * educator can be placed as a trainee instead. Opt-in because only the
   * groups panel has a Trainees row to point at — a session's substitute
   * picker has no such alternative to offer.
   */
  offerTraineeInstead?: boolean;
  /**
   * `staff` seats only: what the product being staffed requires of whoever
   * runs it — its qualifications, its language and, in person, a coverage
   * area reaching its site. A row whose gedu falls
   * short **stays selectable** and says where — for an admin a missing
   * requirement is a warning, never a refusal, and the caller's confirm step
   * is where the admin says they meant it. Ignored on a `trainee` seat, which
   * the requirements gate no more than certification does.
   */
  requirements?: SessionRequirements;
  /**
   * The pick, with the requirements the gedu falls short of — empty when they
   * meet them all, and always empty on a `trainee` seat. Handed over rather
   * than recomputed so the confirm step names exactly the gap the row showed.
   */
  onSelect: (
    gedu: UserListEntry,
    missing: readonly MissingRequirement[],
  ) => void;
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
  seat = "staff",
  offerTraineeInstead = false,
  requirements,
  onSelect,
}: GeduPickerSheetProps) {
  const t = useTranslations("admin.products.geduPicker");
  const qualificationNames = useQualificationNames();
  const required = seat === "staff" ? requirements : undefined;
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

  /**
   * Who covers the product's site, on an in-person product only — the
   * database's own answer, so this sheet carries no copy of the walk up the
   * location tree that decides it.
   *
   * **The rows wait for it**, as they wait for their own page: a row on
   * screen carries its own verdict, and a row drawn before this lands would
   * grow a coverage line under the admin's cursor. It is a small read keyed
   * by one product, so it lands with the page. Should it fail, the rows draw
   * without the coverage line rather than not at all — the line is a warning,
   * and a picker that cannot staff is worse than one that warns less.
   */
  const site = required?.site ?? null;
  const covering = useGedusCoveringProduct(
    hasOpened && site !== null ? site.productId : null,
  );
  const coverageSettled =
    site === null || covering.data !== undefined || covering.isError;

  const gedus = useMemo(
    () =>
      coverageSettled
        ? (list.data?.pages.flatMap((page) => page.rows) ?? [])
        : [],
    [list.data, coverageSettled],
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

  /** The row's line for one requirement it falls short of. */
  function gapLine(requirement: MissingRequirement): string {
    switch (requirement.kind) {
      case "qualification":
        return t("notQualified", {
          qualification: qualificationNames[requirement.qualification],
        });
      case "language":
        return t("doesNotSpeak", {
          language: languageName(requirement.language),
        });
      case "coverage":
        return t("outsideCoverage");
    }
  }

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
              // own verdict. A trainee seat is the exception: shadowing a
              // group is how an uncertified educator learns it.
              const isUncertified = !g.certified;
              const refusesUncertified = seat === "staff" && isUncertified;
              const isDisabled =
                isCurrent || refusal !== null || refusesUncertified;
              // Said only on a row that can be picked: a refused row already
              // says why it cannot, and a second fact beside the refusal would
              // be about a choice the admin is not being offered.
              const missing =
                isDisabled || required === undefined
                  ? []
                  : missingRequirements(
                      required,
                      g,
                      covering.data?.has(g.id) ?? true,
                    );
              return (
                <GeduRow
                  key={g.id}
                  gedu={g}
                  languageName={languageName}
                  isCurrent={isCurrent}
                  refusal={refusal}
                  isUncertified={isUncertified}
                  refusesUncertified={refusesUncertified}
                  showTraineeHint={refusesUncertified && offerTraineeInstead}
                  requirementGaps={missing.map((requirement) => ({
                    key: missingRequirementKey(requirement),
                    line: gapLine(requirement),
                  }))}
                  isDisabled={isDisabled}
                  onClick={() => {
                    if (isDisabled) return;
                    onSelect(g, missing);
                    onOpenChange(false);
                  }}
                />
              );
            })}
            {/* Only once the first page has answered: "no results" is a claim
                about who exists, and a page of 25 off an indexed view lands in
                a frame or two, so nothing stands in for it in the meantime. */}
            {gedus.length === 0 && !list.isPending && coverageSettled && (
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
  /** The uncertified badge is this row's refusal, rather than information. */
  refusesUncertified: boolean;
  /** Say under the address that this educator can be placed as a trainee. */
  showTraineeHint: boolean;
  /**
   * One line per requirement this selectable gedu falls short of — empty
   * where they meet every one the seat requires.
   */
  requirementGaps: readonly { key: string; line: string }[];
  isDisabled: boolean;
  onClick: () => void;
}

function GeduRow({
  gedu,
  languageName,
  isCurrent,
  refusal,
  isUncertified,
  refusesUncertified,
  showTraineeHint,
  requirementGaps,
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
            <Badge
              variant="outline"
              className={cn("shrink-0", refusesUncertified && "text-destructive")}
            >
              {t("notCertified")}
            </Badge>
          )}
        </div>
        {gedu.email && (
          <p className="truncate text-xs text-muted-foreground">{gedu.email}</p>
        )}
        {showTraineeHint && (
          <p className="text-xs text-muted-foreground">{t("traineeInstead")}</p>
        )}
        {/* Lines rather than badges beside the name: the qualification names
            run long in the longer locales, and a row can lack several, which
            beside a name would squeeze the surname that tells two Mikkos
            apart. One line per gap, as the confirm step words them. They sit
            where the trainee hint does, the other line a row carries about its
            own standing, and never on the same row as it — the hint is for a
            refused row, these for a selectable one. */}
        {requirementGaps.map(({ key, line }) => (
          <StatusLine key={key} status="warning" size="xs" muted>
            {line}
          </StatusLine>
        ))}
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
