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

export default function AdminUsersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: allUsers, isLoading: isLoadingAll } = useUsers();
  const { data: searchResults, isLoading: isSearching } = useSearchUsers(searchQuery);

  const users = searchQuery.length >= 2 ? searchResults : allUsers;
  const isLoading = searchQuery.length >= 2 ? isSearching : isLoadingAll;

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
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users by name, email, or username..."
                aria-label="Search users"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
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
                <div
                  key={user.id}
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
                  <div className="flex items-center gap-4">
                    <Badge className={ROLE_BADGES[user.role].className}>
                      {ROLE_BADGES[user.role].label}
                    </Badge>
                    <Link href={`/admin/users/${user.id}`}>
                      <Button variant="ghost" size="sm" className="group-hover:bg-secondary group-hover:text-secondary-foreground hover:!bg-secondary/80 hover:!text-secondary-foreground">
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              {searchQuery
                ? "No users found matching your search."
                : "No users found."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
