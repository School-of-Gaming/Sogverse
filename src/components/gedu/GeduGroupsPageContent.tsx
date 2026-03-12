"use client";

import { Loader2, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useGeduGroupsPage } from "@/hooks/use-gedu-groups-page";
import { GeduLoungeCard } from "./GeduLoungeCard";
import { GeduGroupCard } from "./GeduGroupCard";

export function GeduGroupsPageContent() {
  const { groups, loungeRoom, isLoading, error } = useGeduGroupsPage();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load groups"}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Groups</h1>
        <p className="text-muted-foreground">
          Your assigned groups, students, and voice sessions.
        </p>
      </div>

      {loungeRoom && <GeduLoungeCard room={loungeRoom} />}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">No Groups Yet</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Groups will appear here when an admin assigns you to a product.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Your Groups</h2>
          {groups.map((group) => (
            <GeduGroupCard key={group.groupId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
