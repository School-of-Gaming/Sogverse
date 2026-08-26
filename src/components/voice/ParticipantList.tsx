"use client";

import { useMemo, useRef } from "react";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { robloxAccountId } from "@/components/game-account";
import { useLiveRobloxRenders, type RobloxRenderMap } from "@/services/roblox";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { useVoiceMemberFlair } from "./VoiceMemberFlairProvider";
import { useSpeakingGlow } from "./hooks/use-speaking-glow";
import { ParticipantRow } from "./ParticipantRow";
import type { VoiceParticipant, LockState } from "./hooks/types";
import type { VoiceMemberFlair } from "./VoiceMemberFlairProvider";

/**
 * The figure URL for one participant, with the row's three meanings intact.
 *
 * Minecraft omits the prop, because its skin host is addressable by username and
 * the row derives its own. Roblox always passes an explicit value — the string
 * the batch resolved, or `null` — because a Roblox render can only come from a
 * lookup, and leaving the prop off would silently mean "placeholder" while
 * reading as "not decided".
 */
function gameAvatarUrlFor(
  p: VoiceParticipant,
  renders: RobloxRenderMap,
): string | null | undefined {
  if (!p.gamePlatform) return undefined;
  const id = robloxAccountId(p.gamePlatform, p.gameExternalId);
  if (id === null) return p.gamePlatform === "roblox" ? null : undefined;
  return renders[String(id)] ?? null;
}

export function ParticipantList() {
  const {
    participants,
    lockStates,
    muteParticipant,
    lockParticipant,
    isModerator,
  } = useVoiceRoom();

  const t = useTranslations("voice");
  // The staff-only overlay, or null for every viewer who is not staff — which
  // is every family member in the call. Resolved once for the list, exactly as
  // the Roblox renders below are, because it is a fact about the viewer rather
  // than about any one row.
  const flair = useVoiceMemberFlair();

  // One batched lookup for the room, and it lives here because the row must
  // stay dumb: the thumbnails API is rate-limited per IP across the entire
  // serverless fleet, so a hook per row would be N requests against a budget one
  // busy session could drain on its own. On any other platform — and on every
  // instant room — this list is empty and nothing is ever asked.
  //
  // **The live variant, because a room's membership moves under it.** The
  // set-keyed batch would treat every join and leave as a new question and
  // re-ask about the whole room; this one accumulates, asking once about the
  // people a change actually brought and never again about anyone already
  // resolved. A change that brings no new verified account issues no request.
  // `head` because that is the figure the row draws, and a caller must pass the
  // render matching the figure it asked for. Before an answer lands (and if the
  // batch fails — renders are never retried) every row falls back to the
  // silhouette, in a figure box already at its final square size, so the
  // pictures landing moves nothing.
  const robloxIds = useMemo(
    () =>
      participants.flatMap((p) => {
        const id = p.gamePlatform
          ? robloxAccountId(p.gamePlatform, p.gameExternalId)
          : null;
        return id === null ? [] : [id];
      }),
    [participants],
  );
  const robloxRenders = useLiveRobloxRenders(robloxIds, "head");

  // No enclosing Card: each ParticipantRow is itself a bordered card, so wrapping
  // them in another card was card-in-card (two borders, doubled padding). Flush
  // section under a plain heading, matching the voice-room section in VoiceRoom.
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Users className="h-4 w-4" />
        {t("participants")}
      </h2>

      {participants.map((p) => (
        <ParticipantRowWithGlow
          key={p.sessionId}
          participant={p}
          gameAvatarUrl={gameAvatarUrlFor(p, robloxRenders)}
          lockState={
            lockStates.get(p.sessionId) ?? { audio: false, video: false }
          }
          isLocalOwner={isModerator}
          flair={flair}
          onMute={(track) => muteParticipant(p.sessionId, track)}
          onLock={(track, locked) =>
            lockParticipant(p.sessionId, track, locked)
          }
        />
      ))}

      {participants.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          {t("noParticipantsYet")}
        </p>
      )}
    </section>
  );
}

/** Wraps ParticipantRow with the speaking-glow hook (needs sessionId for audio analysis). */
function ParticipantRowWithGlow({
  participant,
  gameAvatarUrl,
  lockState,
  isLocalOwner,
  flair,
  onMute,
  onLock,
}: {
  participant: VoiceParticipant;
  /** Resolved by the list, never by the row. See `gameAvatarUrlFor`. */
  gameAvatarUrl: string | null | undefined;
  lockState: LockState;
  isLocalOwner: boolean;
  /** The viewer's staff overlay, or `null` where they have none. */
  flair: VoiceMemberFlair | null;
  onMute: (track: "audio" | "video") => void;
  onLock: (track: "audio" | "video", locked: boolean) => void;
}) {
  const avatarRef = useRef<HTMLDivElement>(null);
  useSpeakingGlow(avatarRef, participant.sessionId, participant.audioOn);
  // A note belongs to a seat in this group, so the staff who are *running* the
  // session are not targets for one — a Gedu cannot take a note about
  // themselves, about the Gedu covering with them, or about a visiting admin.
  // Gating on the overlay's own member set rather than on the row's role is
  // what makes that true for a Gedu who holds a seat in some other group: the
  // question is membership of *this* one.
  const memberFlair =
    flair !== null && flair.members.has(participant.userId) ? flair : null;
  const note = memberFlair?.notes[participant.userId] ?? "";

  return (
    <ParticipantRow
      participant={{ ...participant, gameAvatarUrl }}
      lockState={lockState}
      isModView={isLocalOwner}
      avatarRef={avatarRef}
      newcomerJoinedAt={flair?.newcomers[participant.userId]}
      flairNow={flair?.now}
      hasNote={note !== ""}
      // Absent for a viewer with no overlay, which is what keeps a child's row
      // a plain avatar with no button semantics to announce.
      onOpenNote={
        memberFlair === null
          ? undefined
          : () =>
              memberFlair.onOpenNote(participant.userId, participant.userName)
      }
      onMute={onMute}
      onLock={onLock}
    />
  );
}
