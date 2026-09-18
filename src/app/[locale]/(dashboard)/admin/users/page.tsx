"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { UserRow, type GeduStandingWarnings } from "@/components/admin/user-row";
import {
  findGeduContractAcceptance,
  GEDU_CONTRACT_CURRENT_VERSION,
} from "@/components/gedu/contract/documents";
import { useUserList, type UserListEntry } from "@/services/users";
import { useGeduContractAcceptanceMap } from "@/services/gedu";
import { useScrollSentinel } from "@/hooks/use-scroll-sentinel";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

/**
 * How far below the last row counts as reached. A page is a screenful, so
 * asking one viewport early is what makes a continuous scroll continuous rather
 * than a stutter at every page boundary.
 */
const SENTINEL_ROOT_MARGIN = "800px 0px";

export default function AdminUsersPage() {
  const t = useTranslations('admin.users');
  const c = useTranslations('common');
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | null>(null);

  /**
   * The list, the search and the role filter are one server-side query.
   *
   * Nothing here narrows anything in the browser any more: the needle matches a
   * family-wide blob in the database — so a hit on a child's name returns the
   * family row the child is inside — and the role pill is an equality filter on
   * the same read. The children are already nested inside their family's row,
   * which is what the page used to build from two whole-table reads.
   */
  const list = useUserList({
    search: searchQuery,
    role: roleFilter,
    spokenLanguage: null,
  });
  const acceptances = useGeduContractAcceptanceMap();

  const rows = useMemo(
    () => list.data?.pages.flatMap((page) => page.rows) ?? [],
    [list.data],
  );

  /**
   * Reveal the next page as the reader reaches the bottom of this one.
   *
   * Three conditions, and the third is the one that is easy to miss: while the
   * hook is showing the *previous* needle's pages, the cursor those pages yield
   * belongs to the previous question, so asking for more would resume the new
   * query from the old query's boundary. The other two are the ordinary
   * discipline — nothing left to fetch, or a fetch already in flight.
   */
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
  });

  /**
   * The two warning marks are a **block**, and it stays silent until the one
   * read behind it has answered — or gives up entirely if it failed.
   *
   * The record check now rides along on the row itself, so only contract
   * acceptance arrives a round trip after the rows do. The block is still
   * atomic for the reason it always was: a warning asserts that an educator has
   * *not* done something, and an unanswered or failed read cannot support one —
   * an empty acceptance map would badge every gedu on the platform as unsigned,
   * which is the precise wrong answer rather than a degraded one. Rendering the
   * record-check mark on its own in the meantime would also let the contract
   * mark push it sideways when it lands, in the row's right-packed mark group;
   * waiting makes the pair one insertion at that group's left end, which moves
   * nothing.
   */
  const standingKnown = !acceptances.isPending && !acceptances.isError;

  const standingWarningsFor = (row: UserListEntry): GeduStandingWarnings | null => {
    if (row.role !== "gedu" || !standingKnown) return null;
    return {
      // Matched on the base version, like every other "is this educator
      // current" check: the two languages of one version are the same
      // agreement, so signing either counts.
      contract:
        findGeduContractAcceptance(
          acceptances.map.get(row.id) ?? [],
          GEDU_CONTRACT_CURRENT_VERSION,
        ) === null,
      criminalRecordCheck: !row.criminal_record_check_passed,
    };
  };

  const ROLE_FILTERS: { value: UserRole; label: string }[] = [
    { value: "admin", label: c(ROLE_LABEL_KEYS.admin) },
    { value: "customer", label: c(ROLE_LABEL_KEYS.customer) },
    { value: "gedu", label: c(ROLE_LABEL_KEYS.gedu) },
  ];

  return (
    // Reserve the document scrollbar gutter so the list/search results loading
    // in or filtering down doesn't shift the layout — see html:has() rule in
    // globals.css.
    <div className="space-y-6" data-reserve-scroll-gutter>
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('manageAccounts')}
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchAriaLabel')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground mr-1">{t('roleFilterLabel')}:</span>
            <button
              onClick={() => setRoleFilter(null)}
              className={`inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors ${
                roleFilter === null
                  ? "bg-info text-info-foreground"
                  : "bg-lifted text-muted-foreground"
              }`}
            >
              {t('all')}
            </button>
            {ROLE_FILTERS.map((rf) => (
              <button
                key={rf.value}
                onClick={() => setRoleFilter(roleFilter === rf.value ? null : rf.value)}
                className={cn(
                  // Every pill is the same bordered shape; what a chosen one
                  // does is drop the grey ground and say its own role in its
                  // own colour, which is the chip these roles wear everywhere
                  // else on this page.
                  "inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors",
                  roleFilter === rf.value
                    ? ROLE_BADGE_STYLES[rf.value]
                    : "bg-lifted text-muted-foreground",
                )}
              >
                {rf.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {/* The first page is a keyset page of 25 off an indexed view — a
              small, bounded read that lands in a frame or two — so nothing is
              painted in its place: no skeleton, no spinner. What must not
              appear in the meantime is the empty line, which would claim
              nobody matches before anyone has been asked. */}
          {rows.length > 0 ? (
            <div className="space-y-4">
              {rows.map((row) => (
                <UserRow
                  key={row.id}
                  user={row}
                  linkedGamers={row.linked_gamers}
                  certified={row.certified}
                  // Absent for every non-gedu, and for every gedu until the
                  // acceptance read has answered — see the block above. `null`
                  // is silence, never "nothing missing".
                  standingWarnings={standingWarningsFor(row)}
                />
              ))}
            </div>
          ) : list.isPending ? null : (
            <div className="py-8 text-center text-muted-foreground">
              {searchQuery || roleFilter
                ? t('noFilterResults')
                : t('noUsers')}
            </div>
          )}
          {/* Below every row, so a revealed page lands where the container's
              slack already is and nothing painted moves. Unmounted once there
              is nothing left to reach for. */}
          {list.hasNextPage && (
            <div ref={sentinelRef} aria-hidden className="h-px" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
