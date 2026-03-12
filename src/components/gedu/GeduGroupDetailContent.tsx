"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, Clock, Timer, Globe, Users } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GroupVoiceStatus } from "@/components/ui/group-voice-status";
import { useGeduGroupsPage } from "@/hooks/use-gedu-groups-page";
import { formatScheduleLocal } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { ROUTES } from "@/lib/constants";

interface GeduGroupDetailContentProps {
  groupId: string;
}

function computeAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export function GeduGroupDetailContent({ groupId }: GeduGroupDetailContentProps) {
  const { groups, isLoading, error } = useGeduGroupsPage();
  const { locale } = useCurrency();

  const group = useMemo(
    () => groups.find((g) => g.groupId === groupId) ?? null,
    [groups, groupId],
  );

  const schedule = useMemo(() => {
    if (!group || group.dayOfWeek == null || !group.startTime || !group.timezone) return null;
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
          href="/gedu/groups"
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
        href="/gedu/groups"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Groups
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{group.productName}</h1>
        {group.voiceRoomId && (
          <div className="mt-2">
            <GroupVoiceStatus
              isOpen={group.voiceIsOpen}
              nextSessionStart={group.voiceNextSessionStart}
              joinHref={ROUTES.gedu.voice(group.voiceRoomId)}
            />
          </div>
        )}
      </div>

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {schedule && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Every {schedule.localDay}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{schedule.localTime} {schedule.tzAbbrev}</span>
                </div>
              </>
            )}
            {group.durationMinutes && (
              <div className="flex items-center gap-2 text-sm">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span>{group.durationMinutes} minutes</span>
              </div>
            )}
            {group.timezone && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span>{group.timezone}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
                  <div>
                    <p className="text-sm font-medium">{gamer.displayName}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {gamer.dateOfBirth && (
                        <span>Age {computeAge(gamer.dateOfBirth)}</span>
                      )}
                      {gamer.gender && (
                        <span className="capitalize">{gamer.gender.replace("_", " ")}</span>
                      )}
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
