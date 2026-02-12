"use client";

import { Mic, Radio, PhoneCall, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { SpatialVoiceRoom } from "@/components/voice/SpatialVoiceRoom";
import { useVoiceSession } from "@/hooks/use-voice-session";

function VoiceRoomPanelInner() {
  const { joining } = useVoiceRoom();
  const session = useVoiceSession({ canCreate: true });

  if (session.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Active session — in the call
  if (session.joined && session.joinedRoomId) {
    return (
      <SpatialVoiceRoom
        room={session.isOwnRoom ? (session.myRoom ?? null) : null}
        onLeave={session.leaveSession}
        onEndSession={session.isOwnRoom ? session.endSession : undefined}
        leaveLabel="Leave"
      />
    );
  }

  // Reconnecting
  if (session.reconnecting) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-3 py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Reconnecting to session...</p>
        </CardContent>
      </Card>
    );
  }

  // No active session — offer to start one + browse rooms
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Voice Rooms</h1>
        <p className="text-muted-foreground">
          Start a session or join an open room.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Voice Rooms
          </CardTitle>
          <CardDescription>
            Start a live voice session or join an open room.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {session.error && (
            <p className="mb-4 text-sm text-destructive">{session.error}</p>
          )}
          <Button
            onClick={session.startSession}
            disabled={session.actionPending}
            className="gap-2"
          >
            {session.actionPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radio className="h-4 w-4" />
            )}
            Start Session
          </Button>
        </CardContent>
      </Card>

      {/* Room browser */}
      {session.otherRooms.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open Rooms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {session.otherRooms.map((r) => (
              <div key={r.id} className="flex items-center gap-4">
                <Avatar>
                  <Identicon id={r.creator_id} size={40} />
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.creator_display_name}
                  </p>
                </div>
                <Button
                  onClick={() => session.joinRoom(r)}
                  disabled={joining || session.actionPending}
                  size="sm"
                  className="gap-1.5"
                >
                  {joining ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PhoneCall className="h-4 w-4" />
                  )}
                  Join
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
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
