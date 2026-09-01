"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { ChatReactionCode } from "@/lib/constants/chat";
import { getClient } from "@/lib/supabase/client";
import type {
  ChatChannelLockRow,
  ChatMessageRow,
  ChatReactionRow,
} from "@/types";
import { ChatService, type ChatHistory } from "./chat.service";

/**
 * React Query hooks for persisted chat, plus the only legal edits to the
 * history cache.
 *
 * **The cache patchers live here rather than in the subscriber**, because the
 * cache shape is this module's. A realtime callback may only invalidate a query
 * or apply a payload it was handed — never run a Supabase query of its own (the
 * standing deadlock rule) — so the patchers below are the shape a subscriber is
 * given to work with, and they are pure functions of a payload and the list it
 * lands in.
 */

export const chatKeys = {
  all: ["chat"] as const,
  /** The group's current-window channel, as the ensure RPC materializes it. */
  channelForGroup: (groupId: string) =>
    [...chatKeys.all, "group", groupId] as const,
  channel: (channelId: string) =>
    [...chatKeys.all, "channel", channelId] as const,
  history: (channelId: string) =>
    [...chatKeys.channel(channelId), "history"] as const,
  roster: (channelId: string) =>
    [...chatKeys.channel(channelId), "roster"] as const,
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The channel for this group's open session window, materialized on mount.
 *
 * `retry: false` because both refusals this call can meet are answers rather
 * than glitches — a non-member, and no window open right now — and retrying
 * either just delays the container's quiet unavailable line by a few seconds.
 */
export function useChatChannel(groupId: string) {
  const service = new ChatService(getClient());
  return useQuery({
    queryKey: chatKeys.channelForGroup(groupId),
    queryFn: () => service.ensureChannel(groupId),
    retry: false,
    staleTime: Infinity,
  });
}

/**
 * The latest 200 messages, plus the channel's reactions and visible lock rows.
 *
 * **Refetch-on-focus is left at its default, deliberately.** A payload dropped
 * on a socket that stays up arrives as nothing at all, and Realtime offers no
 * signal for it — so React Query's own focus behaviour is the gap filler, and a
 * parent coming back to the tab reconciles by looking at it.
 */
export function useChatHistory(channelId: string) {
  const service = new ChatService(getClient());
  return useQuery({
    queryKey: chatKeys.history(channelId),
    queryFn: () => service.getHistory(channelId),
  });
}

/**
 * Everyone the channel can name.
 *
 * Refetched by the container when a message arrives from somebody this list
 * does not know — the one signal that a staff drop-in or a membership change
 * has become visible in the log.
 */
export function useChatRoster(channelId: string) {
  const service = new ChatService(getClient());
  return useQuery({
    queryKey: chatKeys.roster(channelId),
    queryFn: () => service.getRoster(channelId),
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** What one optimistic send needs the server to settle. */
export interface ChatSendVariables {
  /** The client-generated id the echo is already rendering under. */
  id: string;
  body: string;
  replyToMessageId: string | null;
  /**
   * The caller's own account id.
   *
   * For the local reconciliation only — the RPC takes the sender from the
   * session and ignores anything a caller could say about it. It is here so the
   * row written into the cache on success is the row the server stored.
   */
  senderId: string;
}

/**
 * Sends a message and writes the settled row straight into the history cache.
 *
 * **This is the one mutation on the surface that does not invalidate**, and the
 * reason is that invalidating would be a 200-row refetch to learn a row we are
 * already holding: the RPC answers with the server `created_at`, which is the
 * only field the optimistic echo could not know, so the cache can be brought to
 * server truth exactly rather than approximately. The realtime INSERT reaches
 * the same entry a moment later and finds the row already there, and the
 * reconnect invalidate plus focus refetch are what cover anything missed.
 */
export function useSendChatMessage(channelId: string) {
  const service = new ChatService(getClient());
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: ChatSendVariables) =>
      service.sendMessage({
        id: variables.id,
        channelId,
        body: variables.body,
        replyToMessageId: variables.replyToMessageId,
      }),
    onSuccess: (createdAt, variables) => {
      queryClient.setQueryData<ChatHistory>(
        chatKeys.history(channelId),
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                messages: upsertMessage(current.messages, {
                  id: variables.id,
                  channel_id: channelId,
                  sender_id: variables.senderId,
                  body: variables.body,
                  created_at: createdAt,
                  edited_at: null,
                  hidden_at: null,
                  hidden_by: null,
                  image_width: null,
                  image_height: null,
                  reply_to_message_id: variables.replyToMessageId,
                }),
              },
      );
    },
  });
}

/**
 * Every write below invalidates the channel's history on success.
 *
 * The realtime UPDATE is the fast path and normally arrives first; the
 * invalidation is what makes the outcome true even when it does not, and it is
 * cheap here because these are the actions somebody takes one at a time rather
 * than the one they take continuously.
 */
function useChatWrite<TVariables, TResult>(
  channelId: string,
  write: (service: ChatService, variables: TVariables) => Promise<TResult>,
) {
  const service = new ChatService(getClient());
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: TVariables) => write(service, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: chatKeys.history(channelId) }),
  });
}

