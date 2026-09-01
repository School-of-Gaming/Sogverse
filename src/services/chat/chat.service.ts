import { parseJsonResponse, readApiError } from "@/lib/api/json-response";
import type { ChatReactionCode } from "@/lib/constants/chat";
import type {
  AppSupabaseClient,
  ChatChannelLockRow,
  ChatMessageRow,
  ChatReactionRow,
} from "@/types";
import {
  CHAT_IMAGES_BUCKET,
  CHAT_IMAGE_SIGNED_URL_TTL_SECONDS,
  chatChannelRow,
  chatChannelRoster,
  chatImageUploadResponse,
  type ChatChannelRow,
  type ChatChannelRoster,
  type ChatImageUploadResponse,
} from "./chat.contracts";

/**
 * Persisted chat, over the injected Supabase client.
 *
 * **Reads are direct, RLS-scoped selects; writes are the guarded RPCs.** The
 * SELECT policies have to exist anyway — Realtime `postgres_changes` reads the
 * tables as the subscriber — so a read RPC for messages, reactions or locks
 * would be a second spelling of a boundary that is already there. The roster is
 * the one exception and the one RPC-backed read: `profiles` RLS correctly
 * refuses cross-participant reads, so naming the people in a log needs a
 * deliberate hole in that refusal.
 *
 * No API route is involved anywhere here. Every write is authorized by the
 * caller's own session inside a SECURITY DEFINER function, so there is no
 * server-side secret to hide behind a route — the first route on this surface
 * arrives with images, which need the storage admin client for the object.
 */

/**
 * How many messages one history read brings back.
 *
 * The cap the app-message chat already had, kept deliberately: a session room's
 * whole conversation fits inside it, and reading further back is a staff review
 * question rather than a participant one (upward pagination is a follow-up).
 */
export const CHAT_HISTORY_LIMIT = 200;

/**
 * One channel's log, as three lists rather than one nested shape.
 *
 * They arrive from three tables and three realtime streams, and a payload
 * patches exactly one of them — folding reactions into their messages here
 * would mean re-deriving that nesting on every reaction anybody in the room
 * presses. The view-model turn happens once, at the container's render.
 */
export interface ChatHistory {
  /** Oldest first — the log's render order, and the order this class returns. */
  messages: ChatMessageRow[];
  reactions: ChatReactionRow[];
  /**
   * Lock rows the viewer is allowed to see: their own, plus every row in the
   * channel for a moderator. A participant reading an empty list has not been
   * told that nobody is locked — only that nobody they may know about is.
   */
  locks: ChatChannelLockRow[];
}

/**
 * Signed URLs for stored chat images, keyed by the message id that names the
 * object.
 *
 * A missing key is the honest answer for two different situations — an object
 * that has not landed yet (the row is written before the bytes) and one the
 * bucket policy refused — and the renderer draws the same empty box for both,
 * so nothing here has to tell them apart.
 */
export type ChatImageUrls = Record<string, string>;

