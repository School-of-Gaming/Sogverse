"use client";

import { createContext, useContext } from "react";

/**
 * The staff-only overlay a voice room draws on top of its participant rows —
 * newcomer stamps and Gedu notes — supplied by whoever renders the room rather
 * than by the room itself.
 *
 * **A context rather than props, for the same reason the flair is not on
 * `ParticipantRowData`.** Everything a participant row knows about a peer
 * arrives over the Daily token, which Daily broadcasts to every client in the
 * call — children included. These two facts are the opposite kind of thing:
 * they come from a staff-scoped read that a family's client never makes and
 * that RLS would refuse it anyway. Threading them down as props through
 * `VoiceRoom` would put a note flag in the signature of a component whose only
 * other inputs are token-derived, which is precisely the boundary the row's own
 * prop block exists to keep sharp. A separate channel, absent by default, keeps
 * "this viewer has staff sight" a fact about the *page* that mounted the room.
 *
 * `null` is the resting state and the default: the room renders exactly what it
 * rendered before any of this existed. A family's page never provides it, so a
 * child's room has nothing to draw even if the components were asked to.
 */
export interface VoiceMemberFlair {
  /**
   * The clock the newcomer badges measure against — one for the whole room, so
   * every row agrees with the page around it rather than each reading its own
   * `new Date()`.
   */
  now: Date;
  /**
   * The `userId` of everyone who **holds a seat in this group** — and therefore
   * the only people a note can be written about.
   *
   * **A room is not a roster.** The people in a voice call are whoever has a
   * token for it: the group's members, but also the Gedu running the session,
   * a second Gedu covering, and any admin who has dropped in. A note is keyed
   * to `(group, participant)`, so none of those staff is a legal target — the
   * write would be refused by the database, whose target check asks whether the
   * person currently sits in that group. Without this set the room would offer
   * a note button on a Gedu's own row and the refusal would arrive as an error
   * after the fact, which is the wrong place to learn it.
   *
   * It is a separate field rather than something derived from the maps below,
   * because those hold only the people who have a note or a badge — most of a
   * group has neither, and every one of them can still be written about.
   */
  members: ReadonlySet<string>;
  /** `group_joined_at` per participant `userId`, for those still inside the window. */
  newcomers: Readonly<Record<string, string>>;
  /**
   * The Gedu note per participant `userId`, for those who have one.
   *
   * A row needs only "is there one" — the lit state of its note button. The
   * text is here because the dialog the button opens is mounted by the page,
   * not by the row, and it has to seed its draft from somewhere.
   */
  notes: Readonly<Record<string, string>>;
  /** Who last wrote each note, keyed as `notes` is. */
  noteEditors?: Readonly<Record<string, string>>;
  /** Open a member's note. Only ever called for a `userId` in {@link members}. */
  onOpenNote: (userId: string, name: string) => void;
}

const VoiceMemberFlairContext = createContext<VoiceMemberFlair | null>(null);

export function useVoiceMemberFlair(): VoiceMemberFlair | null {
  return useContext(VoiceMemberFlairContext);
}

export function VoiceMemberFlairProvider({
  value,
  children,
}: {
  value: VoiceMemberFlair | null;
  children: React.ReactNode;
}) {
  return (
    <VoiceMemberFlairContext.Provider value={value}>
      {children}
    </VoiceMemberFlairContext.Provider>
  );
}