export function useEditChatMessage(channelId: string) {
  return useChatWrite(
    channelId,
    (service, variables: { id: string; body: string }) =>
      service.editMessage(variables.id, variables.body),
  );
}

export function useHideChatMessage(channelId: string) {
  return useChatWrite(channelId, (service, id: string) =>
    service.hideMessage(id),
  );
}

export function useRestoreChatMessage(channelId: string) {
  return useChatWrite(channelId, (service, id: string) =>
    service.restoreMessage(id),
  );
}

export function useToggleChatReaction(channelId: string) {
  return useChatWrite(
    channelId,
    (service, variables: { messageId: string; code: ChatReactionCode }) =>
      service.toggleReaction(variables.messageId, variables.code),
  );
}

export function useSetChatLock(channelId: string) {
  return useChatWrite(
    channelId,
    (service, variables: { userId: string; locked: boolean }) =>
      service.setLock(channelId, variables.userId, variables.locked),
  );
}

// ---------------------------------------------------------------------------
// Cache patching, from realtime payloads
// ---------------------------------------------------------------------------

/**
 * Where a message sits in the log: `(created_at, id)`, the same total order the
 * history read asks Postgres for. `created_at` alone is not one — a burst fanned
 * out by one press of Send shares an instant — so the id breaks the tie and the
 * client and the server cannot disagree about the order of a burst.
 */
function messageComesBefore(a: ChatMessageRow, b: ChatMessageRow): boolean {
  return a.created_at === b.created_at
    ? a.id < b.id
    : a.created_at < b.created_at;
}

/** Replaces a message in place, or inserts it at its ordered position. */
function upsertMessage(
  messages: readonly ChatMessageRow[],
  row: ChatMessageRow,
): ChatMessageRow[] {
  const at = messages.findIndex((message) => message.id === row.id);
  if (at !== -1) {
    const next = [...messages];
    next[at] = row;
    return next;
  }
  const before = messages.findIndex((message) => messageComesBefore(row, message));
  if (before === -1) return [...messages, row];
  return [...messages.slice(0, before), row, ...messages.slice(before)];
}

/**
 * A `chat_messages` change, applied from the payload alone.
 *
 * A DELETE cannot happen — removal is a soft delete, which is an UPDATE — so
 * there is no branch for one; the table keeps its default replica identity for
 * exactly that reason, and a DELETE payload would not carry enough to act on.
 */
export function applyChatMessageChange(
  history: ChatHistory,
  payload: RealtimePostgresChangesPayload<ChatMessageRow>,
): ChatHistory {
  if (payload.eventType !== "INSERT" && payload.eventType !== "UPDATE") {
    return history;
  }
  return { ...history, messages: upsertMessage(history.messages, payload.new) };
}

/** Whether two reaction rows are the same row: the PK triple. */
function sameReaction(
  a: Pick<ChatReactionRow, "message_id" | "sender_id" | "code">,
  b: Pick<ChatReactionRow, "message_id" | "sender_id" | "code">,
): boolean {
  return (
    a.message_id === b.message_id &&
    a.sender_id === b.sender_id &&
    a.code === b.code
  );
}

/**
 * A `chat_reactions` change, applied from the payload alone.
 *
 * Taking a reaction back is a real DELETE, which is why this table carries
 * `REPLICA IDENTITY FULL`: a `channel_id`-filtered subscription can only receive
 * a deletion whose *old* row carries the filter column, and the same old row is
 * what identifies which reaction left.
 */
export function applyChatReactionChange(
  history: ChatHistory,
  payload: RealtimePostgresChangesPayload<ChatReactionRow>,
): ChatHistory {
  if (payload.eventType === "DELETE") {
    const gone = payload.old;
    if (
      gone.message_id === undefined ||
      gone.sender_id === undefined ||
      gone.code === undefined
    ) {
      return history;
    }
    const key = {
      message_id: gone.message_id,
      sender_id: gone.sender_id,
      code: gone.code,
    };
    return {
      ...history,
      reactions: history.reactions.filter(
        (reaction) => !sameReaction(reaction, key),
      ),
    };
  }
  const row = payload.new;
  return {
    ...history,
    reactions: [
      ...history.reactions.filter((reaction) => !sameReaction(reaction, row)),
      row,
    ],
  };
}

/**
 * A `chat_channel_locks` change, applied from the payload alone.
 *
 * Unlocking is an UPDATE that clears `locked_at`, never a DELETE, so both
 * directions replicate under the table's default replica identity — which is
 * the whole reason the schema spells unlock that way.
 */
export function applyChatLockChange(
  history: ChatHistory,
  payload: RealtimePostgresChangesPayload<ChatChannelLockRow>,
): ChatHistory {
  if (payload.eventType === "DELETE") {
    const gone = payload.old;
    if (gone.user_id === undefined) return history;
    const userId = gone.user_id;
    return {
      ...history,
      locks: history.locks.filter((lock) => lock.user_id !== userId),
    };
  }
  const row = payload.new;
  return {
    ...history,
    locks: [
      ...history.locks.filter((lock) => lock.user_id !== row.user_id),
      row,
    ],
  };
}
