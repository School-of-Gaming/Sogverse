"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { UserRow } from "@/components/admin/user-row";
import { useUsers, useSearchUsers, useParentGamerLinks } from "@/services/users";
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

  const ROLE_FILTERS: { value: UserRole; label: string }[] = [
    { value: "admin", label: c(ROLE_LABEL_KEYS.admin) },
    { value: "customer", label: c(ROLE_LABEL_KEYS.customer) },
    { value: "gedu", label: c(ROLE_LABEL_KEYS.gedu) },
  ];

  const isSearchActive = searchQuery.length >= 2;
  const baseUsers = isSearchActive ? searchResults : allUsers;
  const isLoading = isSearchActive ? isSearching : isLoadingAll;

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('manageAccounts')}
          </p>
        </div>
        <Link href={ROUTES.admin.usersAdd}>
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            {t('inviteGedu')}
          </Button>
        </Link>
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
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
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
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
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
          ) : users && users.length > 0 ? (
            <div className="space-y-4">
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  linkedGamers={parentToGamers.get(user.id)}
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
        </CardContent>
      </Card>
    </div>
  );
}

