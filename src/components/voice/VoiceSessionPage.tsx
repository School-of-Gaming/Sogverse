"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { GamerNoteDialog } from "@/components/member-flair";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { VoiceRoom } from "@/components/voice/VoiceRoom";
import { GroupSessionChat } from "@/components/voice/GroupSessionChat";
import type { ParticipantChatControls } from "@/components/voice/ParticipantRow";
import { VoiceMemberFlairProvider } from "@/components/voice/VoiceMemberFlairProvider";
import { deriveVoiceMemberFlair } from "@/components/voice/derive-voice-member-flair";
import {
  useGroupStaffOverlay,
  useSetGamerGroupNote,
} from "@/services/member-flair";
import { useVoiceToken } from "@/services/voice";

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
  /** Whose note is open, and the name the dialog puts in its own copy. */
  const [noteTarget, setNoteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Sticky: flips true the moment we first successfully join, stays true
  // after Daily ejects us at token exp. Lets the post-join "joined=false"
  // render a friendly "session ended" card instead of looping back to the
  // connecting spinner with no way out.
  const [wasJoined, setWasJoined] = useState(false);
  const hasAttemptedJoin = useRef(false);

  /**
   * The chat lock offered against each person in the room, published by the
   * chat container and handed to the participant rail.
   *
   * **The page is the seam here for the same reason it is for the staff
   * overlay.** The rail and the panel are siblings inside the room, the room is
   * a pure consumer of its context, and chat state deliberately never enters
   * that context — so the one place that can see both is out here. What travels
   * is a function of a user id, not the chat's state: the container keeps
   * ownership of the lock rows and of the write, and the rail is handed a
   * conclusion it renders.
   *
   * The published value is memoised on the roster and the standing locks, so
   * this state settles once and then moves only when a lock actually does.
   */
  const [chatControls, setChatControls] = useState<ParticipantChatControls | null>(
    null,
  );
  // Wrapped, because a state setter handed a *function* would run it as an
  // updater — and the value here is a function. Stable by construction, which
  // is what keeps the publishing effect from firing on every render.
  const publishChatControls = useCallback(
    (controls: ParticipantChatControls | null) => setChatControls(() => controls),
    [],
  );

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
   * The staff-only overlay for this room, and the note write behind it.
   *
   * **This page is the seam.** Every component inside the room is a pure
   * consumer of context — the participant list reads the overlay through
   * `useVoiceMemberFlair()` and has no way to fetch one — so the read, the
   * derivation and the dialog all belong here, beside the token, the join and
   * the leave. Nothing about any of it rides the Daily token: `user_name` is
   * broadcast to every peer in the room, children included, and these are staff
   * notes about children.
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

  const openNote = useCallback((userId: string, name: string) => {
    setNoteTarget({ id: userId, name });
  }, []);

  /**
   * The document turned into the context value. The derivation is next door —
   * the clubs-only gate, the seat-holder set and the absence convention are
   * rules with their own unit tests, and none of them needs a React tree.
   */
  const flair = useMemo(
    () => deriveVoiceMemberFlair(overlay, now, openNote),
    [overlay, now, openNote],
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
        <VoiceRoom
          onLeave={handleLeave}
          leaveLabel={t('leave')}
          // The live chat, in the height the room grants it. This page is the
          // seam for chat exactly as it is for the staff overlay: the room and
          // everything in it are pure consumers, so the channel, the history
          // read and the subscription belong out here beside the token.
          chat={(heightClassName) => (
            <GroupSessionChat
              groupId={groupId}
              heightClassName={heightClassName}
              onChatControlsChange={publishChatControls}
            />
          )}
          // ...and what that container knows about who may be locked, handed
          // back to the rail on the other side of the room. Null until the
          // channel opens, which is the same thing "this room has no chat"
          // looks like from here.
          participantChatControls={chatControls ?? undefined}
        />
      </VoiceMemberFlairProvider>

      {/* Outside the provider's subtree and mounted by the page, exactly as the
          preview scene models it: one dialog for the whole room, opened by
          whichever row's button was pressed, saving through the same mutation
          and the same invalidations the gedu product page uses. */}
      {noteTarget !== null && (
        <GamerNoteDialog
          open
          onOpenChange={(open) => {
            if (!open) setNoteTarget(null);
          }}
          name={noteTarget.name}
          note={flair?.notes[noteTarget.id] ?? ''}
          lastEditedBy={flair?.noteEditors?.[noteTarget.id] ?? null}
          // The write's promise, straight through. The dialog owns the
          // committing flag that keeps Save disabled from the click until the
          // close, so nothing here derives one from `isPending`.
          onSave={async (text) => {
            await setGamerNote.mutateAsync({
              participantId: noteTarget.id,
              note: text,
            });
          }}
        />
      )}
    </>
  );
}

export function VoiceSessionPage(props: VoiceSessionPageProps) {
  return (
    <VoiceRoomProvider groupId={props.groupId}>
      <VoiceSessionInner {...props} />
    </VoiceRoomProvider>
  );
}
