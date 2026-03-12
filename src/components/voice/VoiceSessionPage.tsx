"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { SpatialVoiceRoom } from "@/components/voice/SpatialVoiceRoom";
import { useAvailableVoiceRooms, useVoiceToken } from "@/services/voice";
import type { AvailableVoiceRoomWithWindow } from "@/services/voice";

interface VoiceSessionPageProps {
  roomId: string;
  backHref: string;
}

function VoiceSessionInner({ roomId, backHref }: VoiceSessionPageProps) {
  const { joined, joining, join, leave } = useVoiceRoom();
  const { data: rooms } = useAvailableVoiceRooms();
  const getToken = useVoiceToken();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const hasAttemptedJoin = useRef(false);

  const room: AvailableVoiceRoomWithWindow | null =
    rooms?.find((r) => r.id === roomId) ?? null;

  // Auto-join on mount (and reconnect on refresh)
  useEffect(() => {
    if (hasAttemptedJoin.current || joined || joining) return;
    hasAttemptedJoin.current = true;

    getToken
      .mutateAsync(roomId)
      .then(({ token, roomUrl }) => join(roomUrl, token))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to join room");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once on mount
  }, []);

  const handleLeave = useCallback(async () => {
    setLeaving(true);
    await leave();
    window.location.href = backHref;
  }, [leave, backHref]);

  if (error) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <a
              href={backHref}
              className="mt-4 inline-block text-sm text-muted-foreground hover:text-foreground"
            >
              Back to Groups
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (leaving) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Disconnecting...</p>
        </CardContent>
      </Card>
    );
  }

  if (!joined) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Connecting...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <SpatialVoiceRoom
      room={room}
      onLeave={handleLeave}
      leaveLabel="Leave"
    />
  );
}

export function VoiceSessionPage(props: VoiceSessionPageProps) {
  return (
    <VoiceRoomProvider>
      <VoiceSessionInner {...props} />
    </VoiceRoomProvider>
  );
}
