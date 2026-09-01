"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { ChatReactionCode } from "@/lib/constants/chat";
import { getClient } from "@/lib/supabase/client";
import type {
  ChatChannelLockRow,
  ChatMessageRow,
  ChatReactionRow,
} from "@/types";
import { CHAT_IMAGE_SIGNED_URL_TTL_SECONDS } from "./chat.contracts";
import {
  ChatService,
  type ChatHistory,
  type ChatImageUrls,
} from "./chat.service";

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
  // Signed image URLs carry no key: they are accumulated in the hook's own
  // state rather than cached per set of ids — see `useChatImageUrls`.
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
 *
 * **A fetch in flight is a snapshot of the past, and the union below is what
 * stops it deleting the present.** A refetch reads the log at the instant its
 * statement runs; anything inserted after that — somebody else's message,
 * patched into the cache from a realtime payload while the request was still
 * out — is absent from the answer, and replacing the list wholesale would drop
 * that row until the next focus refetch. So a resolved fetch keeps the cached
 * rows that can only postdate its snapshot.
 */
export function useChatHistory(channelId: string) {
  const service = new ChatService(getClient());
  const queryClient = useQueryClient();
  const historyKey = chatKeys.history(channelId);

  return useQuery({
    queryKey: historyKey,
    queryFn: async () => {
      const fetched = await service.getHistory(channelId);
      return withNewerCachedMessages(
        queryClient.getQueryData<ChatHistory>(historyKey),
        fetched,
      );
    },
  });
}

/**
 * A fetched log, plus any cached message strictly newer than the newest row it
 * brought back.
 *
 * **Sound only because messages are never deleted.** A removal is an UPDATE, so
 * a row the cache holds and the fetch does not is a row that did not exist when
 * the fetch took its snapshot — which, for anything ordered after the newest
 * row fetched, can only be an arrival the subscription patched in meanwhile.
 * Anything at or before that boundary is left alone: the fetch is the authority
 * on the window it read, so an edit or a tombstone it carries wins.
 *
 * The other flavours of the same race — an UPDATE (an edit, a hide) that a
 * stale snapshot reverts — are deliberately not treated here. They self-heal on
 * the next focus refetch or realtime payload, and untangling them would need
 * per-row versions this surface does not have.
 *
 * An empty answer is taken at face value rather than unioned: the only ways to
 * read nothing are an empty channel and a read window that has closed, and in
 * both the cached rows are what should go.
 */
