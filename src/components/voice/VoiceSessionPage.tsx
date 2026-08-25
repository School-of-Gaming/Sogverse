"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { GamerNoteDialog, showsNewcomerBadge } from "@/components/member-flair";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { VoiceRoom } from "@/components/voice/VoiceRoom";
import {
  VoiceMemberFlairProvider,
  type VoiceMemberFlair,
} from "@/components/voice/VoiceMemberFlairProvider";
import { useNow } from "@/providers";
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
  const now = useNow();
  const { data: overlay } = useGroupStaffOverlay(groupId, isModerator);
  const setGamerNote = useSetGamerGroupNote(groupId);

  /**
   * The document turned into the context value — and the two shapes are
   * deliberately different, so this is where one becomes the other.
   *
   * The RPC answers with a product type and one record per active member; the
   * context wants one clock, the seat-holder set, and three sparse maps. **The
   * seat-holder set is the document's own keys**: the RPC emits an entry for
   * every active participation, note or no note, stamp or no stamp, so those
   * keys already name exactly the people a note may be written about. A second
   * ids array beside the map would be a second list of the same people to keep
   * true.
   *
   * **The clubs-only gate is applied here and can live nowhere else** — the
   * participant list and its rows know nothing about a product, which is the
   * whole reason `product_type` travels on this document. On a camp or an event
   * the newcomers map goes over empty; the notes are ungated and go over whole.
   * A null product type (an unknown group answered to an admin) is "no badge"
   * for the same reason.
   */
  const flair = useMemo<VoiceMemberFlair | null>(() => {
    if (overlay == null) return null;

    const drawsNewcomerBadge =
      overlay.product_type !== null && showsNewcomerBadge(overlay.product_type);
    const newcomers: Record<string, string> = {};
    const notes: Record<string, string> = {};
    const noteEditors: Record<string, string> = {};

    for (const [userId, member] of Object.entries(overlay.members)) {
      if (drawsNewcomerBadge && member.group_joined_at !== null) {
        newcomers[userId] = member.group_joined_at;
      }
      if (member.note !== null) notes[userId] = member.note;
      if (member.note_updated_by_first_name !== null) {
        noteEditors[userId] = member.note_updated_by_first_name;
      }
    }

    return {
      now,
      members: new Set(Object.keys(overlay.members)),
      newcomers,
      notes,
      noteEditors,
      onOpenNote: (userId, name) => setNoteTarget({ id: userId, name }),
    };
  }, [overlay, now]);

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
