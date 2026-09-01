"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChatView, type ChatAccount, type ChatMessage, type ChatViewHandlers } from "@/components/chat";
import { getClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useRequiredAuth } from "@/providers/auth-provider";
import type {
  ChatChannelLockRow,
  ChatMessageRow,
  ChatReactionRow,
} from "@/types";
import { useTimezone } from "@/providers/timezone-provider";
import {
  applyChatLockChange,
  applyChatMessageChange,
  applyChatReactionChange,
  chatKeys,
  isChatLockedError,
  useChatChannel,
  useChatHistory,
  useChatRoster,
  useEditChatMessage,
  useHideChatMessage,
  useRestoreChatMessage,
  useSendChatMessage,
  useSetChatLock,
  useToggleChatReaction,
  type ChatHistory,
} from "@/services/chat";
import {
  toChatAccounts,
  toChatMessages,
  toLockedAccountIds,
} from "./group-session-chat-model";

/**
 * The transport half of chat in a scheduled voice room.
 *
 * **Everything the components refuse to know lives here**: the channel, the
 * query, the subscription and the service. `src/components/chat/` takes
 * messages, accounts, who is locked and who is writing, and hands back
 * intentions — that contract is what lets the preview scene drive the same tree
 * from fixtures, so this file exists precisely so that none of it leaks in
 * there.
 *
 * The room grants the panel its height and the padding under it; this component
 * passes the height straight through to `ChatView`, which owns the surface's
 * whole budget from there.
 */
export function GroupSessionChat({
  groupId,
  heightClassName,
}: {
  groupId: string;
  /**
   * The fixed height the room grants the whole surface — required rather than
   * optional, because the placeholder this component renders while the channel
   * resolves has to occupy exactly the box the chat will.
   */
  heightClassName: string;
}) {
  const channel = useChatChannel(groupId);

  // Both refusals the ensure RPC can answer with are answers rather than
  // faults: a non-member (42501), and no session window open right now (P0002,
  // which the voice token's own 60-second grace can outlive). Neither is worth
  // a distinct surface — the room is what the person came for, and chat quietly
  // not being there is the honest thing to say about all of it.
  //
  // Keyed on having no channel at all rather than on the error flag, so a
  // failure on some later refetch cannot take a working chat off the screen
  // while the room is still up.
  if (channel.isError && channel.data === undefined) return <ChatUnavailable />;

  if (channel.data === undefined) {
    // One indexed round trip: render nothing, in a box that already has its
    // final size. A skeleton here would be a flash on a call that lands in a
    // frame or two.
    return <div className={heightClassName} />;
  }

  return (
    <GroupSessionChatRoom
      channelId={channel.data.id}
      heightClassName={heightClassName}
    />
  );
}

/** The one quiet line a channel we cannot open gets. */
function ChatUnavailable() {
  const t = useTranslations("chat");
  return <p className="text-sm text-muted-foreground">{t("unavailable")}</p>;
}

/** How often one client will say it is writing, at most. */
const TYPING_PING_MS = 2000;

/**
 * How long one ping keeps somebody on the writing list.
 *
 * Comfortably longer than the ping interval, so a steady writer never flickers
 * off — and short enough that somebody who closes their laptop mid-sentence
 * stops being announced. Expiry is why there is no "stopped writing" message to
 * lose: the indicator heals itself whether a client says goodbye or not.
 */
const TYPING_TTL_MS = 5000;

/** The broadcast event the typing indicator rides. */
const TYPING_EVENT = "typing";

