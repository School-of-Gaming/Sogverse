"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Radio, Loader2 } from "lucide-react";
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
  const { joined, join, leave, participants } = useVoiceRoom();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectAttempted = useRef(false);

  useVoiceRoomRealtime();

  /** Open the room (idempotent if already open), get a token, and join. */
  const handleStartSession = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      const voiceRoom = await openRoom.mutateAsync(undefined);
      const { token, roomUrl } = await getToken.mutateAsync(voiceRoom.id);
      await join(roomUrl, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    } finally {
      setStarting(false);
    }
  }, [openRoom, getToken, join]);

  /** Leave the call and close the room in one action. */
  const handleEndSession = async () => {
    setError(null);
    try {
      await leave();
      await closeRoom.mutateAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end session");
    }
  };

  // Auto-reconnect if the room is open but we're not in the call (e.g. page reload)
  useEffect(() => {
    if (room?.status === "open" && !joined && !starting && !reconnectAttempted.current) {
      reconnectAttempted.current = true;
      handleStartSession();
    }
  }, [room?.status, joined, starting, handleStartSession]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Active session — gedu is in the call
  if (joined) {
    const localParticipant = participants.find((p) => p.isLocal);

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5" />
                {room?.name ?? "Voice Room"}
              </CardTitle>
              <Badge className="bg-success/10 text-success">
                <Radio className="mr-1 h-3 w-3" />
                Live
              </Badge>
            </div>
            <CardDescription>
              Your session is live. Gamers can see and join your room.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <VoiceControls
              onLeave={handleEndSession}
              leaveLabel="End Session"
            />

            {/* Gedu's own video tile */}
            {localParticipant?.videoOn && (
              <VideoTile
                sessionId={localParticipant.sessionId}
                className="aspect-video max-w-sm overflow-hidden rounded-lg border"
              />
            )}
          </CardContent>
        </Card>

        <ParticipantList />
      </div>
    );
  }

  // Reconnecting to active session
  if (starting) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-3 py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Reconnecting to session...</p>
        </CardContent>
      </Card>
    );
  }

  // No active session — offer to start one
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5" />
          Voice Room
        </CardTitle>
        <CardDescription>
          Start a live voice session. Gamers will be able to see your room and join.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="mb-4 text-sm text-destructive">{error}</p>
        )}
        <Button
          onClick={handleStartSession}
          disabled={starting}
          className="gap-2"
        >
          <Radio className="h-4 w-4" />
          Start Session
        </Button>
      </CardContent>
    </Card>
  );
}

export function VoiceRoomPanel() {
  return (
    <VoiceRoomProvider>
      <VoiceRoomPanelInner />
    </VoiceRoomProvider>
  );
}
