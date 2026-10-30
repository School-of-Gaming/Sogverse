"use client";

import { DesktopRoom } from "./DesktopRoom";
import { PhoneRoom } from "./PhoneRoom";
import type { VoiceRoomRedesignProps } from "./types";
import { useRoomStage } from "./use-room-stage";
import { useIsDesktopStage } from "./use-stage-layout";

/**
 * The redesigned in-session room: the zone you are in is the stage.
 *
 * Draft body, previewed in the `voice-room-redesign` scene. It takes `VoiceRoom`'s
 * props and reads the same context, and the promotion that replaces `VoiceRoom`
 * has to give it a route with no site chrome, because it fills the viewport.
 *
 * Two native layouts over one context rather than one responsive layout, because
 * a stage beside two panels and a stage under a thumb share no structure. Exactly
 * one is ever mounted (see {@link useIsDesktopStage}), so crossing the breakpoint
 * remounts the chat and the tiles. What must survive that lives above it, in
 * {@link useRoomStage}.
 */
export function VoiceRoomRedesign(props: VoiceRoomRedesignProps) {
  const stage = useRoomStage(props.onLeave);
  const isDesktop = useIsDesktopStage();

  if (isDesktop === null) return <div className="h-dvh bg-background" />;
  return isDesktop ? (
    <DesktopRoom {...props} stage={stage} />
  ) : (
    <PhoneRoom {...props} stage={stage} />
  );
}
