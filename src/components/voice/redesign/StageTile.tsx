"use client";

import { useRef, type CSSProperties } from "react";
import { MicOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Identicon } from "@/components/ui/identicon";
import { cn } from "@/lib/cn";
import { AVATAR_SIZE } from "@/lib/constants/voice-zones";
import { computeGlowStyle } from "@/lib/voice/glow";
import { useSpeakingGlow } from "../hooks/use-speaking-glow";
import { useVoiceRoom } from "../VoiceRoomProvider";
import type { VoiceParticipant } from "../hooks/types";
import { useRenderVideo } from "./VideoSurface";

/**
 * One person on the stage: their video, or their identicon large with the mic-off
 * mark, name, "you" marker and speaking ring over it. It keeps the size it is
 * given whatever their camera does, so a camera going off never collapses it.
 *
 * **Two speaking signals, on two elements.** A live room drives the glow frame
 * by frame from the audio analyser, which rewrites the glow layer's inline style
 * every frame, so the steady glow a room without an analyser takes from
 * `isSpeaking` sits on the tile itself where that loop cannot wipe it.
 */
export function StageTile({
  participant: p,
  className,
  style,
}: {
  participant: VoiceParticipant;
  className?: string;
  style?: CSSProperties;
}) {
  const t = useTranslations("voice.stage");
  const { getAnalyser } = useVoiceRoom();
  const renderVideo = useRenderVideo();
  const glowRef = useRef<HTMLDivElement>(null);
  useSpeakingGlow(glowRef, p.sessionId, p.audioOn);

  const steadyGlow =
    p.isSpeaking && p.audioOn && getAnalyser(p.sessionId) === null
      ? computeGlowStyle(1)
      : undefined;

  return (
    <div
      data-tile-id={p.sessionId}
      style={{ ...style, ...steadyGlow }}
      className={cn(
        "relative shrink-0 rounded-xl border-2 border-border bg-card transition-shadow",
        p.isLocal && "ring-1 ring-act",
        className,
      )}
    >
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[10px]">
        {p.videoOn ? (
          renderVideo(p, "camera")
        ) : (
          <div className="relative aspect-square h-3/5 max-w-[60%] overflow-hidden rounded-xl">
            <Identicon id={p.userId} size={AVATAR_SIZE} />
          </div>
        )}
        <span className="glass absolute bottom-1.5 left-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-md px-2 py-0.5 text-xs font-medium">
          {p.isLocal ? t("tileYou", { name: p.userName }) : p.userName}
        </span>
        {!p.audioOn && (
          <span className="glass absolute right-1.5 top-1.5 flex items-center justify-center rounded-md p-1">
            <MicOff className="h-4 w-4 text-destructive" aria-hidden />
            <span className="sr-only">{t("tileMicOff")}</span>
          </span>
        )}
      </div>
      <div
        ref={glowRef}
        className="pointer-events-none absolute -inset-0.5 rounded-xl border-2 border-transparent"
      />
    </div>
  );
}
