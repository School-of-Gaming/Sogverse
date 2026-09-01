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
import { useUsers, useSearchUsers, useParentGamerLinks } from "@/services/users";
import {
  useGeduCertificationMap,
  useGeduContractAcceptanceMap,
} from "@/services/gedu";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import type { Profile, UserRole } from "@/types";

export default function AdminUsersPage() {
  const t = useTranslations('admin.users');
  const c = useTranslations('common');
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | null>(null);
  const { data: allUsers, isLoading: isLoadingAll } = useUsers();
  const { data: searchResults, isLoading: isSearching } = useSearchUsers(searchQuery);
  const { data: parentGamerLinks } = useParentGamerLinks();
  const certification = useGeduCertificationMap();
  const acceptances = useGeduContractAcceptanceMap();

  /**
   * The two warning marks are a **block**, and it stays silent until both reads
   * behind it have answered — or gives up entirely if either failed.
   *
   * Two reasons, and both are about honesty rather than caution. A warning
   * asserts that an educator has *not* done something, and an unanswered or
   * failed read cannot support that: an empty acceptance map would badge every
   * gedu on the platform as unsigned, which is the precise wrong answer rather
   * than a degraded one. And the two facts come from two independent queries
   * that can resolve in either order, so rendering each as it lands would let
   * the second one push the first sideways in the row's right-packed mark group
   * — the shift `UserRow`'s ordering note exists to prevent. Waiting for both
   * makes the pair one insertion at the left end of that group, which moves
   * nothing.
   */
  const standingKnown =
    !certification.isPending &&
    !certification.isError &&
    !acceptances.isPending &&
    !acceptances.isError;

  const geduStandingWarnings = useMemo(() => {
    if (!standingKnown) return new Map<string, GeduStandingWarnings>();
    const warnings = new Map<string, GeduStandingWarnings>();
    for (const [geduId, profile] of certification.map) {
      warnings.set(geduId, {
        // Matched on the base version, like every other "is this educator
        // current" check: the two languages of one version are the same
        // agreement, so signing either counts.
        contract:
          findGeduContractAcceptance(
            acceptances.map.get(geduId) ?? [],
            GEDU_CONTRACT_CURRENT_VERSION,
          ) === null,
        criminalRecordCheck: !profile.criminal_record_check_passed,
      });
    }
    return warnings;
  }, [standingKnown, certification.map, acceptances.map]);

  const ROLE_FILTERS: { value: UserRole; label: string }[] = [
    { value: "admin", label: c(ROLE_LABEL_KEYS.admin) },
    { value: "customer", label: c(ROLE_LABEL_KEYS.customer) },
    { value: "gedu", label: c(ROLE_LABEL_KEYS.gedu) },
  ];

  const isSearchActive = searchQuery.length >= 2;
  const baseUsers = isSearchActive ? searchResults?.results : allUsers;
  const isLoading = isSearchActive ? isSearching : isLoadingAll;

  // Search is capped server-side, so a full page of hits and a complete answer
  // look identical without this. Rendered *below* whichever branch is showing:
  // it appears as a search resolves, which is data's own schedule rather than
  // the user's, so it must not push anything already painted (CLAUDE.md layout
  // rule). It has to survive the empty branch too — a role filter or the
  // gamer→parent collapse can empty the display while the search was capped,
  // and "no users match" with no further word is exactly the lie this prevents.
  const cappedSearch =
    isSearchActive && searchResults && searchResults.total > searchResults.results.length
      ? { shown: searchResults.results.length, total: searchResults.total }
      : null;

  // Build maps from ALL users (not just search results) so gamer nesting always works
  const allUsersById = useMemo(
    () => new Map(allUsers?.map((u) => [u.id, u]) ?? []),
    [allUsers]
  );

  // parentId → gamer Profile[], and set of all gamer IDs that have a parent
  const { parentToGamers, gamerToParentIds } = useMemo(() => {
    const map = new Map<string, Profile[]>();
    const gamerParents = new Map<string, string[]>();

    if (!parentGamerLinks || !allUsers) return { parentToGamers: map, gamerToParentIds: gamerParents };

    for (const link of parentGamerLinks) {
      const gamer = allUsersById.get(link.gamer_id);
      if (!gamer) continue;

      const existing = map.get(link.parent_id) || [];
      existing.push(gamer);
      map.set(link.parent_id, existing);

      const parents = gamerParents.get(link.gamer_id) || [];
      parents.push(link.parent_id);
      gamerParents.set(link.gamer_id, parents);
    }

    return { parentToGamers: map, gamerToParentIds: gamerParents };
  }, [parentGamerLinks, allUsers, allUsersById]);

  // Build the display list: filter out gamers (they nest under parents),
  // and when searching for a gamer, pull their parent into the results
  const users = useMemo(() => {
    if (!baseUsers) return undefined;

    const result: Profile[] = [];
    const added = new Set<string>();

    for (const user of baseUsers) {
      if (user.role === "gamer" && gamerToParentIds.has(user.id)) {
        // Gamer with a parent — don't show standalone, but ensure parent is in the list
        for (const parentId of gamerToParentIds.get(user.id)!) {
          if (!added.has(parentId)) {
            const parent = allUsersById.get(parentId);
            if (parent) {
              result.push(parent);
              added.add(parentId);
            }
          }
        }
        continue;
      }

      if (!added.has(user.id)) {
        result.push(user);
        added.add(user.id);
      }
    }

    if (roleFilter) {
      return result.filter((u) => u.role === roleFilter);
    }

    return result;
  }, [baseUsers, gamerToParentIds, allUsersById, roleFilter]);


  return (
    // Reserve the document scrollbar gutter so the list/search results loading
    // in or filtering down doesn't shift the layout — see html:has() rule in
    // globals.css.
    <div className="space-y-6" data-reserve-scroll-gutter>
      <div>
        <h1 className="text-3xl font-semibold">{t('title')}</h1>
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
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                roleFilter === null
                  ? "bg-info text-info-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {t('all')}
            </button>
            {ROLE_FILTERS.map((rf) => (
              <button
                key={rf.value}
                onClick={() => setRoleFilter(roleFilter === rf.value ? null : rf.value)}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  roleFilter === rf.value
                    ? ROLE_BADGE_STYLES[rf.value]
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {rf.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 rounded-lg border p-4 animate-pulse"
                >
                  <div className="h-10 w-10 rounded-md bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded bg-muted" />
                    <div className="h-3 w-48 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {users && users.length > 0 ? (
                <div className="space-y-4">
                  {users.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      linkedGamers={parentToGamers.get(user.id)}
                      // An absent entry means "not certified" only when the read
                      // succeeded. If it failed we know nothing about anyone, so
                      // the answer is `null` and the badge is withheld rather
                      // than asserted — printing it across every gedu is the
                      // precise wrong answer, not a degraded one.
                      certified={
                        certification.isError
                          ? null
                          : certification.map.get(user.id)?.certified ?? false
                      }
                      // Absent for every non-gedu, and for every gedu until
                      // both standing reads have answered — see the block
                      // above. `null` is silence, never "nothing missing".
                      standingWarnings={
                        geduStandingWarnings.get(user.id) ?? null
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  {searchQuery || roleFilter
                    ? t('noFilterResults')
                    : t('noUsers')}
                </div>
              )}
              {cappedSearch && (
                <p className="pt-4 text-center text-sm text-muted-foreground">
                  {t('searchCapped', cappedSearch)}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

