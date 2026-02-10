"use client";

import { Mic, MicOff, Video, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { cn } from "@/lib/utils";

export function ParticipantList() {
  const { participants } = useVoiceRoom();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Participants ({participants.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {participants.map((p) => (
          <div
            key={p.sessionId}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-2 transition-colors",
              p.isLocal && "bg-accent/50"
            )}
          >
            {/* Avatar */}
            <Avatar className="h-8 w-8">
              <Identicon id={p.userId} size={32} />
            </Avatar>

            {/* Name + badges */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-sm font-medium">
                {p.userName}
                {p.isLocal && (
                  <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                )}
              </span>
              {p.isOwner && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Crown className="h-3 w-3" />
                  Host
                </Badge>
              )}
            </div>

            {/* Status indicators */}
            <div className="flex items-center gap-1.5">
              {p.videoOn && (
                <Video className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              {p.audioOn ? (
                <Mic className="h-3.5 w-3.5 text-success" />
              ) : (
                <MicOff className="h-3.5 w-3.5 text-destructive" />
              )}
            </div>
          </div>
        ))}

        {participants.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No participants yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}
