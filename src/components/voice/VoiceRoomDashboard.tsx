"use client";

import { Mic, Loader2, PhoneCall } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { SpatialVoiceRoom } from "@/components/voice/SpatialVoiceRoom";
import { VoiceRoomCard } from "@/components/voice/VoiceRoomCard";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { useAuth } from "@/providers/auth-provider";
import type { AvailableVoiceRoomWithWindow } from "@/services/voice";

// TODO: revert — hardcoded gedu lounge room for gamer debug access
const DEBUG_GEDU_LOUNGE: AvailableVoiceRoomWithWindow = {
  id: "c8e7d686-d034-4113-bf79-d314b87fb84c",
  group_id: null,
  room_type: "gedu_only",
  name: "Gedu Lounge",
  daily_room_name: "gedu-lounge",
  product_name: null,
  day_of_week: null,
  start_time: null,
  timezone: null,
  duration_minutes: null,
  gedu_display_name: null,
  gedu_id: null,
  enrolled_at: null,
  isOpen: true,
  nextSessionStart: null,
  windowClosesAt: null,
};

function VoiceRoomDashboardInner() {
  const { joining } = useVoiceRoom();
  const session = useVoiceSession();
  const { profile } = useAuth();
  // TODO: revert — let gamers join gedu lounge for testing
  const showDebugLounge = profile?.role === "gamer";

  if (session.isLoading || session.reconnecting) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          {session.reconnecting && (
            <p className="text-sm text-muted-foreground">Reconnecting...</p>
          )}
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

      {/* TODO: revert — debug button for gamers to join gedu lounge */}
      {showDebugLounge && (
        <Card className="border-dashed border-yellow-500/50">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium">Gedu Lounge <span className="text-xs text-yellow-500">(debug)</span></p>
              <p className="text-sm text-muted-foreground">Temporary debug access</p>
            </div>
            <Button
              onClick={() => session.joinRoom(DEBUG_GEDU_LOUNGE)}
              disabled={joining || session.actionPending}
              size="sm"
              className="gap-1.5 shrink-0"
            >
              <PhoneCall className="h-4 w-4" />
              Join
            </Button>
          </CardContent>
        </Card>
      )}

      {!hasRooms && !showDebugLounge ? (
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
                  loading={session.joiningRoomId === room.id}
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
                  loading={session.joiningRoomId === room.id}
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
                  loading={session.joiningRoomId === room.id}
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
