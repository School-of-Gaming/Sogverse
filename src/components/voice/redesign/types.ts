import type { ReactNode } from "react";
import type { ParticipantChatControls } from "../ParticipantRow";

/**
 * The redesigned room's props, which are `VoiceRoom`'s, so a page swaps one for
 * the other without changing what it passes.
 */
export interface VoiceRoomRedesignProps {
  /** Defaults to the localised "Voice room" string. */
  title?: string;
  /** A control beside the title. Instant rooms put their room-link chip here. */
  titleAccessory?: ReactNode;
  /**
   * The chat surface, handed the height class it must occupy. Absent on an
   * instant room, which then has no chat anywhere in either layout.
   */
  chat?: (heightClassName: string) => ReactNode;
  /** The chat lock offered against each person, threaded to the participant list. */
  participantChatControls?: ParticipantChatControls;
  onLeave: () => Promise<void>;
  leaveLabel?: string;
}
