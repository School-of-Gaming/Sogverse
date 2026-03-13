"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, UserPlus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { useUsers, useSearchUsers, useParentGamerLinks } from "@/services/users";
import { ROLE_BADGES } from "@/lib/constants";
import type { Profile, UserRole } from "@/types";

const ROLE_FILTERS: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "customer", label: "Customer" },
  { value: "gedu", label: "Gedu" },
];

export default function AdminUsersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | null>(null);
  const { data: allUsers, isLoading: isLoadingAll } = useUsers();
  const { data: searchResults, isLoading: isSearching } = useSearchUsers(searchQuery);
  const { data: parentGamerLinks } = useParentGamerLinks();

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
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            Manage user accounts and permissions
          </p>
        </div>
        <Link href="/admin/users/add">
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search users by name, email, or username..."
              aria-label="Search users"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground mr-1">Role:</span>
            <button
              onClick={() => setRoleFilter(null)}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                roleFilter === null
                  ? "bg-info text-info-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              All
            </button>
            {ROLE_FILTERS.map((rf) => (
              <button
                key={rf.value}
                onClick={() => setRoleFilter(roleFilter === rf.value ? null : rf.value)}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  roleFilter === rf.value
                    ? ROLE_BADGES[rf.value].className
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
                ? "No users found matching your filters."
                : "No users found."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserRow({ user, linkedGamers }: { user: Profile; linkedGamers?: Profile[] }) {
  return (
    <div className="rounded-lg border">
      <Link
        href={`/admin/users/${user.id}`}
        className="group flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-4">
          <Avatar>
            <Identicon id={user.id} size={40} />
          </Avatar>
          <div>
            <p className="font-medium">
              {user.display_name || user.username || "Unnamed User"}
            </p>
            <p className="text-sm text-muted-foreground">
              {user.email || user.username}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={ROLE_BADGES[user.role].className}>
            {ROLE_BADGES[user.role].label}
          </Badge>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </Link>

      {user.role === "customer" && (!linkedGamers || linkedGamers.length === 0) && (
        <div className="border-t bg-muted/30 py-3 pl-14 pr-4">
          <p className="text-sm text-muted-foreground">No connected gamers</p>
        </div>
      )}

      {linkedGamers && linkedGamers.length > 0 && (
        <div className="border-t bg-muted/30">
          {linkedGamers.map((gamer) => (
            <Link
              key={gamer.id}
              href={`/admin/users/${gamer.id}`}
              className="group flex items-center justify-between py-3 pr-4 pl-14 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-7 w-7">
                  <Identicon id={gamer.id} size={28} />
                </Avatar>
                <p className="text-sm font-medium">
                  {gamer.display_name || gamer.username || "Unnamed Gamer"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${ROLE_BADGES.gamer.className} text-[10px] px-2 py-0`}>
                  {ROLE_BADGES.gamer.label}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
