"use client";

import { forwardRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { AVATAR_SIZE } from "@/lib/constants/voice-zones";

interface VoiceAvatarProps {
  userId: string;
  /** Live mic state. `false` overlays a muted badge; `true` shows nothing (an
   *  unmuted mic is the default, not worth the clutter); omit it where there is
   *  no live audio at all (the locked-zone roster, the drag ghost). */
  audioOn?: boolean;
  /** When true, `children` (the participant's `<video>`) renders in place of the
   *  identicon. */
  videoOn?: boolean;
  /** Marks the local participant with a subtle primary ring. */
  isLocal?: boolean;
  /** Inline glow style. The live room drives the speaking glow imperatively
   *  through the forwarded ref; the style-guide demo passes a computed style. */
  glowStyle?: CSSProperties;
  /** Extra tile classes — e.g. a highlighted border for the drag ghost. */
  className?: string;
  /** The `<video>` element, rendered in place of the identicon when videoOn. */
  children?: ReactNode;
}

/**
 * The canonical voice-room avatar tile: a square identicon (or live video in
 * place), a muted badge when the mic is off, and an optional "you" ring. Used
 * for every avatar the room renders — zone members, the locked-zone roster, and
 * the drag ghost — so the look lives in one component. Forward the ref to attach
 * the audio-driven speaking glow (see use-speaking-glow).
 */
export const VoiceAvatar = forwardRef<HTMLDivElement, VoiceAvatarProps>(
  function VoiceAvatar(
    { userId, audioOn, videoOn, isLocal, glowStyle, className, children },
    ref,
  ) {
    return (
      <div
        ref={ref}
        style={glowStyle}
        className={cn(
          "relative h-11 w-11 overflow-hidden rounded-md border-2 border-border transition-shadow",
          isLocal && "ring-1 ring-primary/30",
          className,
        )}
      >
        {videoOn ? (
          children
        ) : (
          <Avatar className="h-full w-full rounded-md">
            <Identicon id={userId} size={AVATAR_SIZE} />
          </Avatar>
        )}
        {/* Muted badge — only when the mic is off. The translucent backing keeps
            the red readable over any identicon or live video; anchored flush in
            the corner so the tile's rounding crops it cleanly. */}
        {audioOn === false && (
          <span className="absolute right-0 bottom-0 flex items-center justify-center rounded-tl-md bg-background/85 p-[3px]">
            <MicOff className="h-3 w-3 text-destructive" />
          </span>
        )}
      </div>
    );
  },
);
