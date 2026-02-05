"use client";

import Link from "next/link";
import { UserPlus, Gamepad2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMyGamers } from "@/services/gamers";
import { formatRelativeTime } from "@/lib/utils";

export default function CustomerGamersPage() {
  const { data: gamers, isLoading } = useMyGamers();

  const getInitials = (displayName?: string | null, username?: string | null) => {
    const name = displayName || username || "G";
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Gamers</h1>
          <p className="text-muted-foreground">
            View and manage your linked gamer accounts
          </p>
        </div>
        <Link href="/customer/gamers/add">
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Gamer
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-muted" />
                  <div className="space-y-2">
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-3 w-16 rounded bg-muted" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : gamers && gamers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {gamers.map((gamer) => (
            <Card key={gamer.id} className="transition-colors hover:bg-accent">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={gamer.avatar_url || undefined} />
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        {getInitials(gamer.display_name, gamer.username)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-lg">
                        {gamer.display_name || gamer.username}
                      </CardTitle>
                      <CardDescription>@{gamer.username}</CardDescription>
                    </div>
                  </div>
                  <Gamepad2 className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Joined {formatRelativeTime(gamer.created_at)}
                  </p>
                  <Button variant="ghost" size="sm">
                    <Settings className="mr-2 h-4 w-4" />
                    Manage
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Gamepad2 className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No Gamers Yet</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Create a gamer account for your child to get started with educational gaming.
            </p>
            <Link href="/customer/gamers/add" className="mt-4">
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Your First Gamer
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
