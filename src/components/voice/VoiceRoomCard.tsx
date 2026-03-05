"use client";

import { useMemo } from "react";
import { Calendar, Clock, PhoneCall, Loader2, Radio } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NextSession } from "@/components/ui/next-session";
import type { AvailableVoiceRoomWithWindow } from "@/services/voice";
import { formatScheduleLocal } from "@/lib/utils";

interface VoiceRoomCardProps {
  room: AvailableVoiceRoomWithWindow;
  onJoin: (room: AvailableVoiceRoomWithWindow) => void;
  disabled?: boolean;
}

export function VoiceRoomCard({ room, onJoin, disabled }: VoiceRoomCardProps) {
  const isAlwaysOpen = room.room_type !== "group";

  const schedule = useMemo(() => {
    if (isAlwaysOpen || room.day_of_week == null || !room.start_time || !room.timezone) return null;
    return formatScheduleLocal(room.day_of_week, room.start_time, room.timezone);
  }, [isAlwaysOpen, room.day_of_week, room.start_time, room.timezone]);

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">
              {room.product_name ?? room.name}
            </p>
            {isAlwaysOpen && (
              <Badge variant="secondary" className="text-xs shrink-0">
                Always Open
              </Badge>
            )}
            {!isAlwaysOpen && room.isOpen && (
              <Badge className="bg-success/10 text-success text-xs shrink-0">
                <Radio className="mr-1 h-3 w-3" />
                Live
              </Badge>
            )}
          </div>

          {room.gedu_display_name && (
            <p className="text-sm text-muted-foreground truncate">
              {room.gedu_display_name}
            </p>
          )}

          {!isAlwaysOpen && schedule && (
            <div className="mt-1 flex items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Every {schedule.localDay}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {schedule.localTime} {schedule.tzAbbrev}
              </span>
            </div>
          )}

          {!isAlwaysOpen && !room.isOpen && room.nextSessionStart && (
            <div className="mt-1">
              <NextSession nextSessionStart={room.nextSessionStart} />
            </div>
          )}
        </div>

        {(isAlwaysOpen || room.isOpen) && (
          <Button
            onClick={() => onJoin(room)}
            disabled={disabled}
            size="sm"
            className="gap-1.5 shrink-0"
          >
            {disabled ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PhoneCall className="h-4 w-4" />
            )}
            Join
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
