"use client";

import { useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { GroupCard } from "@/components/ui/group-card";
import { LoungeCard } from "@/components/ui/lounge-card";
import { formatScheduleLocal } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import type { GroupWithVoice } from "@/hooks/use-groups-page";

export interface LoungeConfig {
  name: string;
  description: string;
  joinHref: string | null;
}

interface GroupsListContentProps {
  groups: GroupWithVoice[];
  isLoading: boolean;
  error: Error | null;
  lounges: LoungeConfig[];
  heading: string;
  subheading: string;
  emptyText: string;
  voiceRoute: (roomId: string) => string;
  detailRoute: (groupId: string) => string;
}

export function GroupsListContent({
  groups,
  isLoading,
  error,
  lounges,
  heading,
  subheading,
  emptyText,
  voiceRoute,
  detailRoute,
}: GroupsListContentProps) {
  const { locale } = useCurrency();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Groups</h1>
        <p className="text-muted-foreground">{subheading}</p>
      </div>

      {lounges.map((lounge) => (
        <LoungeCard
          key={lounge.name}
          name={lounge.name}
          description={lounge.description}
          joinHref={lounge.joinHref}
        />
      ))}

      <div className="space-y-3">
        {lounges.length > 0 && (
          <h2 className="text-lg font-semibold">{heading}</h2>
        )}

        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : error ? (
          <p className="text-sm text-destructive">
            {error.message}
          </p>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No Groups Yet</h3>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {emptyText}
              </p>
            </CardContent>
          </Card>
        ) : (
          groups.map((group) => (
            <GroupCardAdapter
              key={group.groupId}
              group={group}
              locale={locale}
              voiceRoute={voiceRoute}
              detailRoute={detailRoute}
            />
          ))
        )}
      </div>
    </div>
  );
}

function GroupCardAdapter({
  group,
  locale,
  voiceRoute,
  detailRoute,
}: {
  group: GroupWithVoice;
  locale: string;
  voiceRoute: (roomId: string) => string;
  detailRoute: (groupId: string) => string;
}) {
  const router = useRouter();
  const schedule = useMemo(
    () => formatScheduleLocal(group.dayOfWeek, group.startTime, group.timezone, locale),
    [group.dayOfWeek, group.startTime, group.timezone, locale],
  );
  const handleJoinClick = useCallback(
    () => router.push(voiceRoute(group.voiceRoomId)),
    [router, voiceRoute, group.voiceRoomId],
  );

  return (
    <GroupCard
      productName={group.productName}
      productImageUrl={group.productImageUrl}
      geduName={group.geduName}
      gamerCount={group.gamers.length}
      schedule={schedule}
      voiceIsOpen={group.voiceIsOpen}
      voiceNextSessionStart={group.voiceNextSessionStart}
      locale={locale}
      onJoinClick={handleJoinClick}
      detailHref={detailRoute(group.groupId)}
    />
  );
}
