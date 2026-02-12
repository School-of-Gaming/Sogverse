"use client";

import { Mic, PhoneCall, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { SpatialVoiceRoom } from "@/components/voice/SpatialVoiceRoom";
import { useVoiceSession } from "@/hooks/use-voice-session";

function VoiceRoomListInner() {
  const { joining } = useVoiceRoom();
  const session = useVoiceSession({ canCreate: false });

  if (session.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // In a session — show spatial view
  if (session.joined && session.joinedRoomId) {
    return (
      <SpatialVoiceRoom
        room={null}
        onLeave={session.leaveSession}
        leaveLabel="Leave"
      />
    );
  }

  // Room browser
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

      {session.sessionEndedMessage && (
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-sm text-muted-foreground">{session.sessionEndedMessage}</p>
          </CardContent>
        </Card>
      )}

      {session.error && (
        <p className="text-sm text-destructive">{session.error}</p>
      )}

      {session.openRooms.length === 0 && !session.sessionEndedMessage ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mic className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No voice rooms are open right now. Check back later!
            </p>
          </CardContent>
        </Card>
      ) : (
        session.openRooms.map((room) => (
          <Card key={room.id}>
            <CardContent className="flex items-center gap-4 py-4">
              <Avatar>
                <Identicon id={room.creator_id} size={40} />
              </Avatar>

              <div className="flex-1">
                <p className="font-medium">{room.name}</p>
                <p className="text-sm text-muted-foreground">
                  {room.creator_display_name}
                </p>
              </div>

              <Button
                onClick={() => session.joinRoom(room)}
                disabled={joining || session.actionPending}
                size="sm"
                className="gap-1.5"
              >
                {joining || session.actionPending ? (
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
