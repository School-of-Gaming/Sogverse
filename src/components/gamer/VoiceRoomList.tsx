"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, PhoneCall, Radio, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { VoiceControls } from "@/components/voice/VoiceControls";
import { ParticipantList } from "@/components/voice/ParticipantList";
import { VideoTile } from "@/components/voice/VideoTile";
import { useOpenVoiceRooms, useVoiceToken } from "@/services/voice";
import { useVoiceRoomRealtime } from "@/hooks/use-voice-room-realtime";
import type { OpenVoiceRoom } from "@/types";

function VoiceRoomListInner() {
  const { data: rooms, isLoading } = useOpenVoiceRooms();
  const getToken = useVoiceToken();
  const { joined, joining, join, leave, participants } = useVoiceRoom();
  const [joinedRoomId, setJoinedRoomId] = useState<string | null>(null);
  const [sessionEndedMessage, setSessionEndedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Track the room name for the "session ended" message
  const joinedRoomNameRef = useRef<string | null>(null);

  useVoiceRoomRealtime();

  // Auto-leave when the educator ends the session (room disappears from open list)
  useEffect(() => {
    if (!joined || !joinedRoomId || !rooms) return;

    const roomStillOpen = rooms.some((r) => r.id === joinedRoomId);
    if (!roomStillOpen) {
      leave();
      setSessionEndedMessage(
        `${joinedRoomNameRef.current ?? "The session"} has ended.`
      );
      setJoinedRoomId(null);
      joinedRoomNameRef.current = null;
    }
  }, [joined, joinedRoomId, rooms, leave]);

  const handleJoin = async (room: OpenVoiceRoom) => {
    setError(null);
    setSessionEndedMessage(null);
    try {
      const { token, roomUrl } = await getToken.mutateAsync(room.id);
      await join(roomUrl, token);
      setJoinedRoomId(room.id);
      joinedRoomNameRef.current = room.name;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join room");
    }
  };

  const handleLeave = async () => {
    setJoinedRoomId(null);
    joinedRoomNameRef.current = null;
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

  // In a session
  if (joined && joinedRoomId) {
    const currentRoom = rooms?.find((r) => r.id === joinedRoomId);
    const geduParticipant = participants.find((p) => p.isOwner && p.videoOn);

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5" />
                {currentRoom?.name || "Voice Room"}
              </CardTitle>
              <Badge className="bg-success/10 text-success">
                <Radio className="mr-1 h-3 w-3" />
                Connected
              </Badge>
            </div>
            {currentRoom && (
              <CardDescription>
                Hosted by {currentRoom.gedu_display_name}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Gedu's video feed */}
            {geduParticipant && (
              <VideoTile
                sessionId={geduParticipant.sessionId}
                className="aspect-video w-full overflow-hidden rounded-lg border"
              />
            )}

            <VoiceControls onLeave={handleLeave} />
          </CardContent>
        </Card>

        <ParticipantList />
      </div>
    );
  }

  // Room browser
  const openRooms = rooms || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Voice Rooms
          </CardTitle>
          <CardDescription>
            Join a live voice session with your educator.
          </CardDescription>
        </CardHeader>
      </Card>

      {sessionEndedMessage && (
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-sm text-muted-foreground">{sessionEndedMessage}</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {openRooms.length === 0 && !sessionEndedMessage ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mic className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No voice rooms are open right now. Check back later!
            </p>
          </CardContent>
        </Card>
      ) : (
        openRooms.map((room) => (
          <Card key={room.id}>
            <CardContent className="flex items-center gap-4 py-4">
              {/* Educator avatar */}
              <Avatar>
                <Identicon id={room.gedu_id} size={40} />
              </Avatar>

              {/* Room info */}
              <div className="flex-1">
                <p className="font-medium">{room.name}</p>
                <p className="text-sm text-muted-foreground">
                  {room.gedu_display_name}
                </p>
              </div>

              {/* Join button */}
              <Button
                onClick={() => handleJoin(room)}
                disabled={joining || getToken.isPending}
                size="sm"
                className="gap-1.5"
              >
                {joining || getToken.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PhoneCall className="h-4 w-4" />
                )}
                Join
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

export function VoiceRoomList() {
  return (
    <VoiceRoomProvider>
      <VoiceRoomListInner />
    </VoiceRoomProvider>
  );
}
