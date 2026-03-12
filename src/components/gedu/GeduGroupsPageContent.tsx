"use client";

import { useMemo } from "react";
import { Loader2, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { GroupCard } from "@/components/ui/group-card";
import { LoungeCard } from "@/components/ui/lounge-card";
import { useGeduGroupsPage } from "@/hooks/use-gedu-groups-page";
import { ROUTES } from "@/lib/constants";
import { formatScheduleLocal } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";

export function GeduGroupsPageContent() {
  const { groups, loungeRoomId, isLoading, error } = useGeduGroupsPage();
  const { locale } = useCurrency();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Groups</h1>
        <p className="text-muted-foreground">
          Your assigned groups, students, and voice sessions.
        </p>
      </div>

      <LoungeCard
        name="Gedu Lounge"
        description="Connect with other educators anytime"
        joinHref={loungeRoomId ? ROUTES.gedu.voice(loungeRoomId) : null}
      />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Your Groups</h2>

        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : error ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load groups"}
          </p>
        ) : groups.length === 0 ? (
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
          groups.map((group) => (
            <GeduGroupCardAdapter key={group.groupId} group={group} locale={locale} />
          ))
        )}
      </div>
    </div>
  );
}

/** Thin adapter mapping GeduGroupWithVoice to the shared GroupCard props. */
function GeduGroupCardAdapter({ group, locale }: { group: import("@/hooks/use-gedu-groups-page").GeduGroupWithVoice; locale: string }) {
  const schedule = useMemo(
    () => formatScheduleLocal(group.dayOfWeek, group.startTime, group.timezone, locale),
    [group.dayOfWeek, group.startTime, group.timezone, locale],
  );

  return (
    <GroupCard
      productName={group.productName}
      geduName={group.geduName}
      gamerCount={group.gamers.length}
      schedule={schedule}
      voiceIsOpen={group.voiceIsOpen}
      voiceNextSessionStart={group.voiceNextSessionStart}
      locale={locale}
      joinHref={ROUTES.gedu.voice(group.voiceRoomId)}
      detailHref={`/gedu/groups/${group.groupId}`}
    />
  );
}
