"use client";

import { useState } from "react";
import { Mic, Radio, PhoneCall, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { VoiceControls } from "@/components/voice/VoiceControls";
import { ParticipantList } from "@/components/voice/ParticipantList";
import { VideoTile } from "@/components/voice/VideoTile";
import { useMyVoiceRoom, useOpenRoom, useCloseRoom, useVoiceToken } from "@/services/voice";
import { useVoiceRoomRealtime } from "@/hooks/use-voice-room-realtime";

function VoiceRoomPanelInner() {
  const { data: room, isLoading } = useMyVoiceRoom();
  const openRoom = useOpenRoom();
  const closeRoom = useCloseRoom();
  const getToken = useVoiceToken();
  const { joined, joining, join, participants } = useVoiceRoom();
  const [error, setError] = useState<string | null>(null);

  useVoiceRoomRealtime();

  const handleOpenRoom = async () => {
    setError(null);
    try {
      await openRoom.mutateAsync(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open room");
    }
  };

  const handleCloseRoom = async () => {
    setError(null);
    try {
      await closeRoom.mutateAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close room");
    }
  };

  const handleJoin = async () => {
    if (!room) return;
    setError(null);
    try {
      const { token, roomUrl } = await getToken.mutateAsync(room.id);
      await join(roomUrl, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join room");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // No room yet or room is closed — show open/create button
  if (!room || room.status === "closed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Voice Room
          </CardTitle>
          <CardDescription>
            {room
              ? "Your voice room is currently closed. Open it to start a live session with gamers."
              : "Create and open your voice room to start a live session with gamers."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 text-sm text-destructive">{error}</p>
          )}
          <Button
            onClick={handleOpenRoom}
            disabled={openRoom.isPending}
            className="gap-2"
          >
            {openRoom.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radio className="h-4 w-4" />
            )}
            {room ? "Open Room" : "Create & Open Room"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Room is open
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              {room.name}
            </CardTitle>
            <Badge className="bg-success/10 text-success">
              <Radio className="mr-1 h-3 w-3" />
              Live
            </Badge>
          </div>
          <CardDescription>
            Your room is open. Gamers can see and join your session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 text-sm text-destructive">{error}</p>
          )}

          {!joined ? (
            <div className="flex gap-2">
              <Button
                onClick={handleJoin}
                disabled={joining || getToken.isPending}
                className="gap-2"
              >
                {joining || getToken.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PhoneCall className="h-4 w-4" />
                )}
                Join Room
              </Button>
              <Button
                variant="outline"
                onClick={handleCloseRoom}
                disabled={closeRoom.isPending}
              >
                {closeRoom.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Close Room"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <VoiceControls />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCloseRoom}
                  disabled={closeRoom.isPending}
                >
                  {closeRoom.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Close Room"
                  )}
                </Button>
              </div>

              {/* Gedu's own video tile */}
              {participants.find((p) => p.isLocal && p.videoOn) && (
                <VideoTile
                  sessionId={
                    participants.find((p) => p.isLocal)!.sessionId
                  }
                  className="aspect-video max-w-sm overflow-hidden rounded-lg border"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {joined && <ParticipantList />}
    </div>
  );
}

export function VoiceRoomPanel() {
  return (
    <VoiceRoomProvider>
      <VoiceRoomPanelInner />
    </VoiceRoomProvider>
  );
}
