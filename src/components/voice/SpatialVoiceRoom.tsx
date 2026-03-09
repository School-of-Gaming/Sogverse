"use client";

import { useState } from "react";
import { Mic, Radio, Loader2, PhoneOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { VoiceControls } from "./VoiceControls";
import { SpatialCanvas } from "./SpatialCanvas";
import { ScreenShareDisplay } from "./ScreenShareDisplay";
import { ParticipantList } from "./ParticipantList";
import type { AvailableVoiceRoomWithWindow } from "@/services/voice";

interface SpatialVoiceRoomProps {
  room: AvailableVoiceRoomWithWindow | null;
  onLeave: () => Promise<void>;
  leaveLabel?: string;
}

export function SpatialVoiceRoom({
  room,
  onLeave,
  leaveLabel = "Leave",
}: SpatialVoiceRoomProps) {
  const { participants, joining, screenSharerSessionId } = useVoiceRoom();
  const [leaving, setLeaving] = useState(false);

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await onLeave();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              {room?.product_name ?? room?.name ?? "Voice Room"}
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
          {/* Screen share display (above canvas when active) */}
          {screenSharerSessionId && <ScreenShareDisplay />}

          <SpatialCanvas />

          <div className="flex items-center justify-between">
            <VoiceControls />

            <Button
              variant="secondary"
              size="sm"
              onClick={handleLeave}
              disabled={joining || leaving}
              className="gap-1.5"
            >
              {leaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PhoneOff className="h-4 w-4" />
              )}
              {leaveLabel}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Participant list (always visible below the voice room card) */}
      <ParticipantList />
    </div>
  );
}
