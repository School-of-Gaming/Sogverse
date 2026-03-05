"use client";

import { Mic, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { SpatialVoiceRoom } from "@/components/voice/SpatialVoiceRoom";
import { VoiceRoomCard } from "@/components/voice/VoiceRoomCard";
import { useVoiceSession } from "@/hooks/use-voice-session";

function VoiceRoomDashboardInner() {
  const { joining } = useVoiceRoom();
  const session = useVoiceSession();

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
    const joinedRoom = session.rooms.find((r) => r.id === session.joinedRoomId) ?? null;
    return (
      <SpatialVoiceRoom
        room={joinedRoom}
        onLeave={session.leaveSession}
        leaveLabel="Leave"
      />
    );
  }

  const hasRooms =
    session.alwaysOpenRooms.length > 0 ||
    session.openGroupRooms.length > 0 ||
    session.upcomingRooms.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Voice Rooms</h1>
        <p className="text-muted-foreground">
          Join a live voice session or see upcoming schedules.
        </p>
      </div>

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

      {!hasRooms ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mic className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No voice rooms available. Check back later!
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Always-open rooms */}
          {session.alwaysOpenRooms.length > 0 && (
            <div className="space-y-3">
              {session.alwaysOpenRooms.map((room) => (
                <VoiceRoomCard
                  key={room.id}
                  room={room}
                  onJoin={session.joinRoom}
                  disabled={joining || session.actionPending}
                />
              ))}
            </div>
          )}

          {/* Live group rooms */}
          {session.openGroupRooms.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Live Now</h2>
              {session.openGroupRooms.map((room) => (
                <VoiceRoomCard
                  key={room.id}
                  room={room}
                  onJoin={session.joinRoom}
                  disabled={joining || session.actionPending}
                />
              ))}
            </div>
          )}

          {/* Upcoming group rooms */}
          {session.upcomingRooms.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Upcoming Sessions</h2>
              {session.upcomingRooms.map((room) => (
                <VoiceRoomCard
                  key={room.id}
                  room={room}
                  onJoin={session.joinRoom}
                  disabled={joining || session.actionPending}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function VoiceRoomDashboard() {
  return (
    <VoiceRoomProvider>
      <VoiceRoomDashboardInner />
    </VoiceRoomProvider>
  );
}
