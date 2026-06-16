"use client";

import { useState, useEffect, useRef } from "react";
import { Mic, Loader2, PhoneOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { VoiceControls } from "./VoiceControls";
import { ZoneList } from "./ZoneList";
import { ScreenShareDisplay } from "./ScreenShareDisplay";
import { ChatPanel } from "./ChatPanel";
import { ParticipantList } from "./ParticipantList";

interface VoiceRoomProps {
  /** Optional title shown in the card header. Defaults to the localized "Voice room" string. */
  title?: string;
  onLeave: () => Promise<void>;
  leaveLabel?: string;
}

const SCREEN_SHARE_ANIMATION_MS = 700;

export function VoiceRoom({
  title,
  onLeave,
  leaveLabel,
}: VoiceRoomProps) {
  const t = useTranslations('voice');
  const { joining, screenSharerSessionId } = useVoiceRoom();
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
    // eslint-disable-next-line react-hooks/refs -- TODO: refactor stale-sharer tracking off render-time ref I/O — see TODO.md "Refactor VoiceRoom screen-share animation"
    staleSharerRef.current = screenSharerSessionId;
  }

  useEffect(() => {
    if (screenSharerSessionId) {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- TODO: see TODO.md "Refactor VoiceRoom screen-share animation"
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
    <div className="space-y-4 pb-48">
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            {title ?? t('voiceRoom')}
          </CardTitle>
          <CardDescription>
            {t('zonesDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-0">
          {/* Screen share display (above the zone list when active) — animated in/out */}
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
                  // eslint-disable-next-line react-hooks/refs -- TODO: see TODO.md "Refactor VoiceRoom screen-share animation"
                  sharerSessionIdOverride={staleSharerRef.current}
                />
              )}
            </div>
          </div>

          <ZoneList />
        </CardContent>
      </Card>

      {/* Ephemeral in-call chat, between the voice room and the participants */}
      <ChatPanel />

      {/* Participant list (always visible below the voice room card) */}
      <ParticipantList />

      {/* Fixed control dock — pinned to the bottom of the viewport (position:
          fixed: the same overlapping-fixed idea as the home-page section pill,
          a different UI but the same intent) so the mic / camera / leave
          controls stay reachable no matter how far the user scrolls through the
          fixed-height zone list. No scroll-triggered reveal — in a live call the
          controls are always present. The full-width centering wrapper is
          `pointer-events-none` so clicks fall through to content on either side
          of the pill; the pill itself re-enables them. The page container
          reserves matching bottom padding (`pb-32`) so the dock never sits on
          top of the participant list. VoiceControls already collapses to two
          short rows below `sm`, so the pill stays narrow on mobile. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+0.75rem))]">
        <div className="glass-panel pointer-events-auto flex max-w-[calc(100vw-1rem)] items-end gap-3 rounded-2xl border px-4 py-3 shadow-lg">
          <VoiceControls />

          <Button
            variant="destructive"
            onClick={handleLeave}
            disabled={joining || leaving}
            className="gap-1.5"
            title={leaveLabel ?? t('leave')}
          >
            {leaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PhoneOff className="h-4 w-4" />
            )}
            {leaveLabel ?? t('leave')}
          </Button>
        </div>
      </div>
    </div>
  );
}
