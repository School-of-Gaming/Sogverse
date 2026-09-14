"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { GamerFlairDialog } from "@/components/member-flair";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { VoiceRoom } from "@/components/voice/VoiceRoom";
import { GroupSessionChat } from "@/components/voice/GroupSessionChat";
import type { ParticipantChatControls } from "@/components/voice/ParticipantRow";
import { VoiceMemberFlairProvider } from "@/components/voice/VoiceMemberFlairProvider";
import { SessionFeedbackScreen } from "@/components/voice/feedback/SessionFeedbackScreen";
import { useSessionFeedbackItems } from "@/components/voice/feedback/use-session-feedback-items";
import { deriveVoiceMemberFlair } from "@/components/voice/derive-voice-member-flair";
import {
  useGroupStaffOverlay,
  useSetGamerGroupCreations,
  useSetGamerGroupNote,
} from "@/services/member-flair";
import {
  isEmptySessionFeedback,
  useOwnSessionFeedback,
  useSaveSessionFeedback,
} from "@/services/session-feedback";
import { useVoiceToken } from "@/services/voice";
import type { SessionFeedbackResult } from "@/components/voice/feedback/session-feedback-items";
import type { GamerCreation } from "@/types";

interface VoiceSessionPageProps {
  /** A `product_groups.id` — the token endpoint derives the Daily room name from the group + current session window. */
  groupId: string;
  backHref: string;
  /**
   * Whether this viewer is asked how the session went on the way out.
   *
   * Gamers are, and nobody else is. It arrives as a prop because the route has
   * already resolved the viewer's role server-side, and a second, client-side
   * answer to the same question is a second thing that can be wrong.
   */
  askForFeedback: boolean;
}

function VoiceSessionInner({
  groupId,
  backHref,
  askForFeedback,
}: VoiceSessionPageProps) {
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
  /**
   * Whether the reader has already left the call and is now being asked how it
   * went. Only ever set for a viewer the page asks — for everyone else leaving
   * is still one step, and the flag never turns true.
   */
  const [leftForFeedback, setLeftForFeedback] = useState(false);
  /**
   * Done has been pressed and the navigation it starts is under way.
   *
   * Set synchronously before the assignment to `window.location` and never
   * cleared: the document is on its way out, so there is no outcome that wants
   * the button back.
   */
  const [finishing, setFinishing] = useState(false);
  /**
   * Whether the last Done failed to save, which is the only thing the screen is
   * told about the write.
   */
  const [saveFailed, setSaveFailed] = useState(false);
  /**
   * The instant this session's window opened, as the token response gave it.
   *
   * It is the third column of the feedback row's key and the same value the
   * room stamps occupancy with, so the page holds it rather than consuming it
   * where the token resolves. Null until the token does, which is also what
   * holds the prefill read.
   */
  const [sessionOpensAt, setSessionOpensAt] = useState<string | null>(null);
  const feedbackItems = useSessionFeedbackItems();

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
      .then(({ token, roomUrl, sessionOpensAt: opensAt }) => {
        setSessionOpensAt(opensAt);
        return join(roomUrl, token, { sessionOpensAt: opensAt });
      })
      .then(() => setWasJoined(true))
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('failedToJoinRoom'));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once on mount
  }, []);

  /**
   * What this viewer already answered in this window, read as they join and
   * held until they leave.
   *
   * **Read here rather than at the moment of leaving**, because both paths to
   * the question are abrupt: a Leave whose disconnect has already happened, and
   * a room closing under everyone, which fires on any post-join drop — a failed
   * network among them — and must not wait on a fresh read right then. It asks
   * only for a viewer the page asks, and only once the window instant the row
   * is keyed by is in hand.
   *
   * A row that never existed and a read that failed are both survivable here:
   * the form opens empty either way. The two are told apart exactly once, in
   * the write-or-skip rule below.
   */
  const prefill = useOwnSessionFeedback(groupId, sessionOpensAt, askForFeedback);
  const { mutate: saveSessionFeedback } = useSaveSessionFeedback();

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
    // A viewer we ask is held here rather than sent away: the disconnect has
    // already happened, so the question sits between the call and the
    // destination instead of delaying either. Everyone else leaves exactly as
    // they did before.
    if (askForFeedback) {
      setLeaving(false);
      setLeftForFeedback(true);
      return;
    }
    window.location.href = backHref;
  }, [leave, backHref, askForFeedback]);

  /**
   * Done, from either path the question is asked on: the answers are written to
   * this viewer's own row for this group and window, and then the navigation
   * leaving already performed happens.
   *
   * **The write-or-skip rule is one condition.** The write is skipped only when
   * the form is empty *and* the prefill read succeeded with no row — a
   * first-time Done with nothing on screen, which saves nothing because the
   * response rate's denominator is the sessions themselves. In every other
   * state — something answered, a row already loaded, a read that failed or
   * never ran — it writes, because an unknown prefill state must not leave a
   * stale row standing behind a child who cleared it.
   *
   * **The screen's `onDone` is synchronous and this owns the promise.** The
   * committing flag is set before the call and left set on the success path,
   * where the document unloads; a refusal clears it, keeps the screen mounted
   * with what the reader typed still in it, and says so above a Done that
   * retries this same write.
   */
  const handleFeedbackDone = useCallback(
    (result: SessionFeedbackResult) => {
      setFinishing(true);
      setSaveFailed(false);

      const nothingToKeep =
        isEmptySessionFeedback(result) &&
        prefill.isSuccess &&
        prefill.data === null;
      // The screen cannot mount before the token resolved — the join it waits
      // on is what sets this — so the null branch is the compiler's, not a
      // state a reader can reach. With no key there is no row to write.
      if (nothingToKeep || sessionOpensAt === null) {
        window.location.href = backHref;
        return;
      }

      saveSessionFeedback(
        {
          groupId,
          sessionOpensAt,
          result,
          // Which way out this is: the Leave button, or the room closing under
          // everyone. Only knowable here, and no later reader could recover it.
          exitReason: leftForFeedback ? "left" : "ended",
        },
        {
          onSuccess: () => {
            window.location.href = backHref;
          },
          onError: () => {
            setFinishing(false);
            setSaveFailed(true);
          },
        },
      );
    },
    [
      backHref,
      groupId,
      leftForFeedback,
      prefill.data,
      prefill.isSuccess,
      // The mutate function, not the mutation object: the object is a fresh
      // identity on every render, so depending on it would rebuild this
      // callback continuously. `mutate` is stable for the hook's lifetime.
      saveSessionFeedback,
      sessionOpensAt,
    ],
  );

  if (error) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-12 text-center">
            <StatusLine status="destructive" className="justify-center">
              {error}
            </StatusLine>
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

  // The question, on both paths that reach it: the reader pressed Leave and the
  // disconnect resolved, or the room closed under everyone at the window's end.
  // One screen either way — the only difference is that the second one says so
  // above the heading, because nothing else on the page would.
  if (askForFeedback && (leftForFeedback || (wasJoined && !joined))) {
    return (
      <SessionFeedbackScreen
        items={feedbackItems}
        committing={finishing}
        onDone={handleFeedbackDone}
        lead={leftForFeedback ? undefined : t('sessionEnded')}
        // What this viewer already answered in this window, if anything. Absent
        // covers all three of no row, a read still in flight and a read that
        // failed — an empty form, which is the resting state.
        initial={prefill.data ?? undefined}
        status={saveFailed ? t('feedback.saveFailed') : undefined}
      />
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
