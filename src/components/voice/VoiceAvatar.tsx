"use client";

import { forwardRef } from "react";
import { Mic, MicOff, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { Identicon } from "@/components/ui/identicon";
import { AVATAR_SIZE } from "@/lib/constants/spatial";

interface VoiceAvatarProps {
  userId: string;
  userName: string;
  audioOn: boolean;
  videoOn?: boolean;
  isLocal?: boolean;
  /** Inline styles for dynamic glow (set by rAF loop or slider) */
  glowStyle?: React.CSSProperties;
  /** Video element to render when videoOn. Falls back to a camera placeholder. */
  children?: React.ReactNode;
}

export const VoiceAvatar = forwardRef<HTMLDivElement, VoiceAvatarProps>(
  function VoiceAvatar(
    { userId, userName, audioOn, videoOn, isLocal, glowStyle, children },
    ref
  ) {
    return (
      <>
        <div
          ref={ref}
          className={cn(
            "relative h-full w-full overflow-hidden rounded-md border-2 border-border transition-shadow",
            isLocal && "ring-1 ring-primary/30"
          )}
          style={glowStyle}
        >
          {videoOn ? (
            children ?? (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <Video className="h-4 w-4 text-muted-foreground" />
              </div>
            )
          ) : (
            <Identicon id={userId} size={AVATAR_SIZE} />
          )}

          {/* Mic status overlay */}
          <div className="absolute bottom-0.5 right-0.5">
            {audioOn ? (
              <Mic className="h-3 w-3 text-emerald-400 drop-shadow" />
            ) : (
              <MicOff className="h-3 w-3 text-destructive drop-shadow" />
            )}
          </div>
        </div>

        {/* Name label */}
        <p
          className={cn(
            "mt-0.5 truncate text-center text-[9px] font-medium leading-tight",
            isLocal ? "text-primary" : "text-muted-foreground"
          )}
        >
          {userName}
        </p>
      </>
    );
  }
);
