"use client";

import { useRouter } from "next/navigation";
import { Calendar, Clock, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { GroupVoiceStatus } from "@/components/ui/group-voice-status";

interface GroupCardProps {
  productName: string;
  gamerCount: number;
  schedule: { localDay: string; localTime: string; tzAbbrev: string } | null;
  voiceIsOpen: boolean;
  voiceNextSessionStart?: Date | null;
  /** Where the Join button navigates (e.g. /gedu/voice/[id]). */
  joinHref: string;
  /** Where clicking the card navigates (e.g. /gedu/groups/[id]). */
  detailHref: string;
}

/**
 * Shared group card used across all roles (gedu, gamer, parent, admin).
 * Shows product name, gamer count, schedule, and voice status with join button.
 */
export function GroupCard({
  productName,
  gamerCount,
  schedule,
  voiceIsOpen,
  voiceNextSessionStart,
  joinHref,
  detailHref,
}: GroupCardProps) {
  const router = useRouter();

  return (
    <Card
      className="group cursor-pointer transition-colors hover:bg-accent/50"
      onClick={() => router.push(detailHref)}
    >
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{productName}</p>

          <div className="mt-1 flex items-center gap-x-4 gap-y-1 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {gamerCount} gamer{gamerCount !== 1 && "s"}
            </span>
            {schedule && (
              <>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {schedule.localDay}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {schedule.localTime} {schedule.tzAbbrev}
                </span>
              </>
            )}
          </div>

          {!voiceIsOpen && voiceNextSessionStart && (
            <div className="mt-1">
              <GroupVoiceStatus
                isOpen={false}
                nextSessionStart={voiceNextSessionStart}
                joinHref=""
              />
            </div>
          )}
        </div>

        {voiceIsOpen && (
          <GroupVoiceStatus isOpen joinHref={joinHref} />
        )}
      </CardContent>
    </Card>
  );
}