function withNewerCachedMessages(
  held: ChatHistory | undefined,
  fetched: ChatHistory,
): ChatHistory {
  if (held === undefined || fetched.messages.length === 0) return fetched;

  const newest = fetched.messages[fetched.messages.length - 1];
  const fetchedIds = new Set(fetched.messages.map((row) => row.id));
  const newer = held.messages.filter(
    (row) => !fetchedIds.has(row.id) && messageComesBefore(newest, row),
  );
  if (newer.length === 0) return fetched;

  // Both lists carry the one `(created_at, id)` order and every kept row sorts
  // after the last fetched one, so appending preserves it.
  return { ...fetched, messages: [...fetched.messages, ...newer] };
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

/** One minted URL, with the instant it was minted at. */
interface MintedChatImageUrl {
  url: string;
  mintedAt: number;
}

/** The map before anything has been minted, as one stable empty object. */
const NO_MINTED_URLS: Readonly<Record<string, MintedChatImageUrl>> = {};

/**
 * How old a minted URL may get before it is re-minted: half its own lifetime.
 *
 * Late enough that nothing churns during a session — a changed `src` is a fresh
 * download of a picture the reader is already looking at — and early enough
 * that a tab left open all day never draws a link that has expired.
 */
const CHAT_IMAGE_URL_STALE_MS = (CHAT_IMAGE_SIGNED_URL_TTL_SECONDS / 2) * 1000;

/**
 * Signed URLs for the log's stored images, **accumulated rather than re-asked**.
 *
 * The set-keyed shape is wrong for a log that grows under the reader: every
 * arriving picture is a different set, so every INSERT of a burst would discard
 * the answer and re-mint every URL in the room, for every viewer — and a
 * six-picture send from one child would have every other client mint the whole
 * log six times over. So this keeps a map and asks only about what is not in
 * it, which is the same accumulate-don't-re-ask shape the voice room's Roblox
 * thumbnail lookup uses for a roster whose membership moves.
 *
 * **Minting is still one batched call per change**, never one per picture: a
 * change asks about everything it brought at once, and a change that brings no
 * new picture asks nothing at all.
 *
 * **An entry is never allowed to outlive its URL.** Each carries the instant it
 * was minted, a timer wakes on the oldest one currently in the log, and
 * anything past half its lifetime joins the next batch — the old URL keeps
 * drawing until the fresh one lands, so nothing blanks. An id whose re-mint
 * comes back refused is *dropped* rather than kept: that is a moderator hiding
 * the picture, which is exactly the retraction the storage policy exists for,
 * and holding a soon-to-expire URL for it would only delay the empty box.
 *
 * An id the batch could not sign — an object still landing, a hidden message —
 * simply stays out of the map, and is asked about again the next time the log
 * changes. The renderer draws the same empty box either way.
 */
export function useChatImageUrls(
  channelId: string,
  messageIds: readonly string[],
): ChatImageUrls {
  const supabase = getClient();

  // Tagged with the channel it belongs to and reset during render when the two
  // disagree — the thumbnail retry's shape, for the same reason: a URL is
  // minted against one channel's policy answer, and carrying a map across would
  // be a render's worth of somebody else's log.
  const [minted, setMinted] = useState<{
    channelId: string;
    urls: Readonly<Record<string, MintedChatImageUrl>>;
  }>(() => ({ channelId, urls: NO_MINTED_URLS }));
  // The ids a batch is out for. Never cleared wholesale, and it does not need
  // to be: a message id belongs to one channel for good, so an id in flight
  // when the channel changes can never be asked about again anyway, and the
  // settle below removes exactly what it added.
  const inFlightRef = useRef<ReadonlySet<string>>(new Set());
  const mountedRef = useRef(true);
  /** Bumped by the expiry timer below, to make the mint effect look again. */
  const [expiryTick, setExpiryTick] = useState(0);

  if (minted.channelId !== channelId) {
    setMinted({ channelId, urls: NO_MINTED_URLS });
  }
  const urls = minted.channelId === channelId ? minted.urls : NO_MINTED_URLS;

  // Set in the body rather than initialised once: React's development-mode
  // double invocation runs this effect's cleanup and then its setup again, and
  // a ref that only ever moved to `false` would stay there for the real mount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // What has been minted, readable from the mint effect without making that
  // effect depend on it — which would re-run it on its own result.
  const urlsRef = useRef(urls);
  useEffect(() => {
    urlsRef.current = urls;
  }, [urls]);

  // The set as one primitive, so the effect below re-runs when the log's
  // pictures really changed and not because a parent handed over an equal array.
  const idList = [...new Set(messageIds)].sort().join(",");

  useEffect(() => {
    const ids = idList === "" ? [] : idList.split(",");
    const now = Date.now();
    const held = urlsRef.current;
    const wanted = ids.filter((id) => {
      if (inFlightRef.current.has(id)) return false;
      if (!Object.hasOwn(held, id)) return true;
      return now - held[id].mintedAt >= CHAT_IMAGE_URL_STALE_MS;
    });
    if (wanted.length === 0) return;

    // Marked before the request goes out, so a picture arriving while a batch
    // is in flight asks about itself alone rather than about it again.
    inFlightRef.current = new Set([...inFlightRef.current, ...wanted]);

    const service = new ChatService(supabase);
    void service
      .signImageUrls(wanted)
      // A failed batch is "no URL" for the ids it asked about, settled rather
      // than left pending — they are drawing the empty box already, and the
      // next change to the log asks again.
      .catch((): ChatImageUrls => ({}))
      .then((signed) => {
        const remaining = new Set(inFlightRef.current);
        for (const id of wanted) remaining.delete(id);
        inFlightRef.current = remaining;
        if (!mountedRef.current) return;

        // A Map rather than the record itself, so an id the batch did not
        // answer for reads as absent rather than as a key that happens to be
        // missing.
        const fresh = new Map(Object.entries(signed));
        const mintedAt = Date.now();
        setMinted((previous) => {
          if (previous.channelId !== channelId) return previous;
          const next = { ...previous.urls };
          for (const id of wanted) {
            const url = fresh.get(id);
            // Either the fresh URL, or nothing at all: an id we asked about and
            // did not get back must not keep an entry, or a stale one would sit
            // in the map past its own expiry and wake the timer forever.
            if (url === undefined) delete next[id];
            else next[id] = { url, mintedAt };
          }
          return { channelId, urls: next };
        });
      });
  }, [channelId, idList, supabase, expiryTick]);

  // Wake when the oldest URL the log is actually drawing goes stale. Entries
  // for pictures that have scrolled out of the window are ignored: nothing
  // re-mints them, so letting one drive the timer would wake it forever.
  useEffect(() => {
    const ids = idList === "" ? [] : idList.split(",");
    const ages = ids.flatMap((id) =>
      Object.hasOwn(urls, id) ? [urls[id].mintedAt] : [],
    );
    if (ages.length === 0) return;

    const due = Math.min(...ages) + CHAT_IMAGE_URL_STALE_MS - Date.now();
    const timer = window.setTimeout(
      () => setExpiryTick((tick) => tick + 1),
      Math.max(due, 0),
    );
    return () => window.clearTimeout(timer);
  }, [idList, urls]);

  // The shape a consumer reads: the URL alone, with the mint stamp — this
  // hook's own bookkeeping — left behind.
  return useMemo(
    () =>
      Object.fromEntries(
        Object.entries(urls).map(([id, entry]) => [id, entry.url]),
      ),
    [urls],
  );
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

/** What one optimistic image send needs the server to settle. */
export interface ChatImageSendVariables {
  /** The client-generated id the echo — and the object — are named by. */
  id: string;
  replyToMessageId: string | null;
  /** The composer's own normalized JPEG. */
  file: Blob;
  /** The caller's own account id, for the local reconciliation only. */
  senderId: string;
}

/**
 * Sends one picture through the upload route and writes the settled row into
 * the history cache.
 *
 * **The same non-invalidating shape the text send uses, and for a sharper
 * reason**: a send fans a burst out into one message per picture, so six
 * invalidations would be six refetches of a two-hundred-row log to learn six
 * rows the route already answered with. The response carries everything the
 * echo could not know — the server stamp and the dimensions the re-encode
 * measured — so the cache goes to server truth exactly.
 *
 * The row lands here before its object does anywhere: a subscriber other than
 * the sender briefly holds an image message whose bytes are still arriving, and
 * no second event corrects it. That is what the renderer's bounded retry is
 * for. The sender is the one viewer who never sees it, because their own blob
 * is what draws their copy.
 */
export function useSendChatImage(channelId: string) {
  const service = new ChatService(getClient());
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: ChatImageSendVariables) =>
      service.uploadImageMessage({
        id: variables.id,
        channelId,
        replyToMessageId: variables.replyToMessageId,
        file: variables.file,
      }),
    onSuccess: (stored, variables) => {
      queryClient.setQueryData<ChatHistory>(
        chatKeys.history(channelId),
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                messages: upsertMessage(current.messages, {
                  id: stored.id,
                  channel_id: channelId,
                  sender_id: variables.senderId,
                  body: null,
                  created_at: stored.createdAt,
                  edited_at: null,
                  hidden_at: null,
                  hidden_by: null,
                  image_width: stored.width,
                  image_height: stored.height,
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
 *
 * **What an invalidation starts is a fetch that races the socket, and the seam
 * is worth naming rather than pretending away.** A refetch reads the log as it
 * was when its statement ran, so a payload patched into the cache while the
 * request was in flight is not in the answer. The history query unions back the
 * rows that can only postdate that snapshot — new messages, which are the ones
 * whose loss would be visible and permanent. It does *not* reconcile an UPDATE
 * the snapshot predates: an edit or a tombstone that lands mid-flight can be
 * momentarily reverted by the answer, and heals on the next payload or focus
 * refetch. That is the accepted half, alongside the two the container's own
 * comments record (a re-subscribe is the only reconnect signal; a payload
 * dropped on a socket that stays up arrives as silence).
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
