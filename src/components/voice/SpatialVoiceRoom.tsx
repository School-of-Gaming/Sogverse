"use client";

import { useState } from "react";
import { Mic, Radio, Loader2, PhoneOff, Power } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { VoiceControls } from "./VoiceControls";
import { SpatialCanvas } from "./SpatialCanvas";
import type { VoiceRoom } from "@/types";

interface SpatialVoiceRoomProps {
  room: VoiceRoom | null;
  onLeave: () => Promise<void>;
  onEndSession?: () => Promise<void>;
  leaveLabel?: string;
}

export function SpatialVoiceRoom({
  room,
  onLeave,
  onEndSession,
  leaveLabel = "Leave",
}: SpatialVoiceRoomProps) {
  const { participants, localRole, leave, joining } = useVoiceRoom();
  const [leaving, setLeaving] = useState(false);
  const [ending, setEnding] = useState(false);

  const isHost = localRole === "admin" || localRole === "gedu";

  // Count other hosts in the session
  const otherHostCount = participants.filter(
    (p) => !p.isLocal && (p.role === "admin" || p.role === "gedu")
  ).length;
  const isLastHost = isHost && otherHostCount === 0;

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await leave();
      await onLeave();
    } finally {
      setLeaving(false);
    }
  };

  const handleEndSession = async () => {
    if (!onEndSession) return;
    setEnding(true);
    try {
      await leave();
      await onEndSession();
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              {room?.name ?? "Voice Room"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {participants.length} participant{participants.length !== 1 && "s"}
              </Badge>
              <Badge className="bg-success/10 text-success">
                <Radio className="mr-1 h-3 w-3" />
                Live
              </Badge>
            </div>
          </div>
          <CardDescription>
            Drag your avatar to move between zones. Same-zone participants can hear each other.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SpatialCanvas />

          <div className="flex items-center justify-between">
            <VoiceControls />

            <div className="flex items-center gap-2">
              {/* Gamers always see Leave. Hosts see Leave when not last host. */}
              {(!isHost || !isLastHost) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleLeave}
                  disabled={joining || leaving || ending}
                  className="gap-1.5"
                >
                  {leaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PhoneOff className="h-4 w-4" />
                  )}
                  {leaveLabel}
                </Button>
              )}

              {/* Hosts see End Session */}
              {isHost && onEndSession && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleEndSession}
                  disabled={joining || leaving || ending}
                  className="gap-1.5"
                >
                  {ending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                  End Session
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
