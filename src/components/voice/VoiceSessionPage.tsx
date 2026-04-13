"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { SpatialVoiceRoom } from "@/components/voice/SpatialVoiceRoom";
import { useAvailableVoiceRooms, useVoiceToken } from "@/services/voice";
import type { AvailableVoiceRoomWithWindow } from "@/services/voice";
import { computeSessionWindow } from "@/lib/session-schedule";

interface VoiceSessionPageProps {
  roomId: string;
  backHref: string;
}

function VoiceSessionInner({ roomId, backHref }: VoiceSessionPageProps) {
  const t = useTranslations('voice');
  const c = useTranslations('common');
  const { joined, joining, join, leave } = useVoiceRoom();
  const { data: rooms } = useAvailableVoiceRooms();
  const getToken = useVoiceToken();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
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
        setError(err instanceof Error ? err.message : t('failedToJoinRoom'));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once on mount
  }, []);

  const handleLeave = useCallback(async () => {
    setLeaving(true);
    await leave();
    window.location.href = backHref;
  }, [leave, backHref]);

  // Auto-leave when session window closes (group rooms only).
  // Schedule fields (day_of_week, start_time, etc.) are typed as nullable because
  // AvailableVoiceRoom covers both lounges and groups, but group rooms always have
  // non-null schedule data — the RPC LEFT JOINs to products, and the WHERE clause
  // ensures product_groups matched. The `as` casts are safe after the room_type guard.
  useEffect(() => {
    if (!joined || !room || room.room_type !== "group") return;

    const check = () => {
      const window = computeSessionWindow({
        day_of_week: room.day_of_week as number,
        start_time: room.start_time as string,
        timezone: room.timezone as string,
        duration_minutes: room.duration_minutes as number,
      });
      if (!window.isOpen) {
        setSessionEnded(true);
        leave();
      }
    };

    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [joined, room, leave]);

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
              {c('back')}
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (sessionEnded) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm font-medium">{t('sessionEnded')}</p>
          <a
            href={backHref}
            className="mt-4 inline-block text-sm text-muted-foreground hover:text-foreground"
          >
            {c('back')}
          </a>
        </CardContent>
      </Card>
    );
  }

  if (leaving) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('disconnecting')}</p>
        </CardContent>
      </Card>
    );
  }

  if (!joined) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('connecting')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <SpatialVoiceRoom
      room={room}
      onLeave={handleLeave}
      leaveLabel={t('leave')}
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
