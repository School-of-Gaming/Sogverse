"use client";

import { useMemo, useRef } from "react";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { robloxAccountId } from "@/components/game-account";
import { useRobloxRenders } from "@/services/roblox";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { useSpeakingGlow } from "./hooks/use-speaking-glow";
import { ParticipantRow } from "./ParticipantRow";
import type { VoiceParticipant, LockState } from "./hooks/types";

/**
 * The render URLs one batched Roblox lookup resolved, keyed by the account id as
 * a string — and the only form an answer may be read in: **by the id the
 * response names, never by position.** `undefined` is the whole map before the
 * call lands (or after it failed); a missing or `null` entry is an account
 * Roblox has no render for. All three draw the silhouette.
 */
type RobloxRenderMap = Partial<Record<string, string | null>>;

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
  renders: RobloxRenderMap | undefined,
): string | null | undefined {
  if (!p.gamePlatform) return undefined;
  const id = robloxAccountId(p.gamePlatform, p.gameExternalId);
  if (id === null) return p.gamePlatform === "roblox" ? null : undefined;
  return renders?.[String(id)] ?? null;
}

export function ParticipantList() {
  const {
    participants,
    lockStates,
    muteParticipant,
    lockParticipant,
    isModerator,
  } = useVoiceRoom();

  const t = useTranslations('voice');

  // One batched lookup for the whole room, and it lives here because the row
  // must stay dumb: the thumbnails API is rate-limited per IP across the entire
  // serverless fleet, so a hook per row would be N requests against a budget one
  // busy session could drain on its own. On any other platform — and on every
  // instant room — this list is empty, which disables the query outright.
  //
  // Ids change as people join and leave; the hook normalizes them into its own
  // key, so a room in flux re-asks only about ids it has not already resolved.
  // `head` because that is the figure the row draws, and a caller must pass the
  // render matching the figure it asked for. While the call is in flight (and if
  // it fails — renders are never retried) every row falls back to the
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
  const { data: robloxRenders } = useRobloxRenders(robloxIds, "head");

  // No enclosing Card: each ParticipantRow is itself a bordered card, so wrapping
  // them in another card was card-in-card (two borders, doubled padding). Flush
  // section under a plain heading, matching the voice-room section in VoiceRoom.
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Users className="h-4 w-4" />
        {t('participants')}
      </h2>

      {participants.map((p) => (
        <ParticipantRowWithGlow
          key={p.sessionId}
          participant={p}
          gameAvatarUrl={gameAvatarUrlFor(p, robloxRenders)}
          lockState={lockStates.get(p.sessionId) ?? { audio: false, video: false }}
          isLocalOwner={isModerator}
          onMute={(track) => muteParticipant(p.sessionId, track)}
          onLock={(track, locked) => lockParticipant(p.sessionId, track, locked)}
        />
      ))}

      {participants.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          {t('noParticipantsYet')}
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
  onMute,
  onLock,
}: {
  participant: VoiceParticipant;
  /** Resolved by the list, never by the row. See `gameAvatarUrlFor`. */
  gameAvatarUrl: string | null | undefined;
  lockState: LockState;
  isLocalOwner: boolean;
  onMute: (track: "audio" | "video") => void;
  onLock: (track: "audio" | "video", locked: boolean) => void;
}) {
  const avatarRef = useRef<HTMLDivElement>(null);
  useSpeakingGlow(avatarRef, participant.sessionId, participant.audioOn);

  return (
    <ParticipantRow
      participant={{ ...participant, gameAvatarUrl }}
      lockState={lockState}
      isModView={isLocalOwner}
      avatarRef={avatarRef}
      onMute={onMute}
      onLock={onLock}
    />
  );
}
