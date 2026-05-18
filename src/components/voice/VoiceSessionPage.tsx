"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { SpatialVoiceRoom } from "@/components/voice/SpatialVoiceRoom";
import { useVoiceToken } from "@/services/voice";

interface VoiceSessionPageProps {
  /** A `product_groups_v2.id` — the token endpoint derives the Daily room name from the group + current session window. */
  groupId: string;
  backHref: string;
}

function VoiceSessionInner({ groupId, backHref }: VoiceSessionPageProps) {
  const t = useTranslations('voice');
  const c = useTranslations('common');
  const { joined, joining, join, leave } = useVoiceRoom();
  const getToken = useVoiceToken();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const hasAttemptedJoin = useRef(false);

  // Auto-join on mount (and reconnect on refresh). No client-side
  // session-end polling — Daily's token `exp` boundary is the hard
  // ejection, set to the session window close plus the configured grace
  // period by the token endpoint.
  useEffect(() => {
    if (hasAttemptedJoin.current || joined || joining) return;
    hasAttemptedJoin.current = true;

    getToken
      .mutateAsync(groupId)
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

  return <SpatialVoiceRoom onLeave={handleLeave} leaveLabel={t('leave')} />;
}

export function VoiceSessionPage(props: VoiceSessionPageProps) {
  return (
    <VoiceRoomProvider>
      <VoiceSessionInner {...props} />
    </VoiceRoomProvider>
  );
}
