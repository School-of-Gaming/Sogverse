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

// How far the fixed control dock floats above the bottom of the viewport.
// Single source of truth: it's the dock's own bottom padding AND the base of the
// page's reserved scroll space, so nudging this one value moves both together —
// raise the dock and the scroll padding grows to match. The max() keeps a 2.5rem
// floor and grows with the device safe-area inset.
const DOCK_FLOAT_OFFSET = "max(2.5rem, calc(env(safe-area-inset-bottom) + 0.75rem))";

// Generous estimate of the dock pill's own height. Tallest case is the mobile
// two-row layout (~6.5rem); 8rem leaves breathing room. Overestimating only
// leaves a little extra scroll room at the very bottom (harmless) — underestimating
// would let the last participant hide behind the dock, so we round up on purpose.
const DOCK_HEIGHT_ESTIMATE = "8rem";

export function VoiceRoom({
  title,
  onLeave,
  leaveLabel,
}: VoiceRoomProps) {
  const t = useTranslations('voice');
  const { joining, screenSharerSessionId } = useVoiceRoom();
  const [leaving, setLeaving] = useState(false);

  // Animate screen share in/out: delay unmount so the exit animation can play.
  const [screenShareMounted, setScreenShareMounted] = useState(false);
  const [screenShareVisible, setScreenShareVisible] = useState(false);
  // The sharer to keep rendering during the exit animation. Context's
  // screenSharerSessionId flips to null the instant sharing stops, so we hold the
  // last known id in state (set in the effect below) and pass it to
  // ScreenShareDisplay as an override so its content survives the collapse.
  const [exitingSharerId, setExitingSharerId] = useState<string | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Drive the screen-share enter/exit animation. On share start: mount the
  // viewport at 0-height, then expand it on the next frame so the grid-rows /
  // opacity transition has a from-state to animate from. On share stop: collapse,
  // then unmount after the animation finishes (holding exitingSharerId so the
  // content stays painted while it collapses). Every state update is deferred into
  // an rAF / timeout callback — never set synchronously in the effect body — so
  // the mount/visibility state isn't written during the effect's render pass.
  useEffect(() => {
    if (screenSharerSessionId) {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      let expandFrame = 0;
      const mountFrame = requestAnimationFrame(() => {
        setExitingSharerId(screenSharerSessionId);
        setScreenShareMounted(true);
        // One more frame so the 0fr / opacity-0 state paints before expanding.
        expandFrame = requestAnimationFrame(() => setScreenShareVisible(true));
      });
      return () => {
        cancelAnimationFrame(mountFrame);
        cancelAnimationFrame(expandFrame);
      };
    }

    const collapseFrame = requestAnimationFrame(() => setScreenShareVisible(false));
    exitTimerRef.current = setTimeout(() => {
      setScreenShareMounted(false);
      setExitingSharerId(null);
    }, SCREEN_SHARE_ANIMATION_MS);
    return () => {
      cancelAnimationFrame(collapseFrame);
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
    <div
      className="space-y-4"
      // Reserve scroll space equal to the dock's full footprint (how far it floats
      // above the bottom + an estimate of its own height) so the last participant
      // clears it when scrolled all the way down. Shares DOCK_FLOAT_OFFSET with the
      // dock itself, so raising the dock raises this padding in lockstep.
      style={{ paddingBottom: `calc(${DOCK_FLOAT_OFFSET} + ${DOCK_HEIGHT_ESTIMATE})` }}
    >
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
                <ScreenShareDisplay sharerSessionIdOverride={exitingSharerId} />
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
          of the pill; the pill itself re-enables them. Its bottom offset uses the
          shared DOCK_FLOAT_OFFSET, which the page container also folds into its
          reserved scroll padding — so the dock never sits on top of the participant
          list, and raising the dock raises that padding in lockstep. VoiceControls
          already collapses to two short rows below `sm`, so the pill stays narrow
          on mobile. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2"
        style={{ paddingBottom: DOCK_FLOAT_OFFSET }}
      >
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
