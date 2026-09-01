"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { GamerFlairDialog } from "@/components/member-flair";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { VoiceRoom } from "@/components/voice/VoiceRoom";
import { VoiceMemberFlairProvider } from "@/components/voice/VoiceMemberFlairProvider";
import { deriveVoiceMemberFlair } from "@/components/voice/derive-voice-member-flair";
import {
  useGroupStaffOverlay,
  useSetGamerGroupCreations,
  useSetGamerGroupNote,
} from "@/services/member-flair";
import { useVoiceToken } from "@/services/voice";
import type { GamerCreation } from "@/types";

interface VoiceSessionPageProps {
  /** A `product_groups.id` — the token endpoint derives the Daily room name from the group + current session window. */
  groupId: string;
  backHref: string;
}

function VoiceSessionInner({ groupId, backHref }: VoiceSessionPageProps) {
  const t = useTranslations('voice');
  const c = useTranslations('common');
  const { joined, joining, join, leave, isModerator } = useVoiceRoom();
  const getToken = useVoiceToken();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  /** Whose dialog is open, and the name it puts in its own copy. */
  const [flairTarget, setFlairTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Sticky: flips true the moment we first successfully join, stays true
  // after Daily ejects us at token exp. Lets the post-join "joined=false"
  // render a friendly "session ended" card instead of looping back to the
  // connecting spinner with no way out.
  const [wasJoined, setWasJoined] = useState(false);
  const hasAttemptedJoin = useRef(false);

  // Auto-join on mount (and reconnect on refresh). No client-side
  // session-end polling — Daily's token `exp` boundary is the hard
  // ejection, set to the session window close plus the configured grace
  // period by the token endpoint.
  //
  // wasJoined flips true the moment our own join() resolves (Daily's
  // co.join() promise resolves after joined-meeting fires). Setting it
  // here, in the action callback, keeps it out of a derived-state effect.
  useEffect(() => {
    if (hasAttemptedJoin.current || joined || joining) return;
    hasAttemptedJoin.current = true;

    getToken
      .mutateAsync(groupId)
      .then(({ token, roomUrl, sessionOpensAt }) => join(roomUrl, token, { sessionOpensAt }))
      .then(() => setWasJoined(true))
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('failedToJoinRoom'));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once on mount
  }, []);

  /**
   * The staff-supplied overlay for this room, and the two writes behind it.
   *
   * **This page is the seam.** Every component inside the room is a pure
   * consumer of context — the participant list reads the overlay through
   * `useVoiceMemberFlair()` and has no way to fetch one — so the read, the
   * derivation and the dialog all belong here, beside the token, the join and
   * the leave. Nothing about any of it rides the Daily token: `user_name` is
   * broadcast to every peer in the room, children included, and these are staff
   * notes about children.
   *
   * The overlay carries a member's creations beside their note, so the dialog
   * the room opens is the same dialog the workspace opens — the owner's call:
   * a Gedu is never better placed to write down what a gamer just made than in
   * the session they made it in. What the room does *not* draw is the owed
   * marker: whether a creation is wanted is a fact about the product's schedule,
   * which this document deliberately does not carry.
   *
   * `isModerator` is the gate, and it exists **only to avoid firing a request
   * that would be refused** — the RPC's own `42501` is the boundary, and a
   * viewer with no overlay is handed `null`, which is the room exactly as it
   * rendered before any of this existed. The flag is decoded from the local
   * participant's Daily token, so it turns true a moment after the join and the
   * read starts then; the rows absorb the late arrival by construction (the
   * badge is last on the identity line, the note button is the left edge of the
   * right-packed trailing group), which is why nothing waits for it.
   */
  const { data: overlay } = useGroupStaffOverlay(groupId, isModerator);
  const setGamerNote = useSetGamerGroupNote(groupId);
  const setGamerCreations = useSetGamerGroupCreations(groupId);

  /**
   * One instant, taken at mount and never advanced — **the room deliberately
   * does not tick**, which is why this is not the shared `useNow()`.
   *
   * The only thing this clock feeds is the newcomer badge, and the badge answers
   * in whole days. A 30-second tick would rebuild the flair object on every one
   * (a fresh Set and three fresh maps), re-rendering the whole participant list
   * on a page holding live media, a dnd-kit board and the speaking-glow
   * analyser — all so a badge could cross a day boundary that a room living an
   * hour or two will almost never reach, and that nobody is watching for when it
   * does. Freezing it also keeps every row's badge agreeing with every other
   * row's for the whole session.
   */
  const [now] = useState(() => new Date());

  const openFlair = useCallback((userId: string, name: string) => {
    setFlairTarget({ id: userId, name });
  }, []);

  /**
   * The document turned into the context value. The derivation is next door —
   * the clubs-only gate, the seat-holder set and the absence convention are
   * rules with their own unit tests, and none of them needs a React tree.
   */
  const flair = useMemo(
    () => deriveVoiceMemberFlair(overlay, now, openFlair),
    [overlay, now, openFlair],
  );

  const handleLeave = useCallback(async () => {
    setLeaving(true);
    await leave();
    window.location.href = backHref;
  }, [leave, backHref]);

  if (error) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <a
              href={backHref}
              className="mt-4 inline-block text-sm text-muted-foreground hover:text-foreground"
            >
              {c('back')}
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (leaving) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('disconnecting')}</p>
        </CardContent>
      </Card>
    );
  }

  if (wasJoined && !joined) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">{t('sessionEnded')}</p>
            <a
              href={backHref}
              className="mt-4 inline-block text-sm text-muted-foreground hover:text-foreground"
            >
              {c('back')}
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!joined) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('connecting')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <VoiceMemberFlairProvider value={flair}>
        <VoiceRoom onLeave={handleLeave} leaveLabel={t('leave')} />
      </VoiceMemberFlairProvider>

      {/* Outside the provider's subtree and mounted by the page, exactly as the
          preview scene models it: one dialog for the whole room, opened by
          whichever row's button was pressed, saving through the same mutations
          and the same invalidations the gedu product page uses. */}
      {flairTarget !== null && (
        <GamerFlairDialog
          open
          onOpenChange={(open) => {
            if (!open) setFlairTarget(null);
          }}
          name={flairTarget.name}
          note={flair?.notes[flairTarget.id] ?? ''}
          lastEditedBy={flair?.noteEditors?.[flairTarget.id] ?? null}
          creations={flair?.creations[flairTarget.id] ?? NO_CREATIONS}
          // Each write's promise, straight through. The dialog owns the
          // committing flag that keeps Save disabled from the click until the
          // close, so nothing here derives one from `isPending`.
          onSaveNote={async (text) => {
            await setGamerNote.mutateAsync({
              participantId: flairTarget.id,
              note: text,
            });
          }}
          onSaveCreations={async (creations) => {
            await setGamerCreations.mutateAsync({
              participantId: flairTarget.id,
              creations,
            });
          }}
        />
      )}
    </>
  );
}

/**
 * The list a member with no creations is handed — a module constant so the
 * dialog's seed does not see a new empty array on every render.
 */
const NO_CREATIONS: readonly GamerCreation[] = [];

export function VoiceSessionPage(props: VoiceSessionPageProps) {
  return (
    <VoiceRoomProvider groupId={props.groupId}>
      <VoiceSessionInner {...props} />
    </VoiceRoomProvider>
  );
}
