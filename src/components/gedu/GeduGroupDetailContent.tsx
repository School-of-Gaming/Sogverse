"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Radio, Users } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { JoinButton } from "@/components/ui/join-button";
import { GroupVoiceStatus } from "@/components/ui/group-card";
import { PadletLink } from "@/components/ui/padlet-link";
import { useGeduGroupsPage } from "@/hooks/use-gedu-groups-page";
import { computeAge, formatScheduleLocal } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { ROUTES } from "@/lib/constants";

interface GeduGroupDetailContentProps {
  groupId: string;
}

export function GeduGroupDetailContent({ groupId }: GeduGroupDetailContentProps) {
  const { groups, isLoading, error } = useGeduGroupsPage();
  const { locale } = useCurrency();

  const group = useMemo(
    () => groups.find((g) => g.groupId === groupId) ?? null,
    [groups, groupId],
  );

  const schedule = useMemo(() => {
    if (!group) return null;
    return formatScheduleLocal(group.dayOfWeek, group.startTime, group.timezone, locale);
  }, [group, locale]);

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
        {error instanceof Error ? error.message : "Failed to load group"}
      </p>
    );
  }

  if (!group) {
    return (
      <div className="space-y-4">
        <Link
          href={ROUTES.gedu.groups}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Groups
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Group not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={ROUTES.gedu.groups}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Groups
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{group.productName}</h1>
            <Badge className="shrink-0">
              {group.gameName}
            </Badge>
            {group.voiceIsOpen && (
              <Badge className="bg-success/10 text-success text-xs shrink-0">
                <Radio className="mr-1 h-3 w-3" />
                Live
              </Badge>
            )}
          </div>
          <div className="mt-1">
            <GroupVoiceStatus
              nextSessionStart={group.voiceNextSessionStart}
              locale={locale}
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {schedule && (
              <>Every {schedule.localDay} at {schedule.localTime} {schedule.tzAbbrev}</>
            )}
            {schedule && group.durationMinutes && " · "}
            {group.durationMinutes && <>{group.durationMinutes} min</>}
            {(schedule || group.durationMinutes) && " · "}
            <>Ages {group.productMinAge}–{group.productMaxAge}</>
          </p>
          {group.productPadletUrl && (
            <PadletLink href={group.productPadletUrl} />
          )}
        </div>
        <JoinButton
          href={`${ROUTES.gedu.voice(group.voiceRoomId)}?groupId=${group.groupId}`}
          disabled={!group.voiceIsOpen}
        />
      </div>

      {/* Gamers Roster */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Gamers ({group.gamers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {group.gamers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No gamers enrolled in this group yet.
            </p>
          ) : (
            <div className="divide-y">
              {group.gamers.map((gamer) => (
                <div
                  key={gamer.gamerId}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <Identicon id={gamer.gamerId} size={32} />
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{gamer.displayName}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Age {computeAge(gamer.dateOfBirth)}</span>
                        <span className="capitalize">{gamer.gender.replace("_", " ")}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
