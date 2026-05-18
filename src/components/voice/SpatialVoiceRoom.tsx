"use client";

import { useState, useEffect, useRef } from "react";
import { Mic, Radio, Loader2, PhoneOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { VoiceControls } from "./VoiceControls";
import { SpatialCanvas } from "./SpatialCanvas";
import { ScreenShareDisplay } from "./ScreenShareDisplay";
import { ParticipantList } from "./ParticipantList";

interface SpatialVoiceRoomProps {
  /** Optional title shown in the card header. Defaults to the localized "Voice room" string. */
  title?: string;
  onLeave: () => Promise<void>;
  leaveLabel?: string;
}

const SCREEN_SHARE_ANIMATION_MS = 700;

export function SpatialVoiceRoom({
  title,
  onLeave,
  leaveLabel,
}: SpatialVoiceRoomProps) {
  const t = useTranslations('voice');
  const { participants, joining, screenSharerSessionId } = useVoiceRoom();
  const [leaving, setLeaving] = useState(false);

  // Animate screen share in/out: delay unmount so exit animation can play.
  // Keep the last non-null session ID so ScreenShareDisplay can still render
  // its content during the exit animation (it reads from context which goes
  // null immediately, so we override via prop).
  const [screenShareMounted, setScreenShareMounted] = useState(false);
  const [screenShareVisible, setScreenShareVisible] = useState(false);
  const staleSharerRef = useRef<string | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  if (screenSharerSessionId) {
    // eslint-disable-next-line react-hooks/refs -- TODO: refactor stale-sharer tracking off render-time ref I/O — see TODO.md "Refactor SpatialVoiceRoom screen-share animation"
    staleSharerRef.current = screenSharerSessionId;
  }

  useEffect(() => {
    if (screenSharerSessionId) {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- TODO: see TODO.md "Refactor SpatialVoiceRoom screen-share animation"
      setScreenShareMounted(true);
      // Trigger enter animation on the next frame so the DOM has the 0-height state first
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setScreenShareVisible(true));
      });
    } else {
      setScreenShareVisible(false);
      exitTimerRef.current = setTimeout(() => {
        setScreenShareMounted(false);
        staleSharerRef.current = null;
      }, SCREEN_SHARE_ANIMATION_MS);
    }
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, [screenSharerSessionId]);

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await onLeave();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              {title ?? t('voiceRoom')}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {t('participantsCount', { count: participants.length })}
              </Badge>
              <Badge className="bg-success/10 text-success">
                <Radio className="mr-1 h-3 w-3" />
                {t('live')}
              </Badge>
            </div>
          </div>
          <CardDescription>
            {t('spatialDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Screen share display (above canvas when active) — animated in/out */}
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] ease-in-out",
              screenShareVisible
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0",
            )}
            style={{ transitionDuration: `${SCREEN_SHARE_ANIMATION_MS}ms` }}
          >
            <div className="overflow-hidden">
              {screenShareMounted && (
                <ScreenShareDisplay
                  // eslint-disable-next-line react-hooks/refs -- TODO: see TODO.md "Refactor SpatialVoiceRoom screen-share animation"
                  sharerSessionIdOverride={staleSharerRef.current}
                />
              )}
            </div>
          </div>

          <SpatialCanvas />

          <div className="flex items-center justify-between">
            <VoiceControls />

            <Button
              variant="secondary"
              size="sm"
              onClick={handleLeave}
              disabled={joining || leaving}
              className="gap-1.5"
            >
              {leaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PhoneOff className="h-4 w-4" />
              )}
              {leaveLabel ?? t('leave')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Participant list (always visible below the voice room card) */}
      <ParticipantList />
    </div>
  );
}
