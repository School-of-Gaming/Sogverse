import type { ReactNode } from "react";
import type { ParticipantChatControls, ParticipantShareControls } from "../ParticipantRow";

/**
 * The redesigned room's props: `VoiceRoom`'s, so a page swaps one for the other
 * without changing what it passes, and three optional ones the room's context has
 * no way to say yet. Each is absent until the live room has what it needs.
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
  /** Stopping and locking each person's screen share, for a moderator. */
  participantShareControls?: ParticipantShareControls;
  /** A moderator has locked this viewer out of sharing. */
  shareLocked?: boolean;
  /** Who is presenting to the whole room, whichever zone the viewer is in. */
  presenterSessionId?: string | null;
  onLeave: () => Promise<void>;
  leaveLabel?: string;
}
