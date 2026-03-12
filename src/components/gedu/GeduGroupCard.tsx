"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, Clock, Users, PhoneCall, Radio } from "lucide-react";
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NextSession } from "@/components/ui/next-session";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { cn, formatScheduleLocal } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import type { GeduGroupWithVoice } from "@/hooks/use-gedu-groups-page";

interface GeduGroupCardProps {
  group: GeduGroupWithVoice;
}

export function GeduGroupCard({ group }: GeduGroupCardProps) {
  const { locale } = useCurrency();
  const router = useRouter();

  const schedule = useMemo(() => {
    if (group.dayOfWeek == null || !group.startTime || !group.timezone) return null;
    return formatScheduleLocal(group.dayOfWeek, group.startTime, group.timezone, locale);
  }, [group.dayOfWeek, group.startTime, group.timezone, locale]);

  return (
    <Card
      className="group cursor-pointer transition-colors hover:bg-accent/50"
      onClick={() => router.push(`/gedu/groups/${group.groupId}`)}
    >
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">{group.productName}</p>
            {group.voiceIsOpen && group.voiceRoomId && (
              <Badge className="bg-success/10 text-success text-xs shrink-0">
                <Radio className="mr-1 h-3 w-3" />
                Live
              </Badge>
            )}
          </div>

          <div className="mt-1 flex items-center gap-x-4 gap-y-1 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {group.gamers.length} gamer{group.gamers.length !== 1 && "s"}
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

          {!group.voiceIsOpen && group.voiceNextSessionStart && (
            <div className="mt-1">
              <NextSession nextSessionStart={group.voiceNextSessionStart} locale={locale} />
            </div>
          )}
        </div>

        {group.voiceIsOpen && group.voiceRoomId && (
          <Link
            href={ROUTES.gedu.voice(group.voiceRoomId)}
            className={cn(buttonVariants({ size: "sm" }), "gap-1.5 shrink-0")}
            onClick={(e) => e.stopPropagation()}
          >
            <PhoneCall className="h-4 w-4" />
            Join
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
