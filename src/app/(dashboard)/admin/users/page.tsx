"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { useUsers, useSearchUsers } from "@/services/users";
import { ROLE_BADGES } from "@/lib/constants";
import type { UserRole } from "@/types";

const ROLE_FILTERS: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "customer", label: "Customer" },
  { value: "gamer", label: "Gamer" },
  { value: "gedu", label: "Gedu" },
];

export default function AdminUsersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilters, setRoleFilters] = useState<Set<UserRole>>(new Set());
  const { data: allUsers, isLoading: isLoadingAll } = useUsers();
  const { data: searchResults, isLoading: isSearching } = useSearchUsers(searchQuery);

  const isSearchActive = searchQuery.length >= 2;
  const baseUsers = isSearchActive ? searchResults : allUsers;
  const users = roleFilters.size > 0
    ? baseUsers?.filter((u) => roleFilters.has(u.role))
    : baseUsers;
  const isLoading = isSearchActive ? isSearching : isLoadingAll;

  function toggleRole(role: UserRole) {
    setRoleFilters((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

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
              onClick={() => setRoleFilters(new Set())}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                roleFilters.size === 0
                  ? "bg-info text-info-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              All
            </button>
            {ROLE_FILTERS.map((rf) => (
              <button
                key={rf.value}
                onClick={() => toggleRole(rf.value)}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  roleFilters.has(rf.value)
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
                <Link
                  key={user.id}
                  href={`/admin/users/${user.id}`}
                  className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarImage src={user.avatar_url || undefined} />
                      <Identicon id={user.id} size={40} />
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {user.display_name || user.username || "Unnamed User"}
                      </p>
                      <p className="text-sm text-muted-foreground group-hover:text-accent-foreground/70">
                        {user.email || user.username}
                      </p>
                    </div>
                  </div>
                  <Badge className={ROLE_BADGES[user.role].className}>
                    {ROLE_BADGES[user.role].label}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              {searchQuery || roleFilters.size > 0
                ? "No users found matching your filters."
                : "No users found."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