export class ChatService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * The channel for the group's currently-open session window, materialized if
   * this is the first person into it.
   *
   * Both window instants are derived server-side from the product's schedule —
   * they feed the family read bound, so a client-supplied value would let a
   * member mint themselves an arbitrary read window. The function raises rather
   * than returning nothing when no window is open, and the container turns
   * either refusal into its one quiet unavailable line.
   *
   * `.single()` because the function returns exactly one row, always: PostgREST
   * enforces that itself, so the count is checked by the request rather than
   * asserted by a comment.
   */
  async ensureChannel(groupId: string): Promise<ChatChannelRow> {
    const { data, error } = await this.supabase
      .rpc("ensure_chat_channel", { p_group_id: groupId })
      .single();
    if (error) throw error;
    return chatChannelRow.parse(data);
  }

  /**
   * Who the channel can name: the group's active seat-holders, the product's
   * assigned gedus, and everyone who has a message in it.
   *
   * **Returned in the RPC's own order and never re-sorted.** Mention resolution
   * settles two accounts sharing a name by list position, and the composer and
   * the in-place editor are handed the same array — a consumer that sorted would
   * let one typed `@Name` mean different people in different fields.
   */
  async getRoster(channelId: string): Promise<ChatChannelRoster> {
    const { data, error } = await this.supabase.rpc("get_chat_channel_roster", {
      p_channel_id: channelId,
    });
    if (error) throw error;
    return chatChannelRoster.parse(data);
  }

  /**
   * The latest slice of the log, plus the channel's reactions and lock rows.
   *
   * Three reads in parallel because they are three independent policy-scoped
   * selects with nothing to sequence between them. The messages come back
   * newest-first so the limit takes the *latest* 200, and are reversed here so
   * every consumer downstream sees the one order the log renders in.
   *
   * **Ordered by `(created_at, id)` in both directions.** `created_at` alone is
   * not a total order — a burst of images fanned out by one press of Send lands
   * inside the same transaction and can share an instant — so the id breaks the
   * tie and the page boundary lands in the same place on every read.
   */
  async getHistory(channelId: string): Promise<ChatHistory> {
    const [messages, reactions, locks] = await Promise.all([
      this.supabase
        .from("chat_messages")
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(CHAT_HISTORY_LIMIT),
      this.supabase
        .from("chat_reactions")
        .select("*")
        .eq("channel_id", channelId),
      this.supabase
        .from("chat_channel_locks")
        .select("*")
        .eq("channel_id", channelId),
    ]);

    if (messages.error) throw messages.error;
    if (reactions.error) throw reactions.error;
    if (locks.error) throw locks.error;

    return {
      messages: [...messages.data].reverse(),
      reactions: reactions.data,
      locks: locks.data,
    };
  }

  /**
   * Sends one text message, under an id the caller generated.
   *
   * **The id is the client's**, which is what lets the optimistic echo reconcile
   * by identity rather than by guessing which arriving row is its own. Returns
   * the server's `created_at`, the one field the echo could not know.
   *
   * The body arrives already resolved to the stored mention form; the cap is the
   * column's own display-measured CHECK, so nothing re-measures it here.
   */
  async sendMessage(input: {
    id: string;
    channelId: string;
    body: string;
    replyToMessageId: string | null;
  }): Promise<string> {
    const { data, error } = await this.supabase.rpc("send_chat_message", {
      p_id: input.id,
      p_channel_id: input.channelId,
      p_body: input.body,
      p_reply_to_message_id: input.replyToMessageId ?? undefined,
    });
    if (error) throw error;
    return data;
  }

  /**
   * Creates the row for an image message, with the dimensions the upload route's
   * re-encode measured.
   *
   * **Called by that route, not by a browser**, and row-first on purpose: the
   * guard runs before any bytes are stored, and the object's name is this row's
   * id. Client-claimed dimensions never reach the columns — a fabricated
   * `1 × 20000` would be a layout bomb in every viewer's log.
   */
  async sendImageMessage(input: {
    id: string;
    channelId: string;
    width: number;
    height: number;
    replyToMessageId: string | null;
  }): Promise<string> {
    const { data, error } = await this.supabase.rpc("send_chat_image_message", {
      p_id: input.id,
      p_channel_id: input.channelId,
      p_width: input.width,
      p_height: input.height,
      p_reply_to_message_id: input.replyToMessageId ?? undefined,
    });
    if (error) throw error;
    return data;
  }

  /**
   * Sends one picture: the bytes go to the route, the row comes back.
   *
   * **The only method on this surface that is not a `.rpc()`**, and the reason
   * is the object rather than the row — storing it needs the service-role
   * client a browser must never hold. The route's own first act is still
   * `send_chat_image_message` on the CALLER'S session, so the authorization has
   * not moved anywhere; what the route adds is the re-encode (the EXIF strip
   * that no modified client can bypass, and the dimensions it measures) and the
   * storage write.
   *
   * The blob is the composer's own normalized JPEG — the same artifact the
   * staged thumbnail is drawn from — so what the sender saw and what the room
   * receives are one picture.
   *
   * A refusal arrives as an `ApiError` carrying the route's stable code, which
   * is what lets a lock's refusal (`CHAT_LOCKED_SQLSTATE`) be told apart from
   * everything else by the same `isChatLockedError` the RPC path uses.
   */
  async uploadImageMessage(input: {
    id: string;
    channelId: string;
    replyToMessageId: string | null;
    file: Blob;
  }): Promise<ChatImageUploadResponse> {
    const form = new FormData();
    form.append("id", input.id);
    form.append("channelId", input.channelId);
    if (input.replyToMessageId !== null) {
      form.append("replyToMessageId", input.replyToMessageId);
    }
    // A filename is required for the part to arrive as a `File` rather than a
    // string field. It is never stored — the object is named by the message
    // id — so it says what the bytes are and nothing more.
    form.append("file", input.file, "chat-image.jpg");

    const response = await fetch("/api/chat/images", {
      method: "POST",
      // No Content-Type header: the browser has to set the multipart boundary.
      body: form,
    });

    if (!response.ok) {
      throw await readApiError(response, "Failed to send the image");
    }

    return parseJsonResponse(response, chatImageUploadResponse);
  }

  /**
   * Mint a signed URL for each stored image in one call.
   *
   * **Batched, and minted on the viewer's own client on purpose**: signing
   * requires SELECT on the object under storage RLS, so the bucket's policy is
   * what decides — membership, the family time bound, and a hidden message's
   * picture being refused to anyone but a moderator all fall out of one call
   * nobody had to remember to make.
   *
   * An id the policy refuses comes back as a per-path error rather than a
   * failure of the batch, and is simply absent from the map. That is the same
   * answer as "not minted yet", which is what the renderer's empty box already
   * draws — a moderator hiding a picture mid-room and a picture whose object is
   * still landing look identical here, and neither is worth a second state.
   */
  async signImageUrls(messageIds: readonly string[]): Promise<ChatImageUrls> {
    if (messageIds.length === 0) return {};

    const { data, error } = await this.supabase.storage
      .from(CHAT_IMAGES_BUCKET)
      .createSignedUrls([...messageIds], CHAT_IMAGE_SIGNED_URL_TTL_SECONDS);
    if (error) throw error;

    const urls: ChatImageUrls = {};
    for (const entry of data) {
      // `path` is the object name, which is the message id. A row the policy
      // refused carries its own `error` and a null url, and simply does not
      // join the map.
      if (entry.path === null || entry.signedUrl === null) continue;
      urls[entry.path] = entry.signedUrl;
    }
    return urls;
  }

  /** Edits one's own standing text message. Returns the new `edited_at`. */
  async editMessage(id: string, body: string): Promise<string> {
    const { data, error } = await this.supabase.rpc("edit_chat_message", {
      p_id: id,
      p_body: body,
    });
    if (error) throw error;
    return data;
  }

  /**
   * Removes a message — one's own, or anybody's as a moderator.
   *
   * One RPC for both because it is one write and one tombstone: only `hidden_by`
   * differs, and nothing in the UI reads it. Returns the `hidden_at` stamp.
   */
  async hideMessage(id: string): Promise<string> {
    const { data, error } = await this.supabase.rpc("hide_chat_message", {
      p_id: id,
    });
    if (error) throw error;
    return data;
  }

  /** Puts a removed message back. Moderators only. */
  async restoreMessage(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("restore_chat_message", {
      p_id: id,
    });
    if (error) throw error;
  }

  /**
   * Adds or takes back one reaction. Answers whether the reaction now stands.
   */
  async toggleReaction(
    messageId: string,
    code: ChatReactionCode,
  ): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("toggle_chat_reaction", {
      p_message_id: messageId,
      p_code: code,
    });
    if (error) throw error;
    return data;
  }

  /**
   * Locks or unlocks one person in this channel. Moderators only, and never
   * against a fellow moderator — the server refuses that, exactly as the
   * capability module refuses to offer it.
   */
  async setLock(
    channelId: string,
    userId: string,
    locked: boolean,
  ): Promise<void> {
    const { error } = await this.supabase.rpc("set_chat_lock", {
      p_channel_id: channelId,
      p_user_id: userId,
      p_locked: locked,
    });
    if (error) throw error;
  }
}