function GroupSessionChatRoom({
  channelId,
  heightClassName,
}: {
  channelId: string;
  heightClassName: string;
}) {
  const supabase = getClient();
  const queryClient = useQueryClient();
  const timeZone = useTimezone();
  const { profile } = useRequiredAuth();

  const viewer: ChatAccount = useMemo(
    () => ({ id: profile.id, name: profile.first_name, role: profile.role }),
    [profile.id, profile.first_name, profile.role],
  );

  const history = useChatHistory(channelId);
  const roster = useChatRoster(channelId);

  const sendMessage = useSendChatMessage(channelId);
  const editMessage = useEditChatMessage(channelId);
  const hideMessage = useHideChatMessage(channelId);
  const restoreMessage = useRestoreChatMessage(channelId);
  const toggleReaction = useToggleChatReaction(channelId);
  const setLock = useSetChatLock(channelId);

  /**
   * The sender's own messages, on screen before anything has acknowledged them.
   *
   * **Held here rather than in the query cache**, because they are not server
   * rows: a refetch would wipe them, and a reconnect invalidate is exactly the
   * moment they most need to survive. They are always appended *after* every
   * settled row, so a device with a skewed clock cannot insert its own message
   * into the middle of a log everybody else already agrees about — and a row
   * that reconciles therefore never travels upward past anything painted.
   */
  const [pending, setPending] = useState<ChatMessage[]>([]);

  /** Who is writing, by account id, each with the instant their ping expires. */
  const [typists, setTypists] = useState<Record<string, number>>({});

  // The subscribed channel, for sending typing pings. A ref rather than state:
  // it is written by an effect and read by an event handler, and nothing
  // renders differently because of it.
  const liveChannelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingPingRef = useRef(0);

  // Who the roster currently names, readable from inside a subscription
  // callback without making the subscription depend on the roster (which would
  // tear the channel down and rejoin it every time somebody new spoke).
  const rosterIdsRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    rosterIdsRef.current = new Set(roster.data?.map((entry) => entry.id) ?? []);
  }, [roster.data]);

  // ---------------------------------------------------------------------
  // One channel, three tables, and the typing pings
  // ---------------------------------------------------------------------
  useEffect(() => {
    const historyKey = chatKeys.history(channelId);
    const patch = (change: (current: ChatHistory) => ChatHistory) => {
      queryClient.setQueryData<ChatHistory>(historyKey, (current) =>
        current === undefined ? current : change(current),
      );
    };

    let subscribedBefore = false;

    const live = supabase
      .channel(`chat-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload: RealtimePostgresChangesPayload<ChatMessageRow>) => {
          patch((current) => applyChatMessageChange(current, payload));
          // The one signal that somebody the roster does not name has become
          // visible in the log — a staff drop-in, or a membership change. An
          // invalidation is allowed here; a Supabase query would not be (the
          // standing deadlock rule), and this is the difference.
          if (
            payload.eventType === "INSERT" &&
            !rosterIdsRef.current.has(payload.new.sender_id)
          ) {
            void queryClient.invalidateQueries({
              queryKey: chatKeys.roster(channelId),
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_reactions",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload: RealtimePostgresChangesPayload<ChatReactionRow>) =>
          patch((current) => applyChatReactionChange(current, payload)),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_channel_locks",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload: RealtimePostgresChangesPayload<ChatChannelLockRow>) =>
          patch((current) => applyChatLockChange(current, payload)),
      )
      // **Broadcast is not RLS-gated**, and that is accepted rather than
      // overlooked: Realtime authorization policies are machinery this repo has
      // never used, so anybody authenticated who learns a channel id could join
      // this and hear who is writing. What travels is an account id and nothing
      // else — the name a bubble draws comes from the roster, so a stranger on
      // the wire cannot put words or a chosen name in front of a room of
      // children. Nothing here touches the database.
      .on("broadcast", { event: TYPING_EVENT }, (message) => {
        // Anything anybody chose to send, so it is read as `unknown` and
        // narrowed rather than trusted: this channel is not RLS-gated, so a
        // payload is a claim, not a fact.
        const payload: unknown = message.payload;
        if (typeof payload !== "object" || payload === null) return;
        if (!("id" in payload)) return;
        const id: unknown = payload.id;
        if (typeof id !== "string") return;
        setTypists((current) => ({
          ...current,
          [id]: Date.now() + TYPING_TTL_MS,
        }));
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // **The only reconnect signal Realtime offers.** A re-subscribe means
        // the socket went away and came back, so anything that happened while
        // it was down was never delivered and a stranded pending echo has no
        // acknowledgement coming — one invalidation reconciles both.
        //
        // It says nothing about a payload dropped on a socket that *stayed* up:
        // that arrives as silence, and the gap filler is React Query's default
        // refetch-on-focus, deliberately left on.
        if (subscribedBefore) {
          void queryClient.invalidateQueries({ queryKey: historyKey });
        }
        subscribedBefore = true;
      });

    liveChannelRef.current = live;
    return () => {
      liveChannelRef.current = null;
      void supabase.removeChannel(live);
    };
  }, [channelId, queryClient, supabase]);

  // Expire the writing list. The timer exists only while somebody is on it, so
  // a quiet room costs nothing.
  useEffect(() => {
    if (Object.keys(typists).length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setTypists((current) => {
        const live = Object.fromEntries(
          Object.entries(current).filter(([, expiry]) => expiry > now),
        );
        return Object.keys(live).length === Object.keys(current).length
          ? current
          : live;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [typists]);

  /**
   * Say that this viewer is writing, at most once every couple of seconds.
   *
   * **Driven by a capture listener on the wrapper below, not by a prop.** The
   * chat components take no typing handler and must not grow one — they are
   * transport-free by contract, and a composer that had to be told about a
   * socket would be the first crack in it. An `input` event inside the surface
   * is the same fact from outside, and it covers the in-place editor for free.
   */
  const noteWriting = useCallback(() => {
    const live = liveChannelRef.current;
    if (live === null) return;
    const now = Date.now();
    if (now - lastTypingPingRef.current < TYPING_PING_MS) return;
    lastTypingPingRef.current = now;
    void live.send({
      type: "broadcast",
      event: TYPING_EVENT,
      payload: { id: viewer.id },
    });
  }, [viewer.id]);

  // ---------------------------------------------------------------------
  // The optimistic echo
  // ---------------------------------------------------------------------

  const send = sendMessage.mutate;

  const dispatch = useCallback(
    (message: ChatMessage) => {
      send(
        {
          id: message.id,
          body: message.body ?? "",
          replyToMessageId: message.replyToId,
          senderId: message.senderId,
        },
        {
          onError: (error) => {
            // **A lock's refusal offers no retry**, because there is nothing a
            // retry could achieve: the lock's own realtime arrival disables the
            // composer and the refusal simply raced it. So the echo is dropped
            // rather than left as a failed bubble with a button that cannot
            // work — nobody else ever saw the message, and the composer's lock
            // notice is what explains where it went.
            if (isChatLockedError(error)) {
              setPending((current) =>
                current.filter((row) => row.id !== message.id),
              );
              return;
            }
            setPending((current) =>
              current.map((row) =>
                row.id === message.id
                  ? { ...row, delivery: "failed" as const }
                  : row,
              ),
            );
          },
        },
      );
    },
    [send],
  );

  const settledIds = useMemo(
    () => new Set(history.data?.messages.map((row) => row.id) ?? []),
    [history.data],
  );

  const messages = useMemo(() => {
    const settled = history.data === undefined ? [] : toChatMessages(history.data);
    return [
      ...settled,
      ...pending.filter((row) => !settledIds.has(row.id)),
    ];
  }, [history.data, pending, settledIds]);

  const accounts = useMemo(
    () => toChatAccounts(roster.data ?? [], viewer),
    [roster.data, viewer],
  );

  const lockedAccountIds = useMemo(
    () => (history.data === undefined ? new Set<string>() : toLockedAccountIds(history.data)),
    [history.data],
  );

  const typingAccountIds = useMemo(() => Object.keys(typists), [typists]);

  const handlers: ChatViewHandlers = {
    onSend: (drafts) => {
      for (const draft of drafts) {
        // Images are the wire-up's own next step: the composer still stages and
        // fans them out, and until the bucket, the upload route and the
        // server-side re-encode exist there is nowhere for the bytes to go.
        // Dropping the draft is the inert half — no row, no half-sent picture.
        if (draft.image !== null || draft.body === null) continue;
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          senderId: viewer.id,
          createdAt: new Date().toISOString(),
          body: draft.body,
          image: null,
          replyToId: draft.replyToId,
          editedAt: null,
          hiddenAt: null,
          hiddenBy: null,
          reactions: [],
          delivery: "pending",
        };
        // The settled ones are swept here rather than in an effect watching
        // the log: an echo stops being *drawn* the instant its row lands (the
        // merge below filters on exactly this set), so all a sweep has to do is
        // keep the list from accumulating — and a send is the only thing that
        // ever grows it.
        setPending((current) => [
          ...current.filter((row) => !settledIds.has(row.id)),
          message,
        ]);
        dispatch(message);
      }
    },
    onRetry: (messageId) => {
      const message = pending.find((row) => row.id === messageId);
      if (message === undefined) return;
      const retried = { ...message, delivery: "pending" as const };
      setPending((current) =>
        current.map((row) => (row.id === messageId ? retried : row)),
      );
      dispatch(retried);
    },
    onDelete: (messageId) => {
      // A message that never reached the server has no row to tombstone and
      // nobody to tell: it is the echo being dropped. Anything else is the same
      // soft delete a moderator's removal is.
      if (pending.some((row) => row.id === messageId)) {
        setPending((current) => current.filter((row) => row.id !== messageId));
        return;
      }
      hideMessage.mutate(messageId);
    },
    onHide: (messageId) => hideMessage.mutate(messageId),
    onRestore: (messageId) => restoreMessage.mutate(messageId),
    onEdit: (messageId, body) => editMessage.mutate({ id: messageId, body }),
    onToggleReaction: (messageId, code) =>
      toggleReaction.mutate({ messageId, code }),
    onSetLock: (accountId, locked) => setLock.mutate({ userId: accountId, locked }),
  };

  if (history.isError && history.data === undefined) return <ChatUnavailable />;
  if (history.data === undefined) return <div className={cn(heightClassName)} />;

  return (
    <div onInputCapture={noteWriting}>
      <ChatView
        messages={messages}
        accounts={accounts}
        viewer={viewer}
        lockedAccountIds={lockedAccountIds}
        typingAccountIds={typingAccountIds}
        heightClassName={heightClassName}
        timeZone={timeZone}
        handlers={handlers}
      />
    </div>
  );
}
